import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { turso, isTursoConfigured, ensureTursoSchema } from '@/lib/turso';
import { ensureDataMigratedToFelipeAguena } from '@/lib/users-local';
import { ContinueWatchingItem } from '@/lib/types';
import {
  NO_STORE_HEADERS,
  readJsonFileSafe,
  runWithFileLock,
  writeJsonFileAtomic,
} from '@/lib/json-store';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const CONTINUE_WATCHING_FILE = path.join(DATA_DIR, 'local-continue-watching.json');
const CONTINUE_WATCHING_BACKUP = path.join(DATA_DIR, 'local-continue-watching.bak.json');

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401, headers: NO_STORE_HEADERS });
  }
  const userId = session.userId;

  await ensureDataMigratedToFelipeAguena();

  // 1. Se o Turso estiver configurado, retorna estritamente do banco para o usuário logado
  if (isTursoConfigured()) {
    try {
      await ensureTursoSchema();
      const res = await turso.execute({
        sql: 'SELECT * FROM continue_watching WHERE user_id = ? ORDER BY last_watched_at DESC LIMIT 25',
        args: [userId],
      });

      return NextResponse.json({ items: res.rows, userId }, { headers: NO_STORE_HEADERS });
    } catch (e) {
      console.warn('[ContinueWatching] Turso falhou, usando arquivo local:', e);
    }
  }

  // 2. Fallback em disco: estritamente o user_id logado
  const allItems = await readJsonFileSafe<ContinueWatchingItem[]>(
    CONTINUE_WATCHING_FILE,
    [],
    CONTINUE_WATCHING_BACKUP
  );
  const sortedItems = allItems
    .filter((item) => item.user_id === userId)
    .sort(
      (a, b) =>
        new Date(b.last_watched_at).getTime() - new Date(a.last_watched_at).getTime()
    );

  const seenTitles = new Set<string>();
  const userItems: ContinueWatchingItem[] = [];

  for (const it of sortedItems) {
    const key = `${it.stream_type}_${it.series_id || it.stream_id}`;
    if (!seenTitles.has(key)) {
      seenTitles.add(key);
      userItems.push({
        ...it,
        id: key,
      });
    }
  }

  return NextResponse.json(
    { items: userItems.slice(0, 25), userId },
    { headers: NO_STORE_HEADERS }
  );
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401, headers: NO_STORE_HEADERS });
    }
    const userId = session.userId;

    await ensureDataMigratedToFelipeAguena();

    const body = await req.json();
    const {
      streamId,
      streamType,
      title,
      posterUrl,
      backdropUrl,
      categoryName,
      seriesId,
      seriesTitle,
      episodeId,
      episodeNum,
      seasonNum,
      episodeTitle,
      currentTime,
      duration,
    } = body;

    if (!streamId || !streamType) {
      return NextResponse.json(
        { error: 'streamId e streamType são obrigatórios' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const curTime = Number(currentTime) || 0;
    const dur = Number(duration) || 0;
    const progressPercent = dur > 0 ? Math.min(100, Math.round((curTime / dur) * 1000) / 10) : 0;

    const effectiveStreamId =
      streamType === 'series' && seriesId ? String(seriesId) : String(streamId);
    const uniqueId = `${streamType}_${effectiveStreamId}`;

    const item: ContinueWatchingItem & { user_id?: string } = {
      id: uniqueId,
      user_id: userId,
      stream_id: effectiveStreamId,
      stream_type: streamType,
      title: streamType === 'series' && seriesTitle ? seriesTitle : title || 'Título',
      poster_url: posterUrl || undefined,
      backdrop_url: backdropUrl || undefined,
      category_name: categoryName || undefined,
      series_id: seriesId ? String(seriesId) : undefined,
      series_title: seriesTitle || undefined,
      episode_id: episodeId ? String(episodeId) : undefined,
      episode_num: episodeNum !== undefined ? episodeNum : undefined,
      season_num: seasonNum !== undefined ? seasonNum : undefined,
      episode_title: episodeTitle || undefined,
      current_time: curTime,
      duration: dur,
      progress_percentage: progressPercent,
      last_watched_at: new Date().toISOString(),
    };

    // 1. Se o Turso estiver configurado, grava com chave composta (user_id, id)
    if (isTursoConfigured()) {
      try {
        await ensureTursoSchema();
        await turso.execute({
          sql: `INSERT INTO continue_watching (
                  id, user_id, stream_id, stream_type, title,
                  poster_url, backdrop_url, category_name,
                  series_id, series_title,
                  episode_id, episode_num, season_num, episode_title,
                  current_time, duration, progress_percentage, last_watched_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id, id) DO UPDATE SET
                  stream_id = excluded.stream_id,
                  stream_type = excluded.stream_type,
                  title = excluded.title,
                  poster_url = excluded.poster_url,
                  backdrop_url = excluded.backdrop_url,
                  category_name = excluded.category_name,
                  series_id = excluded.series_id,
                  series_title = excluded.series_title,
                  episode_id = excluded.episode_id,
                  episode_num = excluded.episode_num,
                  season_num = excluded.season_num,
                  episode_title = excluded.episode_title,
                  current_time = excluded.current_time,
                  duration = excluded.duration,
                  progress_percentage = excluded.progress_percentage,
                  last_watched_at = excluded.last_watched_at`,
          args: [
            uniqueId,
            userId,
            effectiveStreamId,
            streamType,
            item.title,
            item.poster_url || null,
            item.backdrop_url || null,
            item.category_name || null,
            item.series_id || null,
            item.series_title || null,
            item.episode_id || null,
            item.episode_num !== undefined ? Number(item.episode_num) : null,
            item.season_num !== undefined ? Number(item.season_num) : null,
            item.episode_title || null,
            curTime,
            dur,
            progressPercent,
            item.last_watched_at,
          ],
        });

        return NextResponse.json({ success: true, item, userId }, { headers: NO_STORE_HEADERS });
      } catch (e) {
        console.warn('[ContinueWatching] Erro ao sincronizar com Turso, usando fallback local:', e);
      }
    }

    // 2. Persistência local com mutex e escrita atômica isolada por usuário
    await runWithFileLock(CONTINUE_WATCHING_FILE, async () => {
      const allItems = await readJsonFileSafe<ContinueWatchingItem[]>(
        CONTINUE_WATCHING_FILE,
        [],
        CONTINUE_WATCHING_BACKUP
      );
      const filtered = allItems.filter(
        (i) =>
          !(
            i.user_id === userId &&
            (i.id === uniqueId ||
              (i.stream_type === streamType &&
                (String(i.stream_id) === effectiveStreamId ||
                  String(i.series_id) === effectiveStreamId)) ||
              String(i.id).startsWith(`${streamType}_${effectiveStreamId}_`))
          )
      );
      const updated = [item, ...filtered];
      await writeJsonFileAtomic(CONTINUE_WATCHING_FILE, updated, CONTINUE_WATCHING_BACKUP);
    });

    return NextResponse.json({ success: true, item, userId }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error('[ContinueWatching] Erro no POST:', error);
    return NextResponse.json(
      { error: 'Erro ao salvar progresso' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401, headers: NO_STORE_HEADERS });
    }
    const userId = session.userId;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const streamId = searchParams.get('streamId');
    const streamType = searchParams.get('streamType');

    if (!id && (!streamId || !streamType)) {
      return NextResponse.json(
        { error: 'id ou streamId+streamType são necessários' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (isTursoConfigured()) {
      try {
        await ensureTursoSchema();
        if (id) {
          await turso.execute({
            sql: 'DELETE FROM continue_watching WHERE id = ? AND user_id = ?',
            args: [id, userId],
          });
        } else if (streamId && streamType) {
          await turso.execute({
            sql: 'DELETE FROM continue_watching WHERE stream_id = ? AND stream_type = ? AND user_id = ?',
            args: [String(streamId), streamType, userId],
          });
        }
        return NextResponse.json({ success: true, userId }, { headers: NO_STORE_HEADERS });
      } catch (e) {
        console.warn('[ContinueWatching] Erro ao deletar no Turso:', e);
      }
    }

    await runWithFileLock(CONTINUE_WATCHING_FILE, async () => {
      const allItems = await readJsonFileSafe<ContinueWatchingItem[]>(
        CONTINUE_WATCHING_FILE,
        [],
        CONTINUE_WATCHING_BACKUP
      );
      const updated = allItems.filter((i) => {
        if (i.user_id !== userId) return true;
        if (id && i.id === id) return false;
        if (streamId && streamType && i.stream_id === streamId && i.stream_type === streamType) {
          return false;
        }
        return true;
      });
      await writeJsonFileAtomic(CONTINUE_WATCHING_FILE, updated, CONTINUE_WATCHING_BACKUP);
    });

    return NextResponse.json({ success: true, userId }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error('[ContinueWatching] Erro no DELETE:', error);
    return NextResponse.json(
      { error: 'Erro ao remover item' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
