'use client';
import { useMemo, useState, useEffect, Suspense } from 'react';
import {
  Heart,
  Search,
  Trash2,
  Film,
  Tv,
  Video,
  CheckCircle2,
  HardDrive,
  Play,
  ChevronDown,
  ChevronRight,
  Download,
} from 'lucide-react';
import { useFavorites } from '@/hooks/useFavorites';
import { useWatched } from '@/hooks/useWatched';
import MediaCard from '@/components/media/MediaCard';
import Pagination from '@/components/ui/Pagination';
import { useUrlPagination } from '@/hooks/useUrlPagination';
import {
  getGroupedOfflineDownloads,
  GroupedDownloadItem,
  deleteOfflineDownload,
  deleteGroupDownloads,
  getPlayableOfflineUrl,
  OfflineDownload,
} from '@/lib/download-manager';
import { usePlayer } from '@/context/PlayerContext';

const PAGE_SIZE = 50;

function FavoritesContent() {
  const { favorites, loading: loadingFavs, removeFavorite } = useFavorites();
  const { isWatched, watchedList, loading: loadingWatched } = useWatched();
  const { play } = usePlayer();

  const [groupedDownloads, setGroupedDownloads] = useState<GroupedDownloadItem[]>([]);
  const [loadingDownloads, setLoadingDownloads] = useState(false);
  const [expandedSeriesKey, setExpandedSeriesKey] = useState<string | null>(null);

  const loadDownloads = async () => {
    setLoadingDownloads(true);
    try {
      const data = await getGroupedOfflineDownloads();
      setGroupedDownloads(data);
    } catch {} finally {
      setLoadingDownloads(false);
    }
  };

  useEffect(() => {
    loadDownloads();
  }, []);

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

  const totalDownloadsCount = useMemo(() => {
    return groupedDownloads.reduce((acc, g) => acc + g.items_count, 0);
  }, [groupedDownloads]);

  const totalStorageBytes = useMemo(() => {
    return groupedDownloads.reduce((acc, g) => acc + g.total_size, 0);
  }, [groupedDownloads]);

  const formatSize = (bytes: number) => {
    if (!bytes) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
    return `${Math.round(mb)} MB`;
  };

  const handlePlayOffline = async (item: OfflineDownload) => {
    try {
      const playableUrl = await getPlayableOfflineUrl(item);
      play({
        streamUrl: playableUrl,
        title: item.title,
        posterUrl: item.poster_url,
        streamType: item.stream_type,
        streamId: String(item.stream_id),
      });
    } catch {
      alert('Não foi possível reproduzir este vídeo offline.');
    }
  };

  const handleDeleteOffline = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Deseja excluir este vídeo da memória do celular?')) return;
    await deleteOfflineDownload(id);
    await loadDownloads();
  };

  const handleDeleteGroup = async (
    streamType: 'movie' | 'series',
    streamId: string | number,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    if (!confirm('Deseja excluir todos os vídeos/episódios baixados deste título?')) return;
    await deleteGroupDownloads(streamType, streamId);
    await loadDownloads();
  };

  // Itens unificados quando a aba ativa for 'completed'
  const displayItems = useMemo(() => {
    if (activeTab === 'completed') {
      const itemsMap = new Map<string, any>();

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

  // Filtragem
  const filteredItems = useMemo(() => {
    return displayItems.filter((item) => {
      let matchTab = true;
      if (activeTab === 'movie' || activeTab === 'series' || activeTab === 'live') {
        matchTab = item.stream_type === activeTab;
      }

      let matchStatus = true;
      if (statusFilter === 'completed') {
        matchStatus = isWatched(item.stream_id, item.stream_type);
      } else if (statusFilter === 'pending') {
        matchStatus = !isWatched(item.stream_id, item.stream_type);
      }

      let matchSearch = true;
      if (search.trim()) {
        const q = search.toLowerCase();
        matchSearch =
          item.title?.toLowerCase().includes(q) ||
          item.name?.toLowerCase().includes(q) ||
          item.category_name?.toLowerCase().includes(q);
      }

      return matchTab && matchStatus && matchSearch;
    });
  }, [displayItems, activeTab, statusFilter, search, isWatched]);

  const filteredDownloads = useMemo(() => {
    if (!search.trim()) return groupedDownloads;
    const q = search.toLowerCase();
    return groupedDownloads.filter((g) => g.title.toLowerCase().includes(q));
  }, [groupedDownloads, search]);

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredItems.slice(start, start + PAGE_SIZE);
  }, [filteredItems, currentPage]);

  const tabs = [
    { id: 'all', label: 'Todos', icon: Heart, count: favorites.length },
    { id: 'downloads', label: 'Baixados Offline', icon: HardDrive, count: totalDownloadsCount },
    { id: 'completed', label: 'Concluídos', icon: CheckCircle2, count: totalCompletedAll },
    { id: 'movie', label: 'Filmes', icon: Film, count: favorites.filter((f) => f.stream_type === 'movie').length },
    { id: 'series', label: 'Séries', icon: Video, count: favorites.filter((f) => f.stream_type === 'series').length },
    { id: 'live', label: 'TV ao Vivo', icon: Tv, count: favorites.filter((f) => f.stream_type === 'live').length },
  ] as const;

  const loading = loadingFavs || loadingWatched || (activeTab === 'downloads' && loadingDownloads);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-6">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            {activeTab === 'downloads' ? (
              <HardDrive className="w-6 h-6 text-violet-400" />
            ) : activeTab === 'completed' ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-400 fill-emerald-500/20" />
            ) : (
              <Heart className="w-6 h-6 text-rose-500 fill-rose-500" />
            )}
            {activeTab === 'downloads'
              ? 'Títulos Baixados na Memória'
              : activeTab === 'completed'
              ? 'Itens Concluídos'
              : 'Meus Favoritos'}
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            {activeTab === 'downloads'
              ? 'Gerencie seus filmes e episódios baixados para assistir no celular sem precisar de internet.'
              : activeTab === 'completed'
              ? 'Todos os filmes, séries e canais marcados como concluídos na sua conta privada.'
              : 'Lista privada de canais, filmes e séries sincronizada no banco de dados com isolamento total.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeTab === 'downloads' ? (
            <span className="text-xs font-semibold text-neutral-400 bg-[#13141b] border border-white/10 px-3.5 py-1.5 rounded-xl w-fit">
              Espaço em disco: <strong className="text-violet-400">{formatSize(totalStorageBytes)}</strong>
            </span>
          ) : (
            <>
              <span className="text-xs font-semibold text-neutral-400 bg-[#13141b] border border-white/10 px-3.5 py-1.5 rounded-xl w-fit">
                <span className="text-rose-400 font-bold">{favorites.length}</span> favoritos
              </span>
              <span className="text-xs font-semibold text-neutral-400 bg-[#13141b] border border-white/10 px-3.5 py-1.5 rounded-xl w-fit">
                <span className="text-emerald-400 font-bold">{totalCompletedAll}</span> concluídos
              </span>
            </>
          )}
        </div>
      </div>

      {/* Banner de Destaque para Conteúdos Baixados Offline */}
      {activeTab !== 'downloads' && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-gradient-to-r from-violet-900/40 via-[#181926] to-[#12131c] border border-violet-500/30 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-violet-600/30 text-violet-300 shrink-0">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold text-white text-sm">Gerenciador de Títulos Baixados Offline</p>
              <p className="text-xs text-neutral-400">
                Acesse todos os filmes e episódios salvos na memória do aparelho para assistir sem internet.
              </p>
            </div>
          </div>
          <button
            onClick={() => setActiveTab('downloads')}
            className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-violet-600/30 cursor-pointer shrink-0"
          >
            <HardDrive className="w-4 h-4" />
            <span>Ver Baixados ({totalDownloadsCount})</span>
          </button>
        </div>
      )}

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        {/* Abas */}
        <div className="flex items-center gap-1.5 p-1 bg-[#13141b] rounded-2xl border border-white/10 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const isCompletedTab = tab.id === 'completed';
            const isDownloadsTab = tab.id === 'downloads';

            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setCurrentPage(1);
                }}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? isDownloadsTab
                      ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/30'
                      : isCompletedTab
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

        {/* Filtro Rápido de Status & Input de Busca */}
        <div className="flex items-center gap-2">
          {activeTab !== 'completed' && activeTab !== 'downloads' && (
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
              placeholder={activeTab === 'downloads' ? 'Filtrar baixados...' : 'Filtrar títulos...'}
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

      {/* RENDERIZAÇÃO: ABA DE DOWNLOADS OFFLINE */}
      {activeTab === 'downloads' ? (
        loadingDownloads ? (
          <div className="p-20 text-center text-xs text-neutral-400 space-y-2">
            <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p>Carregando vídeos salvos no celular...</p>
          </div>
        ) : filteredDownloads.length === 0 ? (
          <div className="p-16 rounded-3xl bg-[#13141b] border border-white/10 text-center space-y-3">
            <HardDrive className="w-10 h-10 text-neutral-600 mx-auto" />
            <h3 className="text-sm font-bold text-neutral-200">Nenhum vídeo baixado ainda</h3>
            <p className="text-xs text-neutral-500 max-w-sm mx-auto">
              Você pode clicar no botão <strong>"Baixar"</strong> ao lado de qualquer filme ou episódio na página de informações para salvar na memória do celular.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredDownloads.map((group) => {
              const isExpanded =
                expandedSeriesKey === `${group.stream_type}_${group.stream_id}`;

              return (
                <div
                  key={`${group.stream_type}_${group.stream_id}`}
                  className="rounded-3xl bg-[#13141b] border border-white/10 p-4 sm:p-5 space-y-4 hover:border-violet-500/40 transition-all shadow-lg"
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      {/* Thumbnail / Poster */}
                      <div className="w-16 sm:w-20 aspect-[3/4] rounded-2xl overflow-hidden bg-neutral-900 border border-white/10 shrink-0 relative">
                        <img
                          src={group.poster_url || '/placeholder.svg'}
                          alt={group.title}
                          className="w-full h-full object-cover"
                        />
                      </div>

                      {/* Informações do Título */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-violet-600/20 text-violet-300 border border-violet-500/30">
                            {group.stream_type === 'series' ? 'Série' : 'Filme'}
                          </span>
                          <span className="text-[11px] font-mono text-neutral-400">
                            {formatSize(group.total_size)}
                          </span>
                        </div>

                        <h3 className="text-base font-bold text-white line-clamp-1">
                          {group.title}
                        </h3>

                        <p className="text-xs text-neutral-400">
                          {group.stream_type === 'series'
                            ? `${group.items_count} ${group.items_count === 1 ? 'episódio salvo na memória' : 'episódios salvos na memória'}`
                            : 'Filme completo pronto para assistir offline'}
                        </p>
                      </div>
                    </div>

                    {/* Ações do Título */}
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end border-t sm:border-t-0 border-white/5 pt-3 sm:pt-0">
                      {group.stream_type === 'movie' ? (
                        <button
                          onClick={() => handlePlayOffline(group.episodes[0])}
                          className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-violet-600/30 transition cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5 fill-white" />
                          <span>Assistir Offline</span>
                        </button>
                      ) : (
                        <button
                          onClick={() =>
                            setExpandedSeriesKey(
                              isExpanded ? null : `${group.stream_type}_${group.stream_id}`
                            )
                          }
                          className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-200 font-bold text-xs flex items-center gap-2 transition cursor-pointer"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronDown className="w-3.5 h-3.5 text-violet-400" />
                              <span>Ocultar Episódios</span>
                            </>
                          ) : (
                            <>
                              <ChevronRight className="w-3.5 h-3.5 text-violet-400" />
                              <span>Gerenciar Episódios ({group.items_count})</span>
                            </>
                          )}
                        </button>
                      )}

                      <button
                        onClick={(e) =>
                          handleDeleteGroup(group.stream_type, group.stream_id, e)
                        }
                        className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 transition cursor-pointer text-xs flex items-center gap-1.5"
                        title="Excluir da memória"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Excluir</span>
                      </button>
                    </div>
                  </div>

                  {/* Lista de Episódios Expansível */}
                  {group.stream_type === 'series' && isExpanded && (
                    <div className="mt-3 pt-3 border-t border-white/5 space-y-2 animate-in fade-in duration-150">
                      <span className="text-[11px] font-bold text-neutral-400 block mb-2">
                        Episódios Baixados:
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                        {group.episodes.map((ep) => (
                          <div
                            key={ep.id}
                            className="p-3 rounded-2xl bg-[#0b0c10] border border-white/5 flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-white truncate" title={ep.title}>
                                {ep.season_num !== undefined && ep.episode_num !== undefined
                                  ? `T${ep.season_num}:E${ep.episode_num} - ${ep.title.split(' - ')[1] || ep.title}`
                                  : ep.title}
                              </p>
                              <span className="text-[10px] text-neutral-400 font-mono">
                                {formatSize(ep.file_size || 0)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={() => handlePlayOffline(ep)}
                                className="p-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white transition shadow-md shadow-violet-600/20 cursor-pointer"
                                title="Assistir offline"
                              >
                                <Play className="w-3.5 h-3.5 fill-white" />
                              </button>
                              <button
                                onClick={(e) => handleDeleteOffline(ep.id, e)}
                                className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 transition cursor-pointer"
                                title="Excluir da memória"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* RENDERIZAÇÃO: OUTRAS ABAS COMUNS (TODOS / CONCLUÍDOS / FILMES / SÉRIES / CANAIS) */
        loading ? (
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
        )
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
