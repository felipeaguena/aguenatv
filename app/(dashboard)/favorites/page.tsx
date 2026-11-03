'use client';
import { useMemo, useState, Suspense } from 'react';
import { Heart, Search, Trash2, Film, Tv, Video, CheckCircle2 } from 'lucide-react';
import { useFavorites } from '@/hooks/useFavorites';
import { useWatched } from '@/hooks/useWatched';
import MediaCard from '@/components/media/MediaCard';
import Pagination from '@/components/ui/Pagination';
import { useUrlPagination } from '@/hooks/useUrlPagination';

const PAGE_SIZE = 50;

function FavoritesContent() {
  const { favorites, loading: loadingFavs, removeFavorite } = useFavorites();
  const { isWatched, watchedList, loading: loadingWatched } = useWatched();

  const {
    selectedCat: activeTab,
    currentPage,
    search,
    setCategory: setActiveTab,
    setPage: setCurrentPage,
    setSearch,
  } = useUrlPagination({
    categoryParam: 'tab',
    defaultCategory: 'all',
  });

  // Filtro secundário de status (todos / apenas concluídos / pendentes)
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'pending'>('all');

  // Conta total de concluídos
  const totalCompletedFavorites = useMemo(() => {
    return favorites.filter((fav) => isWatched(fav.stream_id, fav.stream_type)).length;
  }, [favorites, isWatched]);

  const totalCompletedAll = useMemo(() => {
    return watchedList.filter((w) => w.is_completed).length;
  }, [watchedList]);

  // Itens unificados quando a aba ativa for 'completed'
  const displayItems = useMemo(() => {
    if (activeTab === 'completed') {
      // Combina os favoritos que estão concluídos com itens concluídos do histórico
      const itemsMap = new Map<string, any>();

      // 1. Favoritos concluídos têm prioridade por terem mais metadados completos
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

      // 2. Outros itens assistidos/concluídos do usuário
      for (const w of watchedList) {
        if (w.is_completed) {
          const key = `${w.stream_type}_${w.stream_id}`;
          if (!itemsMap.has(key)) {
            itemsMap.set(key, {
              id: w.stream_id,
              stream_id: w.stream_id,
              stream_type: w.stream_type,
              title: w.title,
              name: w.title,
              stream_icon: (w as any).poster_url,
              category_name: (w as any).category_name,
              rating: (w as any).rating,
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
  }, [favorites, watchedList, activeTab, isWatched]);

  const filteredItems = useMemo(() => {
    return displayItems.filter((item) => {
      // Filtro de aba
      const matchTab =
        activeTab === 'all' ||
        activeTab === 'completed' ||
        item.stream_type === activeTab;

      // Filtro de status
      const completed = isWatched(item.stream_id, item.stream_type);
      let matchStatus = true;
      if (statusFilter === 'completed') {
        matchStatus = completed;
      } else if (statusFilter === 'pending') {
        matchStatus = !completed;
      }

      // Filtro de busca
      const matchSearch = (item.title || item.name || '').toLowerCase().includes(search.toLowerCase());

      return matchTab && matchStatus && matchSearch;
    });
  }, [displayItems, activeTab, statusFilter, search, isWatched]);

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredItems.slice(start, start + PAGE_SIZE);
  }, [filteredItems, currentPage]);

  const tabs = [
    { id: 'all', label: 'Todos', icon: Heart, count: favorites.length },
    { id: 'completed', label: 'Concluídos', icon: CheckCircle2, count: totalCompletedAll },
    { id: 'movie', label: 'Filmes', icon: Film, count: favorites.filter((f) => f.stream_type === 'movie').length },
    { id: 'series', label: 'Séries', icon: Video, count: favorites.filter((f) => f.stream_type === 'series').length },
    { id: 'live', label: 'TV ao Vivo', icon: Tv, count: favorites.filter((f) => f.stream_type === 'live').length },
  ] as const;

  const loading = loadingFavs || loadingWatched;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
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
              ? 'Todos os filmes, séries e canais marcados como concluídos na sua conta privada.'
              : 'Lista privada de canais, filmes e séries sincronizada no banco de dados com isolamento total.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-neutral-400 bg-[#13141b] border border-white/10 px-3.5 py-1.5 rounded-xl w-fit">
            <span className="text-rose-400 font-bold">{favorites.length}</span> favoritos
          </span>
          <span className="text-xs font-semibold text-neutral-400 bg-[#13141b] border border-white/10 px-3.5 py-1.5 rounded-xl w-fit">
            <span className="text-emerald-400 font-bold">{totalCompletedAll}</span> concluídos
          </span>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        {/* Abas */}
        <div className="flex items-center gap-1.5 p-1 bg-[#13141b] rounded-2xl border border-white/10 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const isCompletedTab = tab.id === 'completed';

            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setCurrentPage(1);
                }}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? isCompletedTab
                      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                      : 'bg-rose-500 text-white shadow-lg shadow-rose-500/30'
                    : 'text-neutral-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isCompletedTab && isActive ? 'fill-emerald-400' : ''}`} />
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

        {/* Filtro Rápido de Status & Input de Busca */}
        <div className="flex items-center gap-2">
          {activeTab !== 'completed' && (
            <div className="flex items-center gap-1 bg-[#13141b] p-1 rounded-xl border border-white/10 text-xs shrink-0">
              <button
                onClick={() => {
                  setStatusFilter('all');
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  statusFilter === 'all'
                    ? 'bg-white/10 text-white'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => {
                  setStatusFilter('completed');
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1 ${
                  statusFilter === 'completed'
                    ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30'
                    : 'text-neutral-400 hover:text-emerald-300'
                }`}
                title="Apenas itens concluídos"
              >
                <CheckCircle2 className="w-3 h-3" />
                <span>Concluídos ({totalCompletedFavorites})</span>
              </button>
            </div>
          )}

          {/* Input de Busca */}
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filtrar títulos..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-[#13141b] border border-white/10 hover:border-violet-500/40 focus:border-violet-500 rounded-xl pl-9 pr-3.5 py-2 text-xs text-white focus:outline-none transition"
            />
          </div>
        </div>
      </div>

      {/* Grid de Itens */}
      {loading ? (
        <div className="p-20 text-center text-xs text-neutral-400 space-y-2">
          <div className="w-8 h-8 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p>Carregando itens sincronizados...</p>
        </div>
      ) : paginatedItems.length === 0 ? (
        <div className="p-16 rounded-3xl bg-[#13141b] border border-white/10 text-center space-y-3">
          {activeTab === 'completed' ? (
            <>
              <CheckCircle2 className="w-10 h-10 text-neutral-600 mx-auto" />
              <h3 className="text-sm font-bold text-neutral-200">Nenhum item concluído ainda</h3>
              <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                Você pode marcar filmes, séries ou episódios como concluídos clicando no botão fixo de confirmação (ícone de check) presente em cada card.
              </p>
            </>
          ) : (
            <>
              <Heart className="w-10 h-10 text-neutral-600 mx-auto" />
              <h3 className="text-sm font-bold text-neutral-200">Nenhum item nesta categoria</h3>
              <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                Você pode adicionar canais, filmes ou séries aos favoritos clicando no ícone fixo de coração em qualquer card.
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
                    removeFavorite(item.stream_id, item.stream_type);
                  }}
                  className="absolute top-2.5 right-20 z-20 p-1.5 rounded-lg bg-black/80 hover:bg-rose-600 text-neutral-300 hover:text-white border border-white/10 opacity-0 group-hover:opacity-100 transition shadow-lg cursor-pointer"
                  title="Excluir dos favoritos"
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
