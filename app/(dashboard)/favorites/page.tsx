'use client';
import { useMemo, useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Heart,
  Search,
  Trash2,
  Film,
  Tv,
  Video,
  CheckCircle2,
} from 'lucide-react';
import { useFavorites } from '@/hooks/useFavorites';
import { useWatched } from '@/hooks/useWatched';
import MediaCard from '@/components/media/MediaCard';
import Pagination from '@/components/ui/Pagination';
import { localDB } from '@/lib/db-local';

const PAGE_SIZE = 50;

type TabType = 'all' | 'completed' | 'movie' | 'series' | 'live';

function FavoritesContent() {
  const searchParams = useSearchParams();
  const { favorites, loading: loadingFavs, removeFavorite } = useFavorites();
  const { isWatched, watchedList, loading: loadingWatched, removeWatched } = useWatched();

  // Aba ativa com estado direto para resposta instantânea ao primeiro clique
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const t = searchParams.get('tab') as TabType;
    if (t === 'completed' || t === 'movie' || t === 'series' || t === 'live') {
      return t;
    }
    return 'all';
  });

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [search, setSearch] = useState<string>('');

  // Metadados extras (como poster oficial e categoria) recuperados do IndexedDB local
  const [extraMeta, setExtraMeta] = useState<
    Record<string, { posterUrl?: string; categoryName?: string; rating?: string }>
  >({});

  // Recupera imagens originais dos títulos concluídos caso não tenham poster salvo no histórico
  useEffect(() => {
    if (!localDB?.streams || watchedList.length === 0) return;

    let isMounted = true;
    async function fillMissingPosters() {
      const missingItems = watchedList.filter(
        (w) =>
          w.is_completed &&
          !w.poster_url &&
          !favorites.some((f) => String(f.stream_id) === String(w.stream_id))
      );

      if (missingItems.length === 0) return;

      const newPosters: Record<
        string,
        { posterUrl?: string; categoryName?: string; rating?: string }
      > = {};

      for (const item of missingItems) {
        try {
          const streamType = (item.stream_type as string) === 'movies' ? 'movie' : item.stream_type;
          let found = await localDB.streams
            .where('stream_id')
            .equals(String(item.stream_id))
            .filter((s) => s.stream_type === streamType)
            .first();

          if (!found) {
            found = await localDB.streams
              .where('stream_id')
              .equals(String(item.stream_id))
              .first();
          }

          if (!found && item.title) {
            found = await localDB.streams.where('name').equals(item.title).first();
          }

          if (found && (found.stream_icon || found.category_name)) {
            newPosters[`${item.stream_type}_${item.stream_id}`] = {
              posterUrl: found.stream_icon,
              categoryName: found.category_name,
              rating: found.rating !== undefined ? String(found.rating) : undefined,
            };
          }
        } catch {
          // ignora falha pontual de consulta
        }
      }

      if (isMounted && Object.keys(newPosters).length > 0) {
        setExtraMeta((prev) => ({ ...prev, ...newPosters }));
      }
    }

    fillMissingPosters();
    return () => {
      isMounted = false;
    };
  }, [watchedList, favorites]);

  // Total de concluídos consolidados
  const totalCompletedAll = useMemo(() => {
    const set = new Set<string>();
    for (const fav of favorites) {
      if (isWatched(fav.stream_id, fav.stream_type)) {
        set.add(`${fav.stream_type}_${fav.stream_id}`);
      }
    }
    for (const w of watchedList) {
      if (w.is_completed) {
        set.add(`${w.stream_type}_${w.stream_id}`);
      }
    }
    return set.size;
  }, [favorites, watchedList, isWatched]);

  // Itens unificados de acordo com a aba selecionada
  const displayItems = useMemo(() => {
    if (activeTab === 'completed') {
      const itemsMap = new Map<string, any>();

      // 1. Favoritos marcados como assistidos/concluídos
      for (const fav of favorites) {
        if (isWatched(fav.stream_id, fav.stream_type)) {
          const key = `${fav.stream_type}_${fav.stream_id}`;
          itemsMap.set(key, {
            id: fav.stream_id,
            stream_id: fav.stream_id,
            stream_type: fav.stream_type,
            title: fav.title,
            name: fav.title,
            stream_icon: fav.poster_url,
            category_name: fav.category_name,
            rating: fav.rating,
            created_at: fav.created_at,
          });
        }
      }

      // 2. Histórico de concluídos mesmo que não esteja nos favoritos
      for (const w of watchedList) {
        if (w.is_completed) {
          const key = `${w.stream_type}_${w.stream_id}`;
          if (!itemsMap.has(key)) {
            const extra = extraMeta[key] || {};
            // Tenta achar poster pelo favorito correspondente
            const favMatch = favorites.find(
              (f) => String(f.stream_id) === String(w.stream_id) && f.stream_type === w.stream_type
            );

            itemsMap.set(key, {
              id: w.stream_id,
              stream_id: w.stream_id,
              stream_type: w.stream_type,
              title: w.title,
              name: w.title,
              stream_icon:
                (w as any).poster_url ||
                favMatch?.poster_url ||
                extra.posterUrl ||
                (w as any).stream_icon,
              category_name:
                (w as any).category_name || favMatch?.category_name || extra.categoryName,
              rating: (w as any).rating || favMatch?.rating || extra.rating,
              created_at: w.watched_at,
            });
          }
        }
      }

      return Array.from(itemsMap.values());
    }

    // Abas comuns (all, live, movie, series)
    return favorites.map((fav) => ({
      id: fav.stream_id,
      stream_id: fav.stream_id,
      stream_type: fav.stream_type,
      title: fav.title,
      name: fav.title,
      stream_icon: fav.poster_url,
      category_name: fav.category_name,
      rating: fav.rating,
      created_at: fav.created_at,
    }));
  }, [favorites, watchedList, activeTab, isWatched, extraMeta]);

  // Filtragem por busca e categoria
  const filteredItems = useMemo(() => {
    return displayItems.filter((item) => {
      let matchTab = true;
      if (activeTab === 'movie' || activeTab === 'series' || activeTab === 'live') {
        matchTab = item.stream_type === activeTab;
      }

      let matchSearch = true;
      if (search.trim()) {
        const q = search.toLowerCase();
        matchSearch =
          item.title?.toLowerCase().includes(q) ||
          item.name?.toLowerCase().includes(q) ||
          item.category_name?.toLowerCase().includes(q);
      }

      return matchTab && matchSearch;
    });
  }, [displayItems, activeTab, search]);

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredItems.slice(start, start + PAGE_SIZE);
  }, [filteredItems, currentPage]);

  const handleSelectTab = (tabId: TabType) => {
    setActiveTab(tabId);
    setCurrentPage(1);

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (tabId === 'all') {
        url.searchParams.delete('tab');
      } else {
        url.searchParams.set('tab', tabId);
      }
      url.searchParams.delete('page');
      window.history.replaceState({}, '', url.toString());
    }
  };

  const tabs: Array<{
    id: TabType;
    label: string;
    icon: any;
    count: number;
  }> = [
    { id: 'all', label: 'Todos', icon: Heart, count: favorites.length },
    { id: 'completed', label: 'Concluídos', icon: CheckCircle2, count: totalCompletedAll },
    {
      id: 'movie',
      label: 'Filmes',
      icon: Film,
      count: favorites.filter((f) => f.stream_type === 'movie').length,
    },
    {
      id: 'series',
      label: 'Séries',
      icon: Video,
      count: favorites.filter((f) => f.stream_type === 'series').length,
    },
    {
      id: 'live',
      label: 'TV ao Vivo',
      icon: Tv,
      count: favorites.filter((f) => f.stream_type === 'live').length,
    },
  ];

  const loading = loadingFavs || loadingWatched;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-6">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            {activeTab === 'completed' ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-400 fill-emerald-500/20" />
            ) : (
              <Heart className="w-6 h-6 text-rose-500 fill-rose-500" />
            )}
            {activeTab === 'completed' ? 'Itens Concluídos' : 'Meus Favoritos'}
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            {activeTab === 'completed'
              ? 'Todos os filmes, séries e canais marcados como concluídos na sua conta.'
              : 'Sua lista personalizada de canais, filmes e séries favoritos.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-neutral-400 bg-[#13141b] border border-white/10 px-3.5 py-1.5 rounded-xl w-fit">
            <span className="text-rose-400 font-bold">{favorites.length}</span> favoritos
          </span>
          <span className="text-xs font-semibold text-neutral-400 bg-[#13141b] border border-white/10 px-3.5 py-1.5 rounded-xl w-fit">
            <span className="text-emerald-400 font-bold">{totalCompletedAll}</span> concluídos
          </span>
        </div>
      </div>

      {/* Barra de Filtros de Abas e Busca */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        {/* Abas com clique direto e imediato */}
        <div className="flex items-center gap-1.5 p-1 bg-[#13141b] rounded-2xl border border-white/10 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const isCompletedTab = tab.id === 'completed';

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleSelectTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? isCompletedTab
                      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                      : 'bg-rose-500 text-white shadow-lg shadow-rose-500/30'
                    : 'text-neutral-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon
                  className={`w-3.5 h-3.5 ${
                    isCompletedTab && isActive ? 'fill-emerald-400' : ''
                  }`}
                />
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                    isActive ? 'bg-black/30 text-white' : 'bg-white/5 text-neutral-500'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Input de Busca */}
        <div className="relative flex-1 sm:w-64">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={
              activeTab === 'completed'
                ? 'Filtrar concluídos...'
                : 'Filtrar favoritos...'
            }
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full bg-[#13141b] border border-white/10 hover:border-violet-500/40 focus:border-violet-500 rounded-xl pl-9 pr-3.5 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none transition shadow-sm"
          />
        </div>
      </div>

      {/* Grid de Itens */}
      {loading ? (
        <div className="p-20 text-center text-xs text-neutral-400 space-y-2">
          <div className="w-8 h-8 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p>Carregando itens...</p>
        </div>
      ) : paginatedItems.length === 0 ? (
        <div className="p-16 rounded-3xl bg-[#13141b] border border-white/10 text-center space-y-3">
          {activeTab === 'completed' ? (
            <>
              <CheckCircle2 className="w-10 h-10 text-neutral-600 mx-auto" />
              <h3 className="text-sm font-bold text-neutral-200">Nenhum item concluído ainda</h3>
              <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                Você pode marcar filmes, séries ou episódios como concluídos clicando no botão fixo de confirmação (ícone de check) presente em cada título.
              </p>
            </>
          ) : (
            <>
              <Heart className="w-10 h-10 text-neutral-600 mx-auto" />
              <h3 className="text-sm font-bold text-neutral-200">Nenhum item nesta categoria</h3>
              <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                Você pode adicionar canais, filmes ou séries aos favoritos clicando no ícone de coração em qualquer card.
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-5">
            {paginatedItems.map((item) => (
              <div key={`${item.stream_type}_${item.stream_id}`} className="relative group">
                <MediaCard item={item} />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (activeTab === 'completed') {
                      removeWatched(item.stream_id, item.stream_type);
                    } else {
                      removeFavorite(item.stream_id, item.stream_type);
                    }
                  }}
                  className="absolute top-2.5 right-20 z-20 p-1.5 rounded-lg bg-black/80 hover:bg-rose-600 text-neutral-300 hover:text-white border border-white/10 opacity-0 group-hover:opacity-100 transition shadow-lg cursor-pointer"
                  title={
                    activeTab === 'completed'
                      ? 'Desmarcar como concluído'
                      : 'Excluir dos favoritos'
                  }
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <Pagination
            currentPage={currentPage}
            totalItems={filteredItems.length}
            pageSize={PAGE_SIZE}
            onPageChange={setCurrentPage}
          />
        </>
      )}
    </div>
  );
}

export default function FavoritesPage() {
  return (
    <Suspense
      fallback={
        <div className="p-20 text-center text-xs text-neutral-400">
          <div className="w-8 h-8 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      }
    >
      <FavoritesContent />
    </Suspense>
  );
}
