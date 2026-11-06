'use client';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Download,
  Trash2,
  Play,
  HardDrive,
  Film,
  Tv,
  ChevronDown,
  ChevronRight,
  Search,
  Info,
  Clock,
  Sparkles,
} from 'lucide-react';
import {
  getGroupedOfflineDownloads,
  deleteOfflineDownload,
  deleteGroupDownloads,
  formatDownloadSize,
  GroupedDownloadItem,
  OfflineDownload,
  isNativeApp,
  PROGRESS_EVENT,
} from '@/lib/download-manager';
import { getInfoUrl, getWatchUrl } from '@/lib/routes';
import ImageWithFallback from '@/components/ui/ImageWithFallback';

export default function OfflineDownloadsPage() {
  const router = useRouter();
  const [groupedDownloads, setGroupedDownloads] = useState<GroupedDownloadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedSeriesKey, setExpandedSeriesKey] = useState<string | null>(null);
  const [isNative, setIsNative] = useState(false);

  const loadDownloads = async () => {
    setLoading(true);
    try {
      const data = await getGroupedOfflineDownloads();
      setGroupedDownloads(data);
    } catch (err) {
      console.warn('Erro ao carregar títulos baixados:', err);
    } finally {
      setLoading(false);
    }
  };

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

  const totalDownloadsCount = useMemo(() => {
    return groupedDownloads.reduce((acc, g) => acc + g.items_count, 0);
  }, [groupedDownloads]);

  const totalStorageBytes = useMemo(() => {
    return groupedDownloads.reduce((acc, g) => acc + g.total_size, 0);
  }, [groupedDownloads]);

  const filteredDownloads = useMemo(() => {
    if (!search.trim()) return groupedDownloads;
    const q = search.toLowerCase();
    return groupedDownloads.filter((g) => g.title.toLowerCase().includes(q));
  }, [groupedDownloads, search]);

  const handleOpenInfo = (streamType: 'movie' | 'series', streamId: string | number) => {
    router.push(getInfoUrl(streamType, streamId));
  };

  const handlePlayMovie = (streamId: string | number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    router.push(getWatchUrl('movie', streamId));
  };

  const handlePlayEpisode = (
    streamId: string | number,
    ep: OfflineDownload,
    e?: React.MouseEvent
  ) => {
    if (e) e.stopPropagation();
    const episodeId = ep.episode_id || ep.episode_num;
    router.push(`/series/${streamId}/watch?episode=${episodeId}`);
  };

  const handleDeleteEpisode = async (
    id: string,
    title: string,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    if (!confirm(`Deseja excluir "${title}" da memória do dispositivo?`)) return;
    await deleteOfflineDownload(id);
    await loadDownloads();
  };

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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <span className="p-2.5 rounded-2xl bg-violet-600/20 text-violet-400 border border-violet-500/30 shadow-lg shadow-violet-600/20">
              <HardDrive className="w-6 h-6" />
            </span>
            Vídeos Baixados (Offline)
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1 max-w-2xl leading-relaxed">
            {isNative
              ? 'Gerenciador central de títulos salvos na memória do seu celular para assistir sem consumir internet.'
              : 'O recurso de download para reprodução offline é exclusivo do aplicativo instalado no aparelho.'}
          </p>
        </div>

        {/* Badges de Espaço Armazenado e Quantidade */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#13141b] border border-white/10 text-xs text-neutral-300 shadow-md">
            <HardDrive className="w-4 h-4 text-violet-400" />
            <span>
              Espaço em disco: <strong className="text-violet-300 font-bold">{formatDownloadSize(totalStorageBytes)}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-neutral-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>
              {totalDownloadsCount} {totalDownloadsCount === 1 ? 'vídeo baixado' : 'vídeos baixados'}
            </span>
          </div>
        </div>
      </div>

      {/* Barra de Filtro e Busca */}
      {groupedDownloads.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filtrar títulos baixados..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#13141b] border border-white/10 hover:border-violet-500/40 focus:border-violet-500 rounded-xl pl-9 pr-3.5 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none transition shadow-sm"
            />
          </div>
        </div>
      )}

      {/* Conteúdo Principal */}
      {loading ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3">
          <div className="w-9 h-9 border-3 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-neutral-400 font-medium">Sincronizando arquivos salvos no disco...</p>
        </div>
      ) : groupedDownloads.length === 0 ? (
        <div className="min-h-[45vh] flex flex-col items-center justify-center text-center p-8 rounded-3xl bg-[#13141b]/60 border border-white/5 space-y-4">
          <div className="w-16 h-16 rounded-3xl bg-violet-600/10 flex items-center justify-center text-violet-400 border border-violet-500/20 shadow-xl shadow-violet-600/10">
            <Download className="w-8 h-8 opacity-80" />
          </div>
          <div className="max-w-md space-y-2">
            <h3 className="text-lg font-bold text-white">Nenhum vídeo baixado ainda</h3>
            {!isNative ? (
              <p className="text-xs text-neutral-400 leading-relaxed">
                O recurso de salvar filmes e episódios para assistir offline sem gastar dados móveis é exclusivo do aplicativo mobile AGUENATV instalado no seu aparelho.
              </p>
            ) : (
              <p className="text-xs text-neutral-400 leading-relaxed">
                Abra qualquer filme ou episódio de série no catálogo e clique no botão de download para salvar na memória do seu celular e assistir quando estiver sem internet.
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Link
              href="/movies"
              className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs shadow-lg shadow-violet-600/30 transition cursor-pointer"
            >
              Explorar Filmes
            </Link>
            <Link
              href="/series"
              className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white font-bold text-xs border border-white/10 transition cursor-pointer"
            >
              Explorar Séries
            </Link>
          </div>
        </div>
      ) : filteredDownloads.length === 0 ? (
        <div className="p-16 rounded-3xl bg-[#13141b] border border-white/10 text-center space-y-2">
          <Search className="w-8 h-8 text-neutral-600 mx-auto" />
          <h3 className="text-sm font-bold text-neutral-300">Nenhum título corresponde à pesquisa</h3>
          <p className="text-xs text-neutral-500">Tente buscar por outro termo ou limpe o campo de busca.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredDownloads.map((group) => {
            const groupKey = `${group.stream_type}_${group.stream_id}`;
            const isExpanded = expandedSeriesKey === groupKey;
            const isSeries = group.stream_type === 'series';

            return (
              <div
                key={groupKey}
                className="rounded-3xl bg-[#13141b] border border-white/10 p-4 sm:p-5 space-y-4 hover:border-violet-500/40 transition-all shadow-lg"
              >
                {/* Linha Superior: Poster, Dados do Título e Botões de Gerenciamento */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div
                    onClick={() => handleOpenInfo(group.stream_type, group.stream_id)}
                    className="flex items-center gap-4 cursor-pointer group/title flex-1 min-w-0"
                    title="Clique para abrir a página de informações do título"
                  >
                    {/* Poster */}
                    <div className="w-16 sm:w-20 aspect-[3/4] rounded-2xl overflow-hidden bg-neutral-900 border border-white/10 shrink-0 relative shadow-md">
                      <ImageWithFallback
                        src={group.poster_url || '/placeholder.svg'}
                        alt={group.title}
                        className="w-full h-full object-cover group-hover/title:scale-105 transition-transform duration-300"
                        isSmallThumb={true}
                      />
                    </div>

                    {/* Informações Textuais */}
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider bg-violet-600/20 text-violet-300 border border-violet-500/30">
                          {isSeries ? 'Série' : 'Filme'}
                        </span>
                        <span className="text-[11px] font-mono text-neutral-400 bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
                          {formatDownloadSize(group.total_size)}
                        </span>
                      </div>

                      <h3 className="text-base font-extrabold text-white group-hover/title:text-violet-300 transition-colors line-clamp-1">
                        {group.title}
                      </h3>

                      <p className="text-xs text-neutral-400">
                        {isSeries
                          ? `${group.items_count} ${
                              group.items_count === 1
                                ? 'episódio salvo na memória'
                                : 'episódios salvos na memória'
                            }`
                          : 'Filme completo pronto para assistir offline'}
                      </p>
                    </div>
                  </div>

                  {/* Ações do Título: Abrir Info, Assistir, Gerenciar Episódios e Excluir */}
                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end border-t sm:border-t-0 border-white/5 pt-3 sm:pt-0 shrink-0">
                    {/* Botão Abrir Detalhes (Página Info) */}
                    <button
                      onClick={() => handleOpenInfo(group.stream_type, group.stream_id)}
                      className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-200 hover:text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                      title="Abrir página de detalhes e informações"
                    >
                      <Info className="w-3.5 h-3.5 text-violet-400" />
                      <span>Detalhes</span>
                    </button>

                    {/* Botão Assistir (Filme) ou Gerenciar Episódios (Série) */}
                    {!isSeries ? (
                      <button
                        onClick={(e) => handlePlayMovie(group.stream_id, e)}
                        className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-violet-600/30 transition cursor-pointer"
                        title="Assistir filme completo offline"
                      >
                        <Play className="w-3.5 h-3.5 fill-white" />
                        <span>Assistir Offline</span>
                      </button>
                    ) : (
                      <button
                        onClick={() =>
                          setExpandedSeriesKey(isExpanded ? null : groupKey)
                        }
                        className="px-4 py-2 rounded-xl bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/40 text-violet-200 font-bold text-xs flex items-center gap-2 transition cursor-pointer shadow-sm"
                        title="Expandir/ocultar lista de episódios baixados"
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

                    {/* Botão Excluir Todos / Excluir Filme */}
                    <button
                      onClick={(e) =>
                        handleDeleteGroup(
                          group.stream_type,
                          group.stream_id,
                          group.title,
                          group.items_count,
                          e
                        )
                      }
                      className="p-2 sm:px-3 sm:py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 hover:border-rose-500/40 transition cursor-pointer text-xs font-bold flex items-center gap-1.5"
                      title={
                        isSeries
                          ? 'Excluir todos os episódios baixados desta série da memória'
                          : 'Excluir filme da memória do dispositivo'
                      }
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                      <span className="hidden sm:inline">
                        {isSeries ? 'Excluir Todos' : 'Excluir'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Lista Expansível de Episódios da Série */}
                {isSeries && isExpanded && (
                  <div className="mt-3 pt-4 border-t border-white/5 space-y-3 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between text-xs font-bold text-neutral-400">
                      <span className="flex items-center gap-1.5">
                        <Tv className="w-3.5 h-3.5 text-violet-400" />
                        Episódios Baixados ({group.episodes.length}):
                      </span>
                      <span className="text-[11px] text-neutral-500 font-normal">
                        Clique em Assistir para reproduzir direto na tela cheia offline
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {group.episodes.map((ep) => {
                        const epLabel =
                          ep.season_num !== undefined && ep.episode_num !== undefined
                            ? `T${ep.season_num}:E${ep.episode_num} - ${
                                ep.title.includes(' - ')
                                  ? ep.title.split(' - ').slice(1).join(' - ')
                                  : ep.title
                              }`
                            : ep.title;

                        return (
                          <div
                            key={ep.id}
                            className="p-3.5 rounded-2xl bg-[#0b0c10] border border-white/5 hover:border-white/10 flex items-center justify-between gap-3 transition shadow-sm"
                          >
                            <div className="min-w-0 flex-1">
                              <p
                                className="text-xs font-bold text-white truncate"
                                title={epLabel}
                              >
                                {epLabel}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] text-neutral-400 font-mono">
                                  {formatDownloadSize(ep.file_size)}
                                </span>
                                <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-white/5 text-neutral-400 font-mono">
                                  {ep.container_extension || 'mp4'}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {/* Assistir Episódio no player de tela cheia */}
                              <button
                                onClick={(e) => handlePlayEpisode(group.stream_id, ep, e)}
                                className="p-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white transition shadow-md shadow-violet-600/20 cursor-pointer"
                                title="Assistir este episódio offline"
                              >
                                <Play className="w-3.5 h-3.5 fill-white" />
                              </button>

                              {/* Excluir Episódio */}
                              <button
                                onClick={(e) => handleDeleteEpisode(ep.id, epLabel, e)}
                                className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 transition cursor-pointer"
                                title="Excluir este episódio da memória"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
