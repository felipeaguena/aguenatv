'use client';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  ChevronLeft,
  ChevronRight,
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
  Download,
  Check,
  Trash2,
} from 'lucide-react';
import {
  downloadVideoForOffline,
  isNativeApp,
  buildDownloadId,
  checkIsDownloaded,
  getPlayableOfflineUrl,
  deleteOfflineDownload,
  OfflineDownload,
} from '@/lib/download-manager';
import { localDB, getSavedIPTVConfig } from '@/lib/db-local';
import { fetchIPTVApi } from '@/lib/iptv-client';
import {
  BaseStreamItem,
  IPTVAccount,
  StreamType,
  SeriesSeason,
  SeriesEpisode,
  SeriesInfoResponse,
  EnrichedMetadata,
  EnrichedEpisodeMetadata,
  SkipTimesData,
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
  const [skipTimes, setSkipTimes] = useState<SkipTimesData | null>(null);
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

  // Estados de Download Offline (Capacitor / Celular)
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadDone, setDownloadDone] = useState(false);
  const [localPlayableUrl, setLocalPlayableUrl] = useState<string | null>(null);
  const [isCurrentDownloaded, setIsCurrentDownloaded] = useState(false);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [isNative, setIsNative] = useState(false);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const [playerHeight, setPlayerHeight] = useState<number | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const autoMarkedEpisodesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setIsNative(isNativeApp());
  }, []);

  useEffect(() => {
    const checkSize = () => {
      const desktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
      setIsDesktop(desktop);
      if (playerContainerRef.current) {
        const width = playerContainerRef.current.clientWidth;
        if (width > 0) {
          // Altura exata da proporcao 16:9 widescreen do player de video
          const exactVideoHeight = Math.round((width * 9) / 16);
          setPlayerHeight(exactVideoHeight);
        }
      }
    };

    checkSize();

    const el = playerContainerRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      checkSize();
    });

    ro.observe(el);
    window.addEventListener('resize', checkSize);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', checkSize);
    };
  }, []);

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

        // Se o item não foi encontrado no Dexie local, busca metadados sob demanda na API do IPTV
        if (!foundItem && savedCfg) {
          if (targetType === 'movie') {
            try {
              const vodData = await fetchIPTVApi(savedCfg, {
                action: 'get_vod_info',
                params: { vod_id: currentStreamId },
              });
              if (vodData?.movie_data && isMounted) {
                foundItem = {
                  id: `movie_${currentStreamId}`,
                  stream_id: String(currentStreamId),
                  name: vodData.movie_data.name || 'Filme',
                  title: vodData.movie_data.name || 'Filme',
                  stream_type: 'movie',
                  stream_icon: vodData.info?.movie_image || vodData.movie_data.stream_icon,
                  category_id: String(vodData.movie_data.category_id || ''),
                  container_extension: vodData.movie_data.container_extension || 'mp4',
                };
              }
            } catch (err) {
              console.warn('Erro ao buscar metadados do filme online:', err);
            }
          }

          // Fallback resiliente: cria item com IDs do stream para permitir que o player carregue a URL
          if (!foundItem && isMounted) {
            foundItem = {
              id: `${targetType}_${currentStreamId}`,
              stream_id: String(currentStreamId),
              name: targetType === 'movie' ? 'Filme' : targetType === 'series' ? 'Série' : 'Canal',
              title: targetType === 'movie' ? 'Filme' : targetType === 'series' ? 'Série' : 'Canal',
              stream_type: targetType,
              container_extension: 'mp4',
            };
          }
        }

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

  // 1b. Efeito: Verifica se o vídeo ou episódio atual está salvo offline na memória do celular
  useEffect(() => {
    let isMounted = true;
    async function checkOffline() {
      try {
        const epNum = activeEpisode?.episode_num ?? (episodeParam ? Number(episodeParam) : undefined);
        const epId = activeEpisode?.id ?? (episodeParam || undefined);
        const sNum = selectedSeason || seasonParam || '1';

        let offlineRec: OfflineDownload | undefined;
        if (localDB?.offline_downloads) {
          if (type === 'movies' || type === 'movie' || item?.stream_type === 'movie') {
            const downId = buildDownloadId('movie', currentStreamId);
            offlineRec = await localDB.offline_downloads.get(downId);
            if (!offlineRec) {
              offlineRec = await localDB.offline_downloads
                .where('stream_id')
                .equals(currentStreamId)
                .filter((i) => i.stream_type === 'movie')
                .first();
            }
          } else if (type === 'series' || item?.stream_type === 'series') {
            const downId = buildDownloadId('series', currentStreamId, sNum, epNum ?? epId);
            offlineRec = await localDB.offline_downloads.get(downId);
            if (!offlineRec) {
              offlineRec = await localDB.offline_downloads
                .where('stream_id')
                .equals(currentStreamId)
                .filter(
                  (i) =>
                    i.stream_type === 'series' &&
                    (String(i.episode_id) === String(epId) || Number(i.episode_num) === Number(epNum))
                )
                .first();
            }
          }
        }

        if (!isMounted) return;

        if (offlineRec) {
          setIsCurrentDownloaded(true);
          const playable = await getPlayableOfflineUrl(offlineRec);
          if (isMounted) {
            setLocalPlayableUrl(playable);
            setIsOfflineMode(true);
            if (!item) {
              setItem({
                stream_id: String(offlineRec.stream_id),
                name: offlineRec.title,
                title: offlineRec.title,
                stream_type: offlineRec.stream_type,
                stream_icon: offlineRec.poster_url,
                category_name: 'Download Offline',
              });
            }
          }
        } else {
          setIsCurrentDownloaded(false);
          setLocalPlayableUrl(null);
          setIsOfflineMode(false);
        }
      } catch (err) {
        console.warn('Erro ao verificar status offline:', err);
      }
    }

    checkOffline();
    return () => {
      isMounted = false;
    };
  }, [currentStreamId, type, selectedSeason, activeEpisode?.id, activeEpisode?.episode_num, item]);

  // 2. Efeito: Se for série, busca os detalhes completos, temporadas e episódios via API do IPTV
  useEffect(() => {
    if (type !== 'series' && item?.stream_type !== 'series') return;
    if (!config) return;

    let isMounted = true;
    async function fetchSeriesDetails() {
      setLoadingSeries(true);
      try {
        const data: SeriesInfoResponse = await fetchIPTVApi(config!, {
          action: 'get_series_info',
          params: { series_id: id },
        });

        if (!data) throw new Error('Falha ao obter episódios da série');

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
        console.warn('Erro ao buscar capítulos da série online (tentando offline):', err);
        if (localDB?.offline_downloads) {
          try {
            const offlineItems = await localDB.offline_downloads
              .where('stream_id')
              .equals(String(id))
              .toArray();
            if (offlineItems.length > 0 && isMounted) {
              const episodesMap: Record<string, SeriesEpisode[]> = {};
              const seasonsList: SeriesSeason[] = [];

              for (const off of offlineItems) {
                const sNum = String(off.season_num || 1);
                if (!episodesMap[sNum]) {
                  episodesMap[sNum] = [];
                  seasonsList.push({
                    season_number: Number(sNum),
                    name: `Temporada ${sNum}`,
                    episode_count: 0,
                  });
                }
                episodesMap[sNum].push({
                  id: String(off.episode_id || off.id),
                  episode_num: off.episode_num || 1,
                  title: off.title,
                  season: Number(sNum),
                  container_extension: off.container_extension || 'mp4',
                });
              }

              for (const s of seasonsList) {
                s.episode_count = episodesMap[String(s.season_number)]?.length || 0;
              }

              const fallbackSeriesInfo: SeriesInfoResponse = {
                seasons: seasonsList,
                episodes: episodesMap,
                info: {
                  name: offlineItems[0].series_title || offlineItems[0].title,
                  title: offlineItems[0].series_title || offlineItems[0].title,
                  cover: offlineItems[0].poster_url,
                },
              };

              setSeriesInfo(fallbackSeriesInfo);
              if (!episodeParam) {
                const sorted = buildSortedSeasonList(fallbackSeriesInfo);
                setSelectedSeason(getDefaultSeason(sorted));
              }
            }
          } catch {}
        }
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

  // 3. Efeito: Sincroniza o episódio ativo inicial com base no parâmetro `?ep=...` ou padrão (Episódio 1)
  const hasInitializedEpisodeRef = useRef(false);
  useEffect(() => {
    if (!seriesInfo?.episodes) return;
    if (hasInitializedEpisodeRef.current) return;

    let targetEp: SeriesEpisode | null = null;
    let targetSeason = seasonParam || selectedSeason;

    // Se temos um ep no query param, procura na temporada selecionada primeiro, depois em todas
    if (episodeParam) {
      if (seriesInfo.episodes[targetSeason]) {
        const found = seriesInfo.episodes[targetSeason].find((e) => String(e.id) === String(episodeParam));
        if (found) {
          targetEp = found;
        }
      }
      if (!targetEp) {
        for (const sKey of Object.keys(seriesInfo.episodes)) {
          const found = seriesInfo.episodes[sKey].find((e) => String(e.id) === String(episodeParam));
          if (found) {
            targetEp = found;
            targetSeason = sKey;
            break;
          }
        }
      }
    }

    // Se não encontrou pelo epParam ou não foi passado, pega o primeiro episódio da temporada alvo
    if (!targetEp) {
      const sKeys = Object.keys(seriesInfo.episodes);
      const chosenSeason = seriesInfo.episodes[targetSeason] ? targetSeason : sKeys[0];
      if (chosenSeason && seriesInfo.episodes[chosenSeason]?.length > 0) {
        targetEp = seriesInfo.episodes[chosenSeason][0];
        targetSeason = chosenSeason;
      }
    }

    if (targetEp) {
      hasInitializedEpisodeRef.current = true;
      setActiveEpisode(targetEp);
      setSelectedSeason(targetSeason);
    }
  }, [seriesInfo, episodeParam, seasonParam, selectedSeason]);

  // 3b. Efeito: Sincroniza com botões nativos Voltar/Avançar do navegador (History API)
  useEffect(() => {
    if (type !== 'series') return;
    const handlePopState = () => {
      if (typeof window === 'undefined' || !seriesInfo?.episodes) return;
      const sp = new URLSearchParams(window.location.search);
      const epQuery = sp.get('ep');
      const sQuery = sp.get('season');

      if (epQuery) {
        let targetEp: SeriesEpisode | null = null;
        let targetSeason = sQuery || selectedSeason;

        if (seriesInfo.episodes[targetSeason]) {
          targetEp = seriesInfo.episodes[targetSeason].find((e) => String(e.id) === String(epQuery)) || null;
        }
        if (!targetEp) {
          for (const sKey of Object.keys(seriesInfo.episodes)) {
            const match = seriesInfo.episodes[sKey].find((e) => String(e.id) === String(epQuery));
            if (match) {
              targetEp = match;
              targetSeason = sKey;
              break;
            }
          }
        }
        if (targetEp) {
          setActiveEpisode(targetEp);
          setSelectedSeason(targetSeason);
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [type, seriesInfo, selectedSeason]);

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

  // 6. Efeito: Busca Tempos de Abertura e Encerramento (TheIntroDB / AniSkip)
  useEffect(() => {
    if (type !== 'series' && item?.stream_type !== 'series') {
      setSkipTimes(null);
      return;
    }
    if (!activeEpisode) {
      setSkipTimes(null);
      return;
    }

    let isMounted = true;
    async function loadSkipTimes() {
      try {
        const titleToSearch = item?.title || item?.name || '';
        const categoryParam = item?.category_name ? `&category=${encodeURIComponent(item.category_name)}` : '';
        const tmdbParam = enrichedMetadata?.tmdbId ? `&tmdbId=${enrichedMetadata.tmdbId}` : '';
        const seasonNum = selectedSeason.replace(/\D/g, '') || '1';
        const epNum = String(activeEpisode!.episode_num);

        const res = await fetch(
          `/api/skip-times?season=${seasonNum}&episode=${epNum}&title=${encodeURIComponent(titleToSearch)}${tmdbParam}${categoryParam}`
        );

        if (res.ok && isMounted) {
          const data: SkipTimesData = await res.json();
          if (data.found) {
            setSkipTimes(data);
          } else {
            setSkipTimes(null);
          }
        }
      } catch (err) {
        console.warn('Falha ao buscar tempos de abertura/encerramento:', err);
        if (isMounted) setSkipTimes(null);
      }
    }

    loadSkipTimes();
    return () => {
      isMounted = false;
    };
  }, [
    type,
    item?.stream_type,
    item?.title,
    item?.name,
    item?.category_name,
    activeEpisode?.id,
    activeEpisode?.episode_num,
    selectedSeason,
    enrichedMetadata?.tmdbId,
  ]);

  // =========================================================================
  // 2. TODOS OS USEMEMO SÃO CALCULADOS AQUI NO TOPO (INCONDICIONAIS)
  // =========================================================================
  const streamType = (item?.stream_type || type || 'live') as StreamType;
  const isSeries = streamType === 'series';
  const isLive = streamType === 'live';
  const isMovie = streamType === 'movie';

  // Preserva estritamente o servidor, protocolo e porta originais da lista IPTV para os fluxos de vídeo
  const cleanHost = useMemo(() => {
    if (!config?.server_url) return '';
    return config.server_url.trim().replace(/\/+$/, '');
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

  const finalPlayUrl = localPlayableUrl || streamUrl;

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
    if (isSeries) {
      if (activeEpisode) {
        return isWatched(String(activeEpisode.id), 'series');
      }
      return isWatched(item?.stream_id || id, 'series');
    }
    const targetId = item?.stream_id || id;
    if (targetId) return isWatched(targetId, streamType);
    return false;
  }, [isSeries, activeEpisode, item?.stream_id, id, isWatched, streamType]);

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

      // Marca o capítulo como assistido assim que faltar 1 minuto (<= 60s) para terminar
      const remainingSeconds = duration - currentTime;
      const isNearEnd = duration > 60 ? remainingSeconds <= 60 : (duration > 0 && currentTime >= duration * 0.9);

      if (isNearEnd) {
        if (streamType === 'series' && activeEpisode) {
          const epIdStr = String(activeEpisode.id);
          if (!autoMarkedEpisodesRef.current.has(epIdStr) && !isWatched(epIdStr, 'series')) {
            autoMarkedEpisodesRef.current.add(epIdStr);
            const epMeta = seasonEpisodesMeta[Number(activeEpisode.episode_num)];
            const formattedEpName = formatEpisodeTitle(
              activeEpisode.episode_num,
              selectedSeason,
              epMeta?.name || activeEpisode.title
            );
            const fullTitle = `${item.title || item.name || 'Série'} - ${formattedEpName}`;
            markWatched(epIdStr, 'series', fullTitle, true, {
              posterUrl:
                epMeta?.thumbnailUrl ||
                activeEpisode.info?.movie_image ||
                activeEpisode.info?.cover_big ||
                item.stream_icon,
              categoryName: item.category_name,
            });
          }
        } else if (streamType === 'movie') {
          const movieIdStr = String(item.stream_id || id);
          if (!autoMarkedEpisodesRef.current.has(movieIdStr) && !isWatched(movieIdStr, 'movie')) {
            autoMarkedEpisodesRef.current.add(movieIdStr);
            markWatched(movieIdStr, 'movie', item.title || item.name, true, {
              posterUrl: enrichedMetadata?.posterUrl || item.stream_icon,
              categoryName: item.category_name,
              rating: item.rating,
            });
          }
        }
      }
    },
    [
      item,
      streamType,
      activeEpisode,
      selectedSeason,
      enrichedMetadata,
      currentEpMeta,
      seasonEpisodesMeta,
      saveProgress,
      isWatched,
      markWatched,
      id,
    ]
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

  // Helper de rolagem suave para manter o player sempre visível ao trocar de episódio
  const scrollToPlayer = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (playerContainerRef.current) {
      playerContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  // Atualiza a URL do navegador com o episódio e temporada selecionados
  // usando a History API nativa, sem acionar o roteador interno do Next.js
  // (Zero requisições RSC ao servidor e sem ativar Suspense fallback).
  const updateWatchUrl = useCallback(
    (epId?: string | number, seasonNum?: string | number) => {
      if (typeof window === 'undefined') return;
      const targetUrl = getWatchUrl('series', id, epId, seasonNum);
      window.history.replaceState({ seriesId: id, epId, season: seasonNum }, '', targetUrl);
    },
    [id]
  );

  // Callbacks para troca de item
  const handleSwitchStream = useCallback((newStream: BaseStreamItem) => {
    setCurrentStreamId(newStream.stream_id);
    router.replace(getWatchUrl(newStream.stream_type, newStream.stream_id));
  }, [router]);

  const handleSelectEpisode = useCallback(
    (ep: SeriesEpisode, shouldScroll = true) => {
      setActiveEpisode(ep);
      updateWatchUrl(ep.id, selectedSeason);
      if (shouldScroll) {
        scrollToPlayer();
      }
    },
    [selectedSeason, updateWatchUrl, scrollToPlayer]
  );

  // Lista de episódios sem filtro de busca para navegação sequencial entre capítulos
  const allCurrentSeasonEpisodes: SeriesEpisode[] = useMemo(() => {
    return getEpisodesForSeason(seriesInfo, selectedSeason);
  }, [seriesInfo, selectedSeason]);

  const activeEpisodeIndex = useMemo(() => {
    if (!activeEpisode || !allCurrentSeasonEpisodes.length) return -1;
    return allCurrentSeasonEpisodes.findIndex((ep) => String(ep.id) === String(activeEpisode.id));
  }, [activeEpisode, allCurrentSeasonEpisodes]);

  const currentSeasonIndex = useMemo(() => {
    return seasonList.findIndex((s) => String(s.season_number) === String(selectedSeason));
  }, [seasonList, selectedSeason]);

  const canGoPrev = useMemo(() => {
    if (isSeries) {
      if (activeEpisodeIndex > 0) return true;
      if (currentSeasonIndex > 0) {
        const prevSeasonNum = String(seasonList[currentSeasonIndex - 1].season_number);
        const prevEps = getEpisodesForSeason(seriesInfo, prevSeasonNum);
        return prevEps.length > 0;
      }
      return false;
    }
    if (filteredRelated.length > 1) {
      const idx = filteredRelated.findIndex((i) => String(i.stream_id) === String(currentStreamId));
      return idx > 0;
    }
    return false;
  }, [isSeries, activeEpisodeIndex, currentSeasonIndex, seasonList, seriesInfo, filteredRelated, currentStreamId]);

  const canGoNext = useMemo(() => {
    if (isSeries) {
      if (activeEpisodeIndex >= 0 && activeEpisodeIndex < allCurrentSeasonEpisodes.length - 1) return true;
      if (currentSeasonIndex >= 0 && currentSeasonIndex < seasonList.length - 1) {
        const nextSeasonNum = String(seasonList[currentSeasonIndex + 1].season_number);
        const nextEps = getEpisodesForSeason(seriesInfo, nextSeasonNum);
        return nextEps.length > 0;
      }
      return false;
    }
    if (filteredRelated.length > 1) {
      const idx = filteredRelated.findIndex((i) => String(i.stream_id) === String(currentStreamId));
      return idx >= 0 && idx < filteredRelated.length - 1;
    }
    return false;
  }, [isSeries, activeEpisodeIndex, allCurrentSeasonEpisodes.length, currentSeasonIndex, seasonList, seriesInfo, filteredRelated, currentStreamId]);

  const handlePrevChapter = useCallback(() => {
    if (isSeries) {
      if (activeEpisodeIndex > 0) {
        handleSelectEpisode(allCurrentSeasonEpisodes[activeEpisodeIndex - 1], true);
      } else if (currentSeasonIndex > 0) {
        const prevSeason = seasonList[currentSeasonIndex - 1];
        const prevSeasonNum = String(prevSeason.season_number);
        const prevEps = getEpisodesForSeason(seriesInfo, prevSeasonNum);
        if (prevEps.length > 0) {
          const lastEp = prevEps[prevEps.length - 1];
          setSelectedSeason(prevSeasonNum);
          setActiveEpisode(lastEp);
          updateWatchUrl(lastEp.id, prevSeasonNum);
          scrollToPlayer();
        }
      }
      return;
    }

    if (filteredRelated.length > 1) {
      const idx = filteredRelated.findIndex((i) => String(i.stream_id) === String(currentStreamId));
      if (idx > 0) {
        handleSwitchStream(filteredRelated[idx - 1]);
      }
    }
  }, [isSeries, activeEpisodeIndex, currentSeasonIndex, allCurrentSeasonEpisodes, handleSelectEpisode, seasonList, seriesInfo, updateWatchUrl, scrollToPlayer, filteredRelated, currentStreamId, handleSwitchStream]);

  const handleNextChapter = useCallback(() => {
    if (isSeries) {
      if (activeEpisodeIndex >= 0 && activeEpisodeIndex < allCurrentSeasonEpisodes.length - 1) {
        handleSelectEpisode(allCurrentSeasonEpisodes[activeEpisodeIndex + 1], true);
      } else if (currentSeasonIndex >= 0 && currentSeasonIndex < seasonList.length - 1) {
        const nextSeason = seasonList[currentSeasonIndex + 1];
        const nextSeasonNum = String(nextSeason.season_number);
        const nextEps = getEpisodesForSeason(seriesInfo, nextSeasonNum);
        if (nextEps.length > 0) {
          const firstEp = nextEps[0];
          setSelectedSeason(nextSeasonNum);
          setActiveEpisode(firstEp);
          updateWatchUrl(firstEp.id, nextSeasonNum);
          scrollToPlayer();
        }
      }
      return;
    }

    if (filteredRelated.length > 1) {
      const idx = filteredRelated.findIndex((i) => String(i.stream_id) === String(currentStreamId));
      if (idx >= 0 && idx < filteredRelated.length - 1) {
        handleSwitchStream(filteredRelated[idx + 1]);
      }
    }
  }, [isSeries, activeEpisodeIndex, allCurrentSeasonEpisodes, handleSelectEpisode, currentSeasonIndex, seasonList, seriesInfo, updateWatchUrl, scrollToPlayer, filteredRelated, currentStreamId, handleSwitchStream]);

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

  if (!config && !localPlayableUrl) {
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

  if (!item && !seriesInfo && !localPlayableUrl) {
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6 sm:space-y-8 overflow-x-hidden w-full">
      {/* 1. Barra Superior com Navegação e Ações */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4 w-full min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => router.push(getInfoUrl(streamType, id))}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white border border-white/10 transition cursor-pointer shrink-0"
            title="Voltar para a página de detalhes"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-violet-600/30 text-violet-300 border border-violet-500/30 shrink-0">
              {isLive ? 'Ao Vivo' : isMovie ? 'Filme' : 'Série'}
            </span>
            <span className="text-xs text-neutral-400 font-medium truncate max-w-[140px] sm:max-w-none">
              {item?.category_name || 'Geral'}
            </span>
            {isSeries && activeEpisode && (
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-white/10 text-neutral-300 shrink-0">
                T{selectedSeason} • EP {activeEpisode.episode_num}
              </span>
            )}
          </div>
        </div>

        {/* Ações Rápidas: Info, Favorito, Assistido */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
          <Link
            href={getInfoUrl(streamType, id)}
            className="px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 text-xs font-semibold border border-white/10 flex items-center gap-1.5 transition"
          >
            <Info className="w-3.5 h-3.5" />
            <span>Ver Resumo</span>
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
            className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl border text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
              favorited
                ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10'
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${favorited ? 'fill-rose-500 text-rose-500' : ''}`} />
            <span>{favorited ? 'Favoritado' : 'Favoritar'}</span>
          </button>

          <button
            onClick={() => {
              if (watched) {
                if (isSeries && activeEpisode) {
                  removeWatched(String(activeEpisode.id), 'series');
                } else {
                  const targetId = item?.stream_id || id;
                  removeWatched(targetId, streamType);
                }
              } else {
                if (isSeries && activeEpisode) {
                  const epMeta = seasonEpisodesMeta[Number(activeEpisode.episode_num)];
                  const formattedEpName = formatEpisodeTitle(
                    activeEpisode.episode_num,
                    selectedSeason,
                    epMeta?.name || activeEpisode.title
                  );
                  const fullTitle = `${item?.title || item?.name || 'Série'} - ${formattedEpName}`;
                  markWatched(String(activeEpisode.id), 'series', fullTitle, true, {
                    posterUrl:
                      epMeta?.thumbnailUrl ||
                      activeEpisode.info?.movie_image ||
                      activeEpisode.info?.cover_big ||
                      item?.stream_icon,
                    categoryName: item?.category_name,
                  });
                } else {
                  const targetId = item?.stream_id || id;
                  const mainTitle = item?.title || item?.name || playerTitle;
                  markWatched(targetId, streamType, mainTitle, true, {
                    posterUrl: item?.stream_icon,
                    categoryName: item?.category_name,
                    rating: item?.rating,
                  });
                }
              }
            }}
            className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl border text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
              watched
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10'
            }`}
          >
            <CheckCircle2 className={`w-3.5 h-3.5 ${watched ? 'fill-emerald-500/20 text-emerald-400' : ''}`} />
            <span>{watched ? 'Concluído' : 'Marcar Concluído'}</span>
          </button>
        </div>
      </div>

      {/* 2. Grid Principal: Player Central + Coluna Lateral Dinâmica */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full min-w-0 lg:items-start">
        {/* Lado Esquerdo: Player de Vídeo Cinema + Controles de Capítulos na mesma primeira div */}
        <div className="lg:col-span-8 xl:col-span-8 flex flex-col gap-3 min-w-0 self-start">
          <div
            ref={playerContainerRef}
            className="aspect-video w-full rounded-2xl sm:rounded-3xl overflow-hidden bg-black border border-white/10 shadow-2xl relative"
          >
            {isSeries && loadingSeries && !activeEpisode ? (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-neutral-950">
                <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-neutral-400 font-medium">Carregando episódios da série...</p>
              </div>
            ) : finalPlayUrl ? (
              <VideoPlayer
                streamUrl={finalPlayUrl}
                title={playerTitle}
                streamId={currentActiveId}
                streamType={streamType}
                posterUrl={playerPoster}
                autoPlay={true}
                initialTime={initialTime}
                skipTimes={skipTimes}
                onProgress={handlePlayerProgress}
                onVideoInfo={handlePlayerVideoInfo}
                hasPrevEpisode={canGoPrev}
                onPrevEpisode={canGoPrev ? handlePrevChapter : undefined}
                prevEpisodeLabel={isLive ? 'Canal Anterior' : isMovie ? 'Filme Anterior' : 'Capítulo Anterior'}
                hasNextEpisode={canGoNext}
                onNextEpisode={canGoNext ? handleNextChapter : undefined}
                nextEpisodeLabel={isLive ? 'Próximo Canal' : isMovie ? 'Próximo Filme' : 'Próximo Capítulo'}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-neutral-400">
                <Play className="w-10 h-10 text-neutral-600" />
                <p className="text-xs">Selecione um capítulo na lista para reproduzir</p>
              </div>
            )}
          </div>

          {/* Informações do Vídeo / Capítulo Selecionado (Diretamente abaixo do player, sem background e sem border) */}
          <div className="pt-2 pb-1 space-y-2.5 w-full min-w-0">
            {/* Especificações Técnicas: Duração, Tamanho, Dimensões e Codec (Div sem bordas e sem fundo, somente os elementos) */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-neutral-300 text-[11px] w-full">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                {isOfflineMode && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Modo Offline (Armazenamento Local)</span>
                  </div>
                )}

                {/* Duração */}
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/5 border border-white/5">
                  <Clock className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                  <span className="text-neutral-400">Duração:</span>
                  <span className="font-bold text-white">{displayDuration}</span>
                </div>

                {/* Tamanho */}
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/5 border border-white/5">
                  <HardDrive className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                  <span className="text-neutral-400">Tamanho:</span>
                  <span className="font-bold text-white">{displaySize}</span>
                </div>

                {/* Dimensões */}
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/5 border border-white/5">
                  <Monitor className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                  <span className="text-neutral-400">Dimensões:</span>
                  <span className="font-bold text-white font-mono">{displayDimensions}</span>
                </div>

                {/* Codec */}
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/5 border border-white/5">
                  <Cpu className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                  <span className="text-neutral-400">Codec:</span>
                  <span className="font-bold text-white">{displayCodec}</span>
                </div>
              </div>

              {/* Ação de Download Offline no Mobile / APK */}
              {!isLive && isNative && (streamUrl || localPlayableUrl) && (
                <button
                  onClick={async () => {
                    if (isDownloading) return;

                    const epNum = activeEpisode?.episode_num !== undefined ? Number(activeEpisode.episode_num) : undefined;
                    const epId = activeEpisode?.id;
                    const sNum = selectedSeason ? Number(selectedSeason) : undefined;
                    const downId = buildDownloadId(
                      streamType === 'series' ? 'series' : 'movie',
                      currentActiveId || id,
                      sNum,
                      epNum ?? epId
                    );

                    if (isCurrentDownloaded) {
                      if (confirm('Deseja excluir este vídeo baixado para liberar espaço no celular?')) {
                        await deleteOfflineDownload(downId);
                        setIsCurrentDownloaded(false);
                        setLocalPlayableUrl(null);
                        setIsOfflineMode(false);
                      }
                      return;
                    }

                    if (!streamUrl) return;
                    setIsDownloading(true);
                    try {
                      await downloadVideoForOffline(
                        {
                          stream_id: String(currentActiveId || id),
                          stream_type: streamType === 'series' ? 'series' : 'movie',
                          title: playerTitle,
                          series_title: item?.title || item?.name,
                          poster_url: playerPoster,
                          container_extension: item?.container_extension,
                          season_num: sNum,
                          episode_num: epNum,
                          episode_id: epId,
                        },
                        streamUrl
                      );
                      setIsCurrentDownloaded(true);
                      setDownloadDone(true);
                      setTimeout(() => setDownloadDone(false), 5000);
                    } catch (e: any) {
                      alert(e.message || 'Erro ao realizar download.');
                    } finally {
                      setIsDownloading(false);
                    }
                  }}
                  disabled={isDownloading}
                  className={`px-2.5 py-1 rounded-xl border text-[11px] font-semibold transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
                    isCurrentDownloaded
                      ? 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border-rose-500/30'
                      : downloadDone
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : 'bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 border-violet-500/30'
                  }`}
                  title={
                    isCurrentDownloaded
                      ? 'Excluir da memória do celular para liberar espaço'
                      : 'Salvar na memória do celular para assistir offline'
                  }
                >
                  {isDownloading ? (
                    <>
                      <div className="w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                      <span>Baixando...</span>
                    </>
                  ) : isCurrentDownloaded ? (
                    <>
                      <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                      <span>Excluir do Celular</span>
                    </>
                  ) : downloadDone ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Baixado Offline</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      <span>Baixar Offline</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Título do Vídeo / Episódio Selecionado */}
            <h1 className="text-base sm:text-xl font-bold text-white tracking-tight break-words pt-0.5">
              {playerTitle}
            </h1>

            {/* Sinopse do Capítulo ou da Obra */}
            <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed max-w-4xl break-words">
              {currentEpMeta?.overview ||
                activeEpisode?.info?.plot ||
                enrichedMetadata?.overview ||
                seriesInfo?.info?.plot ||
                'Aproveite a reprodução fluida direta dos servidores CDN com navegação rápida de episódios.'}
            </p>
          </div>
        </div>


        {/* Lado Direito: Segunda Div com altura relativa ao player de video na primeira div (sem h-full) */}
        <div
          className="lg:col-span-4 xl:col-span-4 min-w-0 w-full p-3 sm:p-3.5 rounded-2xl bg-[#13141b] border border-white/10 shadow-xl flex flex-col max-h-[500px] lg:max-h overflow-hidden self-start"
          style={{
            height: isDesktop && playerHeight ? `${playerHeight}px` : undefined,
            maxHeight: isDesktop && playerHeight ? `${playerHeight}px` : undefined,
          }}
        >
            {/* ======================================================== */}
            {/* CENÁRIO 1: SÉRIES (Capítulos com Seletor de Temporada)     */}
            {/* ======================================================== */}
            {isSeries ? (
              <div className="flex flex-col flex-1 min-h-0 space-y-2.5">
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
                              const newSeason = String(season.season_number);
                              setSelectedSeason(newSeason);
                              setIsSeasonDropdownOpen(false);
                              if (seriesInfo?.episodes && seriesInfo.episodes[newSeason]?.length > 0) {
                                const firstEp = seriesInfo.episodes[newSeason][0];
                                setActiveEpisode(firstEp);
                                updateWatchUrl(firstEp.id, newSeason);
                                scrollToPlayer();
                              }
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
                <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1 divide-y divide-white/[0.03]">
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
                          className={`p-1.5 sm:p-2 rounded-xl flex items-center gap-2.5 cursor-pointer transition group shrink-0 ${
                            isCurrent
                              ? 'bg-violet-600/20 border border-violet-500/40 text-violet-200 shadow-md'
                              : 'hover:bg-white/5 text-neutral-300 hover:text-white'
                          }`}
                        >
                          {/* Miniatura do Episódio com Badge de Número */}
                          <div className="w-12 h-9 rounded-lg bg-black overflow-hidden shrink-0 flex items-center justify-center border border-white/5 relative">
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
              <div className="flex flex-col flex-1 min-h-0 space-y-2.5">
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
                <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1 divide-y divide-white/[0.03]">
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
                          className={`p-1.5 sm:p-2 rounded-xl flex items-center gap-2.5 cursor-pointer transition group shrink-0 ${
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

      {/* ========================================================================= */}
      {/* 3. SEÇÃO DEPOIS DO REPRODUTOR: SUGESTÕES DE SÉRIES/FILMES                 */}
      {/* ========================================================================= */}
      <div className="space-y-4 pt-1 sm:pt-2 w-full min-w-0">
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
