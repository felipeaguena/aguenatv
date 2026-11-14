import { SeriesInfoResponse, SeriesSeason, SeriesEpisode, WatchedItem } from './types';

/**
 * Converte coleções de episódios retornadas pela API IPTV (array ou mapa objeto)
 * em um array padronizado de `SeriesEpisode`.
 */
export function normalizeEpisodeList(raw: unknown): SeriesEpisode[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.filter((ep): ep is SeriesEpisode => Boolean(ep && typeof ep === 'object' && 'id' in ep));
  }
  if (typeof raw === 'object') {
    return Object.values(raw as Record<string, unknown>).filter(
      (ep): ep is SeriesEpisode => Boolean(ep && typeof ep === 'object' && 'id' in ep)
    );
  }
  return [];
}

export function isSpecialSeason(
  s: SeriesSeason | { season_number?: number | string; name?: string }
): boolean {
  const sNum = Number(s.season_number);
  const name = (s.name || '').toLowerCase();
  return sNum === 0 || name.includes('especia') || name.includes('special');
}

export function buildSortedSeasonList(seriesInfo: SeriesInfoResponse | null): SeriesSeason[] {
  if (!seriesInfo) return [];

  const seasonMap = new Map<number, SeriesSeason>();

  // 1. Mapeia metadados de temporadas (nomes, datas, pôsteres)
  if (Array.isArray(seriesInfo.seasons)) {
    seriesInfo.seasons.forEach((s) => {
      const sNum = Number(s.season_number);
      const epsForSeason = getEpisodesForSeason(seriesInfo, sNum);

      seasonMap.set(sNum, {
        ...s,
        season_number: sNum,
        name: s.name || (sNum === 0 ? 'Especiais' : `Temporada ${sNum}`),
        episode_count: epsForSeason.length,
      });
    });
  }

  // 2. Mapeia chaves de episódios (garante que temporadas existentes no servidor apareçam, ex: Temporada 2)
  if (seriesInfo.episodes && typeof seriesInfo.episodes === 'object') {
    Object.keys(seriesInfo.episodes).forEach((sKey) => {
      const sNum = Number(sKey);
      const safeNum = Number.isFinite(sNum) ? sNum : 0;
      const eps = normalizeEpisodeList((seriesInfo.episodes as Record<string, unknown>)[sKey]);
      const existing = seasonMap.get(safeNum);
      if (existing) {
        existing.episode_count = eps.length;
      } else {
        seasonMap.set(safeNum, {
          season_number: safeNum,
          name: safeNum === 0 ? 'Especiais' : `Temporada ${safeNum}`,
          episode_count: eps.length,
        });
      }
    });
  }

  // 3. Regra estrita de ordenação: Temporada 1 é sempre a primeira, 2, 3... e Especiais por último!
  return Array.from(seasonMap.values()).sort((a, b) => {
    const aSpec = isSpecialSeason(a);
    const bSpec = isSpecialSeason(b);

    // Especiais vão SEMPRE para o final da lista
    if (aSpec && !bSpec) return 1;
    if (!aSpec && bSpec) return -1;

    // Temporadas regulares ordenadas de forma crescente (1, 2, 3...)
    return a.season_number - b.season_number;
  });
}

export function getDefaultSeason(sortedSeasons: SeriesSeason[]): string {
  if (!sortedSeasons || sortedSeasons.length === 0) return '1';
  const nonEmpty = sortedSeasons.filter((s) => (s.episode_count ?? 0) > 0);
  const pool = nonEmpty.length > 0 ? nonEmpty : sortedSeasons;

  // Prioriza Temporada 1 se existir com episódios
  const s1 = pool.find((s) => s.season_number === 1);
  if (s1) return '1';
  // Se não existir temporada 1, pega a primeira temporada regular (não especial)
  const firstRegular = pool.find((s) => !isSpecialSeason(s));
  if (firstRegular) return String(firstRegular.season_number);
  // Fallback para a primeira temporada disponível
  return String(pool[0].season_number);
}

export function getEpisodesForSeason(
  seriesInfo: SeriesInfoResponse | null,
  seasonKey: string | number
): SeriesEpisode[] {
  if (!seriesInfo?.episodes || typeof seriesInfo.episodes !== 'object') return [];
  const episodesMap = seriesInfo.episodes as Record<string, unknown>;
  const sStr = String(seasonKey);
  const sNum = Number(seasonKey);

  let eps = normalizeEpisodeList(
    episodesMap[sStr] !== undefined
      ? episodesMap[sStr]
      : Number.isFinite(sNum)
      ? episodesMap[String(sNum)]
      : undefined
  );

  // Se for temporada especial e não encontrou com a chave numérica, busca por 'specials' ou 'especiais'
  if (eps.length === 0 && (sStr === '0' || sStr.toLowerCase().includes('especia'))) {
    const specialKey = Object.keys(episodesMap).find(
      (k) => k.toLowerCase().includes('especia') || k.toLowerCase().includes('special') || k === '0'
    );
    if (specialKey) {
      eps = normalizeEpisodeList(episodesMap[specialKey]);
    }
  }

  return eps;
}

/**
 * Localiza um episódio por ID em `seriesInfo.episodes` (normalizando arrays e mapas objeto).
 */
export function findEpisodeInSeriesInfo(
  seriesInfo: SeriesInfoResponse | null,
  episodeId: string | number,
  preferredSeason?: string | number
): { episode: SeriesEpisode; season: string } | null {
  if (!seriesInfo?.episodes || typeof seriesInfo.episodes !== 'object') return null;

  const targetId = String(episodeId);
  if (preferredSeason !== undefined && preferredSeason !== '') {
    const preferredEps = getEpisodesForSeason(seriesInfo, preferredSeason);
    const match = preferredEps.find((e) => String(e.id) === targetId);
    if (match) {
      return { episode: match, season: String(preferredSeason) };
    }
  }

  for (const sKey of Object.keys(seriesInfo.episodes)) {
    const list = normalizeEpisodeList((seriesInfo.episodes as Record<string, unknown>)[sKey]);
    const match = list.find((e) => String(e.id) === targetId);
    if (match) {
      return { episode: match, season: sKey };
    }
  }

  return null;
}

/**
 * Formata o título do capítulo no padrão estrito solicitado:
 * Exemplo: "E1S01 - Nome do capitulo"
 */
export function formatEpisodeTitle(
  episodeNum: number | string,
  seasonNum: number | string,
  rawEpisodeName?: string | null
): string {
  const ep = String(episodeNum || 1);
  const sDigits = String(seasonNum).replace(/\D/g, '');
  const sInt = sDigits ? parseInt(sDigits, 10) : (String(seasonNum).toLowerCase().includes('espec') ? 0 : 1);
  const sStr = String(sInt).padStart(2, '0');

  let cleanName = (rawEpisodeName || '').trim();

  // Remove redundâncias tipo "S01E01", "S1E1", "Episode 1", "Episódio 1"
  cleanName = cleanName.replace(/^[sS]\d+[eE]\d+[:\s\-]*/i, '').trim();
  cleanName = cleanName.replace(/^[eE]\d+[sS]\d+[:\s\-]*/i, '').trim();

  if (!cleanName || /^(epis[oó]dio|episode)\s*\d+$/i.test(cleanName)) {
    cleanName = `Episódio ${ep}`;
  }

  return `E${ep}S${sStr} - ${cleanName}`;
}

/**
 * Localiza o próximo capítulo após o último episódio marcado como assistido.
 * Caso nenhum episódio tenha sido assistido, retorna o primeiro episódio da série.
 * Caso o último episódio assistido seja o fim da série, retorna o primeiro episódio (permitindo recomeçar).
 */
export function findNextEpisodeToWatch(
  seriesInfo: SeriesInfoResponse | null,
  isWatchedFn: (streamId: string | number, streamType: string) => boolean,
  watchedList: WatchedItem[] = []
): (SeriesEpisode & { seasonNumber: string | number }) | null {
  if (!seriesInfo?.episodes) return null;

  const sortedSeasons = buildSortedSeasonList(seriesInfo);
  if (sortedSeasons.length === 0) return null;

  // Monta lista linear e ordenada de todos os episódios de todas as temporadas
  const allEpisodes: Array<SeriesEpisode & { seasonNumber: string | number }> = [];
  for (const season of sortedSeasons) {
    const eps = getEpisodesForSeason(seriesInfo, season.season_number);
    const sortedEps = [...eps].sort(
      (a, b) => Number(a.episode_num || 0) - Number(b.episode_num || 0)
    );
    for (const ep of sortedEps) {
      allEpisodes.push({
        ...ep,
        seasonNumber: season.season_number,
      });
    }
  }

  if (allEpisodes.length === 0) return null;

  // Filtra episódios da série marcados como assistidos
  const watchedEps = allEpisodes.filter((ep) => isWatchedFn(String(ep.id), 'series'));

  // Se nenhum episódio foi assistido ainda, retorna o primeiro episódio
  if (watchedEps.length === 0) {
    return allEpisodes[0];
  }

  // Identifica o último episódio assistido
  // Prioriza o episódio com a data mais recente (watched_at) na lista de assistidos
  let lastWatchedEp = watchedEps[watchedEps.length - 1];
  let latestTime = 0;

  for (const ep of watchedEps) {
    const wItem = watchedList.find(
      (w) =>
        String(w.stream_id) === String(ep.id) &&
        (w.stream_type === 'series' || !w.stream_type) &&
        w.is_completed
    );
    if (wItem?.watched_at) {
      const time = new Date(wItem.watched_at).getTime();
      if (time > latestTime) {
        latestTime = time;
        lastWatchedEp = ep;
      }
    }
  }

  // Encontra a posição do último episódio assistido na lista linear
  const lastIndex = allEpisodes.findIndex((ep) => String(ep.id) === String(lastWatchedEp.id));

  // Retorna o próximo episódio após o último assistido
  if (lastIndex >= 0 && lastIndex + 1 < allEpisodes.length) {
    return allEpisodes[lastIndex + 1];
  }

  // Se assistiu até o último episódio de toda a série, retorna o primeiro para recomeçar
  return allEpisodes[0];
}

