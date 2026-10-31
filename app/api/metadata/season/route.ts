import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import {
  searchTMDbWithVariants,
  getFromCache,
  setInCache,
} from '@/lib/title-search';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const rawTitle = searchParams.get('title');
  const tmdbIdParam = searchParams.get('tmdbId');
  let season = searchParams.get('season') || '1';
  const customYear = searchParams.get('year');
  const offsetParam = Number(searchParams.get('offset')) || 0;

  if (!rawTitle && !tmdbIdParam) {
    return NextResponse.json({ error: 'Título ou tmdbId é obrigatório' }, { status: 400 });
  }

  // Normaliza temporadas especiais para 0
  if (season.toLowerCase().includes('espec') || season.toLowerCase().includes('special')) {
    season = '0';
  }

  const cacheKey = `season_meta_${tmdbIdParam || rawTitle}_${season}_${offsetParam}`;
  const cached = getFromCache<any>(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=43200' },
    });
  }

  const tmdbKey = process.env.TMDB_API_KEY;
  if (!tmdbKey) {
    return NextResponse.json({
      season,
      officialEpisodeCount: 0,
      releasedEpisodeCount: 0,
      unreleasedEpisodeCount: 0,
      episodes: {},
    });
  }

  try {
    let showId: number | null = tmdbIdParam ? Number(tmdbIdParam) : null;
    let showName: string | undefined = undefined;

    // Se não tiver tmdbId prévio, utiliza o motor de variantes inteligentes com cruzamento Kitsu
    if (!showId && rawTitle) {
      const match = await searchTMDbWithVariants('tv', rawTitle, customYear || null, tmdbKey);
      if (match?.show) {
        showId = match.show.id;
        showName = match.show.name;
      }
    }

    if (!showId) {
      const emptyRes = {
        season,
        officialEpisodeCount: 0,
        releasedEpisodeCount: 0,
        unreleasedEpisodeCount: 0,
        episodes: {},
      };
      setInCache(cacheKey, emptyRes, 600);
      return NextResponse.json(emptyRes);
    }

    // 2. Busca informações gerais da série para obter o total de episódios da série completa
    let showTotalEpisodes: number | undefined = undefined;
    let showTotalSeasons: number | undefined = undefined;
    try {
      const showDetailsUrl = `https://api.themoviedb.org/3/tv/${showId}?api_key=${tmdbKey}&language=pt-BR`;
      const showDetailsRes = await fetch(showDetailsUrl, { next: { revalidate: 86400 } });
      if (showDetailsRes.ok) {
        const sDetails = await showDetailsRes.json();
        showTotalEpisodes = sDetails.number_of_episodes;
        showTotalSeasons = sDetails.number_of_seasons;
        if (!showName) showName = sDetails.name;
      }
    } catch (e) {}

    // 3. Busca episódios da temporada solicitada em Português
    const seasonUrl = `https://api.themoviedb.org/3/tv/${showId}/season/${season}?api_key=${tmdbKey}&language=pt-BR`;
    const seasonRes = await fetch(seasonUrl, { next: { revalidate: 86400 } });
    let seasonData = seasonRes.ok ? await seasonRes.json() : null;

    // Se a temporada não foi encontrada no TMDb (ex: anime onde todas as temporadas estão em S01 como Oshi no Ko)
    let tmdbEpisodes = seasonData?.episodes || [];
    if (tmdbEpisodes.length === 0 && Number(season) > 1) {
      // Tenta buscar a Temporada 1 e aplicar o offset cumulativo
      const s1Url = `https://api.themoviedb.org/3/tv/${showId}/season/1?api_key=${tmdbKey}&language=pt-BR`;
      const s1Res = await fetch(s1Url, { next: { revalidate: 86400 } });
      if (s1Res.ok) {
        const s1Data = await s1Res.json();
        const allS1 = s1Data.episodes || [];
        if (allS1.length > offsetParam) {
          // Remapeia episódios a partir do offset
          tmdbEpisodes = allS1.slice(offsetParam).map((e: any, idx: number) => ({
            ...e,
            episode_number: idx + 1,
          }));
        }
      }
    }

    // Fallback de Sinopse em Inglês se a maioria dos episódios em pt-BR estiver sem sinopse
    const emptyOverviews = tmdbEpisodes.filter((e: any) => !e.overview || !e.overview.trim());
    if (tmdbEpisodes.length > 0 && emptyOverviews.length > tmdbEpisodes.length / 2) {
      try {
        const enSeasonUrl = `https://api.themoviedb.org/3/tv/${showId}/season/${season}?api_key=${tmdbKey}&language=en-US`;
        const enRes = await fetch(enSeasonUrl, { next: { revalidate: 86400 } });
        if (enRes.ok) {
          const enData = await enRes.json();
          const enEps: any[] = enData.episodes || [];
          const enMap = new Map<number, string>();
          enEps.forEach((ep) => {
            if (ep.overview && ep.overview.trim()) {
              enMap.set(ep.episode_number, ep.overview.trim());
            }
          });

          tmdbEpisodes = tmdbEpisodes.map((e: any) => {
            if (!e.overview || !e.overview.trim()) {
              const enOverview = enMap.get(e.episode_number);
              if (enOverview) {
                return { ...e, overview: enOverview };
              }
            }
            return e;
          });
        }
      } catch (e) {}
    }

    // Mapeia episódios indexados pelo número do episódio e calcula contagem oficial de episódios lançados
    const today = new Date().toISOString().split('T')[0];
    const totalOfficialEpisodes = tmdbEpisodes.length;
    const releasedEpisodes = tmdbEpisodes.filter((e: any) => !e.air_date || e.air_date <= today).length;
    const unreleasedEpisodes = totalOfficialEpisodes - releasedEpisodes;

    const episodeMap: Record<number, any> = {};
    tmdbEpisodes.forEach((e: any) => {
      episodeMap[e.episode_number] = {
        episodeNumber: e.episode_number,
        name: e.name || `Episódio ${e.episode_number}`,
        overview: e.overview || undefined,
        airDate: e.air_date || undefined,
        thumbnailUrl: e.still_path ? `https://image.tmdb.org/t/p/w500${e.still_path}` : undefined,
        rating: e.vote_average ? Number(e.vote_average.toFixed(1)) : undefined,
      };
    });

    const result = {
      season,
      showId,
      showName,
      officialEpisodeCount: totalOfficialEpisodes,
      releasedEpisodeCount: releasedEpisodes,
      unreleasedEpisodeCount: unreleasedEpisodes,
      showTotalEpisodes,
      showTotalSeasons,
      episodes: episodeMap,
    };

    setInCache(cacheKey, result);
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=43200' },
    });
  } catch (e) {
    console.warn('[Metadata Season] Erro ao buscar episódios da temporada:', e);
    return NextResponse.json(
      {
        season,
        officialEpisodeCount: 0,
        releasedEpisodeCount: 0,
        unreleasedEpisodeCount: 0,
        episodes: {},
      },
      {
        headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=300' },
      }
    );
  }
}
