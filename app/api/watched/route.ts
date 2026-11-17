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
const WATCHED_FILE = path.join(DATA_DIR, 'local-watched.json');

interface LocalWatchedRow {
  id: string;
  user_id: string;
  stream_id: string;
  stream_type: string;
  title: string;
  poster_url?: string | null;
  category_name?: string | null;
  rating?: string | null;
  progress_seconds: number;
  is_completed: boolean;
  watched_at?: string;
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
        sql: 'SELECT * FROM watched_items WHERE user_id = ? ORDER BY watched_at DESC',
        args: [session.userId],
      });

      const items = res.rows.map((row: Record<string, unknown>) => ({
        ...row,
        is_completed: Boolean(row.is_completed),
      }));

      return NextResponse.json(
        { watched: items, userId: session.userId },
        { headers: NO_STORE_HEADERS }
      );
    } catch (e) {
      console.warn('[Watched] Falha no Turso, usando armazenamento local:', e);
    }
  }

  const allWatched = await readJsonFileSafe<LocalWatchedRow[]>(WATCHED_FILE, []);
  const userWatched = allWatched
    .filter((w) => w.user_id === session.userId)
    .sort(
      (a, b) =>
        new Date(b.watched_at || 0).getTime() - new Date(a.watched_at || 0).getTime()
    );

  return NextResponse.json(
    { watched: userWatched, userId: session.userId },
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
  const { streamId, streamType, title, posterUrl, categoryName, rating, progressSeconds, isCompleted } = body;

  if (!streamId || !streamType || !title) {
    return NextResponse.json({ error: 'Dados incompletos' }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const isComp = typeof isCompleted === 'boolean' ? (isCompleted ? 1 : 0) : 1;
  const now = new Date().toISOString();

  if (isTursoConfigured()) {
    try {
      await ensureTursoSchema();
      const watchedId = `watched_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      await turso.execute({
        sql: `INSERT INTO watched_items (id, user_id, stream_id, stream_type, title, poster_url, category_name, rating, progress_seconds, is_completed, watched_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(user_id, stream_id, stream_type) DO UPDATE SET
                title = excluded.title,
                poster_url = coalesce(excluded.poster_url, watched_items.poster_url),
                category_name = coalesce(excluded.category_name, watched_items.category_name),
                rating = coalesce(excluded.rating, watched_items.rating),
                progress_seconds = excluded.progress_seconds,
                is_completed = excluded.is_completed,
                watched_at = excluded.watched_at`,
        args: [
          watchedId,
          session.userId,
          String(streamId),
          streamType,
          title,
          posterUrl || null,
          categoryName || null,
          rating ? String(rating) : null,
          progressSeconds || 0,
          isComp,
          now,
        ],
      });

      const res = await turso.execute({
        sql: 'SELECT * FROM watched_items WHERE user_id = ? AND stream_id = ? AND stream_type = ? LIMIT 1',
        args: [session.userId, String(streamId), streamType],
      });

      if (res.rows.length > 0) {
        const row = res.rows[0] as Record<string, unknown>;
        return NextResponse.json(
          {
            watchedItem: {
              ...row,
              is_completed: Boolean(row.is_completed),
            },
            userId: session.userId,
          },
          { status: 201, headers: NO_STORE_HEADERS }
        );
      }
    } catch (e) {
      console.warn('[Watched] Falha no Turso, usando persistência local:', e);
    }
  }

  const newWatched: LocalWatchedRow = {
    id: `watched_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    user_id: session.userId,
    stream_id: String(streamId),
    stream_type: streamType,
    title,
    poster_url: posterUrl || null,
    category_name: categoryName || null,
    rating: rating ? String(rating) : null,
    progress_seconds: progressSeconds || 0,
    is_completed: typeof isCompleted === 'boolean' ? isCompleted : true,
    watched_at: now,
  };

  await runWithFileLock(WATCHED_FILE, async () => {
    const allWatched = await readJsonFileSafe<LocalWatchedRow[]>(WATCHED_FILE, []);
    const filtered = allWatched.filter(
      (w) =>
        !(
          w.user_id === session.userId &&
          String(w.stream_id) === String(streamId) &&
          w.stream_type === streamType
        )
    );
    filtered.unshift(newWatched);
    await writeJsonFileAtomic(WATCHED_FILE, filtered);
  });

  return NextResponse.json(
    { watchedItem: newWatched, userId: session.userId },
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
        sql: 'DELETE FROM watched_items WHERE user_id = ? AND stream_id = ? AND stream_type = ?',
        args: [session.userId, String(streamId), streamType],
      });
      return NextResponse.json(
        { success: true, message: 'Item removido do histórico', userId: session.userId },
        { headers: NO_STORE_HEADERS }
      );
    } catch (e) {
      console.warn('[Watched] Falha ao deletar do Turso:', e);
    }
  }

  await runWithFileLock(WATCHED_FILE, async () => {
    const allWatched = await readJsonFileSafe<LocalWatchedRow[]>(WATCHED_FILE, []);
    const filtered = allWatched.filter(
      (w) =>
        !(
          w.user_id === session.userId &&
          String(w.stream_id) === String(streamId) &&
          w.stream_type === streamType
        )
    );
    await writeJsonFileAtomic(WATCHED_FILE, filtered);
  });

  return NextResponse.json(
    { success: true, message: 'Item removido do histórico', userId: session.userId },
    { headers: NO_STORE_HEADERS }
  );
}
