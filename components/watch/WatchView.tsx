'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Heart,
  CheckCircle2,
  Info,
  Play,
  Tv,
  Film,
  Layers,
  ChevronDown,
  Search,
  Clock,
  Sparkles,
  Star,
  Compass,
  Calendar,
  HardDrive,
  Monitor,
  Cpu,
  Eye,
} from 'lucide-react';
import { localDB, getSavedIPTVConfig } from '@/lib/db-local';
import {
  BaseStreamItem,
  IPTVAccount,
  StreamType,
  SeriesSeason,
  SeriesEpisode,
  SeriesInfoResponse,
  EnrichedMetadata,
  EnrichedEpisodeMetadata,
} from '@/lib/types';
import { getWatchUrl, getInfoUrl, getRouteType } from '@/lib/routes';
import { buildSortedSeasonList, getDefaultSeason, getEpisodesForSeason, formatEpisodeTitle } from '@/lib/series';
import VideoPlayer, { PlayerVideoInfo } from '@/components/player/VideoPlayer';
import MediaCard from '@/components/media/MediaCard';
import ImageWithFallback from '@/components/ui/ImageWithFallback';
import { useFavorites } from '@/hooks/useFavorites';
import { useWatched } from '@/hooks/useWatched';
import { useContinueWatching } from '@/hooks/useContinueWatching';

interface WatchViewProps {
  type: string;
  id: string;
}

export default function WatchView({ type, id }: WatchViewProps) {
  // =========================================================================
  // 1. TODOS OS HOOKS DO REACT SÃO DECLARADOS AQUI NO TOPO (INCONDICIONAIS)
  // =========================================================================
  const router = useRouter();
  const searchParams = useSearchParams();
  const episodeParam = searchParams.get('ep');
  const seasonParam = searchParams.get('season');
  const timeParam = searchParams.get('t');
  const initialTime = timeParam ? Number(timeParam) : undefined;

  const [item, setItem] = useState<BaseStreamItem | null>(null);
  const [config, setConfig] = useState<IPTVAccount | null>(null);
  const [relatedItems, setRelatedItems] = useState<BaseStreamItem[]>([]);
  const [currentStreamId, setCurrentStreamId] = useState(id);
  const [loading, setLoading] = useState(true);

  // Estados específicos para Séries
  const [seriesInfo, setSeriesInfo] = useState<SeriesInfoResponse | null>(null);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState<string>(seasonParam || '1');
  const [activeEpisode, setActiveEpisode] = useState<SeriesEpisode | null>(null);
  const [isSeasonDropdownOpen, setIsSeasonDropdownOpen] = useState(false);
  const [episodeSearch, setEpisodeSearch] = useState('');
  const [channelSearch, setChannelSearch] = useState('');
  const [seasonEpisodesMeta, setSeasonEpisodesMeta] = useState<Record<string | number, EnrichedEpisodeMetadata>>({});
  const [techVideoStats, setTechVideoStats] = useState<{
    duration?: string;
    size?: string;
    dimensions?: string;
    codec?: string;
  }>({});

  // Metadados enriquecidos da API (TMDb / Kitsu / TVMaze) e Sugestões Inteligentes
  const [enrichedMetadata, setEnrichedMetadata] = useState<EnrichedMetadata | null>(null);
  const [suggestions, setSuggestions] = useState<BaseStreamItem[]>([]);

  // Custom Hooks para Favoritos e Histórico
  const { isFavorite, addFavorite, removeFavorite } = useFavorites();
  const { isWatched, markWatched, removeWatched } = useWatched();
  const { saveProgress } = useContinueWatching();

  // 1. Efeito: Carrega Configuração do IPTV e Item do banco local Dexie
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const targetType: StreamType =
          type === 'series'
            ? 'series'
            : type === 'movies' || type === 'movie'
            ? 'movie'
            : 'live';

        let foundItem: any = null;
        if (localDB) {
          // 1. Tenta buscar pela chave primária explícita para evitar colisão entre stream types
          foundItem = await localDB.streams.get(`${targetType}_${currentStreamId}`);

          // 2. Se não encontrar, filtra estritamente pelo stream_type
          if (!foundItem) {
            foundItem = await localDB.streams
              .where('stream_id')
              .equals(String(currentStreamId))
              .filter((s) => s.stream_type === targetType)
              .first();
          }

          // 3. Fallback amplo
          if (!foundItem) {
            foundItem = await localDB.streams.where('stream_id').equals(String(currentStreamId)).first();
          }
        }

        const savedCfg = await getSavedIPTVConfig();

        if (!isMounted) return;
        setConfig(savedCfg);

        if (foundItem) {
          setItem(foundItem as unknown as BaseStreamItem);

          if (foundItem.category_id && localDB) {
            const related = await localDB.streams
              .where('category_id')
              .equals(foundItem.category_id)
              .filter((s) => s.stream_type === foundItem.stream_type)
              .toArray();
            if (isMounted) {
              setRelatedItems(related as unknown as BaseStreamItem[]);
            }
          }
        }
      } catch (e) {
        console.error('Erro ao carregar dados do stream:', e);
      } finally {
        if (isMounted && type !== 'series') {
          setLoading(false);
        }
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, [currentStreamId, type]);

  // 2. Efeito: Se for série, busca os detalhes completos, temporadas e episódios via API do IPTV
  useEffect(() => {
    if (type !== 'series' && item?.stream_type !== 'series') return;
    if (!config) return;

    let isMounted = true;
    async function fetchSeriesDetails() {
      setLoadingSeries(true);
      try {
        let cleanHost = config!.server_url.replace(/\/+$/, '');
        if (cleanHost.includes(':80') && !cleanHost.includes(':8080')) {
          cleanHost = cleanHost.replace(':80', ':8080');
        }

        const res = await fetch(
          `/api/iptv?host=${encodeURIComponent(cleanHost)}&username=${encodeURIComponent(
            config!.username
          )}&password=${encodeURIComponent(config!.password)}&action=get_series_info&series_id=${id}`
        );

        if (!res.ok) throw new Error('Falha ao obter episódios da série');
        const data: SeriesInfoResponse = await res.json();

        if (!isMounted) return;
        setSeriesInfo(data);
        if (!episodeParam) {
          const sorted = buildSortedSeasonList(data);
          setSelectedSeason(getDefaultSeason(sorted));
        }

        // Se o item não estava no banco local (Dexie), cria a partir dos dados do servidor
        setItem((prev) => {
          if (prev) return prev;
          return {
            stream_id: String(id),
            name: data.info?.name || data.info?.title || 'Série',
            title: data.info?.name || data.info?.title || 'Série',
            stream_type: 'series',
            stream_icon: data.info?.cover,
            category_name: data.info?.genre || 'Séries',
          };
        });
      } catch (err) {
        console.error('Erro ao buscar capítulos da série:', err);
      } finally {
        if (isMounted) {
          setLoadingSeries(false);
          setLoading(false);
        }
      }
    }

    fetchSeriesDetails();
    return () => {
      isMounted = false;
    };
  }, [id, type, config, item?.stream_type]);

  // 3. Efeito: Sincroniza o episódio ativo com base no parâmetro `?ep=...` ou padrão (Episódio 1)
  useEffect(() => {
    if (!seriesInfo?.episodes) return;

    let targetEp: SeriesEpisode | null = null;
    let targetSeason = selectedSeason;

    // Se temos um ep no query param, procura em todas as temporadas
    if (episodeParam) {
      for (const sKey of Object.keys(seriesInfo.episodes)) {
        const found = seriesInfo.episodes[sKey].find((e) => String(e.id) === String(episodeParam));
        if (found) {
          targetEp = found;
          targetSeason = sKey;
          break;
        }
      }
    }

    // Se não encontrou pelo epParam ou não foi passado, pega o primeiro episódio da temporada
    if (!targetEp) {
      const sKeys = Object.keys(seriesInfo.episodes);
      const chosenSeason = seriesInfo.episodes[selectedSeason] ? selectedSeason : sKeys[0];
      if (chosenSeason && seriesInfo.episodes[chosenSeason]?.length > 0) {
        targetEp = seriesInfo.episodes[chosenSeason][0];
        targetSeason = chosenSeason;
      }
    }

    if (targetEp) {
      setActiveEpisode(targetEp);
      setSelectedSeason(targetSeason);
    }
  }, [seriesInfo, episodeParam, selectedSeason]);

  // 4. Efeito: Busca Metadados Enriquecidos (TMDb / Kitsu / TVMaze) e Gera Sugestões Relacionadas
  useEffect(() => {
    if (!item?.title && !item?.name) return;

    let isMounted = true;
    async function loadMetadataAndSuggestions() {
      // 1. Busca metadados enriquecidos
      let meta: EnrichedMetadata | null = null;
      try {
        const titleToSearch = item!.title || item!.name;
        const categoryParam = item!.category_name ? `&category=${encodeURIComponent(item!.category_name)}` : '';
        const res = await fetch(`/api/metadata?title=${encodeURIComponent(titleToSearch)}&type=${item!.stream_type}${categoryParam}`);
        if (res.ok) {
          const data: EnrichedMetadata = await res.json();
          if (data.source !== 'none') {
            meta = data;
            if (isMounted) setEnrichedMetadata(data);
          }
        }
      } catch (err) {
        console.warn('Erro ao carregar metadados adicionais:', err);
      }

      // 2. Busca sugestões no banco local Dexie com base na categoria e estilo
      if (localDB) {
        try {
          let list: BaseStreamItem[] = [];

          // Sugestões da mesma categoria
          if (item!.category_id) {
            const sameCat = await localDB.streams
              .where('category_id')
              .equals(item!.category_id)
              .filter((s) => s.stream_id !== item!.stream_id && s.stream_type === item!.stream_type)
              .limit(18)
              .toArray();
            list = sameCat as unknown as BaseStreamItem[];
          }

          // Se tiver poucos itens, busca itens do mesmo tipo
          if (list.length < 12) {
            const more = await localDB.streams
              .where('stream_type')
              .equals(item!.stream_type)
              .filter((s) => s.stream_id !== item!.stream_id)
              .limit(18)
              .toArray();

            const existing = new Set(list.map((l) => l.stream_id));
            for (const m of more) {
              if (!existing.has(m.stream_id)) {
                list.push(m as unknown as BaseStreamItem);
              }
            }
          }

          // Se for série, inclui também filmes recomendados para diversificar opções
          if (item!.stream_type === 'series') {
            const sampleMovies = await localDB.streams
              .where('stream_type')
              .equals('movie')
              .limit(12)
              .toArray();
            const existing = new Set(list.map((l) => l.stream_id));
            for (const m of sampleMovies) {
              if (!existing.has(m.stream_id)) {
                list.push(m as unknown as BaseStreamItem);
              }
            }
          }

          // Ordena sugestões por pontuação
          list.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));

          if (isMounted) {
            setSuggestions(list.slice(0, 12));
          }
        } catch (e) {
          console.warn('Erro ao carregar sugestões:', e);
        }
      }
    }

    loadMetadataAndSuggestions();
    return () => {
      isMounted = false;
    };
  }, [item?.stream_id, item?.title, item?.category_id, item?.stream_type]);

  // 5. Efeito: Busca Metadados de Cada Episódio da Temporada Ativa (TMDb: Nome, Sinopse, Data e Thumb)
  useEffect(() => {
    if (type !== 'series' && item?.stream_type !== 'series') return;
    if (!item?.title && !item?.name) return;

    let isMounted = true;
    async function loadSeasonEpisodesMeta() {
      try {
        const titleToSearch = item!.title || item!.name;
        const sParam = selectedSeason.toLowerCase().includes('espec')
          ? '0'
          : selectedSeason.replace(/\D/g, '') || '1';

        let url = `/api/metadata/season?title=${encodeURIComponent(titleToSearch)}&season=${sParam}`;
        if (enrichedMetadata?.tmdbId) {
          url += `&tmdbId=${enrichedMetadata.tmdbId}`;
        }

        const res = await fetch(url);
        if (res.ok && isMounted) {
          const data = await res.json();
          if (data.episodes) {
            setSeasonEpisodesMeta(data.episodes);
          }
        }
      } catch (err) {
        console.warn('Erro ao carregar metadados dos episódios na reprodução:', err);
      }
    }

    loadSeasonEpisodesMeta();
    return () => {
      isMounted = false;
    };
  }, [item?.title, item?.name, item?.stream_type, selectedSeason, enrichedMetadata?.tmdbId, type]);

  // =========================================================================
  // 2. TODOS OS USEMEMO SÃO CALCULADOS AQUI NO TOPO (INCONDICIONAIS)
  // =========================================================================
  const streamType = (item?.stream_type || type || 'live') as StreamType;
  const isSeries = streamType === 'series';
  const isLive = streamType === 'live';
  const isMovie = streamType === 'movie';

  // Normalização do Host do servidor IPTV (ajuste para porta 8080 se necessário)
  const cleanHost = useMemo(() => {
    if (!config?.server_url) return '';
    let host = config.server_url.replace(/\/+$/, '');
    if (host.includes(':80') && !host.includes(':8080')) {
      host = host.replace(':80', ':8080');
    }
    return host;
  }, [config?.server_url]);

  // Lista de temporadas formatadas
  const seasonList: SeriesSeason[] = useMemo(() => {
    return buildSortedSeasonList(seriesInfo);
  }, [seriesInfo]);

  // Temporada ativa atual
  const activeSeasonData = useMemo(() => {
    return seasonList.find((s) => String(s.season_number) === String(selectedSeason));
  }, [seasonList, selectedSeason]);

  // Episódios da temporada selecionada com filtro de pesquisa
  const currentSeasonEpisodes: SeriesEpisode[] = useMemo(() => {
    const list = getEpisodesForSeason(seriesInfo, selectedSeason);
    if (!episodeSearch.trim()) return list;
    const q = episodeSearch.toLowerCase();
    return list.filter(
      (ep) =>
        ep.title?.toLowerCase().includes(q) ||
        String(ep.episode_num).includes(q)
    );
  }, [seriesInfo, selectedSeason, episodeSearch]);

  // Filtragem de canais/filmes relacionados na coluna lateral
  const filteredRelated = useMemo(() => {
    if (!channelSearch.trim()) return relatedItems;
    const q = channelSearch.toLowerCase();
    return relatedItems.filter((i) => (i.title || i.name).toLowerCase().includes(q));
  }, [relatedItems, channelSearch]);

  // URL e Metadados do Player
  const { streamUrl, playerTitle, playerPoster, currentActiveId } = useMemo(() => {
    let url = '';
    let title = item?.title || item?.name || 'Transmissão';
    let poster = enrichedMetadata?.posterUrl || item?.stream_icon;
    let activeId = item?.stream_id || id;

    if (!config || !cleanHost) {
      return { streamUrl: '', playerTitle: title, playerPoster: poster, currentActiveId: activeId };
    }

    if (isLive) {
      url = `${cleanHost}/live/${config.username}/${config.password}/${activeId}.m3u8`;
    } else if (isMovie) {
      url = `${cleanHost}/movie/${config.username}/${config.password}/${activeId}.${item?.container_extension || 'mp4'}`;
    } else if (isSeries) {
      if (activeEpisode) {
        activeId = String(activeEpisode.id);
        url = `${cleanHost}/series/${config.username}/${config.password}/${activeEpisode.id}.${activeEpisode.container_extension || 'mp4'}`;
        const epMeta = seasonEpisodesMeta[Number(activeEpisode.episode_num)];
        const formattedEpName = formatEpisodeTitle(
          activeEpisode.episode_num,
          selectedSeason,
          epMeta?.name || activeEpisode.title
        );
        title = `${item?.title || item?.name || 'Série'} - ${formattedEpName}`;
        poster =
          epMeta?.thumbnailUrl ||
          activeEpisode.info?.movie_image ||
          activeEpisode.info?.cover_big ||
          enrichedMetadata?.backdropUrl ||
          item?.stream_icon;
      }
    }

    return { streamUrl: url, playerTitle: title, playerPoster: poster, currentActiveId: activeId };
  }, [config, cleanHost, item, isLive, isMovie, isSeries, activeEpisode, id, enrichedMetadata, seasonEpisodesMeta, selectedSeason]);

  // Metadados do episódio atualmente em reprodução
  const currentEpMeta = useMemo(() => {
    if (!isSeries || !activeEpisode) return null;
    return seasonEpisodesMeta[Number(activeEpisode.episode_num)] || null;
  }, [isSeries, activeEpisode, seasonEpisodesMeta]);

  const currentEpAirDate = useMemo(() => {
    return currentEpMeta?.airDate ? currentEpMeta.airDate.split('-').reverse().join('/') : null;
  }, [currentEpMeta]);

  // Lista de gêneros consolidada
  const genresList = useMemo(() => {
    if (enrichedMetadata?.genres && enrichedMetadata.genres.length > 0) {
      return enrichedMetadata.genres.slice(0, 3);
    }
    return item?.category_name ? [item.category_name] : ['Geral'];
  }, [enrichedMetadata, item?.category_name]);

  const favorited = useMemo(() => {
    if (!item) return false;
    return isFavorite(item.stream_id, streamType);
  }, [item, isFavorite, streamType]);

  const watched = useMemo(() => {
    if (isSeries && activeEpisode) {
      return isWatched(String(activeEpisode.id), 'series');
    }
    if (item) {
      return isWatched(item.stream_id, streamType);
    }
    return false;
  }, [isSeries, activeEpisode, item, isWatched, streamType]);

  // 6. Efeito: Busca Dados Técnicos do Vídeo (Tamanho em MB, Codec, Dimensões e Duração da CDN)
  useEffect(() => {
    if (!streamUrl) return;

    let isMounted = true;
    async function fetchStreamTechStats() {
      try {
        const res = await fetch(`/api/iptv/video-info?url=${encodeURIComponent(streamUrl)}`);
        if (res.ok && isMounted) {
          const data = await res.json();
          setTechVideoStats((prev) => ({
            ...prev,
            size: data.sizeFormatted || prev.size,
            dimensions: data.dimensions || prev.dimensions,
            codec: data.codec || prev.codec,
            duration: data.durationFormatted || prev.duration,
          }));
        }
      } catch (err) {
        console.warn('Erro ao buscar estatísticas do stream:', err);
      }
    }

    setTechVideoStats({});
    fetchStreamTechStats();

    return () => {
      isMounted = false;
    };
  }, [streamUrl]);

  const handlePlayerVideoInfo = useCallback((info: PlayerVideoInfo) => {
    setTechVideoStats((prev) => ({
      ...prev,
      duration: info.formattedDuration || prev.duration,
      dimensions: info.dimensions || prev.dimensions,
      codec: info.codec || prev.codec,
    }));
  }, []);

  const handlePlayerProgress = useCallback(
    ({ currentTime, duration }: { currentTime: number; duration: number }) => {
      if (!item || streamType === 'live') return;

      if (streamType === 'movie') {
        saveProgress({
          streamId: item.stream_id,
          streamType: 'movie',
          title: item.title || item.name,
          posterUrl: enrichedMetadata?.posterUrl || item.stream_icon,
          backdropUrl: enrichedMetadata?.backdropUrl || item.stream_icon,
          categoryName: item.category_name,
          currentTime,
          duration,
        });
      } else if (streamType === 'series' && activeEpisode) {
        saveProgress({
          streamId: item.stream_id,
          streamType: 'series',
          title: item.title || item.name,
          posterUrl: item.stream_icon,
          backdropUrl:
            enrichedMetadata?.backdropUrl ||
            currentEpMeta?.thumbnailUrl ||
            activeEpisode.info?.movie_image ||
            item.stream_icon,
          categoryName: item.category_name,
          seriesId: item.stream_id,
          seriesTitle: item.title || item.name,
          episodeId: String(activeEpisode.id),
          episodeNum: activeEpisode.episode_num,
          seasonNum: selectedSeason,
          episodeTitle: currentEpMeta?.name || activeEpisode.title,
          currentTime,
          duration,
        });
      }
    },
    [item, streamType, activeEpisode, selectedSeason, enrichedMetadata, currentEpMeta, saveProgress]
  );

  // Metadados técnicos calculados para o painel de status
  const displayDuration = useMemo(() => {
    if (techVideoStats.duration) return techVideoStats.duration;
    if (isSeries && activeEpisode?.info?.duration) {
      const d = activeEpisode.info.duration;
      return d.includes(':') ? d : `${d} min`;
    }
    if (isLive) return 'Ao Vivo';
    return 'Carregando...';
  }, [techVideoStats.duration, isSeries, activeEpisode?.info?.duration, isLive]);

  const displaySize = useMemo(() => {
    if (techVideoStats.size) return techVideoStats.size;
    if (isLive) return 'Fluxo Contínuo';
    return 'Calculando...';
  }, [techVideoStats.size, isLive]);

  const displayDimensions = useMemo(() => {
    if (techVideoStats.dimensions) return techVideoStats.dimensions;
    const titleLower = (item?.title || item?.name || '').toLowerCase();
    if (titleLower.includes('4k') || titleLower.includes('uhd')) return '3840x2160 (4K)';
    if (titleLower.includes('fhd') || titleLower.includes('1080')) return '1920x1080 (1080p)';
    if (titleLower.includes('hd') || titleLower.includes('720')) return '1280x720 (720p)';
    if (titleLower.includes('sd')) return '720x480 (SD)';
    return '1920x1080 (FHD)';
  }, [techVideoStats.dimensions, item?.title, item?.name]);

  const displayCodec = useMemo(() => {
    if (techVideoStats.codec) return techVideoStats.codec;
    const titleLower = (item?.title || item?.name || '').toLowerCase();
    if (titleLower.includes('hevc') || titleLower.includes('h265') || titleLower.includes('h.265')) {
      return 'H.265 (HEVC)';
    }
    if (titleLower.includes('av1')) return 'AV1';
    return 'H.264 (AVC) / AAC';
  }, [techVideoStats.codec, item?.title, item?.name]);

  // Callbacks para troca de item
  const handleSwitchStream = useCallback((newStream: BaseStreamItem) => {
    setCurrentStreamId(newStream.stream_id);
    router.replace(getWatchUrl(newStream.stream_type, newStream.stream_id));
  }, [router]);

  const handleSelectEpisode = useCallback((ep: SeriesEpisode) => {
    setActiveEpisode(ep);
    router.replace(getWatchUrl('series', id, ep.id));
  }, [id, router]);

  // =========================================================================
  // 3. RETORNOS CONDICIONAIS DE RENDERIZAÇÃO (SEGUROS - APÓS TODOS OS HOOKS)
  // =========================================================================
  if (loading) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center gap-3">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-neutral-400 font-medium">Carregando player de transmissão...</p>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center space-y-4">
        <h2 className="text-xl font-bold text-white">Configuração IPTV Não Encontrada</h2>
        <p className="text-xs text-neutral-400">
          Certifique-se de sincronizar sua lista IPTV na página inicial para carregar usuário e senha.
        </p>
        <button
          onClick={() => router.push(`/${getRouteType(type)}`)}
          className="px-5 py-2.5 rounded-xl bg-violet-600 text-white text-xs font-bold shadow-lg shadow-violet-600/30 cursor-pointer"
        >
          Voltar ao catálogo
        </button>
      </div>
    );
  }

  if (!item && !seriesInfo) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center space-y-4">
        <h2 className="text-xl font-bold text-white">Canal ou Série Indisponível</h2>
        <p className="text-xs text-neutral-400">
          O conteúdo solicitado não foi encontrado no servidor IPTV.
        </p>
        <button
          onClick={() => router.push(`/${getRouteType(type)}`)}
          className="px-5 py-2.5 rounded-xl bg-violet-600 text-white text-xs font-bold shadow-lg shadow-violet-600/30 cursor-pointer"
        >
          Voltar ao catálogo
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
      {/* 1. Barra Superior com Navegação, Título e Ações */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(getInfoUrl(streamType, id))}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white border border-white/10 transition cursor-pointer"
            title="Voltar para a página de detalhes"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-violet-600/30 text-violet-300 border border-violet-500/30">
                {isLive ? 'Ao Vivo' : isMovie ? 'Filme' : 'Série'}
              </span>
              <span className="text-xs text-neutral-400 font-medium">
                {item?.category_name || 'Geral'}
              </span>
              {isSeries && activeEpisode && (
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-white/10 text-neutral-300">
                  T{selectedSeason} • EP {activeEpisode.episode_num}
                </span>
              )}
            </div>
            <h1 className="text-base sm:text-xl font-bold text-white truncate max-w-xl">
              {playerTitle}
            </h1>
          </div>
        </div>

        {/* Ações Rápidas: Info, Favorito, Assistido */}
        <div className="flex items-center gap-2">
          <Link
            href={getInfoUrl(streamType, id)}
            className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 text-xs font-semibold border border-white/10 flex items-center gap-1.5 transition"
          >
            <Info className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Ver Resumo</span>
          </Link>

          <button
            onClick={() => {
              if (item) {
                if (favorited) {
                  removeFavorite(item.stream_id, streamType);
                } else {
                  addFavorite({
                    streamId: item.stream_id,
                    streamType,
                    title: item.title || item.name,
                    posterUrl: item.stream_icon,
                    categoryName: item.category_name,
                    rating: item.rating,
                  });
                }
              }
            }}
            className={`px-3.5 py-2 rounded-xl border text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
              favorited
                ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10'
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${favorited ? 'fill-rose-500 text-rose-500' : ''}`} />
            <span className="hidden sm:inline">{favorited ? 'Favoritado' : 'Favoritar'}</span>
          </button>

          <button
            onClick={() => {
              if (watched) {
                removeWatched(currentActiveId, streamType);
              } else {
                markWatched(currentActiveId, streamType, playerTitle, true);
              }
            }}
            className={`px-3.5 py-2 rounded-xl border text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
              watched
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10'
            }`}
          >
            <CheckCircle2 className={`w-3.5 h-3.5 ${watched ? 'fill-emerald-500/20 text-emerald-400' : ''}`} />
            <span className="hidden sm:inline">{watched ? 'Assistido' : 'Marcar Assistido'}</span>
          </button>
        </div>
      </div>

      {/* 2. Grid Principal: Player Central + Coluna Lateral Dinâmica */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Lado Esquerdo: Player de Vídeo Cinema */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-4">
          <div className="aspect-video w-full rounded-3xl overflow-hidden bg-black border border-white/10 shadow-2xl relative">
            {isSeries && loadingSeries && !activeEpisode ? (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-neutral-950">
                <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-neutral-400 font-medium">Carregando episódios da série...</p>
              </div>
            ) : streamUrl ? (
              <VideoPlayer
                streamUrl={streamUrl}
                title={playerTitle}
                streamId={currentActiveId}
                streamType={streamType}
                posterUrl={playerPoster}
                autoPlay={true}
                initialTime={initialTime}
                onProgress={handlePlayerProgress}
                onVideoInfo={handlePlayerVideoInfo}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-neutral-400">
                <Play className="w-10 h-10 text-neutral-600" />
                <p className="text-xs">Selecione um capítulo na lista para reproduzir</p>
              </div>
            )}
          </div>

          {/* Barra de Status e Metadados Técnicos do Vídeo */}
          <div className="p-3.5 rounded-2xl bg-[#13141b] border border-white/10 flex flex-wrap items-center gap-2 text-xs">
            {/* Especificações Técnicas: Duração, Tamanho em MB, Dimensões e Codec */}
            <div className="flex flex-wrap items-center gap-2 text-neutral-300 text-[11px] w-full">
              {/* Duração */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/5">
                <Clock className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-neutral-400">Duração:</span>
                <span className="font-bold text-white">{displayDuration}</span>
              </div>

              {/* Tamanho em MB */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/5">
                <HardDrive className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-neutral-400">Tamanho:</span>
                <span className="font-bold text-white">{displaySize}</span>
              </div>

              {/* Dimensões */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/5">
                <Monitor className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-neutral-400">Dimensões:</span>
                <span className="font-bold text-white font-mono">{displayDimensions}</span>
              </div>

              {/* Codec Utilizado */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/5">
                <Cpu className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-neutral-400">Codec:</span>
                <span className="font-bold text-white">{displayCodec}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Lado Direito: Dinâmica Diferenciada para Séries vs Ao Vivo / Filmes */}
        <div className="lg:col-span-4 xl:col-span-3 space-y-3">
          <div className="p-4 rounded-2xl bg-[#13141b] border border-white/10 shadow-xl flex flex-col h-[540px]">
            {/* ======================================================== */}
            {/* CENÁRIO 1: SÉRIES (Capítulos com Seletor de Temporada)     */}
            {/* ======================================================== */}
            {isSeries ? (
              <div className="flex flex-col h-full space-y-3">
                {/* Cabeçalho de Séries */}
                <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-violet-400" />
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                      Capítulos
                    </h3>
                  </div>
                  <span className="text-[11px] font-semibold text-neutral-400">
                    {currentSeasonEpisodes.length} eps
                  </span>
                </div>

                {/* Seletor / Dropdown de Temporada */}
                <div className="relative">
                  <button
                    onClick={() => setIsSeasonDropdownOpen(!isSeasonDropdownOpen)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-bold border border-white/10 flex items-center justify-between transition cursor-pointer"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="w-2 h-2 rounded-full bg-violet-400 shrink-0" />
                      <span className="truncate">
                        {activeSeasonData?.name || `Temporada ${selectedSeason}`}
                      </span>
                    </div>
                    <ChevronDown
                      className={`w-4 h-4 text-neutral-400 transition-transform duration-200 ${
                        isSeasonDropdownOpen ? 'rotate-180 text-violet-400' : ''
                      }`}
                    />
                  </button>

                  {/* Menu Dropdown de Temporadas */}
                  {isSeasonDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1.5 z-30 bg-[#181924] border border-white/10 rounded-xl shadow-2xl p-1 max-h-48 overflow-y-auto space-y-1">
                      {seasonList.map((season) => {
                        const isCurrent = String(season.season_number) === String(selectedSeason);
                        return (
                          <button
                            key={`season_opt_${season.season_number}`}
                            onClick={() => {
                              setSelectedSeason(String(season.season_number));
                              setIsSeasonDropdownOpen(false);
                            }}
                            className={`w-full px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between text-left transition cursor-pointer ${
                              isCurrent
                                ? 'bg-violet-600 text-white shadow-md'
                                : 'text-neutral-300 hover:bg-white/5 hover:text-white'
                            }`}
                          >
                            <span>{season.name || `Temporada ${season.season_number}`}</span>
                            {season.episode_count ? (
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded ${
                                  isCurrent ? 'bg-violet-800 text-violet-200' : 'bg-white/5 text-neutral-400'
                                }`}
                              >
                                {season.episode_count} eps
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Filtro Rápido de Episódios */}
                {seasonList.length > 0 && (
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Filtrar episódios..."
                      value={episodeSearch}
                      onChange={(e) => setEpisodeSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-neutral-900 border border-white/5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-violet-500"
                    />
                  </div>
                )}

                {/* Lista de Capítulos / Episódios estilo Miruro */}
                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 divide-y divide-white/[0.03]">
                  {loadingSeries && !activeEpisode ? (
                    <div className="py-12 flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-[11px] text-neutral-400">Carregando episódios...</span>
                    </div>
                  ) : currentSeasonEpisodes.length === 0 ? (
                    <div className="py-10 text-center text-xs text-neutral-500">
                      Nenhum episódio encontrado para esta temporada.
                    </div>
                  ) : (
                    currentSeasonEpisodes.map((ep) => {
                      const isCurrent = activeEpisode && String(activeEpisode.id) === String(ep.id);
                      const isEpWatched = isWatched(String(ep.id), 'series');
                      const epMeta = seasonEpisodesMeta[Number(ep.episode_num)];
                      const formattedEpTitle = formatEpisodeTitle(
                        ep.episode_num,
                        selectedSeason,
                        epMeta?.name || ep.title
                      );
                      const epThumb =
                        epMeta?.thumbnailUrl || ep.info?.movie_image || ep.info?.cover_big;
                      const formattedDate = epMeta?.airDate
                        ? epMeta.airDate.split('-').reverse().join('/')
                        : null;

                      return (
                        <div
                          key={`ep_${ep.id}`}
                          onClick={() => handleSelectEpisode(ep)}
                          className={`p-2.5 rounded-xl flex items-center gap-3 cursor-pointer transition group ${
                            isCurrent
                              ? 'bg-violet-600/20 border border-violet-500/40 text-violet-200 shadow-md'
                              : 'hover:bg-white/5 text-neutral-300 hover:text-white'
                          }`}
                        >
                          {/* Miniatura do Episódio com Badge de Número */}
                          <div className="w-14 h-11 rounded-lg bg-black overflow-hidden shrink-0 flex items-center justify-center border border-white/5 relative">
                            <ImageWithFallback
                              src={epThumb}
                              alt={formattedEpTitle}
                              isSmallThumb={true}
                            />

                            <span className="absolute bottom-0.5 right-0.5 px-1 py-0.2 text-[9px] font-bold rounded bg-black/80 text-white z-10">
                              E{ep.episode_num}
                            </span>
                          </div>

                          {/* Detalhes do Capítulo */}
                          <div className="flex-1 truncate">
                            <div className="flex items-center gap-1.5">
                              <p className={`text-xs font-semibold truncate ${isCurrent ? 'text-violet-300' : 'group-hover:text-violet-400'}`}>
                                {formattedEpTitle}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-neutral-500 mt-0.5">
                              {formattedDate && (
                                <span className="text-neutral-400">{formattedDate}</span>
                              )}
                              {ep.info?.duration && (
                                <span className="flex items-center gap-1">
                                  <Clock className="w-2.5 h-2.5" />
                                  {ep.info.duration}
                                </span>
                              )}
                              <span>•</span>
                              <span>{ep.container_extension || 'mp4'}</span>
                            </div>
                          </div>

                          {/* Indicadores de Status (Assistido com Botão de Olho e Tocando Agora) */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isEpWatched) {
                                  removeWatched(String(ep.id), 'series');
                                } else {
                                  markWatched(String(ep.id), 'series', formattedEpTitle, true);
                                }
                              }}
                              className={`p-1.5 rounded-lg border transition-all cursor-pointer flex items-center justify-center ${
                                isEpWatched
                                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30'
                                  : 'bg-white/5 text-neutral-400 border-white/5 hover:text-white hover:border-violet-500/40 hover:bg-white/10'
                              }`}
                              title={isEpWatched ? 'Marcar como não assistido' : 'Marcar como assistido'}
                              aria-label={isEpWatched ? 'Marcar como não assistido' : 'Marcar como assistido'}
                            >
                              <Eye className={`w-3.5 h-3.5 ${isEpWatched ? 'text-emerald-400' : ''}`} />
                            </button>
                            {isCurrent && (
                              <span className="w-2 h-2 rounded-full bg-violet-400 animate-ping" />
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              /* ======================================================== */
              /* CENÁRIO 2: AO VIVO / FILMES (Sem Capítulos, Mesma Categoria)*/
              /* ======================================================== */
              <div className="flex flex-col h-full space-y-3">
                {/* Cabeçalho */}
                <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
                  <div className="flex items-center gap-2">
                    {isLive ? (
                      <Tv className="w-4 h-4 text-violet-400" />
                    ) : (
                      <Film className="w-4 h-4 text-violet-400" />
                    )}
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                      {isLive ? 'Outros Canais' : 'Filmes da Categoria'}
                    </h3>
                  </div>
                  <span className="text-[11px] font-semibold text-neutral-400">
                    {filteredRelated.length} itens
                  </span>
                </div>

                {/* Filtro de Canais / Filmes */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder={isLive ? 'Buscar canal...' : 'Buscar filme...'}
                    value={channelSearch}
                    onChange={(e) => setChannelSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-neutral-900 border border-white/5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-violet-500"
                  />
                </div>

                {/* Lista de Canais / Filmes */}
                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 divide-y divide-white/[0.03]">
                  {filteredRelated.length === 0 ? (
                    <div className="py-10 text-center text-xs text-neutral-500">
                      Nenhum item encontrado nesta categoria.
                    </div>
                  ) : (
                    filteredRelated.map((channel) => {
                      const isCurrent = channel.stream_id === item?.stream_id;
                      const isItemWatched = isWatched(channel.stream_id, streamType);

                      return (
                        <div
                          key={`side_${channel.id || channel.stream_id}`}
                          onClick={() => handleSwitchStream(channel)}
                          className={`p-2.5 rounded-xl flex items-center gap-3 cursor-pointer transition group ${
                            isCurrent
                              ? 'bg-violet-600/20 border border-violet-500/40 text-violet-200 shadow-md'
                              : 'hover:bg-white/5 text-neutral-300 hover:text-white'
                          }`}
                        >
                          <div className="w-9 h-9 rounded-lg bg-black overflow-hidden shrink-0 flex items-center justify-center border border-white/5 relative">
                            <ImageWithFallback
                              src={channel.stream_icon}
                              alt={channel.title || channel.name}
                              isSmallThumb={true}
                            />
                          </div>

                          <div className="flex-1 truncate">
                            <p className={`text-xs font-semibold truncate ${isCurrent ? 'text-violet-300' : 'group-hover:text-violet-400'}`}>
                              {channel.title || channel.name}
                            </p>
                            <p className="text-[10px] text-neutral-500 truncate">
                              {channel.category_name || (isLive ? 'Canal de TV' : 'Filme')}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {isItemWatched && (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 fill-emerald-500/20" />
                            )}
                            {isCurrent && (
                              <span className="w-2 h-2 rounded-full bg-violet-400 animate-ping" />
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. SEÇÃO DEPOIS DO REPRODUTOR: DETALHES DO CAPÍTULO & SUGESTÕES DE SÉRIES/FILMES */}
      {/* ========================================================================= */}
      <div className="space-y-8 pt-4">
        {/* Painel de Informações do Capítulo Selecionado */}
        <div className="p-5 sm:p-6 rounded-3xl bg-[#13141b] border border-white/10 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="px-2.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-violet-600 text-white">
                      {isSeries ? 'Capítulo Atual' : isMovie ? 'Filme' : 'Canal'}
                    </span>

                    {genresList.map((genre) => (
                      <span
                        key={`pill_${genre}`}
                        className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-white/10 text-neutral-300 border border-white/10"
                      >
                        {genre}
                      </span>
                    ))}

                    {/* Data de Lançamento do Episódio ou Ano da Obra */}
                    {currentEpAirDate ? (
                      <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-white/10 text-neutral-300 border border-white/10 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-violet-400" />
                        Lançamento: {currentEpAirDate}
                      </span>
                    ) : enrichedMetadata?.year ? (
                      <span className="text-[11px] font-medium text-neutral-400">
                        {enrichedMetadata.year}
                      </span>
                    ) : null}

                    {/* Nota / Avaliação */}
                    {currentEpMeta?.rating ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />{' '}
                        {currentEpMeta.rating}
                      </span>
                    ) : enrichedMetadata?.rating ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> {enrichedMetadata.rating}
                      </span>
                    ) : null}

                    {enrichedMetadata?.source && enrichedMetadata.source !== 'none' && (
                      <span className="px-2 py-0.5 rounded text-[9px] font-extrabold uppercase bg-violet-950/60 text-violet-300 border border-violet-500/30">
                        Via {enrichedMetadata.source.toUpperCase()}
                      </span>
                    )}
                  </div>

                  <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                    {playerTitle}
                  </h2>
                </div>

                {/* Duração e Resolução */}
                <div className="flex items-center gap-3 text-xs text-neutral-400">
                  {activeEpisode?.info?.duration && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/5">
                      <Clock className="w-3.5 h-3.5 text-violet-400" />
                      <span>{activeEpisode.info.duration}</span>
                    </div>
                  )}
                  <div className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/5 font-mono text-[11px] uppercase text-neutral-300">
                    {item?.container_extension || 'HD 1080p'}
                  </div>
                </div>
              </div>

              {/* Sinopse do Capítulo ou da Obra */}
              <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed max-w-4xl">
                {currentEpMeta?.overview ||
                  activeEpisode?.info?.plot ||
                  enrichedMetadata?.overview ||
                  seriesInfo?.info?.plot ||
                  'Aproveite a reprodução fluida direta dos servidores CDN com navegação rápida de episódios.'}
              </p>
            </div>

        {/* Grade de Sugestões: Outras Séries e Filmes que Você Pode Gostar */}
        {suggestions.length > 0 && (
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-3">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-5 h-5 text-violet-400" />
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white">
                    Você Também Pode Gostar
                  </h3>
                  <p className="text-xs text-neutral-400">
                    Sugestões baseadas na categoria {item?.category_name || 'Geral'}{genresList.length > 0 ? ` e no estilo ${genresList[0]}` : ''}
                  </p>
                </div>
              </div>

              <span className="text-xs text-neutral-500 font-medium self-end sm:self-auto">
                {suggestions.length} títulos recomendados
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {suggestions.map((sug) => (
                <MediaCard key={`sug_${sug.id || sug.stream_id}`} item={sug} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
