import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { turso, isTursoConfigured, ensureTursoSchema } from '@/lib/turso';
import { hashPassword } from '@/lib/password';
import { getLocalUsers, saveLocalUsers } from '@/lib/users-local';

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  // 1. Se Turso estiver configurado, busca na nuvem
  if (isTursoConfigured()) {
    try {
      await ensureTursoSchema();
      const res = await turso.execute(
        'SELECT id, username, display_name, role, is_active, created_at FROM app_users ORDER BY created_at DESC'
      );
      if (res.rows.length > 0) {
        const users = res.rows.map((row: any) => ({
          id: String(row.id),
          username: String(row.username),
          display_name: String(row.display_name),
          role: String(row.role),
          is_active: Boolean(row.is_active),
          created_at: row.created_at,
        }));
        return NextResponse.json({ users });
      }
    } catch (err: any) {
      console.warn('Erro ao listar usuários no Turso, usando persistência local:', err);
    }
  }

  // 2. Persistência local em disco (data/local-users.json)
  const localList = await getLocalUsers();
  const safeUsers = localList.map(({ password_hash, ...rest }) => rest);
  return NextResponse.json({ users: safeUsers });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  try {
    const { username, password, displayName, role } = await req.json();

    if (!username || !password || !displayName) {
      return NextResponse.json({ error: 'Preencha todos os campos obrigatórios' }, { status: 400 });
    }

    const cleanUsername = String(username).toLowerCase().trim();
    const hashedPassword = await hashPassword(password);
    const id = crypto.randomUUID();
    const cleanRole = role === 'admin' ? 'admin' : 'user';
    const now = new Date().toISOString();

    // 1. Se Turso configurado, tenta gravar no banco
    if (isTursoConfigured()) {
      await ensureTursoSchema();
      try {
        await turso.execute({
          sql: `INSERT INTO app_users (id, username, password_hash, display_name, role, is_active, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
          args: [id, cleanUsername, hashedPassword, displayName.trim(), cleanRole, now, now],
        });
      } catch (err: any) {
        if (
          err.message &&
          (err.message.includes('UNIQUE constraint failed') || err.message.includes('SQLITE_CONSTRAINT'))
        ) {
          return NextResponse.json({ error: 'Este nome de usuário já está em uso' }, { status: 409 });
        }
        return NextResponse.json({ error: err.message || 'Erro ao criar usuário no banco' }, { status: 500 });
      }
    }

    // 2. Persiste também em disco local (data/local-users.json)
    const localList = await getLocalUsers();
    if (localList.some((u) => u.username.toLowerCase().trim() === cleanUsername)) {
      return NextResponse.json({ error: 'Este nome de usuário já está em uso' }, { status: 409 });
    }

    const newRecord = {
      id,
      username: cleanUsername,
      password_hash: hashedPassword,
      display_name: displayName.trim(),
      role: cleanRole as 'admin' | 'user',
      is_active: true,
      created_at: now,
      updated_at: now,
    };

    localList.unshift(newRecord);
    await saveLocalUsers(localList);

    return NextResponse.json(
      {
        user: {
          id,
          username: cleanUsername,
          display_name: displayName.trim(),
          role: cleanRole,
          is_active: true,
          created_at: now,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao criar usuário' }, { status: 500 });
  }
}
