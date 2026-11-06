'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Download,
  Trash2,
  Play,
  HardDrive,
  Film,
  Video,
  Search,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowLeft,
  Volume2,
} from 'lucide-react';
import {
  getGroupedOfflineDownloads,
  getOfflineDownloadsList,
  deleteOfflineDownload,
  deleteGroupDownloads,
  formatDownloadSize,
  getPlayableOfflineUrl,
  GroupedDownloadItem,
  OfflineDownload,
  isNativeApp,
  PROGRESS_EVENT,
} from '@/lib/download-manager';
import VideoPlayer from '@/components/player/VideoPlayer';
import ImageWithFallback from '@/components/ui/ImageWithFallback';

export default function OfflineWatchPage() {
  const router = useRouter();
  const [groupedDownloads, setGroupedDownloads] = useState<GroupedDownloadItem[]>([]);
  const [allDownloadsList, setAllDownloadsList] = useState<OfflineDownload[]>([]);
  const [activeItem, setActiveItem] = useState<OfflineDownload | null>(null);
  const [playableUrl, setPlayableUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isNative, setIsNative] = useState(false);

  // Carrega lista de downloads offline salvos
  const loadDownloads = useCallback(async (preferredItemId?: string) => {
    try {
      const [grouped, allList] = await Promise.all([
        getGroupedOfflineDownloads(),
        getOfflineDownloadsList(),
      ]);

      setGroupedDownloads(grouped);
      setAllDownloadsList(allList);

      if (allList.length > 0) {
        let target = allList[0];
        if (preferredItemId) {
          const found = allList.find((i) => i.id === preferredItemId);
          if (found) target = found;
        } else if (activeItem) {
          const stillExists = allList.find((i) => i.id === activeItem.id);
          if (stillExists) target = stillExists;
        }

        setActiveItem(target);
        const url = await getPlayableOfflineUrl(target);
        setPlayableUrl(url);
      } else {
        setActiveItem(null);
        setPlayableUrl(null);
      }
    } catch (err) {
      console.warn('Erro ao carregar títulos offline:', err);
    } finally {
      setLoading(false);
    }
  }, [activeItem]);

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

  // Seleciona um item para reprodução direta no player topo
  const handleSelectItem = async (item: OfflineDownload) => {
    setActiveItem(item);
    const url = await getPlayableOfflineUrl(item);
    setPlayableUrl(url);
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
        ? `Deseja excluir todos os ${count} episódios baixados de "${title}" da memória do celular?`
        : `Deseja excluir "${title}" da memória do dispositivo?`;
    if (!confirm(msg)) return;
    await deleteGroupDownloads(streamType, streamId);
    await loadDownloads();
  };

  const totalDownloadsCount = useMemo(() => {
    return allDownloadsList.length;
  }, [allDownloadsList]);

  const totalStorageBytes = useMemo(() => {
    return allDownloadsList.reduce((acc, g) => acc + (g.file_size || 0), 0);
  }, [allDownloadsList]);

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groupedDownloads;
    const q = search.toLowerCase();
    return groupedDownloads
      .map((g) => {
        const matchesGroup = g.title.toLowerCase().includes(q);
        const matchingEps = g.episodes.filter(
          (ep) =>
            ep.title.toLowerCase().includes(q) ||
            (ep.series_title && ep.series_title.toLowerCase().includes(q))
        );
        if (matchesGroup) return g;
        if (matchingEps.length > 0) return { ...g, episodes: matchingEps };
        return null;
      })
      .filter(Boolean) as GroupedDownloadItem[];
  }, [groupedDownloads, search]);

  const playerDisplayTitle = useMemo(() => {
    if (!activeItem) return 'Nenhum vídeo selecionado';
    if (activeItem.stream_type === 'series') {
      const sTitle = activeItem.series_title || activeItem.title.split(' - ')[0];
      const epLabel = activeItem.season_num && activeItem.episode_num
        ? `T${activeItem.season_num} • EP ${activeItem.episode_num}`
        : activeItem.title;
      return `${sTitle} - ${epLabel}`;
    }
    return activeItem.title;
  }, [activeItem]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
      {/* 1. Cabeçalho de Navegação e Resumo de Armazenamento */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white border border-white/10 transition cursor-pointer"
            title="Voltar ao início"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
              <HardDrive className="w-6 h-6 text-violet-400" />
              <span>Vídeos Baixados (Offline)</span>
            </h1>
            <p className="text-xs text-neutral-400 mt-0.5">
              Reproduza seus filmes e séries salvos na memória local sem consumir conexão.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#13141b] border border-white/10 text-xs text-neutral-300 shadow-md">
            <HardDrive className="w-3.5 h-3.5 text-violet-400" />
            <span>Espaço em disco: <strong className="text-violet-300 font-bold">{formatDownloadSize(totalStorageBytes)}</strong></span>
          </div>
          <span className="text-xs font-semibold text-neutral-400 bg-[#13141b] border border-white/10 px-3 py-1.5 rounded-xl">
            <strong className="text-emerald-400 font-bold">{totalDownloadsCount}</strong> {totalDownloadsCount === 1 ? 'item baixado' : 'itens baixados'}
          </span>
        </div>
      </div>

      {/* 2. PLAYER CENTRAL NO TOPO - ESTILO WATCH SÉRIES */}
      {loading ? (
        <div className="p-20 text-center text-xs text-neutral-400 space-y-2">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p>Carregando player offline...</p>
        </div>
      ) : activeItem && playableUrl ? (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#13141b] p-3.5 rounded-2xl border border-white/10">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-violet-600/30 text-violet-300 border border-violet-500/30 shrink-0">
                  {activeItem.stream_type === 'series' ? 'Série Offline' : 'Filme Offline'}
                </span>
                <span className="text-xs text-neutral-400 font-medium truncate">
                  {activeItem.series_title || 'Arquivo Local'}
                </span>
                {activeItem.stream_type === 'series' && activeItem.season_num && activeItem.episode_num && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-white/10 text-neutral-300 shrink-0">
                    T{activeItem.season_num} • EP {activeItem.episode_num}
                  </span>
                )}
              </div>
              <h2 className="text-base sm:text-lg font-bold text-white truncate">
                {playerDisplayTitle}
              </h2>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={(e) => handleDeleteItem(activeItem.id, activeItem.title, e)}
                className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                title="Excluir este vídeo da memória"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir do Aparelho</span>
              </button>
            </div>
          </div>

          {/* Player de Vídeo em Proporção Cinema */}
          <div className="aspect-video max-w-5xl mx-auto w-full rounded-2xl sm:rounded-3xl overflow-hidden bg-black border border-white/10 shadow-2xl relative">
            <VideoPlayer
              streamUrl={playableUrl}
              title={playerDisplayTitle}
              streamId={String(activeItem.stream_id)}
              streamType={activeItem.stream_type}
              posterUrl={activeItem.poster_url}
              autoPlay={true}
            />
          </div>

          {/* Barra de Status da Reprodução Offline */}
          <div className="max-w-5xl mx-auto p-3 rounded-2xl bg-[#13141b] border border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-300">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Reproduzindo arquivo local (<strong className="text-white font-mono">{formatDownloadSize(activeItem.file_size)}</strong>)</span>
            </div>
            <span className="text-[11px] text-neutral-500">
              Salvo em: {new Date(activeItem.downloaded_at).toLocaleDateString('pt-BR')}
            </span>
          </div>
        </div>
      ) : (
        <div className="p-16 rounded-3xl bg-[#13141b] border border-white/10 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-violet-600/15 text-violet-400 border border-violet-500/30 flex items-center justify-center mx-auto">
            <HardDrive className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">Nenhum vídeo baixado para uso offline</h3>
            <p className="text-xs text-neutral-400 max-w-md mx-auto leading-relaxed">
              Você pode baixar filmes e episódios de séries enquanto estiver conectado clicando no botão "Baixar Offline" na tela de detalhes ou no player de vídeo.
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
      )}

      {/* 3. LISTA DE TÍTULOS E EPISÓDIOS BAIXADOS (ESTILO SÉRIES WATCH ABAIXO) */}
      {groupedDownloads.length > 0 && (
        <div className="space-y-6 pt-4 border-t border-white/5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Video className="w-5 h-5 text-violet-400" />
                <span>Sequência de Capítulos e Filmes Baixados</span>
              </h3>
              <p className="text-xs text-neutral-400">
                Toque em qualquer capítulo para alternar a reprodução imediatamente no player acima.
              </p>
            </div>

            {/* Input de Busca */}
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filtrar por nome do título..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-[#13141b] border border-white/10 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-violet-500 transition shadow-sm"
              />
            </div>
          </div>

          {/* Grupos de Conteúdo */}
          <div className="space-y-6">
            {filteredGroups.map((group) => {
              const isSeries = group.stream_type === 'series';

              return (
                <div
                  key={`${group.stream_type}_${group.stream_id}`}
                  className="p-4 sm:p-5 rounded-3xl bg-[#13141b] border border-white/10 shadow-xl space-y-4"
                >
                  {/* Cabeçalho do Grupo */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-16 rounded-xl bg-black overflow-hidden shrink-0 border border-white/10 relative">
                        <ImageWithFallback
                          src={group.poster_url}
                          alt={group.title}
                          isSmallThumb={true}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-violet-600/20 text-violet-300 border border-violet-500/30">
                            {isSeries ? 'Série Completa' : 'Filme'}
                          </span>
                          <span className="text-xs text-neutral-400">
                            {formatDownloadSize(group.total_size)}
                          </span>
                        </div>
                        <h4 className="text-sm sm:text-base font-bold text-white truncate">
                          {group.title}
                        </h4>
                        <p className="text-[11px] text-neutral-400">
                          {group.items_count} {group.items_count === 1 ? 'capítulo baixado' : 'capítulos baixados'}
                        </p>
                      </div>
                    </div>

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
                      className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-xs font-semibold flex items-center gap-1.5 transition self-start sm:self-auto cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{isSeries ? 'Excluir Todos os Episódios' : 'Excluir Filme'}</span>
                    </button>
                  </div>

                  {/* Lista Sequencial de Episódios / Capítulos */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {group.episodes.map((ep) => {
                      const isCurrentPlaying = activeItem?.id === ep.id;
                      const epLabel =
                        isSeries && ep.season_num && ep.episode_num
                          ? `T${ep.season_num} • EP ${ep.episode_num}`
                          : ep.title;

                      return (
                        <div
                          key={ep.id}
                          onClick={() => handleSelectItem(ep)}
                          className={`p-3 rounded-2xl flex items-center justify-between gap-3 cursor-pointer transition border ${
                            isCurrentPlaying
                              ? 'bg-violet-600/20 border-violet-500/50 text-violet-200 shadow-lg shadow-violet-600/20'
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
                              <p className={`text-xs font-bold truncate ${isCurrentPlaying ? 'text-violet-300' : 'text-white'}`}>
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
                                Tocando
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={(e) => handleDeleteItem(ep.id, ep.title, e)}
                              className="p-1.5 rounded-lg bg-black/40 hover:bg-rose-600 text-neutral-400 hover:text-white transition cursor-pointer"
                              title="Excluir capítulo"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
