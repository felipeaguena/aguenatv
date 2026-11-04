import { NextRequest, NextResponse } from 'next/server';
import { turso, isTursoConfigured, ensureTursoSchema } from '@/lib/turso';
import { verifyPassword } from '@/lib/password';
import { createSession } from '@/lib/auth';
import { checkIpBlock, registerFailedAttempt, clearIpAttempts } from '@/lib/rate-limit';
import { UserRole } from '@/lib/types';
import {
  findLocalUserByUsername,
  getLocalUsers,
} from '@/lib/users-local';

function getClientIp(req: NextRequest): string {
  // 1. Tenta cabeçalho confiável de proxy reverso (Nginx, Caddy, Vercel)
  const realIp = req.headers.get('x-real-ip');
  if (realIp && realIp.trim().length > 0) {
    return realIp.trim();
  }

  const vercelIp = req.headers.get('x-vercel-forwarded-for');
  if (vercelIp && vercelIp.trim().length > 0) {
    return vercelIp.split(',')[0].trim();
  }

  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor && forwardedFor.trim().length > 0) {
    return forwardedFor.split(',')[0].trim();
  }

  return '127.0.0.1';
}

export async function POST(req: NextRequest) {
  try {
    // 1. Extração segura do IP do cliente
    const clientIp = getClientIp(req);

    // 2. Proteção Anti-Brute-Force: Checagem de bloqueio de 1 hora
    const ipStatus = await checkIpBlock(clientIp);
    if (ipStatus.blocked) {
      return NextResponse.json(
        {
          error: `Acesso bloqueado por segurança. Muitas tentativas incorretas. Tente novamente em ${ipStatus.remainingMinutes} minutos.`,
          isBlocked: true,
          remainingMinutes: ipStatus.remainingMinutes,
        },
        { status: 429 }
      );
    }

    // 3. Validação dos dados do formulário
    const body = await req.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json({ error: 'Preencha usuário e senha' }, { status: 400 });
    }

    const cleanUsername = String(username).toLowerCase().trim();
    let userRecord: any = null;

    // 4. Busca no Turso se configurado
    if (isTursoConfigured()) {
      try {
        await ensureTursoSchema();
        const res = await turso.execute({
          sql: 'SELECT * FROM app_users WHERE username = ? LIMIT 1',
          args: [cleanUsername],
        });

        if (res.rows.length > 0) {
          const row: any = res.rows[0];
          userRecord = {
            id: String(row.id),
            username: String(row.username),
            password_hash: String(row.password_hash),
            display_name: String(row.display_name),
            role: row.role as UserRole,
            is_active: Boolean(row.is_active),
            created_at: row.created_at,
            updated_at: row.updated_at,
          };
        }
      } catch (err) {
        console.warn('Erro ao consultar Turso, utilizando persistência local:', err);
      }
    }

    // 5. Fallback para persistência local em disco (data/local-users.json)
    if (!userRecord) {
      const localUser = await findLocalUserByUsername(cleanUsername);
      if (localUser) {
        userRecord = localUser;
      } else {
        // Se a lista de usuários ainda não foi inicializada em disco, obtém a lista inicial padrão
        const localList = await getLocalUsers();
        const found = localList.find((u) => u.username.toLowerCase().trim() === cleanUsername);
        if (found) {
          userRecord = found;
        }
      }
    }

    // 6. Verificação estrita e segura da senha via Bcrypt (sem backdoors)
    let isValidPassword = false;
    if (userRecord && userRecord.is_active && userRecord.password_hash) {
      isValidPassword = await verifyPassword(String(password), userRecord.password_hash);
    }

    // Se usuário não encontrado ou senha incorreta -> registra tentativa falha
    if (!isValidPassword) {
      const { blockedNow } = await registerFailedAttempt(clientIp);

      if (blockedNow) {
        return NextResponse.json(
          {
            error: 'Você atingiu 3 tentativas incorretas. Seu IP foi bloqueado por 1 hora.',
            isBlocked: true,
            remainingMinutes: 60,
          },
          { status: 429 }
        );
      }

      return NextResponse.json(
        {
          error: 'Usuário ou senha incorretos.',
        },
        { status: 401 }
      );
    }

    // 7. Login bem-sucedido -> limpa tentativas do IP
    await clearIpAttempts(clientIp);

    // 8. Criação da sessão em Cookie Seguro HTTP-Only
    await createSession({
      id: userRecord.id,
      username: userRecord.username,
      displayName: userRecord.display_name || userRecord.username,
      role: userRecord.role as UserRole,
    });

    return NextResponse.json({
      success: true,
      user: {
        id: userRecord.id,
        username: userRecord.username,
        displayName: userRecord.display_name,
        role: userRecord.role,
      },
    });
  } catch (error) {
    console.error('Erro na API de Login:', error);
    return NextResponse.json({ error: 'Erro interno ao processar login' }, { status: 500 });
  }
}
