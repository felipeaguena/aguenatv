interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const globalCache = new Map<string, CacheEntry<any>>();

export function getFromCache<T>(key: string): T | null {
  const entry = globalCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    globalCache.delete(key);
    return null;
  }
  return entry.data;
}

export function setInCache<T>(key: string, data: T, ttlSeconds = 7200): void {
  // Limita o tamanho do cache em memória para preservar recursos de RAM no Vercel (máx 1500 itens)
  if (globalCache.size > 1500) {
    const firstKeys = Array.from(globalCache.keys()).slice(0, 400);
    firstKeys.forEach((k) => globalCache.delete(k));
  }
  globalCache.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 });
}

export function generateSearchVariants(rawTitle: string) {
  let title = rawTitle || '';
  let year: string | null = null;
  const yearMatch = title.match(/\b(19\d\d|20\d\d)\b/);
  if (yearMatch) year = yearMatch[1];

  // Remove anos explícitos
  title = title.replace(/\b(19\d\d|20\d\d)\b/g, '');
  // Remove tags entre colchetes e parênteses: [L], (2023), [4K], [Dublado], etc.
  title = title.replace(/\[.*?\]|\(.*?\)/g, '');
  // Remove termos técnicos de IPTV e resoluções
  title = title.replace(
    /\b(4k|fhd|hd|sd|hevc|h265|x265|h264|x264|dublado|legendado|leg|dub|dual|audio|completo|web-dl|bluray|repack)\b/gi,
    ''
  );
  // Limpeza de pontuações redundantes no início ou fim
  title = title.replace(/^[^\w\u00C0-\u017F]+|[^\w\u00C0-\u017F]+$/g, '').trim();

  const variants: string[] = [];
  const add = (str?: string | null) => {
    if (!str) return;
    const clean = str.replace(/\s+/g, ' ').trim();
    if (clean && clean.length > 1 && !variants.includes(clean)) {
      variants.push(clean);
    }
  };

  // V1: Título limpo original
  add(title);

  // V2: Se tiver delimitadores (: ou - ou —), separa a parte principal antes do subtítulo
  if (/[:–—]| - /i.test(title)) {
    const mainPart = title.split(/[:–—]| - /)[0].trim();
    add(mainPart);
  }

  // V3: Remove sufixos comuns em animes e séries (Nível/Level 999, Parte 2, Temporada 2, Arco X, etc.)
  const withoutSuffixes = title
    .replace(/\s*(nível|level|lv|nv)\s*\d+.*$/i, '')
    .replace(/\s*(temporada|season|temp|s|t)\s*\d+.*$/i, '')
    .replace(/\s*(parte|part|pt)\s*\d+.*$/i, '')
    .replace(/\s*(arco|arc|saga)\s+.*$/i, '')
    .trim();
  add(withoutSuffixes);

  // V4: Se tiver delimitador na versão sem sufixo
  if (/[:–—]| - /i.test(withoutSuffixes)) {
    const mainSub = withoutSuffixes.split(/[:–—]| - /)[0].trim();
    add(mainSub);
  }

  // V5: Versão sem hífens (caso o provedor ou TMDb tenha cadastrado com espaço)
  if (title.includes('-')) {
    add(title.replace(/-/g, ' '));
  }

  // V6: Se for um título longo (> 4 palavras), extrai as primeiras 4 palavras significativas
  const words = withoutSuffixes.split(/\s+/).filter(Boolean);
  if (words.length > 4) {
    add(words.slice(0, 4).join(' '));
  }

  // V7: Extrai termos-chave com sufixos honoríficos japoneses (Yamada-kun, etc.)
  const nameWithHonorific = title.match(/([A-Z][a-z]+-(?:kun|chan|san|sama|senpai))/i);
  if (nameWithHonorific) {
    add(nameWithHonorific[1]);
  }

  return { variants, year };
}

export async function searchTMDbWithVariants(
  endpoint: 'movie' | 'tv',
  rawTitle: string,
  customYear: string | null,
  tmdbKey: string
) {
  const cacheKey = `tmdb_search_${endpoint}_${rawTitle}_${customYear || ''}`;
  const cached = getFromCache<any>(cacheKey);
  if (cached) return cached;

  const { variants, year: extractedYear } = generateSearchVariants(rawTitle);
  const searchYear = customYear || extractedYear;

  // 1. Itera pelas variantes no TMDb (ordem de maior para menor fidelidade)
  for (const query of variants) {
    // A. Com ano especificado
    if (searchYear) {
      try {
        const url = `https://api.themoviedb.org/3/search/${endpoint}?api_key=${tmdbKey}&query=${encodeURIComponent(
          query
        )}&language=pt-BR&${endpoint === 'movie' ? 'primary_release_year' : 'first_air_date_year'}=${searchYear}`;
        const res = await fetch(url, { next: { revalidate: 86400 } });
        if (res.ok) {
          const data = await res.json();
          if (data.results && data.results.length > 0) {
            const result = { show: data.results[0], matchedQuery: query, source: 'tmdb' };
            setInCache(cacheKey, result);
            return result;
          }
        }
      } catch (e) {}
    }

    // B. Busca ampla em Português (pt-BR) sem ano
    try {
      const url = `https://api.themoviedb.org/3/search/${endpoint}?api_key=${tmdbKey}&query=${encodeURIComponent(
        query
      )}&language=pt-BR`;
      const res = await fetch(url, { next: { revalidate: 86400 } });
      if (res.ok) {
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          const result = { show: data.results[0], matchedQuery: query, source: 'tmdb' };
          setInCache(cacheKey, result);
          return result;
        }
      }
    } catch (e) {}

    // C. Busca multi-idioma no TMDb (títulos em inglês / romaji)
    try {
      const url = `https://api.themoviedb.org/3/search/${endpoint}?api_key=${tmdbKey}&query=${encodeURIComponent(
        query
      )}`;
      const res = await fetch(url, { next: { revalidate: 86400 } });
      if (res.ok) {
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          const result = { show: data.results[0], matchedQuery: query, source: 'tmdb' };
          setInCache(cacheKey, result);
          return result;
        }
      }
    } catch (e) {}
  }

  // 2. TIER 2: Cruzamento Inteligente com Kitsu para Animes
  // Se o TMDb não encontrou pelas variantes em português, busca no Kitsu para obter o título em Romaji/Inglês
  if (endpoint === 'tv') {
    for (const query of variants.slice(0, 3)) {
      try {
        const kitsuUrl = `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(query)}&page[limit]=2`;
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
            const firstKitsu = kData.data[0].attributes;
            const romaji = firstKitsu.titles?.en_jp || firstKitsu.canonicalTitle;
            const enTitle = firstKitsu.titles?.en || firstKitsu.titles?.en_us;

            // Cruza de volta com o TMDb usando o título Romaji ou Inglês obtido pelo Kitsu
            const crossQuery = romaji || enTitle;
            if (crossQuery) {
              const crossUrl = `https://api.themoviedb.org/3/search/tv?api_key=${tmdbKey}&query=${encodeURIComponent(
                crossQuery
              )}&language=pt-BR`;
              const crossRes = await fetch(crossUrl, { next: { revalidate: 86400 } });
              if (crossRes.ok) {
                const crossData = await crossRes.json();
                if (crossData.results && crossData.results.length > 0) {
                  const result = {
                    show: crossData.results[0],
                    matchedQuery: crossQuery,
                    kitsuEnrichment: firstKitsu,
                    source: 'kitsu+tmdb',
                  };
                  setInCache(cacheKey, result);
                  return result;
                }
              }
            }
          }
        }
      } catch (e) {}
    }
  }

  return null;
}
