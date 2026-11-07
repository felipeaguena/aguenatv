'use client';

import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Download,
  Trash2,
  Play,
  HardDrive,
  Film,
  Tv,
  Video,
  Search,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowLeft,
  Volume2,
  ChevronLeft,
  ChevronRight,
  Layers,
} from 'lucide-react';
import {
  getGroupedOfflineDownloads,
  getOfflineDownloadsList,
  deleteOfflineDownload,
  deleteGroupDownloads,
  formatDownloadSize,
  getPlayableOfflineUrl,
  getCachedManifestSync,
  GroupedDownloadItem,
  OfflineDownload,
  isNativeApp,
  PROGRESS_EVENT,
} from '@/lib/download-manager';
import VideoPlayer from '@/components/player/VideoPlayer';
import ImageWithFallback from '@/components/ui/ImageWithFallback';

function OfflineWatchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTitleParam = searchParams.get('title');

  // Inicializa o estado imediatamente do cache local para 0ms de espera ao abrir
  const [allDownloadsList, setAllDownloadsList] = useState<OfflineDownload[]>(() => {
    if (typeof window !== 'undefined') {
      return getCachedManifestSync();
    }
    return [];
  });

  const [groupedDownloads, setGroupedDownloads] = useState<GroupedDownloadItem[]>(() => {
    if (typeof window !== 'undefined') {
      const initial = getCachedManifestSync();
      if (initial.length > 0) {
        const map = new Map<string, GroupedDownloadItem>();
        for (const item of initial) {
          const groupKey = `${item.stream_type}_${item.stream_id}`;
          const mainTitle = item.series_title || (item.stream_type === 'series' ? item.title.split(' - ')[0] : item.title);
          if (!map.has(groupKey)) {
            map.set(groupKey, {
              stream_id: item.stream_id,
              stream_type: item.stream_type,
              title: mainTitle,
              poster_url: item.poster_url,
              total_size: item.file_size || 0,
              items_count: 1,
              episodes: [item],
              last_downloaded_at: item.downloaded_at,
            });
          } else {
            const existing = map.get(groupKey)!;
            existing.total_size += item.file_size || 0;
            existing.items_count += 1;
            if (!existing.episodes.some((e) => e.id === item.id)) {
              existing.episodes.push(item);
            }
          }
        }
        return Array.from(map.values());
      }
    }
    return [];
  });

  const [selectedGroup, setSelectedGroup] = useState<GroupedDownloadItem | null>(null);
  const [activeEpisode, setActiveEpisode] = useState<OfflineDownload | null>(null);
  const [playableUrl, setPlayableUrl] = useState<string | null>(null);
  const [isUrlResolving, setIsUrlResolving] = useState(false);
  const [loading, setLoading] = useState(() => {
    if (typeof window !== 'undefined') {
      const initial = getCachedManifestSync();
      if (initial.length > 0) return false;
    }
    return true;
  });
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'movie' | 'series'>('all');
  const [isNative, setIsNative] = useState(false);

  // Seleciona um grupo de título para abrir a página de reprodução
  const handleOpenTitle = useCallback(async (group: GroupedDownloadItem) => {
    setSelectedGroup(group);
    if (group.episodes && group.episodes.length > 0) {
      const firstEp = group.episodes[0];
      setActiveEpisode(firstEp);
      setIsUrlResolving(true);
      try {
        const url = await getPlayableOfflineUrl(firstEp);
        setPlayableUrl(url);
      } catch (err) {
        console.warn('Erro ao resolver URL offline:', err);
        setPlayableUrl(firstEp.file_path);
      } finally {
        setIsUrlResolving(false);
      }
    } else {
      setActiveEpisode(null);
      setPlayableUrl(null);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Carrega lista de downloads offline salvos
  const loadDownloads = useCallback(async () => {
    try {
      const allList = await getOfflineDownloadsList();
      const grouped = await getGroupedOfflineDownloads(allList);

      setAllDownloadsList(allList);
      setGroupedDownloads(grouped);

      // Se houver um título selecionado anteriormente ou via query param, revalida
      if (selectedGroup) {
        const stillGroup = grouped.find(
          (g) =>
            String(g.stream_id) === String(selectedGroup.stream_id) &&
            g.stream_type === selectedGroup.stream_type
        );
        if (stillGroup) {
          setSelectedGroup(stillGroup);
          if (activeEpisode) {
            const stillEp = stillGroup.episodes.find((e) => e.id === activeEpisode.id);
            if (stillEp) {
              setActiveEpisode(stillEp);
              const url = await getPlayableOfflineUrl(stillEp);
              setPlayableUrl(url);
            } else if (stillGroup.episodes.length > 0) {
              const firstEp = stillGroup.episodes[0];
              setActiveEpisode(firstEp);
              const url = await getPlayableOfflineUrl(firstEp);
              setPlayableUrl(url);
            }
          }
        }
      } else if (initialTitleParam) {
        const found = grouped.find((g) => `${g.stream_type}_${g.stream_id}` === initialTitleParam);
        if (found) {
          handleOpenTitle(found);
        }
      }
    } catch (err) {
      console.warn('Erro ao carregar títulos offline:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedGroup, activeEpisode, initialTitleParam, handleOpenTitle]);

  useEffect(() => {
    setIsNative(isNativeApp());
    loadDownloads();

    const handleProgress = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.done) {
        loadDownloads();
      }
    };
    window.addEventListener(PROGRESS_EVENT, handleProgress);
    return () => window.removeEventListener(PROGRESS_EVENT, handleProgress);
  }, []);

  // Volta da tela de reprodução para a tela de catálogo de títulos
  const handleBackToCatalog = () => {
    setSelectedGroup(null);
    setActiveEpisode(null);
    setPlayableUrl(null);
  };

  // Alterna o capítulo selecionado na tela de reprodução
  const handleSelectEpisode = async (ep: OfflineDownload) => {
    setActiveEpisode(ep);
    setIsUrlResolving(true);
    try {
      const url = await getPlayableOfflineUrl(ep);
      setPlayableUrl(url);
    } catch {
      setPlayableUrl(ep.file_path);
    } finally {
      setIsUrlResolving(false);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Exclui item individual da memória
  const handleDeleteItem = async (
    id: string,
    title: string,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    if (!confirm(`Deseja excluir "${title}" da memória do dispositivo?`)) return;
    await deleteOfflineDownload(id);
    await loadDownloads();
  };

  // Exclui grupo completo (série ou filme)
  const handleDeleteGroup = async (
    streamType: 'movie' | 'series',
    streamId: string | number,
    title: string,
    count: number,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    const msg =
      streamType === 'series'
        ? `Deseja excluir todos os ${count} episódios baixados de "${title}" da memória do aparelho?`
        : `Deseja excluir "${title}" da memória do dispositivo?`;
    if (!confirm(msg)) return;
    await deleteGroupDownloads(streamType, streamId);
    if (
      selectedGroup &&
      String(selectedGroup.stream_id) === String(streamId) &&
      selectedGroup.stream_type === streamType
    ) {
      setSelectedGroup(null);
      setActiveEpisode(null);
      setPlayableUrl(null);
    }
    await loadDownloads();
  };

  // Estatísticas de armazenamento
  const totalDownloadsCount = useMemo(() => {
    return allDownloadsList.length;
  }, [allDownloadsList]);

  const totalStorageBytes = useMemo(() => {
    return allDownloadsList.reduce((acc, g) => acc + (g.file_size || 0), 0);
  }, [allDownloadsList]);

  // Grupos filtrados por aba e busca
  const filteredGroups = useMemo(() => {
    return groupedDownloads.filter((g) => {
      if (filterTab === 'movie' && g.stream_type !== 'movie') return false;
      if (filterTab === 'series' && g.stream_type !== 'series') return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const matchesTitle = g.title.toLowerCase().includes(q);
      const matchesEp = g.episodes.some((ep) => ep.title.toLowerCase().includes(q));
      return matchesTitle || matchesEp;
    });
  }, [groupedDownloads, filterTab, search]);

  // Navegação entre capítulos para o título ativo
  const currentEpisodesList = useMemo(() => {
    return selectedGroup?.episodes || [];
  }, [selectedGroup]);

  const currentEpisodeIndex = useMemo(() => {
    if (!activeEpisode || !currentEpisodesList.length) return -1;
    return currentEpisodesList.findIndex((ep) => ep.id === activeEpisode.id);
  }, [activeEpisode, currentEpisodesList]);

  const canGoPrev = currentEpisodeIndex > 0;
  const canGoNext =
    currentEpisodeIndex >= 0 && currentEpisodeIndex < currentEpisodesList.length - 1;

  const handlePrevChapter = () => {
    if (canGoPrev) {
      handleSelectEpisode(currentEpisodesList[currentEpisodeIndex - 1]);
    }
  };

  const handleNextChapter = () => {
    if (canGoNext) {
      handleSelectEpisode(currentEpisodesList[currentEpisodeIndex + 1]);
    }
  };

  // Título legível do episódio ou filme para o player
  const playerDisplayTitle = useMemo(() => {
    if (!activeEpisode) return selectedGroup?.title || 'Vídeo Offline';
    if (activeEpisode.stream_type === 'series') {
      const sTitle = activeEpisode.series_title || selectedGroup?.title || 'Série';
      const epLabel =
        activeEpisode.season_num && activeEpisode.episode_num
          ? `T${activeEpisode.season_num} • EP ${activeEpisode.episode_num}`
          : activeEpisode.title;
      return `${sTitle} - ${epLabel}`;
    }
    return activeEpisode.title;
  }, [activeEpisode, selectedGroup]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center space-y-3">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs text-neutral-400 font-semibold tracking-wide">
          Carregando títulos salvos na memória local...
        </p>
      </div>
    );
  }

  // =========================================================================
  // CENÁRIO 2: REPRODUÇÃO DO TÍTULO SELECIONADO (ESTILO WATCH COM CAPÍTULOS)
  // =========================================================================
  if (selectedGroup && activeEpisode) {
    const isSeries = selectedGroup.stream_type === 'series';

    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 sm:pb-12 space-y-6 pt-[calc(1.5rem+env(safe-area-inset-top,0px))]">
        {/* Barra Superior de Navegação para Retorno ao Catálogo de Baixados */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={handleBackToCatalog}
              className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white border border-white/10 transition cursor-pointer flex items-center gap-1.5 text-xs font-bold shrink-0 shadow-sm"
              title="Voltar aos títulos baixados"
            >
              <ArrowLeft className="w-4 h-4 text-violet-400" />
              <span>Voltar aos Títulos</span>
            </button>

            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-violet-600/30 text-violet-300 border border-violet-500/30 shrink-0">
                  {isSeries ? 'Série Offline' : 'Filme Offline'}
                </span>
                <span className="text-xs text-neutral-400 font-medium truncate">
                  {selectedGroup.title}
                </span>
              </div>
              <h1 className="text-base sm:text-xl font-bold text-white truncate">
                {playerDisplayTitle}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            <button
              type="button"
              onClick={(e) =>
                handleDeleteGroup(
                  selectedGroup.stream_type,
                  selectedGroup.stream_id,
                  selectedGroup.title,
                  selectedGroup.items_count,
                  e
                )
              }
              className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              title="Excluir este título da memória"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isSeries ? 'Excluir Todos os Episódios' : 'Excluir Filme'}</span>
            </button>
          </div>
        </div>

        {/* Grid Principal: Player Central Cinema + Controles de Capítulos */}
        <div className="flex flex-col gap-4 max-w-5xl mx-auto w-full">
          {/* Frame do Player: Widescreen 16:9, SEM AUTOPLAY (o usuário precisa dar play primeiro) */}
          <div className="aspect-video w-full rounded-2xl sm:rounded-3xl overflow-hidden bg-black border border-white/10 shadow-2xl relative flex items-center justify-center">
            {playableUrl ? (
              <VideoPlayer
                streamUrl={playableUrl}
                title={playerDisplayTitle}
                streamId={String(activeEpisode.stream_id)}
                streamType={activeEpisode.stream_type}
                posterUrl={activeEpisode.poster_url || selectedGroup.poster_url}
                autoPlay={false}
                hasPrevEpisode={isSeries && canGoPrev}
                onPrevEpisode={isSeries && canGoPrev ? handlePrevChapter : undefined}
                prevEpisodeLabel="Capítulo Anterior"
                hasNextEpisode={isSeries && canGoNext}
                onNextEpisode={isSeries && canGoNext ? handleNextChapter : undefined}
                nextEpisodeLabel="Próximo Episódio"
              />
            ) : (
              <div className="flex flex-col items-center justify-center space-y-3 p-6 text-center">
                <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-neutral-300 font-semibold tracking-wide">
                  Carregando vídeo offline da memória local...
                </p>
              </div>
            )}
          </div>

          {/* Barra de Navegação entre Capítulos logo após o frame do player na mesma div */}
          <div className="flex items-center justify-between gap-3 p-2.5 sm:p-3 rounded-2xl bg-[#13141b] border border-white/10 shadow-lg">
            <button
              type="button"
              onClick={handlePrevChapter}
              disabled={!canGoPrev}
              className={`flex-1 flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer select-none ${
                canGoPrev
                  ? 'bg-white/5 hover:bg-white/10 text-white border border-white/10 active:scale-98 shadow-sm'
                  : 'bg-white/5 text-neutral-600 border border-white/5 cursor-not-allowed opacity-40'
              }`}
              title={canGoPrev ? 'Voltar para o capítulo anterior' : 'Não há capítulo anterior'}
            >
              <ChevronLeft className="w-4 h-4 text-violet-400 shrink-0" />
              <span className="truncate">Capítulo Anterior</span>
            </button>

            {isSeries && activeEpisode && (
              <div className="hidden sm:flex flex-col items-center justify-center px-2 text-center min-w-0 max-w-[220px]">
                <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">
                  Capítulo Atual
                </span>
                <span className="text-xs font-bold text-violet-300 truncate w-full">
                  {activeEpisode.season_num && activeEpisode.episode_num
                    ? `T${activeEpisode.season_num} • EP ${activeEpisode.episode_num}`
                    : activeEpisode.title}
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={handleNextChapter}
              disabled={!canGoNext}
              className={`flex-1 flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer select-none ${
                canGoNext
                  ? 'bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-600/30 active:scale-98'
                  : 'bg-white/5 text-neutral-600 border border-white/5 cursor-not-allowed opacity-40'
              }`}
              title={canGoNext ? 'Ir para o próximo capítulo' : 'Não há próximo capítulo'}
            >
              <span className="truncate">Próximo Capítulo</span>
              <ChevronRight className="w-4 h-4 text-white shrink-0" />
            </button>
          </div>

          {/* Barra de Status do Arquivo Local */}
          <div className="p-3 rounded-2xl bg-[#13141b] border border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-300">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>
                Reproduzindo arquivo local (
                <strong className="text-white font-mono">
                  {formatDownloadSize(activeEpisode.file_size)}
                </strong>
                )
              </span>
            </div>
            <span className="text-[11px] text-neutral-500">
              Salvo em: {new Date(activeEpisode.downloaded_at).toLocaleDateString('pt-BR')}
            </span>
          </div>

          {/* Sequência de Capítulos Baixados deste Título Listados Abaixo */}
          <div className="p-4 sm:p-5 rounded-3xl bg-[#13141b] border border-white/10 shadow-xl space-y-4 mt-2">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-violet-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  {isSeries ? 'Capítulos Disponíveis nesta Série' : 'Arquivo do Filme'}
                </h3>
              </div>
              <span className="text-xs font-semibold text-neutral-400">
                {currentEpisodesList.length} {currentEpisodesList.length === 1 ? 'item' : 'itens'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {currentEpisodesList.map((ep, idx) => {
                const isCurrentPlaying = activeEpisode?.id === ep.id;
                const epLabel =
                  isSeries && ep.season_num && ep.episode_num
                    ? `T${ep.season_num} • EP ${ep.episode_num}`
                    : ep.title;

                return (
                  <div
                    key={ep.id}
                    onClick={() => handleSelectEpisode(ep)}
                    className={`p-3 rounded-2xl flex items-center justify-between gap-3 cursor-pointer transition border ${
                      isCurrentPlaying
                        ? 'bg-violet-600/25 border-violet-500 text-violet-200 shadow-lg shadow-violet-600/20'
                        : 'bg-white/5 border-white/5 hover:bg-white/10 text-neutral-300 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-violet-600/20 text-violet-300 flex items-center justify-center shrink-0">
                        {isCurrentPlaying ? (
                          <Volume2 className="w-4 h-4 animate-pulse text-violet-400" />
                        ) : (
                          <Play className="w-3.5 h-3.5 fill-current" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p
                          className={`text-xs font-bold truncate ${
                            isCurrentPlaying ? 'text-violet-300' : 'text-white'
                          }`}
                        >
                          {epLabel}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-neutral-400 mt-0.5">
                          <span>{formatDownloadSize(ep.file_size)}</span>
                          <span>•</span>
                          <span>{ep.container_extension || 'mp4'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isCurrentPlaying && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-violet-500 text-white">
                          Ativo
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleDeleteItem(ep.id, ep.title, e)}
                        className="p-1.5 rounded-lg bg-black/40 hover:bg-rose-600 text-neutral-400 hover:text-white transition cursor-pointer"
                        title="Excluir este capítulo da memória"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // CENÁRIO 1: CATÁLOGO / ESCOLHA DO TÍTULO QUE DESEJA ASSISTIR
  // =========================================================================
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 sm:pb-12 space-y-8 pt-[calc(1.5rem+env(safe-area-inset-top,0px))]">
      {/* 1. Cabeçalho de Navegação e Resumo de Armazenamento */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white border border-white/10 transition cursor-pointer"
            title="Voltar ao início"
          >
            <ArrowLeft className="w-4 h-4 text-violet-400" />
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
              <HardDrive className="w-6 h-6 text-violet-400" />
              <span>Vídeos Baixados (Offline)</span>
            </h1>
            <p className="text-xs text-neutral-400 mt-0.5">
              Escolha um título salvo na memória do seu aparelho para reproduzir offline.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-[#13141b] border border-white/10 text-xs text-neutral-300 shadow-md">
            <HardDrive className="w-3.5 h-3.5 text-violet-400" />
            <span>
              Espaço ocupado:{' '}
              <strong className="text-violet-300 font-bold">
                {formatDownloadSize(totalStorageBytes)}
              </strong>
            </span>
          </div>
          <span className="text-xs font-semibold text-neutral-400 bg-[#13141b] border border-white/10 px-3.5 py-2 rounded-2xl">
            <strong className="text-emerald-400 font-bold">{groupedDownloads.length}</strong>{' '}
            {groupedDownloads.length === 1 ? 'título salvo' : 'títulos salvos'} ({totalDownloadsCount}{' '}
            {totalDownloadsCount === 1 ? 'arquivo' : 'arquivos'})
          </span>
        </div>
      </div>

      {/* 2. Barra de Filtro e Busca de Títulos Baixados */}
      {groupedDownloads.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#13141b] p-3 rounded-2xl border border-white/10">
          {/* Abas: Todos, Filmes, Séries */}
          <div className="flex items-center gap-1.5 p-1 bg-black/40 rounded-xl border border-white/5 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setFilterTab('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                filterTab === 'all'
                  ? 'bg-violet-600 text-white shadow-md'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Todos ({groupedDownloads.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('movie')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                filterTab === 'movie'
                  ? 'bg-violet-600 text-white shadow-md'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              <span>Filmes</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('series')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                filterTab === 'series'
                  ? 'bg-violet-600 text-white shadow-md'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Tv className="w-3.5 h-3.5" />
              <span>Séries</span>
            </button>
          </div>

          {/* Campo de Busca */}
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar título baixado..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-violet-500 transition shadow-inner"
            />
          </div>
        </div>
      )}

      {/* 3. Grid de Títulos Baixados (Escolha de Título) */}
      {groupedDownloads.length === 0 ? (
        <div className="p-16 rounded-3xl bg-[#13141b] border border-white/10 text-center space-y-4">
          <div className="w-14 h-14 rounded-3xl bg-violet-600/15 text-violet-400 border border-violet-500/30 flex items-center justify-center mx-auto shadow-lg">
            <HardDrive className="w-7 h-7" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-base font-bold text-white">Nenhum vídeo baixado para uso offline</h3>
            <p className="text-xs text-neutral-400 max-w-md mx-auto leading-relaxed">
              Você pode baixar filmes e episódios de séries enquanto estiver conectado clicando no
              botão &quot;Baixar Offline&quot; na tela de detalhes ou no player de vídeo.
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs shadow-lg shadow-violet-600/30 transition cursor-pointer"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>Explorar Catálogo</span>
          </Link>
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="p-12 rounded-3xl bg-[#13141b] border border-white/10 text-center space-y-2">
          <Search className="w-8 h-8 text-neutral-500 mx-auto" />
          <h3 className="text-sm font-bold text-white">Nenhum título corresponde à busca</h3>
          <p className="text-xs text-neutral-400">Tente buscar com outro termo ou limpe o filtro.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filteredGroups.map((group) => {
            const isSeries = group.stream_type === 'series';

            return (
              <div
                key={`${group.stream_type}_${group.stream_id}`}
                className="group relative flex flex-col rounded-2xl bg-[#13141b] border border-white/10 overflow-hidden shadow-xl hover:border-violet-500/50 hover:shadow-2xl hover:shadow-violet-600/10 transition-all duration-300"
              >
                {/* Poster do Título */}
                <div
                  onClick={() => handleOpenTitle(group)}
                  className="aspect-[2/3] w-full relative bg-neutral-900 overflow-hidden cursor-pointer"
                >
                  <ImageWithFallback
                    src={group.poster_url}
                    alt={group.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />

                  {/* Badges de Categoria e Episódios */}
                  <div className="absolute top-2 left-2 flex flex-col gap-1 items-start z-10">
                    <span className="px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider bg-black/80 backdrop-blur-md border border-white/10 text-white shadow-md">
                      {isSeries ? 'Série' : 'Filme'}
                    </span>
                    {isSeries && (
                      <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-violet-600 text-white shadow-md">
                        {group.items_count} {group.items_count === 1 ? 'ep' : 'eps'}
                      </span>
                    )}
                  </div>

                  {/* Badge de Tamanho em Disco */}
                  <div className="absolute bottom-2 right-2 z-10">
                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-extrabold bg-black/85 backdrop-blur-md border border-white/15 text-violet-300 shadow-md">
                      {formatDownloadSize(group.total_size)}
                    </span>
                  </div>

                  {/* Overlay de Hover com Ícone Play */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-violet-600 text-white flex items-center justify-center shadow-lg shadow-violet-600/50 scale-90 group-hover:scale-100 transition-transform">
                      <Play className="w-5 h-5 fill-white ml-0.5" />
                    </div>
                  </div>
                </div>

                {/* Detalhes do Card */}
                <div className="p-3 flex flex-col flex-1 justify-between gap-2.5">
                  <div className="min-w-0">
                    <h3
                      onClick={() => handleOpenTitle(group)}
                      className="text-xs font-bold text-white truncate hover:text-violet-300 transition cursor-pointer"
                      title={group.title}
                    >
                      {group.title}
                    </h3>
                    <p className="text-[10px] text-neutral-400 mt-0.5">
                      {isSeries
                        ? `${group.items_count} capítulos baixados`
                        : `${formatDownloadSize(group.total_size)}`}
                    </p>
                  </div>

                  {/* Botões de Ação: Assistir e Excluir */}
                  <div className="flex items-center gap-1.5 pt-1 border-t border-white/5">
                    <button
                      type="button"
                      onClick={() => handleOpenTitle(group)}
                      className="flex-1 py-1.5 px-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-bold transition flex items-center justify-center gap-1.5 shadow-md shadow-violet-600/30 cursor-pointer"
                    >
                      <Play className="w-3 h-3 fill-white" />
                      <span>Assistir</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) =>
                        handleDeleteGroup(
                          group.stream_type,
                          group.stream_id,
                          group.title,
                          group.items_count,
                          e
                        )
                      }
                      className="p-1.5 rounded-xl bg-white/5 hover:bg-rose-500/20 text-neutral-400 hover:text-rose-300 border border-white/5 hover:border-rose-500/30 transition cursor-pointer"
                      title="Excluir título da memória"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function OfflineWatchPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto px-4 py-20 text-center">
          <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      }
    >
      <OfflineWatchContent />
    </Suspense>
  );
}
