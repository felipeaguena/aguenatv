'use client';
import { useMemo, useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  CheckCircle2,
  Search,
  Trash2,
  Film,
  Video,
  Heart,
  ArrowRight,
} from 'lucide-react';
import { useFavorites } from '@/hooks/useFavorites';
import { useWatched } from '@/hooks/useWatched';
import MediaCard from '@/components/media/MediaCard';
import Pagination from '@/components/ui/Pagination';
import { localDB } from '@/lib/db-local';

const PAGE_SIZE = 50;

type CompletedTabType = 'all' | 'movie' | 'series';

function CompletedContent() {
  const searchParams = useSearchParams();
  const { favorites } = useFavorites();
  const { isWatched, watchedList, loading: loadingWatched, removeWatched } = useWatched();

  const [activeTab, setActiveTab] = useState<CompletedTabType>(() => {
    const t = searchParams.get('tab') as CompletedTabType;
    if (t === 'movie' || t === 'series') {
      return t;
    }
    return 'all';
  });

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [search, setSearch] = useState<string>('');

  // Títulos verificados do catálogo oficial (apenas filmes e séries completos)
  const [verifiedCompletedTitles, setVerifiedCompletedTitles] = useState<any[]>([]);
  const [loadingTitles, setLoadingTitles] = useState<boolean>(true);

  // Carrega e valida estritamente os títulos principais concluídos a partir do catálogo local
  // Capítulos individuais de episódios são descartados para manter a página leve e sem bugs
  useEffect(() => {
    let isMounted = true;

    async function loadVerifiedCompleted() {
      setLoadingTitles(true);
      try {
        const titleMap = new Map<string, any>();

        // 1. Títulos de Favoritos marcados como concluídos
        for (const fav of favorites) {
          if (fav.stream_type === 'live') continue;
          if (isWatched(fav.stream_id, fav.stream_type)) {
            const key = `${fav.stream_type}_${fav.stream_id}`;
            titleMap.set(key, {
              id: fav.stream_id,
              stream_id: fav.stream_id,
              stream_type: fav.stream_type,
              title: fav.title,
              name: fav.title,
              stream_icon: fav.poster_url,
              category_name: fav.category_name || (fav.stream_type === 'series' ? 'Série' : 'Filme'),
              rating: fav.rating,
              isCompleted: true,
            });
          }
        }

        // 2. Histórico de concluídos diretos (verificando se o stream_id é de fato um título no catálogo)
        const candidates = watchedList.filter((w) => w.is_completed && w.stream_type !== 'live');

        if (localDB?.streams && candidates.length > 0) {
          for (const w of candidates) {
            const rawType = (w.stream_type as string) === 'movies' ? 'movie' : w.stream_type;
            const key = `${rawType}_${w.stream_id}`;

            if (titleMap.has(key)) continue;

            // Busca no banco local se o ID corresponde a um Filme ou Série catalogado
            let catalogItem = await localDB.streams.get(`${rawType}_${w.stream_id}`);
            if (!catalogItem) {
              catalogItem = await localDB.streams
                .where('stream_id')
                .equals(String(w.stream_id))
                .filter((s) => s.stream_type === rawType)
                .first();
            }

            // Somente inclui se for um título legítimo do catálogo (ignora episódios soltos)
            if (catalogItem) {
              titleMap.set(key, {
                id: catalogItem.stream_id,
                stream_id: catalogItem.stream_id,
                stream_type: catalogItem.stream_type,
                title: catalogItem.name || catalogItem.title || w.title,
                name: catalogItem.name || catalogItem.title || w.title,
                stream_icon: catalogItem.stream_icon || w.poster_url,
                category_name: catalogItem.category_name || (rawType === 'series' ? 'Série' : 'Filme'),
                rating: catalogItem.rating || (w as any).rating,
                isCompleted: true,
              });
            }
          }
        }

        if (isMounted) {
          setVerifiedCompletedTitles(Array.from(titleMap.values()));
        }
      } catch (err) {
        console.warn('[CompletedPage] Erro ao filtrar títulos concluídos:', err);
      } finally {
        if (isMounted) setLoadingTitles(false);
      }
    }

    loadVerifiedCompleted();

    return () => {
      isMounted = false;
    };
  }, [favorites, watchedList, isWatched]);

  // Filtra por aba e busca
  const filteredItems = useMemo(() => {
    return verifiedCompletedTitles.filter((item) => {
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
  }, [verifiedCompletedTitles, activeTab, search]);

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredItems.slice(start, start + PAGE_SIZE);
  }, [filteredItems, currentPage]);

  const handleSelectTab = (tabId: CompletedTabType) => {
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
    id: CompletedTabType;
    label: string;
    icon: any;
    count: number;
  }> = [
    { id: 'all', label: 'Todos', icon: CheckCircle2, count: verifiedCompletedTitles.length },
    {
      id: 'movie',
      label: 'Filmes',
      icon: Film,
      count: verifiedCompletedTitles.filter((f) => f.stream_type === 'movie').length,
    },
    {
      id: 'series',
      label: 'Séries',
      icon: Video,
      count: verifiedCompletedTitles.filter((f) => f.stream_type === 'series').length,
    },
  ];

  const isLoading = loadingWatched || loadingTitles;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-6">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <CheckCircle2 className="w-6 h-6 text-emerald-400 fill-emerald-500/20" />
            Títulos Concluídos
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Filmes e séries finalizados marcados como concluídos na sua conta.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/favorites"
            className="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
          >
            <Heart className="w-3.5 h-3.5 text-rose-400" />
            <span>Ver Favoritos</span>
            <ArrowRight className="w-3 h-3 text-neutral-500" />
          </Link>
          <span className="text-xs font-semibold text-neutral-400 bg-[#13141b] border border-white/10 px-3.5 py-1.5 rounded-xl w-fit">
            <span className="text-emerald-400 font-bold">{verifiedCompletedTitles.length}</span> títulos concluídos
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
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                    : 'text-neutral-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon
                  className={`w-3.5 h-3.5 ${
                    isActive ? 'fill-emerald-400 text-white' : ''
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
            placeholder="Filtrar concluídos por título..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full bg-[#13141b] border border-white/10 hover:border-emerald-500/40 focus:border-emerald-500 rounded-xl pl-9 pr-3.5 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none transition shadow-sm"
          />
        </div>
      </div>

      {/* Grid de Itens Concluídos */}
      {isLoading ? (
        <div className="p-20 text-center text-xs text-neutral-400 space-y-2">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p>Carregando títulos concluídos...</p>
        </div>
      ) : paginatedItems.length === 0 ? (
        <div className="p-16 rounded-3xl bg-[#13141b] border border-white/10 text-center space-y-3">
          <CheckCircle2 className="w-10 h-10 text-neutral-600 mx-auto" />
          <h3 className="text-sm font-bold text-neutral-200">Nenhum título concluído encontrado</h3>
          <p className="text-xs text-neutral-500 max-w-sm mx-auto">
            Quando você marcar um filme ou série como concluído na tela de detalhes (página info) ou no player, o título aparecerá organizado aqui.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-5">
            {paginatedItems.map((item) => (
              <div key={`completed_${item.stream_type}_${item.stream_id}`} className="relative group">
                <MediaCard item={item} />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeWatched(item.stream_id, item.stream_type);
                  }}
                  className="absolute top-2.5 right-2.5 z-20 p-1.5 rounded-lg bg-black/80 hover:bg-rose-600 text-neutral-300 hover:text-white border border-white/10 opacity-0 group-hover:opacity-100 transition shadow-lg cursor-pointer"
                  title="Desmarcar como concluído"
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

export default function CompletedPage() {
  return (
    <Suspense
      fallback={
        <div className="p-20 text-center text-xs text-neutral-400">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      }
    >
      <CompletedContent />
    </Suspense>
  );
}
