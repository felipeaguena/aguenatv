'use client';
import { useMemo, Suspense } from 'react';
import { Heart, Search, Trash2, Film, Tv, Video } from 'lucide-react';
import { useFavorites } from '@/hooks/useFavorites';
import { StreamType } from '@/lib/types';
import MediaCard from '@/components/media/MediaCard';
import Pagination from '@/components/ui/Pagination';
import { useUrlPagination } from '@/hooks/useUrlPagination';

const PAGE_SIZE = 50;

function FavoritesContent() {
  const { favorites, loading, removeFavorite } = useFavorites();

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

  const filteredFavorites = useMemo(() => {
    return favorites.filter((fav) => {
      const matchTab = activeTab === 'all' || fav.stream_type === activeTab;
      const matchSearch = (fav.title || '').toLowerCase().includes(search.toLowerCase());
      return matchTab && matchSearch;
    });
  }, [favorites, activeTab, search]);

  const paginatedFavorites = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredFavorites.slice(start, start + PAGE_SIZE);
  }, [filteredFavorites, currentPage]);

  const tabs = [
    { id: 'all', label: 'Todos', icon: Heart },
    { id: 'live', label: 'TV ao Vivo', icon: Tv },
    { id: 'movie', label: 'Filmes', icon: Film },
    { id: 'series', label: 'Séries', icon: Video },
  ] as const;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-6">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <Heart className="w-6 h-6 text-rose-500 fill-rose-500" />
            Gerenciar Meus Favoritos
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Lista privada de canais, filmes e séries sincronizada no banco de dados.
          </p>
        </div>

        <span className="text-xs font-semibold text-neutral-400 bg-[#13141b] border border-white/10 px-4 py-2 rounded-2xl w-fit">
          <span className="text-rose-400 font-bold">{favorites.length}</span> favoritos cadastrados
        </span>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Abas */}
        <div className="flex items-center gap-1.5 p-1 bg-[#13141b] rounded-2xl border border-white/10 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30'
                    : 'text-neutral-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Input de Busca */}
        <div className="relative sm:w-72">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Filtrar favoritos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#13141b] border border-white/10 hover:border-rose-500/40 focus:border-rose-500 rounded-xl pl-9 pr-3.5 py-2 text-xs text-white focus:outline-none transition"
          />
        </div>
      </div>

      {/* Grid de Favoritos */}
      {loading ? (
        <div className="p-20 text-center text-xs text-neutral-400 space-y-2">
          <div className="w-8 h-8 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p>Carregando favoritos do banco...</p>
        </div>
      ) : paginatedFavorites.length === 0 ? (
        <div className="p-16 rounded-3xl bg-[#13141b] border border-white/10 text-center space-y-3">
          <Heart className="w-10 h-10 text-neutral-600 mx-auto" />
          <h3 className="text-sm font-bold text-neutral-200">Nenhum favorito nesta categoria</h3>
          <p className="text-xs text-neutral-500 max-w-sm mx-auto">
            Você pode adicionar canais, filmes ou séries aos favoritos clicando no ícone de coração em qualquer card.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-5">
            {paginatedFavorites.map((fav) => (
              <div key={fav.id} className="relative group">
                <MediaCard
                  item={{
                    id: fav.stream_id,
                    stream_id: fav.stream_id,
                    name: fav.title,
                    title: fav.title,
                    stream_type: fav.stream_type,
                    stream_icon: fav.poster_url,
                  }}
                />
                <button
                  onClick={() => removeFavorite(fav.stream_id, fav.stream_type)}
                  className="absolute top-2 right-12 z-20 p-1.5 rounded-lg bg-black/80 hover:bg-rose-600 text-neutral-300 hover:text-white border border-white/10 opacity-0 group-hover:opacity-100 transition shadow-lg cursor-pointer"
                  title="Excluir dos favoritos"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <Pagination
            currentPage={currentPage}
            totalItems={filteredFavorites.length}
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
