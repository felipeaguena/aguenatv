import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { turso, isTursoConfigured, ensureTursoSchema } from '@/lib/turso';
import { hashPassword } from '@/lib/password';
import { getLocalUsers, saveLocalUsers } from '@/lib/users-local';
import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { username, displayName, role, password, isActive } = body;

  // Proteção contra auto-bloqueio do administrador logado
  if (session.userId === id) {
    if (isActive === false) {
      return NextResponse.json(
        { error: 'Você não pode desativar sua própria conta de administrador logada' },
        { status: 400 }
      );
    }
    if (role && role !== 'admin') {
      return NextResponse.json(
        { error: 'Você não pode remover seu próprio privilégio de administrador' },
        { status: 400 }
      );
    }
  }

  const now = new Date().toISOString();
  let updatedPasswordHash: string | undefined;
  if (password && password.trim().length > 0) {
    updatedPasswordHash = await hashPassword(password);
  }

  // 1. Atualização no Turso (se configurado)
  if (isTursoConfigured()) {
    await ensureTursoSchema();
    try {
      const updates: string[] = [];
      const args: any[] = [];

      if (username && username.trim().length > 0) {
        updates.push('username = ?');
        args.push(String(username).toLowerCase().trim());
      }
      if (displayName && displayName.trim().length > 0) {
        updates.push('display_name = ?');
        args.push(displayName.trim());
      }
      if (role && (role === 'admin' || role === 'user')) {
        updates.push('role = ?');
        args.push(role);
      }
      if (typeof isActive === 'boolean') {
        updates.push('is_active = ?');
        args.push(isActive ? 1 : 0);
      }
      if (updatedPasswordHash) {
        updates.push('password_hash = ?');
        args.push(updatedPasswordHash);
      }

      updates.push('updated_at = ?');
      args.push(now);
      args.push(id);

      await turso.execute({
        sql: `UPDATE app_users SET ${updates.join(', ')} WHERE id = ?`,
        args,
      });
    } catch (err: any) {
      if (
        err.message &&
        (err.message.includes('UNIQUE constraint failed') || err.message.includes('SQLITE_CONSTRAINT'))
      ) {
        return NextResponse.json(
          { error: 'Este nome de usuário já está em uso por outra conta' },
          { status: 409 }
        );
      }
      console.warn('Erro ao atualizar usuário no Turso:', err);
    }
  }

  // 2. Persistência em disco local (data/local-users.json)
  const localList = await getLocalUsers();
  const index = localList.findIndex((u) => u.id === id);

  let targetUser = index >= 0 ? localList[index] : null;

  if (targetUser) {
    if (username && username.trim().length > 0) {
      const cleanUser = String(username).toLowerCase().trim();
      // Checa duplicidade com outro usuário
      if (localList.some((u) => u.id !== id && u.username.toLowerCase().trim() === cleanUser)) {
        return NextResponse.json(
          { error: 'Este nome de usuário já está em uso por outra conta' },
          { status: 409 }
        );
      }
      targetUser.username = cleanUser;
    }
    if (displayName && displayName.trim().length > 0) {
      targetUser.display_name = displayName.trim();
    }
    if (role && (role === 'admin' || role === 'user')) {
      targetUser.role = role;
    }
    if (typeof isActive === 'boolean') {
      targetUser.is_active = isActive;
    }
    if (updatedPasswordHash) {
      targetUser.password_hash = updatedPasswordHash;
    }
    targetUser.updated_at = now;

    localList[index] = targetUser;
    await saveLocalUsers(localList);
  } else {
    targetUser = {
      id,
      username: username ? String(username).toLowerCase().trim() : 'felipeaguena',
      display_name: displayName ? displayName.trim() : 'Felipe Aguena',
      role: role || 'admin',
      is_active: typeof isActive === 'boolean' ? isActive : true,
      password_hash: updatedPasswordHash || '',
      created_at: now,
      updated_at: now,
    };
    localList.push(targetUser);
    await saveLocalUsers(localList);
  }

  return NextResponse.json({
    user: {
      id: targetUser.id,
      username: targetUser.username,
      display_name: targetUser.display_name,
      role: targetUser.role,
      is_active: targetUser.is_active,
      created_at: targetUser.created_at,
      updated_at: targetUser.updated_at,
    },
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const { id } = await params;

  // Evita que o próprio admin logado se autoexclua acidentalmente
  if (session.userId === id) {
    return NextResponse.json({ error: 'Você não pode excluir sua própria conta logada' }, { status: 400 });
  }

  // 1. Remove do Turso se configurado (inclui dados em cascata de favoritos, watched, continue e playlists)
  if (isTursoConfigured()) {
    await ensureTursoSchema();
    try {
      await turso.batch([
        { sql: 'DELETE FROM app_users WHERE id = ?', args: [id] },
        { sql: 'DELETE FROM favorites WHERE user_id = ?', args: [id] },
        { sql: 'DELETE FROM watched_items WHERE user_id = ?', args: [id] },
        { sql: 'DELETE FROM continue_watching WHERE user_id = ?', args: [id] },
        { sql: 'DELETE FROM user_playlists WHERE user_id = ?', args: [id] },
      ], 'write');
    } catch (err: any) {
      console.warn('Erro ao deletar usuário no Turso:', err);
    }
  }

  // 2. Remove da persistência local
  const localList = await getLocalUsers();
  const filtered = localList.filter((u) => u.id !== id);
  await saveLocalUsers(filtered);

  // Limpa arquivos locais de favoritos, watched, continue-watching e playlists
  try {
    const favPath = path.join(DATA_DIR, 'local-favorites.json');
    const rawFav = await fs.readFile(favPath, 'utf-8').catch(() => '[]');
    const favs = JSON.parse(rawFav);
    await fs.writeFile(favPath, JSON.stringify(favs.filter((f: any) => f.user_id !== id), null, 2), 'utf-8');
  } catch {}

  try {
    const watchedPath = path.join(DATA_DIR, 'local-watched.json');
    const rawWatched = await fs.readFile(watchedPath, 'utf-8').catch(() => '[]');
    const watched = JSON.parse(rawWatched);
    await fs.writeFile(watchedPath, JSON.stringify(watched.filter((w: any) => w.user_id !== id), null, 2), 'utf-8');
  } catch {}

  try {
    const continuePath = path.join(DATA_DIR, 'local-continue-watching.json');
    const rawContinue = await fs.readFile(continuePath, 'utf-8').catch(() => '[]');
    const cont = JSON.parse(rawContinue);
    await fs.writeFile(continuePath, JSON.stringify(cont.filter((c: any) => c.user_id !== id), null, 2), 'utf-8');
  } catch {}

  try {
    const playlistsPath = path.join(DATA_DIR, 'local-playlists.json');
    const rawPlaylists = await fs.readFile(playlistsPath, 'utf-8').catch(() => '{}');
    const pl = JSON.parse(rawPlaylists);
    if (pl[id]) {
      delete pl[id];
      await fs.writeFile(playlistsPath, JSON.stringify(pl, null, 2), 'utf-8');
    }
  } catch {}

  return NextResponse.json({ success: true, message: 'Usuário e seus dados exclusivos removidos com sucesso' });
}
