import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { SkipTimesData } from '@/lib/types';

// Cache em memória para tempos de abertura/encerramento (TTL de 2 horas)
const skipCache = new Map<string, { data: SkipTimesData; timestamp: number }>();
const CACHE_TTL_MS = 1000 * 60 * 60 * 2;

// Cache auxiliar para mapeamentos Kitsu -> MyAnimeList ID
const malIdCache = new Map<string, number>();

/**
 * Resolve o MyAnimeList ID através do Kitsu API para consultas no AniSkip
 */
async function resolveMalId(title: string): Promise<number | null> {
  const cleanTitle = title.trim();
  if (!cleanTitle) return null;

  const cached = malIdCache.get(cleanTitle.toLowerCase());
  if (cached) return cached;

  try {
    const kitsuUrl = `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(cleanTitle)}&page[limit]=1`;
    const res = await fetch(kitsuUrl, {
      headers: {
        Accept: 'application/vnd.api+json',
        'User-Agent': 'IPTV-Player/1.0',
      },
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) return null;
    const json = await res.json();
    const animeId = json.data?.[0]?.id;
    if (!animeId) return null;

    // Busca os mapeamentos externos do anime
    const mapRes = await fetch(`https://kitsu.io/api/edge/anime/${animeId}/mappings`, {
      headers: {
        Accept: 'application/vnd.api+json',
        'User-Agent': 'IPTV-Player/1.0',
      },
      signal: AbortSignal.timeout(4000),
    });

    if (!mapRes.ok) return null;
    const mapJson = await mapRes.json();
    const mappings = mapJson.data || [];

    const malMapping = mappings.find(
      (m: any) => m.attributes?.externalSite === 'myanimelist/anime'
    );

    if (malMapping?.attributes?.externalId) {
      const malId = Number(malMapping.attributes.externalId);
      if (!isNaN(malId) && malId > 0) {
        malIdCache.set(cleanTitle.toLowerCase(), malId);
        return malId;
      }
    }
  } catch (err) {
    console.warn('[SkipTimes] Erro ao resolver MAL ID para anime:', err);
  }

  return null;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const tmdbId = searchParams.get('tmdbId');
  const season = searchParams.get('season') || '1';
  const episode = searchParams.get('episode') || '1';
  const title = (searchParams.get('title') || '').trim();
  const category = (searchParams.get('category') || '').toLowerCase();
  const duration = Number(searchParams.get('duration')) || 0;

  if (!tmdbId && !title) {
    return NextResponse.json(
      { error: 'Parâmetros tmdbId ou title são obrigatórios' },
      { status: 400 }
    );
  }

  const cacheKey = `skip_${tmdbId || ''}_${season}_${episode}_${title.toLowerCase()}`;
  const cached = skipCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(cached.data, {
      headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=43200' },
    });
  }

  const isAnime =
    category.includes('anime') ||
    title.toLowerCase().includes('anime') ||
    category.includes('animes');

  // =========================================================================
  // 1. TIER 1: TheIntroDB v4 (Funciona com tmdb_id para Séries e Animes populares)
  // =========================================================================
  if (tmdbId) {
    try {
      const introDbUrl = `https://api.theintrodb.org/v4/media?tmdb_id=${encodeURIComponent(tmdbId)}&season=${encodeURIComponent(season)}&episode=${encodeURIComponent(episode)}`;
      const res = await fetch(introDbUrl, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(4500),
      });

      if (res.ok) {
        const data = await res.json();

        let intro = null;
        let outro = null;
        let recap = null;
        let preview = null;

        if (Array.isArray(data.intro) && data.intro.length > 0) {
          const item = data.intro.find((i: any) => typeof i.start_ms === 'number' && typeof i.end_ms === 'number' && i.end_ms > i.start_ms);
          if (item) {
            intro = {
              start: Math.round((item.start_ms / 1000) * 10) / 10,
              end: Math.round((item.end_ms / 1000) * 10) / 10,
            };
          }
        }

        if (Array.isArray(data.credits) && data.credits.length > 0) {
          const item = data.credits.find((c: any) => typeof c.start_ms === 'number' && c.start_ms > 0);
          if (item) {
            outro = {
              start: Math.round((item.start_ms / 1000) * 10) / 10,
              end: item.end_ms ? Math.round((item.end_ms / 1000) * 10) / 10 : 0,
            };
          }
        }

        if (Array.isArray(data.recap) && data.recap.length > 0) {
          const item = data.recap.find((r: any) => typeof r.start_ms === 'number' && typeof r.end_ms === 'number' && r.end_ms > r.start_ms);
          if (item) {
            recap = {
              start: Math.round((item.start_ms / 1000) * 10) / 10,
              end: Math.round((item.end_ms / 1000) * 10) / 10,
            };
          }
        }

        if (Array.isArray(data.preview) && data.preview.length > 0) {
          const item = data.preview.find((p: any) => typeof p.start_ms === 'number' && p.start_ms > 0);
          if (item) {
            preview = {
              start: Math.round((item.start_ms / 1000) * 10) / 10,
              end: item.end_ms ? Math.round((item.end_ms / 1000) * 10) / 10 : 0,
            };
          }
        }

        if (intro || outro) {
          const result: SkipTimesData = {
            found: true,
            source: 'theintrodb',
            intro,
            outro,
            recap,
            preview,
          };
          skipCache.set(cacheKey, { data: result, timestamp: Date.now() });
          return NextResponse.json(result, {
            headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=43200' },
          });
        }
      }
    } catch (err) {
      console.warn('[SkipTimes] Erro ao consultar TheIntroDB:', err);
    }
  }

  // =========================================================================
  // 2. TIER 2: AniSkip v2 (Especializado para Animes)
  // =========================================================================
  if (isAnime || title) {
    try {
      const malId = await resolveMalId(title);
      if (malId) {
        const aniSkipUrl = `https://api.aniskip.com/v2/skip-times/${malId}/${encodeURIComponent(episode)}?types=op&types=ed&episodeLength=${duration || 0}`;
        const res = await fetch(aniSkipUrl, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(4500),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.found && Array.isArray(data.results)) {
            let intro = null;
            let outro = null;

            for (const r of data.results) {
              if (r.skipType === 'op' && r.interval) {
                intro = {
                  start: Math.round(Number(r.interval.startTime) * 10) / 10,
                  end: Math.round(Number(r.interval.endTime) * 10) / 10,
                };
              } else if (r.skipType === 'ed' && r.interval) {
                outro = {
                  start: Math.round(Number(r.interval.startTime) * 10) / 10,
                  end: Math.round(Number(r.interval.endTime) * 10) / 10,
                };
              }
            }

            if (intro || outro) {
              const result: SkipTimesData = {
                found: true,
                source: 'aniskip',
                intro,
                outro,
              };
              skipCache.set(cacheKey, { data: result, timestamp: Date.now() });
              return NextResponse.json(result, {
                headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=43200' },
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn('[SkipTimes] Erro ao consultar AniSkip:', err);
    }
  }

  // Se nenhum provedor possuir dados para o episódio
  const notFoundResult: SkipTimesData = { found: false };
  skipCache.set(cacheKey, { data: notFoundResult, timestamp: Date.now() });

  return NextResponse.json(notFoundResult, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=1800' },
  });
}
