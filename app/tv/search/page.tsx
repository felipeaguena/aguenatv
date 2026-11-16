'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Search,
  Delete,
  Space,
  X,
  Film,
  Video,
  Tv,
  LayoutGrid,
  LayoutList,
  Keyboard,
  History,
} from 'lucide-react';
import { BaseStreamItem, StreamType } from '@/lib/types';
import { searchAllStreams } from '@/lib/search-index';
import { getTvCatalogUrl, getTvSearchUrl } from '@/lib/tv-routes';
import { cleanCategoryName } from '@/lib/stream-utils';
import TvMediaCard from '@/components/tv/TvMediaCard';
import TvHorizontalRow from '@/components/tv/TvHorizontalRow';

const TV_KEYS = [
  'A', 'B', 'C', 'D', 'E', 'F',
  'G', 'H', 'I', 'J', 'K', 'L',
  'M', 'N', 'O', 'P', 'Q', 'R',
  'S', 'T', 'U', 'V', 'W', 'X',
  'Y', 'Z', '0', '1', '2', '3',
  '4', '5', '6', '7', '8', '9',
];

const RECENT_SEARCHES_KEY = 'aguenatv_tv_recent_searches';

interface CategoryGroup {
  id: string;
  name: string;
  type: StreamType;
  items: BaseStreamItem[];
}

function TvSearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qParam = searchParams.get('q') || '';

  const [prevQParam, setPrevQParam] = useState(qParam);
  const [query, setQuery] = useState(qParam);
  const [results, setResults] = useState<BaseStreamItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'all' | StreamType>('all');
  const [viewMode, setViewMode] = useState<'category' | 'grid'>('category');
  const [showKeyboard, setShowKeyboard] = useState(true);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  if (prevQParam !== qParam) {
    setPrevQParam(qParam);
    setQuery(qParam);
  }

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      if (!query.trim()) {
        if (active) {
          setResults([]);
          setLoading(false);
        }
        return;
      }
      if (active) setLoading(true);
      try {
        const found = await searchAllStreams(query.trim(), 300);
        if (active) {
          setResults(found);
        }
      } catch (err) {
        console.error('Erro na busca TV:', err);
      } finally {
        if (active) setLoading(false);
      }
    }, 200);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  const saveRecentSearch = (term: string) => {
    const clean = term.trim();
    if (clean.length < 2) return;
    setRecentSearches((prev) => {
      const next = [clean, ...prev.filter((t) => t.toLowerCase() !== clean.toLowerCase())].slice(0, 8);
      try {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;
    saveRecentSearch(query);
    router.replace(getTvSearchUrl(query));
  };

  const handleVirtualKey = (char: string) => {
    setQuery((prev) => prev + char.toLowerCase());
  };

  const handleBackspace = () => {
    setQuery((prev) => prev.slice(0, -1));
  };

  const filteredResults = useMemo(() => {
    if (typeFilter === 'all') return results;
    return results.filter((r) => r.stream_type === typeFilter);
  }, [results, typeFilter]);

  const groupedCategories: CategoryGroup[] = useMemo(() => {
    const map = new Map<string, CategoryGroup>();
    for (const item of filteredResults) {
      const catId = String(item.category_id || 'geral');
      const catName = cleanCategoryName(item.category_name || '') || item.category_name || 'Geral';
      const key = `${item.stream_type}_${catId}`;
      const existing = map.get(key);
      if (existing) {
        existing.items.push(item);
      } else {
        map.set(key, {
          id: catId,
          name: catName,
          type: item.stream_type,
          items: [item],
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.items.length - a.items.length);
  }, [filteredResults]);

  return (
    <div className="p-5 sm:p-8 flex flex-col lg:flex-row gap-6 min-h-[calc(100vh-4rem)]">
      {/* COLUNA ESQUERDA: TECLADO VIRTUAL D-PAD ESTILO NETFLIX + HISTÓRICO */}
      {showKeyboard && (
        <aside
          data-tv-zone="keyboard"
          className="lg:w-72 xl:w-80 shrink-0 space-y-5 bg-[#0c0d14] border border-white/10 rounded-3xl p-4 self-start"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-neutral-300">
              <Keyboard className="w-4 h-4 text-violet-400" />
              <span>Teclado TV</span>
            </div>
            <button
              type="button"
              tabIndex={0}
              data-tv-focusable="true"
              data-tv-focus="pill"
              onClick={() => setShowKeyboard(false)}
              className="text-[11px] font-bold text-neutral-400 hover:text-white px-2 py-1 rounded-lg bg-white/5 cursor-pointer"
            >
              Ocultar
            </button>
          </div>

          <div className="grid grid-cols-6 gap-1.5">
            {TV_KEYS.map((k) => (
              <button
                key={k}
                type="button"
                tabIndex={0}
                data-tv-focusable="true"
                data-tv-focus="key"
                onClick={() => handleVirtualKey(k)}
                className="h-10 rounded-xl bg-white/5 hover:bg-violet-600/30 border border-white/10 text-xs font-black text-white flex items-center justify-center cursor-pointer transition"
              >
                {k}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              tabIndex={0}
              data-tv-focusable="true"
              data-tv-focus="button"
              onClick={() => setQuery((prev) => prev + ' ')}
              className="py-2.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-xs font-bold text-neutral-200 flex items-center justify-center gap-1 cursor-pointer"
            >
              <Space className="w-4 h-4" />
              <span>Espaço</span>
            </button>

            <button
              type="button"
              tabIndex={0}
              data-tv-focusable="true"
              data-tv-focus="button"
              onClick={handleBackspace}
              className="py-2.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-xs font-bold text-neutral-200 flex items-center justify-center gap-1 cursor-pointer"
            >
              <Delete className="w-4 h-4" />
              <span>Apagar</span>
            </button>

            <button
              type="button"
              tabIndex={0}
              data-tv-focusable="true"
              data-tv-focus="button"
              onClick={() => setQuery('')}
              className="py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/30 border border-rose-500/30 text-xs font-bold text-rose-200 flex items-center justify-center gap-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>Limpar</span>
            </button>
          </div>

          {recentSearches.length > 0 && (
            <div className="pt-3 border-t border-white/10 space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
                <History className="w-3.5 h-3.5 text-violet-400" />
                <span>Buscas Recentes</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {recentSearches.map((term) => (
                  <button
                    key={term}
                    type="button"
                    tabIndex={0}
                    data-tv-focusable="true"
                    data-tv-focus="pill"
                    onClick={() => setQuery(term)}
                    className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-violet-600/25 border border-white/10 text-[11px] font-semibold text-neutral-200 cursor-pointer"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>
      )}

      {/* COLUNA DIREITA: INPUT PRINCIPAL, FILTROS E RESULTADOS */}
      <div className="flex-1 min-w-0 space-y-6" data-tv-zone="content">
        <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-5 h-5 text-violet-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              data-tv-focusable="true"
              data-tv-focus="input"
              data-tv-autofocus="true"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Digite o nome de um filme, série, anime ou canal..."
              className="w-full bg-[#12131c] border border-white/15 rounded-2xl pl-12 pr-12 py-3.5 text-sm sm:text-base text-white placeholder:text-neutral-500"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-neutral-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {!showKeyboard && (
            <button
              type="button"
              tabIndex={0}
              data-tv-focusable="true"
              data-tv-focus="button"
              onClick={() => setShowKeyboard(true)}
              className="px-4 py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-neutral-200 flex items-center gap-2 cursor-pointer"
            >
              <Keyboard className="w-4 h-4 text-violet-400" />
              <span>Teclado TV</span>
            </button>
          )}
        </form>

        {/* Barra de Filtros de Tipo e Modo de Exibição */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2" data-tv-row="true">
            {(
              [
                { id: 'all', label: 'Tudo' },
                { id: 'movie', label: 'Filmes' },
                { id: 'series', label: 'Séries' },
                { id: 'live', label: 'TV Ao Vivo' },
              ] as const
            ).map((chip) => (
              <button
                key={chip.id}
                type="button"
                tabIndex={0}
                data-tv-focusable="true"
                data-tv-focus="pill"
                onClick={() => setTypeFilter(chip.id)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold border transition cursor-pointer ${
                  typeFilter === chip.id
                    ? 'bg-violet-600 text-white border-violet-400 shadow-md shadow-violet-600/30'
                    : 'bg-white/5 hover:bg-white/10 text-neutral-300 border-white/10'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 bg-white/5 p-1 rounded-xl border border-white/10">
            <button
              type="button"
              tabIndex={0}
              data-tv-focusable="true"
              data-tv-focus="pill"
              onClick={() => setViewMode('category')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'category' ? 'bg-violet-600 text-white' : 'text-neutral-400 hover:text-white'
              }`}
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span>Categorias</span>
            </button>
            <button
              type="button"
              tabIndex={0}
              data-tv-focusable="true"
              data-tv-focus="pill"
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'grid' ? 'bg-violet-600 text-white' : 'text-neutral-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Grade</span>
            </button>
          </div>
        </div>

        {/* Resultados */}
        {!query.trim() ? (
          <div className="p-12 rounded-3xl bg-[#11121c] border border-white/10 text-center space-y-2">
            <Search className="w-10 h-10 text-violet-400/70 mx-auto" />
            <h2 className="text-lg font-black text-white">Pronto para buscar</h2>
            <p className="text-xs sm:text-sm text-neutral-400 max-w-md mx-auto">
              Use o teclado na tela com seu controle remoto ou digite diretamente para encontrar filmes, séries, animes e canais ao vivo.
            </p>
          </div>
        ) : loading ? (
          <div className="py-16 flex flex-col items-center gap-3 text-neutral-400">
            <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs">Buscando em todo o catálogo...</p>
          </div>
        ) : filteredResults.length === 0 ? (
          <div className="p-12 rounded-3xl bg-[#11121c] border border-white/10 text-center space-y-2">
            <p className="text-base font-bold text-white">Nenhum resultado para &quot;{query}&quot;</p>
            <p className="text-xs text-neutral-400">
              Tente outro termo ou altere o filtro de tipo acima.
            </p>
          </div>
        ) : viewMode === 'category' ? (
          <div className="space-y-8">
            {groupedCategories.map((group) => {
              const Icon =
                group.type === 'live' ? Tv : group.type === 'series' ? Video : Film;
              const label =
                group.type === 'live' ? 'Ao Vivo' : group.type === 'series' ? 'Séries' : 'Filmes';

              return (
                <TvHorizontalRow
                  key={`${group.type}_${group.id}`}
                  title={group.name}
                  badge={`${label} • ${group.items.length}`}
                  icon={<Icon className="w-5 h-5 text-violet-400" />}
                  seeAllHref={getTvCatalogUrl(group.type, group.id)}
                  seeAllLabel="Abrir categoria"
                >
                  {group.items.slice(0, 16).map((item) => (
                    <div
                      key={`${item.stream_type}_${item.stream_id}`}
                      className={
                        group.type === 'live'
                          ? 'w-[220px] sm:w-[245px] flex-none'
                          : 'w-[160px] sm:w-[180px] flex-none'
                      }
                    >
                      <TvMediaCard item={item} />
                    </div>
                  ))}
                </TvHorizontalRow>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredResults.slice(0, 100).map((item) => (
              <TvMediaCard key={`${item.stream_type}_${item.stream_id}`} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TvSearchPage() {
  return (
    <Suspense
      fallback={
        <div className="py-24 flex justify-center">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <TvSearchContent />
    </Suspense>
  );
}
