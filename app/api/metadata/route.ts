import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { EnrichedMetadata, CastMember } from '@/lib/types';
import {
  searchTMDbWithVariants,
  generateSearchVariants,
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
  const type = searchParams.get('type') || 'movie';
  const customYear = searchParams.get('year');
  const category = (searchParams.get('category') || '').trim();

  if (!rawTitle) {
    return NextResponse.json({ error: 'Título é obrigatório' }, { status: 400 });
  }

  const cacheKey = `meta_${type}_${rawTitle}_${customYear || ''}_${category}`;
  const cached = getFromCache<EnrichedMetadata>(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=43200' },
    });
  }

  const isMovie = type === 'movie';
  const tmdbKey = process.env.TMDB_API_KEY;
  const endpoint = isMovie ? 'movie' : 'tv';

  // 1. TIER 1: The Movie Database (TMDb) com Busca por Variantes Inteligentes e Cruzamento
  if (tmdbKey) {
    try {
      const searchResult = await searchTMDbWithVariants(endpoint, rawTitle, customYear, tmdbKey);
      const first = searchResult?.show;

      if (first) {
        // Busca detalhes completos (elenco, trailers do YouTube, classificação, traduções e títulos alternativos)
        const detailsUrl = `https://api.themoviedb.org/3/${endpoint}/${first.id}?api_key=${tmdbKey}&language=pt-BR&append_to_response=credits,videos,translations,alternative_titles`;
        const detailsRes = await fetch(detailsUrl, { next: { revalidate: 86400 } });

        if (detailsRes.ok) {
          const d = await detailsRes.json();

          // Trailer oficial do YouTube
          const videos = d.videos?.results || [];
          const trailer =
            videos.find((v: any) => v.site === 'YouTube' && v.type === 'Trailer') ||
            videos.find((v: any) => v.site === 'YouTube');

          // Elenco principal
          const castList: CastMember[] = (d.credits?.cast || []).slice(0, 8).map((c: any) => ({
            name: c.name,
            character: c.character,
            profileUrl: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : undefined,
          }));

          // Extração das traduções oficiais de idioma do TMDb
          const translationsList = d.translations?.translations || [];
          const ptTranslation =
            translationsList.find((t: any) => t.iso_639_1 === 'pt' && t.iso_3166_1 === 'BR') ||
            translationsList.find((t: any) => t.iso_639_1 === 'pt');
          const enTranslation =
            translationsList.find((t: any) => t.iso_639_1 === 'en' && t.iso_3166_1 === 'US') ||
            translationsList.find((t: any) => t.iso_639_1 === 'en');

          const tmdbTitlePt = ptTranslation?.data?.name || ptTranslation?.data?.title;
          const tmdbTitleEn = enTranslation?.data?.name || enTranslation?.data?.title;

          // Extração dos títulos alternativos conhecidos no TMDb
          const rawAltTitles = d.alternative_titles?.results || d.alternative_titles?.titles || [];
          const tmdbAltTitles: string[] = rawAltTitles
            .map((a: any) => a.title)
            .filter((t: any): t is string => Boolean(t && typeof t === 'string' && t.trim().length > 1));

          // Verificação: É ANIME?
          const genreIds: number[] = (d.genres || []).map((g: any) => g.id);
          const isAnimation =
            genreIds.includes(16) ||
            (first.genre_ids || []).includes(16) ||
            (d.genres || []).some((g: any) => g.name?.toLowerCase().includes('anima'));
          const isJapanese =
            d.original_language === 'ja' ||
            (d.origin_country || []).includes('JP') ||
            (d.production_countries || []).some((c: any) => c.iso_3166_1 === 'JP');
          const hasAnimeTag =
            category.toLowerCase().includes('anime') ||
            rawTitle.toLowerCase().includes('anime');

          const isAnime = (isAnimation && isJapanese) || hasAnimeTag || Boolean(searchResult.kitsuEnrichment);

          // Se for anime, enriquece com Kitsu para obter dados adicionais e títulos em Romaji/Inglês
          let kitsuEnrichment: any = searchResult.kitsuEnrichment || null;
          if (isAnime && !kitsuEnrichment) {
            try {
              // Tenta com original_name, original_title ou o primeiro título alternativo em Romaji
              const animeQueries = [
                d.original_name,
                d.original_title,
                tmdbAltTitles[0],
                tmdbTitleEn,
                first.name,
              ].filter(Boolean);

              for (const q of animeQueries) {
                const kitsuUrl = `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(q)}&page[limit]=1`;
                const kitsuRes = await fetch(kitsuUrl, {
                  headers: {
                    Accept: 'application/vnd.api+json',
                    'User-Agent': 'IPTV-Miruro/1.0',
                  },
                  next: { revalidate: 86400 },
                });
                if (kitsuRes.ok) {
                  const kData = await kitsuRes.json();
                  if (kData.data && kData.data.length > 0) {
                    kitsuEnrichment = kData.data[0].attributes;
                    break;
                  }
                }
              }
            } catch (err) {
              console.warn('[Metadata] Falha ao enriquecer anime via Kitsu:', err);
            }
          }

          // Consolidação de Títulos Multilíngues (Português, Inglês, Romaji e Japonês)
          const kitsuTitleEn = kitsuEnrichment?.titles?.en || kitsuEnrichment?.titles?.en_us;
          const kitsuTitleRomaji = kitsuEnrichment?.titles?.en_jp || kitsuEnrichment?.canonicalTitle;
          const kitsuTitleJp = kitsuEnrichment?.titles?.ja_jp;
          const kitsuAbbreviated: string[] = Array.isArray(kitsuEnrichment?.abbreviatedTitles)
            ? kitsuEnrichment.abbreviatedTitles
            : [];

          const titlePortuguese =
            tmdbTitlePt || d.title || d.name || first.title || first.name;
          const titleEnglish =
            kitsuTitleEn ||
            tmdbTitleEn ||
            (d.original_language === 'en' ? (d.original_title || d.original_name) : undefined);
          const titleRomanized =
            kitsuTitleRomaji ||
            (isJapanese ? (d.original_title || d.original_name) : undefined);
          const originalTitle =
            kitsuTitleJp || d.original_title || d.original_name;

          // Agrupamento de aliases únicos para busca facilitada
          const aliasesSet = new Set<string>();
          kitsuAbbreviated.forEach((a: string) => { if (a && a.trim()) aliasesSet.add(a.trim()); });
          tmdbAltTitles.slice(0, 15).forEach((a: string) => { if (a && a.trim()) aliasesSet.add(a.trim()); });
          if (titlePortuguese) aliasesSet.add(titlePortuguese);
          if (titleEnglish) aliasesSet.add(titleEnglish);
          if (titleRomanized) aliasesSet.add(titleRomanized);
          if (originalTitle) aliasesSet.add(originalTitle);

          // Monta resposta consolidada garantindo idioma em Português e fidelidade
          const metadata: EnrichedMetadata = {
            tmdbId: first.id,
            source: kitsuEnrichment ? 'tmdb+kitsu' : 'tmdb',
            title: d.title || d.name || first.title || first.name,
            titlePortuguese,
            titleEnglish,
            titleRomanized,
            originalTitle,
            aliases: Array.from(aliasesSet),
            overview: d.overview || first.overview || kitsuEnrichment?.synopsis,
            backdropUrl: d.backdrop_path
              ? `https://image.tmdb.org/t/p/original${d.backdrop_path}`
              : (kitsuEnrichment?.coverImage?.original || kitsuEnrichment?.coverImage?.large),
            posterUrl: d.poster_path
              ? `https://image.tmdb.org/t/p/w600_and_h900_bestv2${d.poster_path}`
              : (kitsuEnrichment?.posterImage?.large || kitsuEnrichment?.posterImage?.original),
            rating: d.vote_average
              ? Number(d.vote_average.toFixed(1))
              : (kitsuEnrichment?.averageRating
                  ? Number((Number(kitsuEnrichment.averageRating) / 10).toFixed(1))
                  : undefined),
            genres: d.genres?.map((g: any) => g.name) || [],
            releaseDate: d.release_date || d.first_air_date || kitsuEnrichment?.startDate,
            year:
              (d.release_date || d.first_air_date || kitsuEnrichment?.startDate || '').slice(0, 4) ||
              customYear ||
              undefined,
            status:
              kitsuEnrichment?.status === 'finished'
                ? 'Finalizado'
                : kitsuEnrichment?.status === 'current'
                ? 'Em Lançamento'
                : d.status,
            totalEpisodes: d.number_of_episodes || kitsuEnrichment?.episodeCount || undefined,
            totalSeasons: d.number_of_seasons || undefined,
            ageRating: kitsuEnrichment?.ageRatingGuide || kitsuEnrichment?.ageRating,
            cast: castList,
            trailerUrl: trailer?.key
              ? `https://www.youtube.com/watch?v=${trailer.key}`
              : kitsuEnrichment?.youtubeVideoId
              ? `https://www.youtube.com/watch?v=${kitsuEnrichment.youtubeVideoId}`
              : undefined,
            trailerEmbedUrl: trailer?.key
              ? `https://www.youtube.com/embed/${trailer.key}`
              : kitsuEnrichment?.youtubeVideoId
              ? `https://www.youtube.com/embed/${kitsuEnrichment.youtubeVideoId}`
              : undefined,
          };

          setInCache(cacheKey, metadata);
          return NextResponse.json(metadata, {
            headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=43200' },
          });
        }
      }
    } catch (e) {
      console.warn('[Metadata] Erro ao buscar no TMDb:', e);
    }
  }

  // 2. Se o TMDb NÃO encontrou o título: Kitsu direto para Animes
  const { variants, year: extractedYear } = generateSearchVariants(rawTitle);
  const explicitlyAnime =
    category.toLowerCase().includes('anime') ||
    rawTitle.toLowerCase().includes('anime');

  if (explicitlyAnime) {
    for (const q of variants.slice(0, 3)) {
      try {
        const kitsuUrl = `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(q)}&page[limit]=1`;
        const kitsuRes = await fetch(kitsuUrl, {
          headers: {
            Accept: 'application/vnd.api+json',
            'User-Agent': 'IPTV-Miruro/1.0',
          },
          next: { revalidate: 86400 },
        });

        if (kitsuRes.ok) {
          const kitsuData = await kitsuRes.json();
          if (kitsuData.data && kitsuData.data.length > 0) {
            const a = kitsuData.data[0].attributes;
            const kTitleEn = a.titles?.en || a.titles?.en_us || a.canonicalTitle;
            const kTitleRomaji = a.titles?.en_jp || a.canonicalTitle;
            const kTitleJp = a.titles?.ja_jp || a.titles?.en_jp;
            const kAbbr: string[] = Array.isArray(a.abbreviatedTitles) ? a.abbreviatedTitles : [];

            const kAliases = new Set<string>();
            kAbbr.forEach((x: string) => { if (x && x.trim()) kAliases.add(x.trim()); });
            if (kTitleEn) kAliases.add(kTitleEn);
            if (kTitleRomaji) kAliases.add(kTitleRomaji);
            if (kTitleJp) kAliases.add(kTitleJp);

            const metadata: EnrichedMetadata = {
              source: 'kitsu',
              title: a.canonicalTitle,
              titlePortuguese: undefined,
              titleEnglish: kTitleEn,
              titleRomanized: kTitleRomaji,
              originalTitle: kTitleJp,
              aliases: Array.from(kAliases),
              overview: a.synopsis,
              backdropUrl: a.coverImage?.original || a.coverImage?.large,
              posterUrl: a.posterImage?.large || a.posterImage?.original || a.posterImage?.medium,
              rating: a.averageRating ? Number((Number(a.averageRating) / 10).toFixed(1)) : undefined,
              releaseDate: a.startDate,
              year: (a.startDate || '').slice(0, 4) || customYear || extractedYear || undefined,
              status: a.status === 'finished' ? 'Finalizado' : a.status === 'current' ? 'Em Lançamento' : a.status,
              totalEpisodes: a.episodeCount || undefined,
              ageRating: a.ageRatingGuide || a.ageRating,
              trailerUrl: a.youtubeVideoId ? `https://www.youtube.com/watch?v=${a.youtubeVideoId}` : undefined,
              trailerEmbedUrl: a.youtubeVideoId ? `https://www.youtube.com/embed/${a.youtubeVideoId}` : undefined,
            };

            setInCache(cacheKey, metadata);
            return NextResponse.json(metadata, {
              headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=43200' },
            });
          }
        }
      } catch (e) {
        console.warn('[Metadata] Erro ao buscar no Kitsu:', e);
      }
    }
  }

  // 3. TIER 3: TVMaze API (Apenas para Séries de TV não-anime caso TMDb não tenha encontrado)
  if (!isMovie && !explicitlyAnime) {
    try {
      const tvQuery = variants[0] || rawTitle;
      const tvmazeUrl = `https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(tvQuery)}`;
      const tvmazeRes = await fetch(tvmazeUrl, { next: { revalidate: 86400 } });

      if (tvmazeRes.ok) {
        const tvData = await tvmazeRes.json();
        const cleanSummary = (tvData.summary || '').replace(/<[^>]+>/g, '').trim();

        const metadata: EnrichedMetadata = {
          source: 'tvmaze',
          title: tvData.name,
          overview: cleanSummary,
          posterUrl: tvData.image?.original || tvData.image?.medium,
          rating: tvData.rating?.average || undefined,
          genres: tvData.genres || [],
          releaseDate: tvData.premiered,
          year: (tvData.premiered || '').slice(0, 4) || customYear || extractedYear || undefined,
          status: tvData.status === 'Ended' ? 'Finalizado' : tvData.status === 'Running' ? 'Em Exibição' : tvData.status,
        };

        setInCache(cacheKey, metadata);
        return NextResponse.json(metadata, {
          headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=43200' },
        });
      }
    } catch (e) {
      console.warn('[Metadata] Erro ao buscar no TVMaze:', e);
    }
  }

  // Se não encontrou, armazena no cache por 10 minutos para evitar chamadas redundantes imediatas
  setInCache(cacheKey, { source: 'none' }, 600);
  return NextResponse.json(
    { source: 'none' },
    {
      status: 200,
      headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=300' },
    }
  );
}
