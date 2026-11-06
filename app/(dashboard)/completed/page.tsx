'use client';
import { useMemo, useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Search,
  Trash2,
  Film,
  Tv,
  Video,
  Heart,
  RotateCw,
  ArrowRight,
} from 'lucide-react';
import { useFavorites } from '@/hooks/useFavorites';
import { useWatched } from '@/hooks/useWatched';
import MediaCard from '@/components/media/MediaCard';
import Pagination from '@/components/ui/Pagination';
import { localDB } from '@/lib/db-local';

const PAGE_SIZE = 50;

type CompletedTabType = 'all' | 'movie' | 'series' | 'live';

function CompletedContent() {
  const { favorites } = useFavorites();
  const { isWatched, watchedList, loading: loadingWatched, removeWatched } = useWatched();

  const [activeTab, setActiveTab] = useState<CompletedTabType>('all');
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
          // ignora falha pontual
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

  // Itens unificados concluídos (assistidos)
  const completedItems = useMemo(() => {
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
          isCompleted: true,
        });
      }
    }

    // 2. Histórico de concluídos diretos
    for (const w of watchedList) {
      if (!w.is_completed) continue;
      const key = `${w.stream_type}_${w.stream_id}`;
      if (!itemsMap.has(key)) {
        const meta = extraMeta[key] || {};
        itemsMap.set(key, {
          id: w.stream_id,
          stream_id: w.stream_id,
          stream_type: (w.stream_type as string) === 'movies' ? 'movie' : w.stream_type,
          title: w.title,
          name: w.title,
          stream_icon: w.poster_url || meta.posterUrl,
          category_name: meta.categoryName || 'Concluído',
          rating: meta.rating,
          isCompleted: true,
        });
      } else {
        const existing = itemsMap.get(key);
        const meta = extraMeta[key];
        if (!existing.stream_icon && (w.poster_url || meta?.posterUrl)) {
          existing.stream_icon = w.poster_url || meta?.posterUrl;
        }
      }
    }

    return Array.from(itemsMap.values());
  }, [favorites, watchedList, isWatched, extraMeta]);

  // Filtra por aba e busca
  const filteredItems = useMemo(() => {
    return completedItems.filter((item) => {
      let matchTab = true;
      if (activeTab !== 'all') {
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
  }, [completedItems, activeTab, search]);

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredItems.slice(start, start + PAGE_SIZE);
  }, [filteredItems, currentPage]);

  const tabs: Array<{
    id: CompletedTabType;
    label: string;
    icon: any;
    count: number;
  }> = [
    { id: 'all', label: 'Todos', icon: CheckCircle2, count: completedItems.length },
    {
      id: 'movie',
      label: 'Filmes',
      icon: Film,
      count: completedItems.filter((f) => f.stream_type === 'movie').length,
    },
    {
      id: 'series',
      label: 'Séries',
      icon: Video,
      count: completedItems.filter((f) => f.stream_type === 'series').length,
    },
    {
      id: 'live',
      label: 'Canais TV',
      icon: Tv,
      count: completedItems.filter((f) => f.stream_type === 'live').length,
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-6">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <CheckCircle2 className="w-6 h-6 text-emerald-400 fill-emerald-500/20" />
            Títulos Concluídos
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Histórico completo de episódios, filmes e canais finalizados na sua conta.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/favorites"
            className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <Heart className="w-3.5 h-3.5 text-rose-400" />
            <span>Ver Favoritos</span>
          </Link>
          <span className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold shadow-md shadow-emerald-500/10">
            {completedItems.length} concluídos
          </span>
        </div>
      </div>

      {/* Abas e Filtro de Busca */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center">
        {/* Abas com Contadores */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setCurrentPage(1);
                }}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                    : 'bg-white/5 text-neutral-400 hover:text-white hover:bg-white/10 border border-white/5'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-neutral-400'}`} />
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                    isActive ? 'bg-black/20 text-white' : 'bg-white/10 text-neutral-400'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Input de Busca */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Filtrar por nome ou categoria..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full bg-[#13141b] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Grid de Itens Concluídos */}
      {loadingWatched ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <RotateCw className="w-8 h-8 text-emerald-400 animate-spin" />
          <p className="text-xs text-neutral-400">Carregando seus títulos concluídos...</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="py-20 text-center space-y-4 rounded-3xl bg-[#13141b]/50 border border-white/5">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Nenhum título concluído encontrado</h3>
            <p className="text-xs text-neutral-400 mt-1 max-w-sm mx-auto">
              Quando você assistir filmes ou episódios até o final ou marcá-los com o ícone de concluído, eles aparecerão aqui.
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-lg shadow-emerald-600/30"
          >
            <span>Explorar Catálogo</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-5">
            {paginatedItems.map((item) => (
              <MediaCard
                key={`completed_${item.stream_type}_${item.stream_id}`}
                item={item}
              />
            ))}
          </div>

          {/* Paginação */}
          <Pagination
            currentPage={currentPage}
            totalItems={filteredItems.length}
            pageSize={PAGE_SIZE}
            onPageChange={(page) => {
              setCurrentPage(page);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </div>
      )}
    </div>
  );
}

export default function CompletedPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto px-4 py-12 flex items-center justify-center">
          <RotateCw className="w-6 h-6 text-emerald-400 animate-spin" />
        </div>
      }
    >
      <CompletedContent />
    </Suspense>
  );
}
