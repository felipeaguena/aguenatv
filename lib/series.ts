import { SeriesInfoResponse, SeriesSeason, SeriesEpisode } from './types';

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
      const realCount =
        seriesInfo.episodes?.[String(sNum)]?.length ||
        seriesInfo.episodes?.[sNum]?.length ||
        0;

      seasonMap.set(sNum, {
        ...s,
        season_number: sNum,
        name: s.name || (sNum === 0 ? 'Especiais' : `Temporada ${sNum}`),
        episode_count: realCount,
      });
    });
  }

  // 2. Mapeia chaves de episódios (garante que temporadas existentes no servidor apareçam, ex: Temporada 2)
  if (seriesInfo.episodes) {
    Object.keys(seriesInfo.episodes).forEach((sKey) => {
      const sNum = Number(sKey);
      const eps = seriesInfo.episodes![sKey] || [];
      const existing = seasonMap.get(sNum);
      if (existing) {
        existing.episode_count = eps.length;
      } else {
        seasonMap.set(sNum, {
          season_number: sNum,
          name: sNum === 0 ? 'Especiais' : `Temporada ${sNum}`,
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
  // Prioriza Temporada 1 se existir
  const s1 = sortedSeasons.find((s) => s.season_number === 1);
  if (s1) return '1';
  // Se não existir temporada 1, pega a primeira temporada regular (não especial)
  const firstRegular = sortedSeasons.find((s) => !isSpecialSeason(s));
  if (firstRegular) return String(firstRegular.season_number);
  // Fallback para a primeira temporada disponível
  return String(sortedSeasons[0].season_number);
}

export function getEpisodesForSeason(
  seriesInfo: SeriesInfoResponse | null,
  seasonKey: string | number
): SeriesEpisode[] {
  if (!seriesInfo?.episodes) return [];
  const sStr = String(seasonKey);
  const sNum = Number(seasonKey);

  let eps = seriesInfo.episodes[sStr] || seriesInfo.episodes[sNum];

  // Se for temporada especial e não encontrou com a chave numérica, busca por 'specials' ou 'especiais'
  if ((!eps || eps.length === 0) && (sStr === '0' || sStr.toLowerCase().includes('especia'))) {
    const specialKey = Object.keys(seriesInfo.episodes).find(
      (k) => k.toLowerCase().includes('especia') || k.toLowerCase().includes('special') || k === '0'
    );
    if (specialKey) {
      eps = seriesInfo.episodes[specialKey];
    }
  }

  return eps || [];
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

