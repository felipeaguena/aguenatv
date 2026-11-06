'use client';
import { useMemo, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Heart,
  Search,
  Trash2,
  Film,
  Video,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { useFavorites } from '@/hooks/useFavorites';
import MediaCard from '@/components/media/MediaCard';
import Pagination from '@/components/ui/Pagination';

const PAGE_SIZE = 50;

type TabType = 'all' | 'movie' | 'series';

function FavoritesContent() {
  const searchParams = useSearchParams();
  const { favorites, loading, removeFavorite } = useFavorites();

  // Aba ativa com estado direto para resposta instantânea ao primeiro clique
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const t = searchParams.get('tab') as TabType;
    if (t === 'movie' || t === 'series') {
      return t;
    }
    return 'all';
  });

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [search, setSearch] = useState<string>('');

  // Itens unificados de favoritos
  const displayItems = useMemo(() => {
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
  }, [favorites]);

  // Filtragem por busca e categoria
  const filteredItems = useMemo(() => {
    return displayItems.filter((item) => {
      let matchTab = true;
      if (activeTab === 'movie' || activeTab === 'series') {
        matchTab = item.stream_type === activeTab;
      }

      let matchSearch = true;
      if (search.trim()) {
        const q = search.toLowerCase();
        matchSearch = Boolean(
          (item.title && item.title.toLowerCase().includes(q)) ||
          (item.name && item.name.toLowerCase().includes(q)) ||
          (item.category_name && item.category_name.toLowerCase().includes(q))
        );
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
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-6">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <Heart className="w-6 h-6 text-rose-500 fill-rose-500" />
            Meus Favoritos
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Sua lista personalizada de filmes e séries favoritos salvos na sua conta.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/completed"
            className="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Ver Concluídos</span>
            <ArrowRight className="w-3 h-3 text-neutral-500" />
          </Link>
          <span className="text-xs font-semibold text-neutral-400 bg-[#13141b] border border-white/10 px-3.5 py-1.5 rounded-xl w-fit">
            <span className="text-rose-400 font-bold">{favorites.length}</span> favoritos
          </span>
        </div>
      </div>

      {/* Barra de Filtros de Abas e Busca */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Abas com clique direto e imediato */}
        <div className="flex items-center gap-1.5 p-1 bg-[#13141b] rounded-2xl border border-white/10 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleSelectTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30'
                    : 'text-neutral-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon
                  className={`w-3.5 h-3.5 ${
                    isActive ? 'fill-white text-white' : ''
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
            placeholder="Filtrar favoritos por título..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full bg-[#13141b] border border-white/10 hover:border-rose-500/40 focus:border-rose-500 rounded-xl pl-9 pr-3.5 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none transition shadow-sm"
          />
        </div>
      </div>

      {/* Grid de Itens */}
      {loading ? (
        <div className="p-20 text-center text-xs text-neutral-400 space-y-2">
          <div className="w-8 h-8 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p>Carregando favoritos...</p>
        </div>
      ) : paginatedItems.length === 0 ? (
        <div className="p-16 rounded-3xl bg-[#13141b] border border-white/10 text-center space-y-3">
          <Heart className="w-10 h-10 text-neutral-600 mx-auto" />
          <h3 className="text-sm font-bold text-neutral-200">Nenhum favorito encontrado</h3>
          <p className="text-xs text-neutral-500 max-w-sm mx-auto">
            Você pode adicionar filmes ou séries aos favoritos clicando no ícone de coração em qualquer card do catálogo.
          </p>
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
                  className="absolute top-2.5 right-2.5 z-20 p-1.5 rounded-lg bg-black/80 hover:bg-rose-600 text-neutral-300 hover:text-white border border-white/10 opacity-0 group-hover:opacity-100 transition shadow-lg cursor-pointer"
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
            onPageChange={(page) => {
              setCurrentPage(page);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
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
