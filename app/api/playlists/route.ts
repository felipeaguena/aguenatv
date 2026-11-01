import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { turso, isTursoConfigured, ensureTursoSchema } from '@/lib/turso';
import { IPTVPlaylist } from '@/lib/types';
import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const PLAYLISTS_FILE = path.join(DATA_DIR, 'local-playlists.json');

async function getLocalFilePlaylists(): Promise<Record<string, IPTVPlaylist[]>> {
  try {
    const raw = await fs.readFile(PLAYLISTS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveLocalFilePlaylists(data: Record<string, IPTVPlaylist[]>): Promise<void> {
  if (process.env.VERCEL) return;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(PLAYLISTS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[Playlists] Erro ao salvar playlists locais:', err);
  }
}

// GET /api/playlists - Retorna as playlists do usuário logado
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const userId = session.userId;

  // 1. Se Turso configurado, busca do banco
  if (isTursoConfigured()) {
    try {
      await ensureTursoSchema();
      const res = await turso.execute({
        sql: 'SELECT * FROM user_playlists WHERE user_id = ? ORDER BY created_at ASC',
        args: [userId],
      });

      const playlists: IPTVPlaylist[] = res.rows.map((row: any) => ({
        id: String(row.id),
        name: String(row.name),
        server_url: String(row.server_url),
        username: String(row.username),
        password: String(row.password),
        is_active: Boolean(row.is_active),
        created_at: String(row.created_at),
        updated_at: row.updated_at ? String(row.updated_at) : undefined,
        last_synced: row.last_synced ? Number(row.last_synced) : undefined,
        channels_count: row.channels_count ? Number(row.channels_count) : undefined,
        movies_count: row.movies_count ? Number(row.movies_count) : undefined,
        series_count: row.series_count ? Number(row.series_count) : undefined,
      }));

      return NextResponse.json({ playlists });
    } catch (e) {
      console.warn('[Playlists] Turso falhou, usando fallback em arquivo local:', e);
    }
  }

  // 2. Fallback de arquivo local por usuário
  const allUserPlaylists = await getLocalFilePlaylists();
  const userLists = allUserPlaylists[userId] || [];
  return NextResponse.json({ playlists: userLists });
}

// POST /api/playlists - Salva a lista completa de playlists do usuário logado
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const userId = session.userId;
  const body = await req.json();
  const playlists: IPTVPlaylist[] = Array.isArray(body.playlists) ? body.playlists : [];

  // 1. Salva no Turso se configurado
  if (isTursoConfigured()) {
    try {
      await ensureTursoSchema();
      await turso.execute({
        sql: 'DELETE FROM user_playlists WHERE user_id = ?',
        args: [userId],
      });

      for (const pl of playlists) {
        await turso.execute({
          sql: `INSERT INTO user_playlists 
                (id, user_id, name, server_url, username, password, is_active, created_at, updated_at, last_synced, channels_count, movies_count, series_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            pl.id,
            userId,
            pl.name,
            pl.server_url,
            pl.username,
            pl.password,
            pl.is_active ? 1 : 0,
            pl.created_at || new Date().toISOString(),
            pl.updated_at || new Date().toISOString(),
            pl.last_synced || null,
            pl.channels_count || null,
            pl.movies_count || null,
            pl.series_count || null,
          ],
        });
      }

      return NextResponse.json({ success: true, playlists });
    } catch (e) {
      console.warn('[Playlists] Erro ao salvar playlists no Turso, usando fallback:', e);
    }
  }

  // 2. Salva no arquivo local persistente no servidor
  const allUserPlaylists = await getLocalFilePlaylists();
  allUserPlaylists[userId] = playlists;
  await saveLocalFilePlaylists(allUserPlaylists);

  return NextResponse.json({ success: true, playlists });
}
