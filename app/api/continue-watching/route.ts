import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { turso, isTursoConfigured, ensureTursoSchema } from '@/lib/turso';
import { ensureDataMigratedToFelipeAguena } from '@/lib/users-local';
import fs from 'fs/promises';
import path from 'path';
import { ContinueWatchingItem } from '@/lib/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const CONTINUE_WATCHING_FILE = path.join(DATA_DIR, 'local-continue-watching.json');
const CONTINUE_WATCHING_BACKUP = path.join(DATA_DIR, 'local-continue-watching.bak.json');

// Mutex de fila em memória para garantir operações de leitura/escrita atômicas sem race condition
let writeQueue = Promise.resolve();
function runWithLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(fn, fn);
  writeQueue = result.then(() => {}, () => {});
  return result;
}

async function getLocalContinueWatching(): Promise<ContinueWatchingItem[]> {
  try {
    const raw = await fs.readFile(CONTINUE_WATCHING_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      if (parsed.length > 0) {
        // Mantém cópia de backup redundante sempre atualizada
        fs.writeFile(CONTINUE_WATCHING_BACKUP, raw, 'utf-8').catch(() => {});
      }
      return parsed;
    }
  } catch (err) {
    console.warn('[ContinueWatching] Falha ao ler arquivo principal, verificando backup redundante:', err);
  }

  // Fallback seguro para o backup caso o arquivo principal esteja corrompido ou vazio
  try {
    const bkpRaw = await fs.readFile(CONTINUE_WATCHING_BACKUP, 'utf-8');
    const parsedBkp = JSON.parse(bkpRaw);
    if (Array.isArray(parsedBkp) && parsedBkp.length > 0) {
      console.info('[ContinueWatching] Restaurando dados a partir do backup redundante');
      return parsedBkp;
    }
  } catch {}

  return [];
}

async function saveLocalContinueWatching(items: ContinueWatchingItem[]): Promise<void> {
  if (process.env.VERCEL) return;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const content = JSON.stringify(items, null, 2);

    // Escrita atômica segura via arquivo temporário + renomeação para evitar arquivos truncados
    const tmpFile = `${CONTINUE_WATCHING_FILE}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    await fs.writeFile(tmpFile, content, 'utf-8');
    await fs.rename(tmpFile, CONTINUE_WATCHING_FILE);

    if (items.length > 0) {
      await fs.writeFile(CONTINUE_WATCHING_BACKUP, content, 'utf-8').catch(() => {});
    }
  } catch (err) {
    console.warn('[ContinueWatching] Aviso: persistência em disco local indisponível:', err);
  }
}

// GET: Retorna os itens de Continue Assistindo ordenados por data mais recente estritamente do usuário logado
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }
  const userId = session.userId;

  await ensureDataMigratedToFelipeAguena();

  // 1. Se o Turso estiver configurado, busca por user_id estrito
  if (isTursoConfigured()) {
    try {
      await ensureTursoSchema();
      const res = await turso.execute({
        sql: 'SELECT * FROM continue_watching WHERE user_id = ? ORDER BY last_watched_at DESC LIMIT 25',
        args: [userId],
      });

      if (res.rows.length > 0) {
        return NextResponse.json({ items: res.rows, userId });
      }
    } catch (e) {
      console.warn('[ContinueWatching] Turso falhou ou tabela ausente, usando arquivo local:', e);
    }
  }

  // 2. Armazenamento local: estritamente o user_id logado
  const allItems = await getLocalContinueWatching();
  const sortedItems = allItems
    .filter((item: any) => item.user_id === userId)
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

  return NextResponse.json({ items: userItems.slice(0, 25), userId });
}

// POST: Salva ou atualiza o progresso de reprodução estritamente para o usuário logado
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
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
      return NextResponse.json({ error: 'streamId e streamType são obrigatórios' }, { status: 400 });
    }

    const curTime = Number(currentTime) || 0;
    const dur = Number(duration) || 0;
    const progressPercent = dur > 0 ? Math.min(100, Math.round((curTime / dur) * 1000) / 10) : 0;

    // Chave única: armazena 1 único registro por título para este usuário
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

    // 1. Persiste no arquivo JSON local com bloqueio de concorrência e isolamento estrito de usuário
    await runWithLock(async () => {
      const allItems = await getLocalContinueWatching();
      const filtered = allItems.filter(
        (i: any) =>
          !(
            i.user_id === userId &&
            (i.id === uniqueId ||
              (i.stream_type === streamType && (String(i.stream_id) === effectiveStreamId || String(i.series_id) === effectiveStreamId)) ||
              String(i.id).startsWith(`${streamType}_${effectiveStreamId}_`))
          )
      );
      const updated = [item, ...filtered];
      await saveLocalContinueWatching(updated);
    });

    // 2. Se o Turso estiver configurado, salva na nuvem
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
                ON CONFLICT(id) DO UPDATE SET
                  user_id = excluded.user_id,
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
                  last_watched_at = excluded.last_watched_at
                WHERE continue_watching.user_id = excluded.user_id`,
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

    return NextResponse.json({ success: true, item, userId });
  } catch (error) {
    console.error('[ContinueWatching] Erro no POST:', error);
    return NextResponse.json({ error: 'Erro ao salvar progresso' }, { status: 500 });
  }
}

// DELETE: Remove um item do Continue Assistindo do usuário logado
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    const userId = session.userId;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const streamId = searchParams.get('streamId');
    const streamType = searchParams.get('streamType');

    if (!id && (!streamId || !streamType)) {
      return NextResponse.json({ error: 'id ou streamId+streamType são necessários' }, { status: 400 });
    }

    await runWithLock(async () => {
      const allItems = await getLocalContinueWatching();
      const updated = allItems.filter((i: any) => {
        if (i.user_id !== userId) return true; // Preserva itens de outros usuários
        if (id && i.id === id) return false;
        if (streamId && streamType && i.stream_id === streamId && i.stream_type === streamType) return false;
        return true;
      });
      await saveLocalContinueWatching(updated);
    });

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
      } catch (e) {
        console.warn('[ContinueWatching] Erro ao deletar no Turso:', e);
      }
    }

    return NextResponse.json({ success: true, userId });
  } catch (error) {
    console.error('[ContinueWatching] Erro no DELETE:', error);
    return NextResponse.json({ error: 'Erro ao remover item' }, { status: 500 });
  }
}
