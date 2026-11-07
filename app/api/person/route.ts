import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { PersonDetails, PersonCredit } from '@/lib/types';
import { getFromCache, setInCache } from '@/lib/title-search';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const rawId = searchParams.get('id');
  const rawName = searchParams.get('name');

  if (!rawId && !rawName) {
    return NextResponse.json(
      { error: 'ID ou Nome do artista é obrigatório' },
      { status: 400 }
    );
  }

  const tmdbKey = process.env.TMDB_API_KEY;
  if (!tmdbKey) {
    return NextResponse.json(
      { error: 'Chave TMDb não configurada no servidor' },
      { status: 500 }
    );
  }

  const cacheKey = `person_${rawId || ''}_${(rawName || '').trim().toLowerCase()}`;
  const cached = getFromCache<PersonDetails>(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: {
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=43200',
      },
    });
  }

  try {
    let personId: number | null = null;

    // Se o ID passado já for um número válido do TMDb
    if (rawId && /^\d+$/.test(rawId.trim())) {
      personId = parseInt(rawId.trim(), 10);
    } else {
      // Caso contrário, busca pelo nome no TMDb
      const queryName = rawName || rawId || '';
      const searchUrl = `https://api.themoviedb.org/3/search/person?api_key=${tmdbKey}&query=${encodeURIComponent(
        queryName
      )}&language=pt-BR`;
      const searchRes = await fetch(searchUrl, { next: { revalidate: 86400 } });

      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.results && searchData.results.length > 0) {
          personId = searchData.results[0].id;
        }
      }
    }

    if (!personId) {
      return NextResponse.json(
        { error: 'Artista não encontrado no banco de dados' },
        { status: 404 }
      );
    }

    // Busca detalhes completos da pessoa e filmografia combinada (filmes e séries)
    const detailsUrl = `https://api.themoviedb.org/3/person/${personId}?api_key=${tmdbKey}&language=pt-BR&append_to_response=combined_credits,external_ids`;
    const detailsRes = await fetch(detailsUrl, { next: { revalidate: 86400 } });

    if (!detailsRes.ok) {
      return NextResponse.json(
        { error: 'Falha ao obter detalhes do artista no TMDb' },
        { status: detailsRes.status }
      );
    }

    const d = await detailsRes.json();

    // Fallback: Se a biografia em português não existir, busca a versão original em inglês
    let biography = d.biography || '';
    if (!biography || biography.trim().length === 0) {
      try {
        const enUrl = `https://api.themoviedb.org/3/person/${personId}?api_key=${tmdbKey}&language=en-US`;
        const enRes = await fetch(enUrl, { next: { revalidate: 86400 } });
        if (enRes.ok) {
          const enData = await enRes.json();
          if (enData.biography && enData.biography.trim().length > 0) {
            biography = enData.biography;
          }
        }
      } catch {}
    }

    // Processa os créditos de filmes e séries
    const rawCast = Array.isArray(d.combined_credits?.cast) ? d.combined_credits.cast : [];
    const rawCrew = Array.isArray(d.combined_credits?.crew) ? d.combined_credits.crew : [];

    // Prioriza direção e roteiro no crew caso relevante
    const notableCrew = rawCrew.filter(
      (c: any) => c.job === 'Director' || c.job === 'Writer' || c.job === 'Creator'
    );

    const seenCredits = new Map<string, PersonCredit>();

    // 1. Processa créditos como Elenco
    for (const c of rawCast) {
      if (!c.id || (!c.title && !c.name)) continue;
      const mediaType: 'movie' | 'tv' = c.media_type === 'tv' ? 'tv' : 'movie';
      const key = `${mediaType}_${c.id}`;

      const releaseDate = c.release_date || c.first_air_date || '';
      const year = releaseDate ? releaseDate.slice(0, 4) : undefined;

      seenCredits.set(key, {
        id: c.id,
        title: c.title || c.name || '',
        original_title: c.original_title || c.original_name || undefined,
        media_type: mediaType,
        character: c.character || undefined,
        release_date: releaseDate || undefined,
        year,
        poster_url: c.poster_path ? `https://image.tmdb.org/t/p/w342${c.poster_path}` : undefined,
        backdrop_url: c.backdrop_path ? `https://image.tmdb.org/t/p/w780${c.backdrop_path}` : undefined,
        vote_average: typeof c.vote_average === 'number' ? Number(c.vote_average.toFixed(1)) : undefined,
        popularity: typeof c.popularity === 'number' ? c.popularity : 0,
      });
    }

    // 2. Adiciona créditos de Direção/Criação que ainda não foram adicionados
    for (const c of notableCrew) {
      if (!c.id || (!c.title && !c.name)) continue;
      const mediaType: 'movie' | 'tv' = c.media_type === 'tv' ? 'tv' : 'movie';
      const key = `${mediaType}_${c.id}`;

      if (!seenCredits.has(key)) {
        const releaseDate = c.release_date || c.first_air_date || '';
        const year = releaseDate ? releaseDate.slice(0, 4) : undefined;

        seenCredits.set(key, {
          id: c.id,
          title: c.title || c.name || '',
          original_title: c.original_title || c.original_name || undefined,
          media_type: mediaType,
          job: c.job,
          department: c.department,
          release_date: releaseDate || undefined,
          year,
          poster_url: c.poster_path ? `https://image.tmdb.org/t/p/w342${c.poster_path}` : undefined,
          backdrop_url: c.backdrop_path ? `https://image.tmdb.org/t/p/w780${c.backdrop_path}` : undefined,
          vote_average: typeof c.vote_average === 'number' ? Number(c.vote_average.toFixed(1)) : undefined,
          popularity: typeof c.popularity === 'number' ? c.popularity : 0,
        });
      }
    }

    // Ordena os créditos: lançamentos mais recentes primeiro (e os sem data no final)
    const sortedCredits = Array.from(seenCredits.values()).sort((a, b) => {
      if (a.release_date && b.release_date) {
        return b.release_date.localeCompare(a.release_date);
      }
      if (a.release_date) return -1;
      if (b.release_date) return 1;
      return (b.popularity || 0) - (a.popularity || 0);
    });

    // Tradução de gênero e departamento
    const genderMap: Record<number, string> = {
      1: 'Feminino',
      2: 'Masculino',
      3: 'Não-binário',
    };

    const deptMap: Record<string, string> = {
      Acting: 'Atuação',
      Directing: 'Direção',
      Writing: 'Roteiro',
      Production: 'Produção',
      Sound: 'Trilha Sonora',
      Crew: 'Equipe Técnica',
    };

    const payload: PersonDetails = {
      id: d.id,
      name: d.name,
      biography: biography || undefined,
      birthday: d.birthday || undefined,
      deathday: d.deathday || undefined,
      place_of_birth: d.place_of_birth || undefined,
      profile_url: d.profile_path ? `https://image.tmdb.org/t/p/h632${d.profile_path}` : undefined,
      known_for_department: deptMap[d.known_for_department] || d.known_for_department || 'Atuação',
      gender: genderMap[d.gender] || undefined,
      imdb_id: d.external_ids?.imdb_id || undefined,
      credits: sortedCredits,
    };

    setInCache(cacheKey, payload, 86400);

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=43200',
      },
    });
  } catch (error: any) {
    console.error('[API Person] Erro ao carregar informações do artista:', error);
    return NextResponse.json(
      { error: 'Erro interno ao consultar artista', details: error.message },
      { status: 500 }
    );
  }
}
