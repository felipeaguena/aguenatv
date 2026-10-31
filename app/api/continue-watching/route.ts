import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { turso, isTursoConfigured, ensureTursoSchema } from '@/lib/turso';
import fs from 'fs/promises';
import path from 'path';
import { ContinueWatchingItem } from '@/lib/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const CONTINUE_WATCHING_FILE = path.join(DATA_DIR, 'local-continue-watching.json');

async function getLocalContinueWatching(): Promise<ContinueWatchingItem[]> {
  try {
    const raw = await fs.readFile(CONTINUE_WATCHING_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function saveLocalContinueWatching(items: ContinueWatchingItem[]): Promise<void> {
  // Em ambientes serverless como a Vercel, o sistema de arquivos raiz é read-only
  if (process.env.VERCEL) return;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(CONTINUE_WATCHING_FILE, JSON.stringify(items, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[ContinueWatching] Aviso: persistência em disco local indisponível:', err);
  }
}

// GET: Retorna os itens de Continue Assistindo ordenados por data mais recente
export async function GET() {
  const session = await getSession();
  const userId = session?.userId || 'local_user';

  // 1. Se o Turso estiver configurado, tenta buscar
  if (isTursoConfigured()) {
    try {
      await ensureTursoSchema();
      const res = await turso.execute({
        sql: 'SELECT * FROM continue_watching WHERE user_id = ? ORDER BY last_watched_at DESC LIMIT 25',
        args: [userId],
      });

      if (res.rows.length > 0) {
        return NextResponse.json({ items: res.rows });
      }
    } catch (e) {
      console.warn('[ContinueWatching] Turso falhou ou tabela ausente, usando arquivo local:', e);
    }
  }

  // 2. Fallback de Desenvolvimento / Localhost: Lê do arquivo JSON local
  const allItems = await getLocalContinueWatching();
  const sortedItems = allItems
    .filter(
      (item: any) =>
        !item.user_id ||
        item.user_id === userId ||
        item.user_id === 'local_user' ||
        item.user_id === '00000000-0000-0000-0000-000000000001'
    )
    .sort(
      (a, b) =>
        new Date(b.last_watched_at).getTime() - new Date(a.last_watched_at).getTime()
    );

  // Garante que cada título apareça apenas uma vez com o seu último capítulo assistido
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

  return NextResponse.json({ items: userItems.slice(0, 25) });
}

// POST: Salva ou atualiza o progresso de reprodução
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    const userId = session?.userId || 'local_user';
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
      return NextResponse.json({ error: 'streamId e streamType são obrigatórios' }, { status: 400 });
    }

    const curTime = Number(currentTime) || 0;
    const dur = Number(duration) || 0;
    const progressPercent = dur > 0 ? Math.min(100, Math.round((curTime / dur) * 1000) / 10) : 0;

    // Chave única: armazena 1 único registro por título, com o último capítulo assistido
    const effectiveStreamId = streamType === 'series' && seriesId ? String(seriesId) : String(streamId);
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

    // 1. Persiste no arquivo JSON local garantindo 1 único registro por título
    const allItems = await getLocalContinueWatching();
    const filtered = allItems.filter(
      (i: any) =>
        i.id !== uniqueId &&
        !(i.stream_type === streamType && (String(i.stream_id) === effectiveStreamId || String(i.series_id) === effectiveStreamId)) &&
        !String(i.id).startsWith(`${streamType}_${effectiveStreamId}_`)
    );
    // Insere no início
    const updated = [item, ...filtered].slice(0, 50);
    await saveLocalContinueWatching(updated);

    // 2. Se o Turso estiver configurado, salva na nuvem
    if (isTursoConfigured()) {
      try {
        await ensureTursoSchema();
        await turso.execute({
          sql: `INSERT INTO continue_watching (
                  id, user_id, stream_id, stream_type, title,
                  poster_url, backdrop_url, category_name,
                  episode_id, episode_num, season_num, episode_title,
                  current_time, duration, progress_percentage, last_watched_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  user_id = excluded.user_id,
                  stream_id = excluded.stream_id,
                  stream_type = excluded.stream_type,
                  title = excluded.title,
                  poster_url = excluded.poster_url,
                  backdrop_url = excluded.backdrop_url,
                  category_name = excluded.category_name,
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
            item.episode_id || null,
            item.episode_num !== undefined ? item.episode_num : null,
            item.season_num !== undefined ? item.season_num : null,
            item.episode_title || null,
            curTime,
            dur,
            progressPercent,
            item.last_watched_at,
          ],
        });
      } catch (e) {
        console.warn('[ContinueWatching] Erro ao sincronizar com Turso:', e);
      }
    }

    return NextResponse.json({ success: true, item });
  } catch (error) {
    console.error('[ContinueWatching] Erro no POST:', error);
    return NextResponse.json({ error: 'Erro ao salvar progresso' }, { status: 500 });
  }
}

// DELETE: Remove um item do Continue Assistindo
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const streamId = searchParams.get('streamId');
    const streamType = searchParams.get('streamType');

    if (!id && (!streamId || !streamType)) {
      return NextResponse.json({ error: 'id ou streamId+streamType são necessários' }, { status: 400 });
    }

    const allItems = await getLocalContinueWatching();
    const updated = allItems.filter((i: any) => {
      if (id && i.id === id) return false;
      if (streamId && streamType && i.stream_id === streamId && i.stream_type === streamType) return false;
      return true;
    });
    await saveLocalContinueWatching(updated);

    if (isTursoConfigured()) {
      try {
        await ensureTursoSchema();
        if (id) {
          await turso.execute({
            sql: 'DELETE FROM continue_watching WHERE id = ?',
            args: [id],
          });
        } else if (streamId && streamType) {
          await turso.execute({
            sql: 'DELETE FROM continue_watching WHERE stream_id = ? AND stream_type = ?',
            args: [String(streamId), streamType],
          });
        }
      } catch (e) {
        console.warn('[ContinueWatching] Erro ao deletar no Turso:', e);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[ContinueWatching] Erro no DELETE:', error);
    return NextResponse.json({ error: 'Erro ao remover item' }, { status: 500 });
  }
}
