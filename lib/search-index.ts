import { BaseStreamItem } from './types';
import { localDB } from './db-local';
import { expandQueryWithAliases } from './anime-aliases';

export interface SearchItemEntry {
  item: BaseStreamItem;
  normTitle: string;
  normCat: string;
  words: string[];
}

let cachedSearchEntries: SearchItemEntry[] | null = null;
let isPreloading = false;

export function normalizeSearchText(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Inicializa ou atualiza o cache em memória de busca com itens pré-normalizados.
 * Processa 30.000+ itens em ~60ms em uma única passagem, tornando todas as
 * pesquisas subsequentes instantâneas (< 1ms).
 */
export function initSearchIndex(items: BaseStreamItem[]): void {
  if (!items || items.length === 0) {
    cachedSearchEntries = [];
    return;
  }

  cachedSearchEntries = items.map((item, idx) => {
    const rawTitle = (item.title || item.name || '').trim();
    const normTitle = normalizeSearchText(rawTitle);
    const normCat = normalizeSearchText(item.category_name || '');
    return {
      item: {
        ...item,
        id: item.id || `${item.stream_type}_${item.stream_id || idx}`,
      },
      normTitle,
      normCat,
      words: normTitle.split(/\s+/).filter(Boolean),
    };
  });
}

/**
 * Garante que os itens do IndexedDB estejam carregados no cache em memória.
 * Executado ao focar ou passar o mouse na Omnibar, deixando a busca pré-aquecida.
 */
export async function ensureSearchDataLoaded(): Promise<SearchItemEntry[]> {
  if (cachedSearchEntries && cachedSearchEntries.length > 0) {
    return cachedSearchEntries;
  }

  if (isPreloading) {
    while (isPreloading) {
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    return cachedSearchEntries || [];
  }

  if (!localDB) return [];

  isPreloading = true;
  try {
    const items = await localDB.streams.toArray();
    if (items && items.length > 0) {
      initSearchIndex(items as unknown as BaseStreamItem[]);
    }
  } catch (err) {
    console.warn('[search-index] Erro ao carregar itens do IndexedDB para memória:', err);
  } finally {
    isPreloading = false;
  }

  return cachedSearchEntries || [];
}

/**
 * Busca ultrarrápida em memória com suporte a expansão de títulos de animes,
 * priorização por relevância (prefixo exato > palavra inicial > substring)
 * e retorno em < 1ms para a Omnibar do Navbar.
 */
export async function searchStreams(query: string, maxResults = 5): Promise<BaseStreamItem[]> {
  const cleanQ = query.trim();
  if (!cleanQ) return [];

  const entries = await ensureSearchDataLoaded();
  if (!entries || entries.length === 0) return [];

  // Gera variantes multilíngues (ex: "Demon Slayer" -> "Kimetsu no Yaiba", etc.)
  const rawVariants = expandQueryWithAliases(cleanQ);
  const parsedVariants = rawVariants
    .map((v) => {
      const norm = normalizeSearchText(v);
      const tokens = norm.split(/\s+/).filter(Boolean);
      return { norm, tokens };
    })
    .filter((v) => v.tokens.length > 0);

  if (parsedVariants.length === 0) return [];

  const mainNorm = parsedVariants[0].norm;
  const mainTokens = parsedVariants[0].tokens;

  const tier1: BaseStreamItem[] = []; // Título começa com o termo digitado
  const tier2: BaseStreamItem[] = []; // Alguma palavra do título começa com o termo
  const tier3: BaseStreamItem[] = []; // Título contém todos os termos (ou variante bateu)
  const tier4: BaseStreamItem[] = []; // Categoria contém os termos
  const seen = new Set<string>();

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const key = `${entry.item.stream_type}_${entry.item.stream_id}`;
    if (seen.has(key)) continue;

    // Prioridade 1: Título começa exatamente com a busca principal
    if (entry.normTitle.startsWith(mainNorm)) {
      seen.add(key);
      tier1.push(entry.item);
      if (tier1.length >= maxResults) return tier1;
      continue;
    }

    // Prioridade 2: Uma das palavras do título começa com a busca principal
    if (entry.words.some((w) => w.startsWith(mainNorm))) {
      seen.add(key);
      tier2.push(entry.item);
      continue;
    }

    // Prioridade 3: Verifica se todos os tokens da busca principal ou de alguma variante batem no título
    let matchedVariant = false;
    for (let v = 0; v < parsedVariants.length; v++) {
      const { tokens, norm } = parsedVariants[v];
      if (tokens.every((tok) => entry.normTitle.includes(tok)) || entry.normTitle.includes(norm)) {
        matchedVariant = true;
        break;
      }
    }

    if (matchedVariant) {
      seen.add(key);
      tier3.push(entry.item);
      continue;
    }

    // Prioridade 4: Categoria do item bate com a busca
    if (mainTokens.every((tok) => entry.normCat.includes(tok))) {
      seen.add(key);
      tier4.push(entry.item);
    }
  }

  return [...tier1, ...tier2, ...tier3, ...tier4].slice(0, maxResults);
}

/**
 * Busca completa para a página dedicada de pesquisa (/search).
 * Varre o índice pré-normalizado em memória instantaneamente.
 */
export async function searchAllStreams(query: string, limit = 500): Promise<BaseStreamItem[]> {
  const cleanQ = query.trim();
  if (!cleanQ) return [];

  const entries = await ensureSearchDataLoaded();
  if (!entries || entries.length === 0) return [];

  const rawVariants = expandQueryWithAliases(cleanQ);
  const parsedVariants = rawVariants
    .map((v) => {
      const norm = normalizeSearchText(v);
      const tokens = norm.split(/\s+/).filter(Boolean);
      return { norm, tokens };
    })
    .filter((v) => v.tokens.length > 0);

  if (parsedVariants.length === 0) return [];

  const mainNorm = parsedVariants[0].norm;
  const tier1: BaseStreamItem[] = [];
  const tier2: BaseStreamItem[] = [];
  const tier3: BaseStreamItem[] = [];
  const tier4: BaseStreamItem[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const key = `${entry.item.stream_type}_${entry.item.stream_id}`;
    if (seen.has(key)) continue;

    if (entry.normTitle.startsWith(mainNorm)) {
      seen.add(key);
      tier1.push(entry.item);
      continue;
    }

    if (entry.words.some((w) => w.startsWith(mainNorm))) {
      seen.add(key);
      tier2.push(entry.item);
      continue;
    }

    let matched = false;
    for (let v = 0; v < parsedVariants.length; v++) {
      const { tokens, norm } = parsedVariants[v];
      if (tokens.every((tok) => entry.normTitle.includes(tok)) || entry.normTitle.includes(norm)) {
        matched = true;
        break;
      }
    }

    if (matched) {
      seen.add(key);
      tier3.push(entry.item);
      continue;
    }

    if (parsedVariants[0].tokens.every((tok) => entry.normCat.includes(tok))) {
      seen.add(key);
      tier4.push(entry.item);
    }
  }

  return [...tier1, ...tier2, ...tier3, ...tier4].slice(0, limit);
}

/**
 * Função retrocompatível
 */
export function searchFuzzy(query: string, maxResults = 30): BaseStreamItem[] {
  if (!cachedSearchEntries || !query.trim()) return [];
  const q = normalizeSearchText(query);
  const results: BaseStreamItem[] = [];
  for (let i = 0; i < cachedSearchEntries.length; i++) {
    const entry = cachedSearchEntries[i];
    if (entry.normTitle.includes(q) || entry.normCat.includes(q)) {
      results.push(entry.item);
      if (results.length >= maxResults) break;
    }
  }
  return results;
}
