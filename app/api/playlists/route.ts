import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { turso, isTursoConfigured, ensureTursoSchema } from '@/lib/turso';
import { IPTVPlaylist } from '@/lib/types';
import { ensureDataMigratedToFelipeAguena } from '@/lib/users-local';
import {
  NO_STORE_HEADERS,
  readJsonFileSafe,
  runWithFileLock,
  writeJsonFileAtomic,
} from '@/lib/json-store';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const PLAYLISTS_FILE = path.join(DATA_DIR, 'local-playlists.json');

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401, headers: NO_STORE_HEADERS });
  }

  await ensureDataMigratedToFelipeAguena();

  const userId = session.userId;

  if (isTursoConfigured()) {
    try {
      await ensureTursoSchema();
      const res = await turso.execute({
        sql: 'SELECT * FROM user_playlists WHERE user_id = ? ORDER BY created_at ASC',
        args: [userId],
      });

      const playlists: IPTVPlaylist[] = res.rows.map((row: Record<string, unknown>) => ({
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

      return NextResponse.json({ playlists, userId }, { headers: NO_STORE_HEADERS });
    } catch (e) {
      console.warn('[Playlists] Turso falhou, usando fallback em arquivo local:', e);
    }
  }

  const allUserPlaylists = await readJsonFileSafe<Record<string, IPTVPlaylist[]>>(
    PLAYLISTS_FILE,
    {}
  );
  const userLists = allUserPlaylists[userId] || [];
  return NextResponse.json({ playlists: userLists, userId }, { headers: NO_STORE_HEADERS });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401, headers: NO_STORE_HEADERS });
  }

  await ensureDataMigratedToFelipeAguena();

  const userId = session.userId;
  const body = await req.json();
  const playlists: IPTVPlaylist[] = Array.isArray(body.playlists) ? body.playlists : [];

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
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id, id) DO UPDATE SET
                  name = excluded.name,
                  server_url = excluded.server_url,
                  username = excluded.username,
                  password = excluded.password,
                  is_active = excluded.is_active,
                  updated_at = excluded.updated_at,
                  last_synced = excluded.last_synced,
                  channels_count = excluded.channels_count,
                  movies_count = excluded.movies_count,
                  series_count = excluded.series_count`,
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

      return NextResponse.json({ success: true, playlists, userId }, { headers: NO_STORE_HEADERS });
    } catch (e) {
      console.warn('[Playlists] Erro ao salvar playlists no Turso, usando fallback:', e);
    }
  }

  await runWithFileLock(PLAYLISTS_FILE, async () => {
    const allUserPlaylists = await readJsonFileSafe<Record<string, IPTVPlaylist[]>>(
      PLAYLISTS_FILE,
      {}
    );
    allUserPlaylists[userId] = playlists;
    await writeJsonFileAtomic(PLAYLISTS_FILE, allUserPlaylists);
  });

  return NextResponse.json({ success: true, playlists, userId }, { headers: NO_STORE_HEADERS });
}
