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
  Star,
  Calendar,
  Monitor,
  Cpu,
  Info,
  Tag,
  ShieldCheck,
} from 'lucide-react';
import {
  getGroupedOfflineDownloads,
  getOfflineDownloadsList,
  deleteOfflineDownload,
  deleteGroupDownloads,
  formatDownloadSize,
  getPlayableOfflineUrl,
  getPlayableOfflineUrlSync,
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
          const mainTitle = item.series_title || (item.stream_type === 'series' ? item.title.split(' - ')[0] : item.title);
          const groupKey =
            item.stream_type === 'series'
              ? `series_${(item.series_title || mainTitle).trim().toLowerCase()}`
              : `movie_${item.stream_id}`;

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
  const [episodeSearch, setEpisodeSearch] = useState('');
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

  // Seleciona um grupo de título para abrir a página de reprodução estilo Watch
  const handleOpenTitle = useCallback((group: GroupedDownloadItem, targetEp?: OfflineDownload) => {
    setSelectedGroup(group);
    const chosenEp = targetEp || (group.episodes && group.episodes.length > 0 ? group.episodes[0] : null);
    if (chosenEp) {
      setActiveEpisode(chosenEp);
      const syncUrl = getPlayableOfflineUrlSync(chosenEp);
      setPlayableUrl(syncUrl);
      // Confirmação assíncrona
      getPlayableOfflineUrl(chosenEp).then((u) => {
        if (u) setPlayableUrl(u);
      }).catch(() => {});
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
            (String(g.stream_id) === String(selectedGroup.stream_id) && g.stream_type === selectedGroup.stream_type) ||
            g.title.toLowerCase() === selectedGroup.title.toLowerCase()
        );
        if (stillGroup) {
          setSelectedGroup(stillGroup);
          if (activeEpisode) {
            const stillEp = stillGroup.episodes.find((e) => e.id === activeEpisode.id);
            if (stillEp) {
              setActiveEpisode(stillEp);
              setPlayableUrl(getPlayableOfflineUrlSync(stillEp));
            } else if (stillGroup.episodes.length > 0) {
              const firstEp = stillGroup.episodes[0];
              setActiveEpisode(firstEp);
              setPlayableUrl(getPlayableOfflineUrlSync(firstEp));
            }
          }
        }
      } else if (initialTitleParam) {
        const found = grouped.find(
          (g) =>
            `${g.stream_type}_${g.stream_id}` === initialTitleParam ||
            g.title.toLowerCase() === initialTitleParam.toLowerCase()
        );
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
  }, [loadDownloads]);

  // Volta da tela de reprodução para a tela de catálogo de títulos
  const handleBackToCatalog = () => {
    setSelectedGroup(null);
    setActiveEpisode(null);
    setPlayableUrl(null);
    setEpisodeSearch('');
  };

  // Alterna o capítulo selecionado na tela de reprodução de forma 100% síncrona
  const handleSelectEpisode = (ep: OfflineDownload) => {
    setActiveEpisode(ep);
    const syncUrl = getPlayableOfflineUrlSync(ep);
    setPlayableUrl(syncUrl);
    getPlayableOfflineUrl(ep).then((u) => {
      if (u) setPlayableUrl(u);
    }).catch(() => {});
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
      (String(selectedGroup.stream_id) === String(streamId) || selectedGroup.title === title) &&
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

  const filteredEpisodesList = useMemo(() => {
    if (!episodeSearch.trim()) return currentEpisodesList;
    const q = episodeSearch.toLowerCase();
    return currentEpisodesList.filter(
      (ep) =>
        ep.title.toLowerCase().includes(q) ||
        (ep.episode_title && ep.episode_title.toLowerCase().includes(q)) ||
        String(ep.episode_num || '').includes(q)
    );
  }, [currentEpisodesList, episodeSearch]);

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

  // Metadados EXIF e Descrição enriquecida do item ativo
  const activePlot = useMemo(() => {
    if (!activeEpisode) return '';
    return (
      activeEpisode.overview ||
      activeEpisode.plot ||
      selectedGroup?.episodes.find((e) => e.overview || e.plot)?.overview ||
      ''
    );
  }, [activeEpisode, selectedGroup]);

  const activeRating = useMemo(() => {
    if (!activeEpisode) return null;
    return activeEpisode.rating || selectedGroup?.episodes.find((e) => e.rating)?.rating || null;
  }, [activeEpisode, selectedGroup]);

  const activeGenre = useMemo(() => {
    if (!activeEpisode) return 'Conteúdo Offline';
    return (
      activeEpisode.genre ||
      selectedGroup?.episodes.find((e) => e.genre)?.genre ||
      (activeEpisode.stream_type === 'series' ? 'Série' : 'Filme')
    );
  }, [activeEpisode, selectedGroup]);

  const activeYear = useMemo(() => {
    if (!activeEpisode) return null;
    return (
      activeEpisode.year ||
      activeEpisode.release_date?.slice(0, 4) ||
      selectedGroup?.episodes.find((e) => e.year || e.release_date)?.year ||
      null
    );
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
  // CENÁRIO 2: REPRODUÇÃO DO TÍTULO SELECIONADO (ESTILO WATCHVIEW CINEMA 12-COLUNAS)
  // =========================================================================
  if (selectedGroup && activeEpisode) {
    const isSeries = selectedGroup.stream_type === 'series';

    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 sm:pb-12 space-y-6 pt-[calc(1.5rem+env(safe-area-inset-top,0px))]">
        {/* Barra Superior de Navegação idêntica à WatchView */}
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
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>Local</span>
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

        {/* Grid Principal Cinema 12 Colunas (Player + Painel Lateral de Capítulos) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full min-w-0 lg:items-start">
          {/* Lado Esquerdo: Player Cinema + Specs Técnicas + Navegação de Capítulos + Descrição EXIF (8 Colunas) */}
          <div className="lg:col-span-8 xl:col-span-8 flex flex-col gap-3 min-w-0 self-start">
            {/* Frame do Player Widescreen 16:9 */}
            <div className="aspect-video w-full rounded-2xl sm:rounded-3xl overflow-hidden bg-black border border-white/10 shadow-2xl relative flex items-center justify-center">
              {playableUrl ? (
                <VideoPlayer
                  streamUrl={playableUrl}
                  title={playerDisplayTitle}
                  streamId={String(activeEpisode.stream_id)}
                  streamType={activeEpisode.stream_type}
                  posterUrl={activeEpisode.poster_url || selectedGroup.poster_url}
                  autoPlay={true}
                  hasPrevEpisode={isSeries && canGoPrev}
                  onPrevEpisode={isSeries && canGoPrev ? handlePrevChapter : undefined}
                  prevEpisodeLabel="Capítulo Anterior"
                  hasNextEpisode={isSeries && canGoNext}
                  onNextEpisode={isSeries && canGoNext ? handleNextChapter : undefined}
                  nextEpisodeLabel="Próximo Capítulo"
                />
              ) : (
                <div className="flex flex-col items-center justify-center space-y-3 p-6 text-center">
                  <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-neutral-300 font-semibold tracking-wide">
                    Carregando arquivo offline da memória local...
                  </p>
                </div>
              )}
            </div>

            {/* Informações Técnicas Diretamente Abaixo do Player (Idêntico à WatchView) */}
            <div className="pt-1 pb-1 space-y-2.5 w-full min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2 text-neutral-300 text-[11px] w-full">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Modo Offline (Armazenamento Local)</span>
                  </div>

                  {/* Duração */}
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/5 border border-white/5">
                    <Clock className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                    <span className="text-neutral-400">Duração:</span>
                    <span className="font-bold text-white">{activeEpisode.duration || '24 min'}</span>
                  </div>

                  {/* Tamanho */}
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/5 border border-white/5">
                    <HardDrive className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                    <span className="text-neutral-400">Tamanho:</span>
                    <span className="font-bold text-white font-mono">{formatDownloadSize(activeEpisode.file_size)}</span>
                  </div>

                  {/* Dimensões */}
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/5 border border-white/5">
                    <Monitor className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                    <span className="text-neutral-400">Dimensões:</span>
                    <span className="font-bold text-white font-mono">{activeEpisode.dimensions || '1080p FHD'}</span>
                  </div>

                  {/* Codec */}
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/5 border border-white/5">
                    <Cpu className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                    <span className="text-neutral-400">Codec:</span>
                    <span className="font-bold text-white">{activeEpisode.codec || (activeEpisode.container_extension || 'mp4').toUpperCase()}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-neutral-500 font-mono">
                    {new Date(activeEpisode.downloaded_at).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              </div>
            </div>

            {/* Barra de Navegação entre Capítulos logo após o player */}
            {isSeries && (
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

                <div className="flex flex-col items-center justify-center px-2 text-center min-w-0 max-w-[220px]">
                  <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">
                    Capítulo Atual
                  </span>
                  <span className="text-xs font-bold text-violet-300 truncate w-full">
                    {activeEpisode.season_num && activeEpisode.episode_num
                      ? `T${activeEpisode.season_num} • EP ${activeEpisode.episode_num}`
                      : activeEpisode.title}
                  </span>
                </div>

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
            )}

            {/* Card Completo de Informações do Título, Sinopse e Metadados EXIF */}
            <div className="p-5 sm:p-6 rounded-3xl bg-[#13141b] border border-white/10 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-4">
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">
                    {selectedGroup.title}
                  </h2>
                  {activeEpisode.episode_title && (
                    <p className="text-xs sm:text-sm font-semibold text-violet-300 mt-0.5">
                      {activeEpisode.episode_title}
                    </p>
                  )}
                </div>

                {/* Badges de Metadados EXIF: Nota, Ano, Gênero */}
                <div className="flex flex-wrap items-center gap-2">
                  {activeRating && (
                    <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      <span>{Number(activeRating).toFixed(1)}</span>
                    </div>
                  )}
                  {activeYear && (
                    <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white/5 border border-white/10 text-neutral-300 text-xs font-medium">
                      <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                      <span>{activeYear}</span>
                    </div>
                  )}
                  {activeGenre && (
                    <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-violet-500/15 border border-violet-500/30 text-violet-300 text-xs font-semibold">
                      <Tag className="w-3 h-3 text-violet-400" />
                      <span>{activeGenre}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Sinopse / Descrição Completa */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-violet-400" />
                  <span>Sinopse / Descrição</span>
                </h3>
                <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">
                  {activePlot || 'Este vídeo baixado está pronto para reprodução local sem necessidade de conexão com a internet.'}
                </p>
              </div>

              {/* Dados do Arquivo Físico Local */}
              <div className="pt-3 border-t border-white/5 flex flex-wrap items-center justify-between gap-3 text-[11px] text-neutral-500">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Arquivo verificado e disponível offline</span>
                </div>
                <span className="font-mono">{activeEpisode.file_path}</span>
              </div>
            </div>
          </div>

          {/* Lado Direito: Coluna de Capítulos Baixados ou Detalhes do Filme (4 Colunas) */}
          <div className="lg:col-span-4 xl:col-span-4 flex flex-col gap-4 min-w-0">
            {isSeries ? (
              <div className="p-4 sm:p-5 rounded-3xl bg-[#13141b] border border-white/10 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-violet-400" />
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                      Capítulos Baixados
                    </h3>
                  </div>
                  <span className="text-xs font-bold text-violet-400 bg-violet-500/10 px-2.5 py-1 rounded-xl border border-violet-500/20">
                    {currentEpisodesList.length} {currentEpisodesList.length === 1 ? 'capítulo' : 'capítulos'}
                  </span>
                </div>

                {/* Filtro de Busca de Capítulos */}
                {currentEpisodesList.length > 3 && (
                  <div className="relative w-full">
                    <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Filtrar episódios salvos..."
                      value={episodeSearch}
                      onChange={(e) => setEpisodeSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-violet-500 transition"
                    />
                  </div>
                )}

                {/* Lista de Cards de Episódios idêntica à WatchView */}
                <div className="flex flex-col gap-2 max-h-[560px] overflow-y-auto pr-1">
                  {filteredEpisodesList.map((ep) => {
                    const isCurrentPlaying = activeEpisode?.id === ep.id;
                    const epLabel =
                      ep.season_num && ep.episode_num
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
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Thumbnail / Poster do Capítulo */}
                          <div className="w-12 h-12 rounded-xl overflow-hidden bg-black/60 shrink-0 relative border border-white/10">
                            {ep.thumbnail_url || ep.poster_url ? (
                              <ImageWithFallback
                                src={ep.thumbnail_url || ep.poster_url!}
                                alt={epLabel}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-neutral-600">
                                <Play className="w-4 h-4" />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                              {isCurrentPlaying ? (
                                <Volume2 className="w-4 h-4 text-violet-400 animate-pulse" />
                              ) : (
                                <Play className="w-3.5 h-3.5 text-white/80 fill-current" />
                              )}
                            </div>
                          </div>

                          <div className="min-w-0">
                            <p
                              className={`text-xs font-bold truncate ${
                                isCurrentPlaying ? 'text-violet-300' : 'text-white'
                              }`}
                            >
                              {epLabel}
                            </p>
                            {ep.episode_title && (
                              <p className="text-[11px] text-neutral-400 truncate">
                                {ep.episode_title}
                              </p>
                            )}
                            <div className="flex items-center gap-2 text-[10px] text-neutral-500 mt-0.5">
                              <span>{formatDownloadSize(ep.file_size)}</span>
                              <span>•</span>
                              <span>{ep.container_extension || 'mp4'}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isCurrentPlaying && (
                            <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-violet-500 text-white shadow-sm">
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
            ) : (
              /* Painel Lateral para Filme */
              <div className="p-5 rounded-3xl bg-[#13141b] border border-white/10 shadow-xl space-y-4">
                <div className="aspect-[2/3] w-full rounded-2xl overflow-hidden bg-black/40 relative border border-white/10">
                  {selectedGroup.poster_url ? (
                    <ImageWithFallback
                      src={selectedGroup.poster_url}
                      alt={selectedGroup.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-neutral-600">
                      <Film className="w-12 h-12" />
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-bold text-white">{selectedGroup.title}</h4>
                  <div className="flex items-center justify-between text-xs text-neutral-400 border-t border-white/5 pt-2">
                    <span>Espaço em disco:</span>
                    <strong className="text-white font-mono">{formatDownloadSize(selectedGroup.total_size)}</strong>
                  </div>
                  <div className="flex items-center justify-between text-xs text-neutral-400 border-t border-white/5 pt-2">
                    <span>Formato do contêiner:</span>
                    <strong className="text-white uppercase font-mono">{activeEpisode.container_extension || 'mp4'}</strong>
                  </div>
                </div>
              </div>
            )}
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

      {/* 3. Grid de Títulos Baixados (Escolha de Título com Aparência Estilo Watch) */}
      {groupedDownloads.length === 0 ? (
        <div className="p-16 rounded-3xl bg-[#13141b] border border-white/10 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-neutral-500">
            <HardDrive className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Nenhum vídeo baixado ainda</h3>
            <p className="text-xs text-neutral-400 mt-1 max-w-md mx-auto">
              Ao navegar pelo catálogo de Filmes ou Séries, clique no botão de download para salvar os vídeos na memória do seu aparelho e assistir offline sem internet.
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition shadow-lg shadow-violet-600/30"
          >
            <Sparkles className="w-4 h-4" />
            <span>Explorar Catálogo</span>
          </Link>
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="p-12 rounded-3xl bg-[#13141b] border border-white/10 text-center space-y-3">
          <p className="text-sm text-neutral-400">
            Nenhum título encontrado para &ldquo;<strong className="text-white">{search}</strong>&rdquo;.
          </p>
          <button
            type="button"
            onClick={() => setSearch('')}
            className="text-xs font-bold text-violet-400 hover:text-violet-300"
          >
            Limpar busca
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filteredGroups.map((group) => {
            const isSeries = group.stream_type === 'series';
            const firstEp = group.episodes[0];
            const synopsis = firstEp?.overview || firstEp?.plot || '';

            return (
              <div
                key={`${group.stream_type}_${group.stream_id}`}
                onClick={() => handleOpenTitle(group)}
                className="group flex flex-col rounded-2xl bg-[#13141b] border border-white/10 overflow-hidden hover:border-violet-500/50 hover:shadow-xl hover:shadow-violet-600/15 transition-all duration-300 cursor-pointer"
              >
                {/* Poster com Badges */}
                <div className="aspect-[2/3] w-full bg-black/60 relative overflow-hidden">
                  {group.poster_url ? (
                    <ImageWithFallback
                      src={group.poster_url}
                      alt={group.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-neutral-700">
                      {isSeries ? <Tv className="w-10 h-10" /> : <Film className="w-10 h-10" />}
                    </div>
                  )}

                  {/* Overlay gradiente */}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#13141b] via-transparent to-transparent opacity-80" />

                  {/* Badge Tipo e Quantidade de Capítulos */}
                  <div className="absolute top-2 left-2 flex flex-col gap-1">
                    <span className="px-2 py-0.5 rounded-lg text-[9px] font-extrabold uppercase bg-black/70 backdrop-blur-md text-violet-300 border border-violet-500/30 shadow-md">
                      {isSeries ? 'Série' : 'Filme'}
                    </span>
                    {isSeries && (
                      <span className="px-2 py-0.5 rounded-lg text-[9px] font-bold bg-violet-600/90 text-white shadow-md">
                        {group.items_count} {group.items_count === 1 ? 'cap.' : 'caps.'}
                      </span>
                    )}
                  </div>

                  {/* Botão Play Hover */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-[2px]">
                    <div className="w-11 h-11 rounded-2xl bg-violet-600 text-white flex items-center justify-center shadow-xl shadow-violet-600/40 group-hover:scale-110 transition-transform">
                      <Play className="w-5 h-5 fill-current ml-0.5" />
                    </div>
                  </div>

                  {/* Badge de Tamanho */}
                  <div className="absolute bottom-2 right-2">
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-black/80 text-emerald-400 border border-emerald-500/30">
                      {formatDownloadSize(group.total_size)}
                    </span>
                  </div>
                </div>

                {/* Conteúdo do Card */}
                <div className="p-3 flex flex-col flex-1 justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold text-white group-hover:text-violet-300 transition-colors line-clamp-2">
                      {group.title}
                    </h3>
                    {synopsis && (
                      <p className="text-[10px] text-neutral-400 line-clamp-2 mt-1">
                        {synopsis}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-white/5">
                    <span className="text-[9px] text-neutral-500">
                      {new Date(group.last_downloaded_at).toLocaleDateString('pt-BR')}
                    </span>
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
                      className="p-1 rounded-md text-neutral-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                      title="Excluir da memória"
                    >
                      <Trash2 className="w-3 h-3" />
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

export default function OfflinePage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center space-y-3">
          <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-neutral-400 font-semibold tracking-wide">
            Carregando modo offline...
          </p>
        </div>
      }
    >
      <OfflineWatchContent />
    </Suspense>
  );
}
