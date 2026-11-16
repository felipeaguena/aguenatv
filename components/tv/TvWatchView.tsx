'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Heart,
  CheckCircle2,
  ListVideo,
  Tv,
  Play,
  X,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { localDB, getSavedIPTVConfig } from '@/lib/db-local';
import {
  fetchIPTVApi,
  getCachedWorkingHost,
  getStreamHostCandidates,
  resolveWorkingStreamHost,
} from '@/lib/iptv-client';
import {
  BaseStreamItem,
  IPTVAccount,
  StreamType,
  SeriesEpisode,
  SeriesInfoResponse,
  EnrichedMetadata,
  EnrichedEpisodeMetadata,
  SkipTimesData,
} from '@/lib/types';
import {
  buildSortedSeasonList,
  getDefaultSeason,
  getEpisodesForSeason,
  findEpisodeInSeriesInfo,
  formatEpisodeTitle,
} from '@/lib/series';
import { getTvInfoUrl, getTvWatchUrl } from '@/lib/tv-routes';
import { useFavorites } from '@/hooks/useFavorites';
import { useWatched } from '@/hooks/useWatched';
import { useContinueWatching } from '@/hooks/useContinueWatching';
import { useOfflineDownloads } from '@/hooks/useOfflineDownloads';
import { getPlayableOfflineUrlSync } from '@/lib/download-manager';
import VideoPlayer from '@/components/player/VideoPlayer';
import ImageWithFallback from '@/components/ui/ImageWithFallback';

interface TvWatchViewProps {
  type: string;
  id: string;
}

export default function TvWatchView({ type, id }: TvWatchViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const episodeParam = searchParams.get('ep');
  const seasonParam = searchParams.get('season');
  const timeParam = searchParams.get('t');
  const initialTime = timeParam ? Number(timeParam) : undefined;

  const { isFavorite, addFavorite, removeFavorite } = useFavorites();
  const { isWatched, markWatched, removeWatched } = useWatched();
  const { saveProgress } = useContinueWatching({ subscribe: false });
  const { getDownload } = useOfflineDownloads();

  const [item, setItem] = useState<BaseStreamItem | null>(null);
  const [config, setConfig] = useState<IPTVAccount | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [resolvedHost, setResolvedHost] = useState<string | null>(null);
  const [relatedItems, setRelatedItems] = useState<BaseStreamItem[]>([]);
  const [currentStreamId, setCurrentStreamId] = useState(id);
  const [loading, setLoading] = useState(true);

  const [seriesInfo, setSeriesInfo] = useState<SeriesInfoResponse | null>(null);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [seriesError, setSeriesError] = useState<string | null>(null);
  const [seriesRetryNonce, setSeriesRetryNonce] = useState(0);
  const [selectedSeason, setSelectedSeason] = useState<string>(seasonParam || '1');
  const [activeEpisode, setActiveEpisode] = useState<SeriesEpisode | null>(null);
  const [seasonEpisodesMeta, setSeasonEpisodesMeta] = useState<
    Record<string | number, EnrichedEpisodeMetadata>
  >({});
  const [enrichedMetadata, setEnrichedMetadata] = useState<EnrichedMetadata | null>(null);
  const [skipTimes, setSkipTimes] = useState<SkipTimesData | null>(null);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isHudVisible, setIsHudVisible] = useState(true);
  const hudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedSeriesIdRef = useRef<string | null>(null);
  const autoMarkedRef = useRef<Set<string>>(new Set());

  const showHudTemporarily = useCallback(() => {
    setIsHudVisible(true);
    if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    hudTimerRef.current = setTimeout(() => {
      setIsHudVisible(false);
    }, 4500);
  }, []);

  useEffect(() => {
    hudTimerRef.current = setTimeout(() => {
      setIsHudVisible(false);
    }, 4500);
    return () => {
      if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    };
  }, []);

  // Botão Voltar da TV fecha o drawer primeiro, ou volta para Info/Catálogo
  useEffect(() => {
    const onBack = (e: Event) => {
      e.preventDefault();
      if (isDrawerOpen) {
        setIsDrawerOpen(false);
      } else {
        const targetType =
          type === 'series'
            ? 'series'
            : type === 'movies' || type === 'movie'
            ? 'movie'
            : 'live';
        if (targetType === 'live') {
          router.push('/tv/live');
        } else {
          router.push(getTvInfoUrl(targetType, id));
        }
      }
    };
    window.addEventListener('aguenatv:tv-back', onBack);
    return () => window.removeEventListener('aguenatv:tv-back', onBack);
  }, [isDrawerOpen, router, type, id]);

  // Carrega dados do stream + config
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const targetType: StreamType =
          type === 'series'
            ? 'series'
            : type === 'movies' || type === 'movie'
            ? 'movie'
            : 'live';

        let foundItem: BaseStreamItem | null = null;
        if (localDB) {
          const byId = await localDB.streams.get(`${targetType}_${currentStreamId}`);
          if (byId) {
            foundItem = byId as unknown as BaseStreamItem;
          } else {
            const byStreamId = await localDB.streams
              .where('stream_id')
              .equals(String(currentStreamId))
              .filter((s) => s.stream_type === targetType)
              .first();
            if (byStreamId) {
              foundItem = byStreamId as unknown as BaseStreamItem;
            } else {
              const fallback = await localDB.streams
                .where('stream_id')
                .equals(String(currentStreamId))
                .first();
              if (fallback) {
                foundItem = fallback as unknown as BaseStreamItem;
              }
            }
          }
        }

        const savedCfg = await getSavedIPTVConfig();
        if (!active) return;
        setConfig(savedCfg);
        setConfigLoaded(true);

        if (savedCfg?.server_url) {
          const cached = getCachedWorkingHost(savedCfg.server_url);
          if (cached) setResolvedHost(cached);
          if (targetType !== 'series') {
            const working = cached || (await resolveWorkingStreamHost(savedCfg));
            if (active && working) setResolvedHost(working);
          }
        }

        if (!foundItem) {
          foundItem = {
            id: `${targetType}_${currentStreamId}`,
            stream_id: String(currentStreamId),
            name: targetType === 'movie' ? 'Filme' : targetType === 'series' ? 'Série' : 'Canal',
            title: targetType === 'movie' ? 'Filme' : targetType === 'series' ? 'Série' : 'Canal',
            stream_type: targetType,
            container_extension: 'mp4',
          };
        }

        setItem(foundItem as BaseStreamItem);

        if (foundItem.category_id && localDB) {
          const sameCat = await localDB.streams
            .where('category_id')
            .equals(foundItem.category_id)
            .filter((s) => s.stream_type === foundItem.stream_type)
            .limit(80)
            .toArray();
          if (active) setRelatedItems(sameCat as unknown as BaseStreamItem[]);
        }
      } catch (err) {
        console.error('Erro em TvWatchView:', err);
        if (active) setConfigLoaded(true);
      } finally {
        if (active && type !== 'series') {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [currentStreamId, type]);

  // Carrega detalhes da série
  useEffect(() => {
    if (type !== 'series' && item?.stream_type !== 'series') return;
    if (!configLoaded) return;

    let active = true;
    async function loadSeries() {
      setLoadingSeries(true);
      setSeriesError(null);
      try {
        if (!config) {
          throw new Error('Nenhuma lista IPTV configurada. Sincronize nas Configurações.');
        }
        const data: SeriesInfoResponse = await fetchIPTVApi(config, {
          action: 'get_series_info',
          params: { series_id: id },
        });
        if (!data) throw new Error('Falha ao obter episódios.');
        const sorted = buildSortedSeasonList(data);
        if (!sorted.some((s) => (s.episode_count ?? 0) > 0)) {
          throw new Error('Nenhum episódio disponível.');
        }
        if (!active) return;
        const cached = getCachedWorkingHost(config.server_url);
        if (cached) setResolvedHost(cached);
        setSeriesInfo(data);
        if (!episodeParam) {
          setSelectedSeason(getDefaultSeason(sorted));
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erro ao carregar capítulos da série.';
        if (active) setSeriesError(msg);
      } finally {
        if (active) {
          setLoadingSeries(false);
          setLoading(false);
        }
      }
    }

    loadSeries();
    return () => {
      active = false;
    };
  }, [id, type, config, configLoaded, item?.stream_type, episodeParam, seriesRetryNonce]);

  // Seleciona episódio inicial
  useEffect(() => {
    if (!seriesInfo?.episodes) return;
    if (initializedSeriesIdRef.current === String(id)) return;

    let targetEp: SeriesEpisode | null = null;
    let targetSeason = seasonParam || selectedSeason;

    if (episodeParam) {
      const matched = findEpisodeInSeriesInfo(seriesInfo, episodeParam, targetSeason);
      if (matched) {
        targetEp = matched.episode;
        targetSeason = matched.season;
      }
    }

    if (!targetEp) {
      const eps = getEpisodesForSeason(seriesInfo, targetSeason);
      if (eps.length > 0) {
        targetEp = eps[0];
      } else {
        const sorted = buildSortedSeasonList(seriesInfo);
        const def = getDefaultSeason(sorted);
        const defEps = getEpisodesForSeason(seriesInfo, def);
        if (defEps.length > 0) {
          targetEp = defEps[0];
          targetSeason = def;
        }
      }
    }

    if (targetEp) {
      initializedSeriesIdRef.current = String(id);
      setActiveEpisode(targetEp);
      setSelectedSeason(targetSeason);
    }
  }, [id, seriesInfo, episodeParam, seasonParam, selectedSeason]);

  // Metadados TMDb e Skip Times
  useEffect(() => {
    if (!item || item.stream_type === 'live') return;
    const title = item.title || item.name;
    if (!title) return;
    let active = true;
    const catParam = item.category_name ? `&category=${encodeURIComponent(item.category_name)}` : '';
    fetch(`/api/metadata?title=${encodeURIComponent(title)}&type=${item.stream_type}${catParam}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: EnrichedMetadata | null) => {
        if (active && data && data.source !== 'none') setEnrichedMetadata(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [item]);

  useEffect(() => {
    if (!item || item.stream_type !== 'series') return;
    const title = item.title || item.name;
    if (!title) return;
    let active = true;
    const sParam = selectedSeason.replace(/\D/g, '') || '1';
    let url = `/api/metadata/season?title=${encodeURIComponent(title)}&season=${sParam}`;
    if (enrichedMetadata?.tmdbId) url += `&tmdbId=${enrichedMetadata.tmdbId}`;
    fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data?.episodes) setSeasonEpisodesMeta(data.episodes);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [item, selectedSeason, enrichedMetadata?.tmdbId]);

  useEffect(() => {
    if (!item || item.stream_type !== 'series' || !activeEpisode) {
      return;
    }
    let active = true;
    const title = item.title || item.name;
    const catParam = item.category_name ? `&category=${encodeURIComponent(item.category_name)}` : '';
    const tmdbParam = enrichedMetadata?.tmdbId ? `&tmdbId=${enrichedMetadata.tmdbId}` : '';
    const sNum = selectedSeason.replace(/\D/g, '') || '1';
    fetch(
      `/api/skip-times?season=${sNum}&episode=${activeEpisode.episode_num}&title=${encodeURIComponent(title)}${tmdbParam}${catParam}`
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data: SkipTimesData | null) => {
        if (active) setSkipTimes(data?.found ? data : null);
      })
      .catch(() => {});
    return () => {
      active = false;
      setSkipTimes(null);
    };
  }, [item, activeEpisode, selectedSeason, enrichedMetadata?.tmdbId]);

  const streamType = (item?.stream_type || (type === 'movies' ? 'movie' : type)) as StreamType;
  const isSeries = streamType === 'series';
  const isLive = streamType === 'live';
  const isMovie = streamType === 'movie';

  const streamHostCandidates = useMemo(() => {
    if (!config?.server_url) return [];
    return getStreamHostCandidates(config.server_url, resolvedHost);
  }, [config, resolvedHost]);

  const cleanHost = streamHostCandidates[0] || '';
  const seasonList = useMemo(() => buildSortedSeasonList(seriesInfo), [seriesInfo]);
  const currentSeasonEpisodes = useMemo(
    () => getEpisodesForSeason(seriesInfo, selectedSeason),
    [seriesInfo, selectedSeason]
  );

  const { streamUrl, fallbackUrls, playerTitle, playerPoster, activeId } = useMemo(() => {
    let url = '';
    let relativePath = '';
    let title = item?.title || item?.name || 'Transmissão';
    let poster = enrichedMetadata?.posterUrl || item?.stream_icon;
    let curId = item?.stream_id || id;

    if (!config || !cleanHost) {
      return { streamUrl: '', fallbackUrls: [] as string[], playerTitle: title, playerPoster: poster, activeId: curId };
    }

    if (isLive) {
      relativePath = `/live/${config.username}/${config.password}/${curId}.m3u8`;
      url = `${cleanHost}${relativePath}`;
    } else if (isMovie) {
      const ext = (item?.container_extension || 'mp4').replace(/^\./, '').trim() || 'mp4';
      relativePath = `/movie/${config.username}/${config.password}/${curId}.${ext}`;
      url = `${cleanHost}${relativePath}`;
    } else if (isSeries && activeEpisode) {
      curId = String(activeEpisode.id);
      const ext = (activeEpisode.container_extension || 'mp4').replace(/^\./, '').trim() || 'mp4';
      relativePath = `/series/${config.username}/${config.password}/${activeEpisode.id}.${ext}`;
      url = `${cleanHost}${relativePath}`;
      const epMeta = seasonEpisodesMeta[Number(activeEpisode.episode_num)];
      title = `${item?.title || item?.name || 'Série'} - ${formatEpisodeTitle(
        activeEpisode.episode_num,
        selectedSeason,
        epMeta?.name || activeEpisode.title
      )}`;
      poster =
        epMeta?.thumbnailUrl ||
        activeEpisode.info?.movie_image ||
        enrichedMetadata?.backdropUrl ||
        item?.stream_icon;
    }

    return {
      streamUrl: url,
      fallbackUrls: relativePath ? streamHostCandidates.slice(1).map((h) => `${h}${relativePath}`) : [],
      playerTitle: title,
      playerPoster: poster,
      activeId: curId,
    };
  }, [config, cleanHost, streamHostCandidates, item, isLive, isMovie, isSeries, activeEpisode, id, enrichedMetadata, seasonEpisodesMeta, selectedSeason]);

  const offlineDownload = useMemo(() => {
    if (isLive) return undefined;
    if (isMovie) return getDownload('movie', currentStreamId);
    if (isSeries && activeEpisode) {
      return getDownload('series', currentStreamId, selectedSeason, activeEpisode.episode_num, activeEpisode.id);
    }
    return undefined;
  }, [isLive, isMovie, isSeries, currentStreamId, selectedSeason, activeEpisode, getDownload]);

  const effectivePlayUrl = (offlineDownload ? getPlayableOfflineUrlSync(offlineDownload) : null) || streamUrl;

  const activeEpIdx = useMemo(() => {
    if (!activeEpisode) return -1;
    return currentSeasonEpisodes.findIndex((e) => String(e.id) === String(activeEpisode.id));
  }, [activeEpisode, currentSeasonEpisodes]);

  const relatedIdx = useMemo(() => {
    return relatedItems.findIndex((r) => String(r.stream_id) === String(currentStreamId));
  }, [relatedItems, currentStreamId]);

  const canGoPrev = isSeries ? activeEpIdx > 0 : relatedIdx > 0;
  const canGoNext = isSeries
    ? activeEpIdx >= 0 && activeEpIdx < currentSeasonEpisodes.length - 1
    : relatedIdx >= 0 && relatedIdx < relatedItems.length - 1;

  const handleSelectEpisode = (ep: SeriesEpisode) => {
    setActiveEpisode(ep);
    setIsDrawerOpen(false);
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', getTvWatchUrl('series', id, ep.id, selectedSeason));
    }
  };

  const handlePrev = () => {
    if (isSeries && activeEpIdx > 0) {
      handleSelectEpisode(currentSeasonEpisodes[activeEpIdx - 1]);
    } else if (!isSeries && relatedIdx > 0) {
      const target = relatedItems[relatedIdx - 1];
      setCurrentStreamId(target.stream_id);
      router.replace(getTvWatchUrl(target.stream_type, target.stream_id));
    }
  };

  const handleNext = () => {
    if (isSeries && activeEpIdx >= 0 && activeEpIdx < currentSeasonEpisodes.length - 1) {
      handleSelectEpisode(currentSeasonEpisodes[activeEpIdx + 1]);
    } else if (!isSeries && relatedIdx >= 0 && relatedIdx < relatedItems.length - 1) {
      const target = relatedItems[relatedIdx + 1];
      setCurrentStreamId(target.stream_id);
      router.replace(getTvWatchUrl(target.stream_type, target.stream_id));
    }
  };

  const handlePlayerProgress = useCallback(
    ({ currentTime, duration, immediate }: { currentTime: number; duration: number; immediate?: boolean }) => {
      if (!item || streamType === 'live') return;
      if (streamType === 'movie') {
        saveProgress(
          {
            streamId: item.stream_id,
            streamType: 'movie',
            title: item.title || item.name,
            posterUrl: enrichedMetadata?.posterUrl || item.stream_icon,
            backdropUrl: enrichedMetadata?.backdropUrl || item.stream_icon,
            categoryName: item.category_name,
            currentTime,
            duration,
          },
          immediate
        );
      } else if (streamType === 'series' && activeEpisode) {
        const epMeta = seasonEpisodesMeta[Number(activeEpisode.episode_num)];
        saveProgress(
          {
            streamId: item.stream_id,
            streamType: 'series',
            title: item.title || item.name,
            posterUrl: item.stream_icon,
            backdropUrl: enrichedMetadata?.backdropUrl || epMeta?.thumbnailUrl || item.stream_icon,
            categoryName: item.category_name,
            seriesId: item.stream_id,
            seriesTitle: item.title || item.name,
            episodeId: String(activeEpisode.id),
            episodeNum: activeEpisode.episode_num,
            seasonNum: selectedSeason,
            episodeTitle: epMeta?.name || activeEpisode.title,
            currentTime,
            duration,
          },
          immediate
        );
      }

      const remaining = duration - currentTime;
      const isNearEnd = duration > 60 ? remaining <= 60 : duration > 0 && currentTime >= duration * 0.9;
      if (isNearEnd) {
        if (streamType === 'series' && activeEpisode) {
          const epIdStr = String(activeEpisode.id);
          if (!autoMarkedRef.current.has(epIdStr) && !isWatched(epIdStr, 'series')) {
            autoMarkedRef.current.add(epIdStr);
            markWatched(epIdStr, 'series', playerTitle, true, {
              posterUrl: item.stream_icon,
              categoryName: item.category_name,
            });
          }
        } else if (streamType === 'movie') {
          const mIdStr = String(item.stream_id || id);
          if (!autoMarkedRef.current.has(mIdStr) && !isWatched(mIdStr, 'movie')) {
            autoMarkedRef.current.add(mIdStr);
            markWatched(mIdStr, 'movie', item.title || item.name, true, {
              posterUrl: item.stream_icon,
              categoryName: item.category_name,
            });
          }
        }
      }
    },
    [item, streamType, activeEpisode, selectedSeason, seasonEpisodesMeta, enrichedMetadata, saveProgress, isWatched, markWatched, playerTitle, id]
  );

  const favorited = item ? isFavorite(item.stream_id, streamType) : false;
  const watched = isSeries && activeEpisode
    ? isWatched(String(activeEpisode.id), 'series')
    : item
    ? isWatched(item.stream_id, streamType)
    : false;

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-3">
        <div className="w-10 h-10 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-neutral-400">Preparando reprodução...</p>
      </div>
    );
  }

  return (
    <div
      className="relative w-screen h-screen bg-black overflow-hidden flex flex-col"
      onMouseMove={showHudTemporarily}
      onTouchStart={showHudTemporarily}
      onKeyDown={showHudTemporarily}
    >
      {/* BARRA SUPERIOR FLUTUANTE 10-FOOT */}
      <div
        data-tv-zone="topbar"
        className={`absolute top-0 left-0 right-0 z-[60] px-5 py-3.5 bg-gradient-to-b from-black/90 via-black/55 to-transparent flex items-center justify-between gap-3 transition-opacity duration-300 ${
          isHudVisible || isDrawerOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            tabIndex={0}
            data-tv-focusable="true"
            data-tv-focus="button"
            onClick={() => (isLive ? router.push('/tv/live') : router.push(getTvInfoUrl(streamType, id)))}
            className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar</span>
          </button>

          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-black text-white truncate">{playerTitle}</h1>
            {item?.category_name && (
              <p className="text-[11px] text-neutral-400 truncate">{item.category_name}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {item && (
            <button
              type="button"
              tabIndex={0}
              data-tv-focusable="true"
              data-tv-focus="button"
              onClick={() =>
                favorited
                  ? removeFavorite(item.stream_id, streamType)
                  : addFavorite({
                      streamId: item.stream_id,
                      streamType,
                      title: item.title || item.name,
                      posterUrl: item.stream_icon,
                      categoryName: item.category_name,
                    })
              }
              className={`p-2.5 rounded-xl border cursor-pointer ${
                favorited
                  ? 'bg-rose-600/30 border-rose-500/50 text-rose-200'
                  : 'bg-white/10 hover:bg-white/20 border-white/15 text-white'
              }`}
              title="Favoritar"
            >
              <Heart className={`w-4 h-4 ${favorited ? 'fill-rose-500 text-rose-400' : ''}`} />
            </button>
          )}

          {!isLive && (
            <button
              type="button"
              tabIndex={0}
              data-tv-focusable="true"
              data-tv-focus="button"
              onClick={() => {
                if (isSeries && activeEpisode) {
                  if (watched) removeWatched(String(activeEpisode.id), 'series');
                  else markWatched(String(activeEpisode.id), 'series', playerTitle, true);
                } else if (item) {
                  if (watched) removeWatched(item.stream_id, streamType);
                  else markWatched(item.stream_id, streamType, item.title || item.name, true);
                }
              }}
              className={`p-2.5 rounded-xl border cursor-pointer ${
                watched
                  ? 'bg-emerald-600/30 border-emerald-500/50 text-emerald-200'
                  : 'bg-white/10 hover:bg-white/20 border-white/15 text-white'
              }`}
              title="Marcar Concluído"
            >
              <CheckCircle2 className="w-4 h-4" />
            </button>
          )}

          {(isSeries || relatedItems.length > 0) && (
            <button
              type="button"
              tabIndex={0}
              data-tv-focusable="true"
              data-tv-focus="button"
              onClick={() => setIsDrawerOpen((prev) => !prev)}
              className="px-4 py-2 rounded-xl bg-violet-600/80 hover:bg-violet-600 border border-violet-400/50 text-white text-xs font-bold flex items-center gap-2 cursor-pointer"
            >
              {isLive ? <Tv className="w-4 h-4" /> : <ListVideo className="w-4 h-4" />}
              <span>{isSeries ? 'Episódios' : isLive ? 'Canais' : 'Relacionados'}</span>
            </button>
          )}
        </div>
      </div>

      {/* ÁREA PRINCIPAL DO PLAYER */}
      <div className="flex-1 w-full h-full relative">
        {isSeries && loadingSeries && !activeEpisode ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-neutral-400">Carregando capítulos...</p>
          </div>
        ) : isSeries && seriesError && !activeEpisode ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 text-center">
            <AlertCircle className="w-10 h-10 text-rose-400" />
            <p className="text-sm text-neutral-200 max-w-md">{seriesError}</p>
            <button
              type="button"
              data-tv-focusable="true"
              data-tv-focus="button"
              onClick={() => setSeriesRetryNonce((n) => n + 1)}
              className="px-5 py-2.5 rounded-xl bg-violet-600 text-white text-xs font-bold flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Tentar Novamente</span>
            </button>
          </div>
        ) : effectivePlayUrl ? (
          <VideoPlayer
            streamUrl={effectivePlayUrl}
            fallbackStreamUrls={offlineDownload ? undefined : fallbackUrls}
            title={playerTitle}
            streamId={activeId}
            streamType={streamType}
            posterUrl={playerPoster}
            autoPlay={true}
            initialTime={initialTime}
            skipTimes={skipTimes}
            onProgress={handlePlayerProgress}
            hasPrevEpisode={canGoPrev}
            onPrevEpisode={canGoPrev ? handlePrev : undefined}
            prevEpisodeLabel={isLive ? 'Canal Anterior' : isMovie ? 'Filme Anterior' : 'Capítulo Anterior'}
            hasNextEpisode={canGoNext}
            onNextEpisode={canGoNext ? handleNext : undefined}
            nextEpisodeLabel={isLive ? 'Próximo Canal' : isMovie ? 'Próximo Filme' : 'Próximo Capítulo'}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-neutral-400">
            <Play className="w-10 h-10" />
            <p className="text-xs">Configuração IPTV não encontrada. Sincronize nas Configurações.</p>
          </div>
        )}
      </div>

      {/* DRAWER SOBREPOSTO DE EPISÓDIOS / CANAIS */}
      {isDrawerOpen && (
        <div
          data-tv-modal="true"
          className="fixed inset-y-0 right-0 z-[100] w-full max-w-md bg-[#0b0c13]/96 backdrop-blur-2xl border-l border-white/15 flex flex-col shadow-2xl"
        >
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-sm font-black text-white">
              {isSeries ? 'Selecionar Episódio' : isLive ? 'Trocar de Canal' : 'Mesma Categoria'}
            </h2>
            <button
              type="button"
              tabIndex={0}
              data-tv-focusable="true"
              data-tv-focus="button"
              data-tv-autofocus="true"
              onClick={() => setIsDrawerOpen(false)}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {isSeries && seasonList.length > 0 && (
            <div className="p-3 border-b border-white/10 tv-scroll-row flex items-center gap-2 overflow-x-auto">
              {seasonList.map((s) => {
                const sNum = String(s.season_number);
                return (
                  <button
                    key={sNum}
                    type="button"
                    tabIndex={0}
                    data-tv-focusable="true"
                    data-tv-focus="pill"
                    onClick={() => setSelectedSeason(sNum)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap cursor-pointer ${
                      sNum === String(selectedSeason)
                        ? 'bg-violet-600 text-white'
                        : 'bg-white/5 text-neutral-300 hover:bg-white/10'
                    }`}
                  >
                    T{sNum}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-3 space-y-2 tv-scroll-col">
            {isSeries
              ? currentSeasonEpisodes.map((ep) => {
                  const isCurrent = String(ep.id) === String(activeEpisode?.id);
                  const epMeta = seasonEpisodesMeta[Number(ep.episode_num)];
                  const epTitle = formatEpisodeTitle(
                    ep.episode_num,
                    selectedSeason,
                    epMeta?.name || ep.title
                  );

                  return (
                    <button
                      key={ep.id}
                      type="button"
                      tabIndex={0}
                      data-tv-focusable="true"
                      data-tv-focus="pill"
                      onClick={() => handleSelectEpisode(ep)}
                      className={`w-full p-2.5 rounded-2xl border flex items-center gap-3 text-left cursor-pointer transition ${
                        isCurrent
                          ? 'bg-violet-600/25 border-violet-500 text-white'
                          : 'bg-white/5 hover:bg-white/10 border-white/10 text-neutral-200'
                      }`}
                    >
                      <div className="w-24 aspect-video rounded-xl overflow-hidden bg-black shrink-0">
                        <ImageWithFallback
                          src={epMeta?.thumbnailUrl || ep.info?.movie_image || playerPoster}
                          alt={epTitle}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold line-clamp-2">{epTitle}</p>
                        {isCurrent && (
                          <span className="text-[10px] text-violet-300 font-bold">Reproduzindo</span>
                        )}
                      </div>
                    </button>
                  );
                })
              : relatedItems.map((rel) => {
                  const isCurrent = String(rel.stream_id) === String(currentStreamId);
                  return (
                    <button
                      key={`${rel.stream_type}_${rel.stream_id}`}
                      type="button"
                      tabIndex={0}
                      data-tv-focusable="true"
                      data-tv-focus="pill"
                      onClick={() => {
                        setIsDrawerOpen(false);
                        setCurrentStreamId(rel.stream_id);
                        router.replace(getTvWatchUrl(rel.stream_type, rel.stream_id));
                      }}
                      className={`w-full p-2.5 rounded-2xl border flex items-center gap-3 text-left cursor-pointer transition ${
                        isCurrent
                          ? 'bg-violet-600/25 border-violet-500 text-white'
                          : 'bg-white/5 hover:bg-white/10 border-white/10 text-neutral-200'
                      }`}
                    >
                      <div className="w-16 aspect-video rounded-xl overflow-hidden bg-black shrink-0 flex items-center justify-center p-1">
                        <ImageWithFallback
                          src={rel.stream_icon}
                          alt={rel.title || rel.name}
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold truncate">{rel.title || rel.name}</p>
                        <p className="text-[10px] text-neutral-400 truncate">{rel.category_name}</p>
                      </div>
                    </button>
                  );
                })}
          </div>
        </div>
      )}
    </div>
  );
}
