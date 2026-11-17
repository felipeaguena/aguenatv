import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { turso, isTursoConfigured, ensureTursoSchema } from '@/lib/turso';
import { ensureDataMigratedToFelipeAguena } from '@/lib/users-local';
import {
  NO_STORE_HEADERS,
  readJsonFileSafe,
  runWithFileLock,
  writeJsonFileAtomic,
} from '@/lib/json-store';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const FAVORITES_FILE = path.join(DATA_DIR, 'local-favorites.json');

interface LocalFavoriteRow {
  id: string;
  user_id: string;
  stream_id: string;
  stream_type: string;
  title: string;
  poster_url?: string | null;
  category_name?: string | null;
  rating?: string | null;
  created_at?: string;
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401, headers: NO_STORE_HEADERS });
  }

  await ensureDataMigratedToFelipeAguena();

  if (isTursoConfigured()) {
    try {
      await ensureTursoSchema();
      const res = await turso.execute({
        sql: 'SELECT * FROM favorites WHERE user_id = ? ORDER BY created_at DESC',
        args: [session.userId],
      });

      return NextResponse.json(
        { favorites: res.rows, userId: session.userId },
        { headers: NO_STORE_HEADERS }
      );
    } catch (e) {
      console.warn('[Favorites] Turso falhou, usando armazenamento local:', e);
    }
  }

  const allFavorites = await readJsonFileSafe<LocalFavoriteRow[]>(FAVORITES_FILE, []);
  const userFavorites = allFavorites
    .filter((f) => f.user_id === session.userId)
    .sort(
      (a, b) =>
        new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );

  return NextResponse.json(
    { favorites: userFavorites, userId: session.userId },
    { headers: NO_STORE_HEADERS }
  );
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401, headers: NO_STORE_HEADERS });
  }

  await ensureDataMigratedToFelipeAguena();

  const body = await req.json();
  const { streamId, streamType, title, posterUrl, categoryName, rating } = body;

  if (!streamId || !streamType || !title) {
    return NextResponse.json({ error: 'Dados incompletos' }, { status: 400, headers: NO_STORE_HEADERS });
  }

  if (isTursoConfigured()) {
    try {
      await ensureTursoSchema();
      const favId = `fav_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const now = new Date().toISOString();

      await turso.execute({
        sql: `INSERT INTO favorites (id, user_id, stream_id, stream_type, title, poster_url, category_name, rating, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(user_id, stream_id, stream_type) DO UPDATE SET
                title = excluded.title,
                poster_url = excluded.poster_url,
                category_name = excluded.category_name,
                rating = excluded.rating`,
        args: [
          favId,
          session.userId,
          String(streamId),
          streamType,
          title,
          posterUrl || null,
          categoryName || null,
          rating ? String(rating) : null,
          now,
        ],
      });

      const res = await turso.execute({
        sql: 'SELECT * FROM favorites WHERE user_id = ? AND stream_id = ? AND stream_type = ? LIMIT 1',
        args: [session.userId, String(streamId), streamType],
      });

      if (res.rows.length > 0) {
        return NextResponse.json(
          { favorite: res.rows[0], userId: session.userId },
          { status: 201, headers: NO_STORE_HEADERS }
        );
      }
    } catch (e) {
      console.warn('[Favorites] Falha no Turso, gravando em persistência local:', e);
    }
  }

  const newFav: LocalFavoriteRow = {
    id: `fav_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    user_id: session.userId,
    stream_id: String(streamId),
    stream_type: streamType,
    title,
    poster_url: posterUrl || null,
    category_name: categoryName || null,
    rating: rating ? String(rating) : null,
    created_at: new Date().toISOString(),
  };

  await runWithFileLock(FAVORITES_FILE, async () => {
    const allFavorites = await readJsonFileSafe<LocalFavoriteRow[]>(FAVORITES_FILE, []);
    const filtered = allFavorites.filter(
      (f) =>
        !(
          f.user_id === session.userId &&
          String(f.stream_id) === String(streamId) &&
          f.stream_type === streamType
        )
    );
    filtered.unshift(newFav);
    await writeJsonFileAtomic(FAVORITES_FILE, filtered);
  });

  return NextResponse.json(
    { favorite: newFav, userId: session.userId },
    { status: 201, headers: NO_STORE_HEADERS }
  );
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const { searchParams } = new URL(req.url);
  const streamId = searchParams.get('streamId');
  const streamType = searchParams.get('streamType');

  if (!streamId || !streamType) {
    return NextResponse.json({ error: 'Parâmetros insuficientes' }, { status: 400, headers: NO_STORE_HEADERS });
  }

  if (isTursoConfigured()) {
    try {
      await ensureTursoSchema();
      await turso.execute({
        sql: 'DELETE FROM favorites WHERE user_id = ? AND stream_id = ? AND stream_type = ?',
        args: [session.userId, String(streamId), streamType],
      });
      return NextResponse.json(
        { success: true, message: 'Removido dos favoritos', userId: session.userId },
        { headers: NO_STORE_HEADERS }
      );
    } catch (e) {
      console.warn('[Favorites] Falha ao deletar do Turso:', e);
    }
  }

  await runWithFileLock(FAVORITES_FILE, async () => {
    const allFavorites = await readJsonFileSafe<LocalFavoriteRow[]>(FAVORITES_FILE, []);
    const filtered = allFavorites.filter(
      (f) =>
        !(
          f.user_id === session.userId &&
          String(f.stream_id) === String(streamId) &&
          f.stream_type === streamType
        )
    );
    await writeJsonFileAtomic(FAVORITES_FILE, filtered);
  });

  return NextResponse.json(
    { success: true, message: 'Removido dos favoritos', userId: session.userId },
    { headers: NO_STORE_HEADERS }
  );
}
