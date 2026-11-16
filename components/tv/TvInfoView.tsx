'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Play,
  Heart,
  CheckCircle2,
  Star,
  ArrowLeft,
  Film,
  Video,
  Tv,
  Clock,
  Calendar,
  Download,
  Trash2,
  X,
  Users,
  Layers,
} from 'lucide-react';
import { localDB, getSavedIPTVConfig } from '@/lib/db-local';
import { fetchIPTVApi, getEffectiveStreamHost } from '@/lib/iptv-client';
import {
  BaseStreamItem,
  StreamType,
  SeriesInfoResponse,
  SeriesEpisode,
  SeriesSeason,
  EnrichedMetadata,
  EnrichedEpisodeMetadata,
  IPTVAccount,
} from '@/lib/types';
import {
  buildSortedSeasonList,
  getDefaultSeason,
  getEpisodesForSeason,
  formatEpisodeTitle,
  findNextEpisodeToWatch,
} from '@/lib/series';
import { getTvWatchUrl, getTvCatalogUrl } from '@/lib/tv-routes';
import { cleanCategoryName } from '@/lib/stream-utils';
import { useFavorites } from '@/hooks/useFavorites';
import { useWatched } from '@/hooks/useWatched';
import { useOfflineDownloads } from '@/hooks/useOfflineDownloads';
import { downloadVideoForOffline, isNativeApp } from '@/lib/download-manager';
import TvMediaCard from '@/components/tv/TvMediaCard';
import TvHorizontalRow from '@/components/tv/TvHorizontalRow';
import ImageWithFallback from '@/components/ui/ImageWithFallback';

interface TvInfoViewProps {
  type: string;
  id: string;
}

export default function TvInfoView({ type, id }: TvInfoViewProps) {
  const router = useRouter();
  const { isFavorite, addFavorite, removeFavorite } = useFavorites();
  const { isWatched, markWatched, removeWatched, watchedList } = useWatched();
  const { isDownloaded, deleteOfflineItem, refreshDownloads } = useOfflineDownloads();

  const [item, setItem] = useState<BaseStreamItem | null>(null);
  const [related, setRelated] = useState<BaseStreamItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<IPTVAccount | null>(null);

  const [seriesInfo, setSeriesInfo] = useState<SeriesInfoResponse | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<string>('1');
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [seasonEpisodesMeta, setSeasonEpisodesMeta] = useState<
    Record<string | number, EnrichedEpisodeMetadata>
  >({});

  const [enrichedMetadata, setEnrichedMetadata] = useState<EnrichedMetadata | null>(null);
  const [isTrailerOpen, setIsTrailerOpen] = useState(false);
  const [isNative, setIsNative] = useState(false);
  const [downloadingMovie, setDownloadingMovie] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) setIsNative(isNativeApp());
    });
    return () => {
      active = false;
    };
  }, []);

  // Fecha trailer ao pressionar Voltar na TV
  useEffect(() => {
    if (!isTrailerOpen) return;
    const onBack = (e: Event) => {
      e.preventDefault();
      setIsTrailerOpen(false);
    };
    window.addEventListener('aguenatv:tv-back', onBack);
    return () => window.removeEventListener('aguenatv:tv-back', onBack);
  }, [isTrailerOpen]);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!localDB) return;
      try {
        const targetType: StreamType =
          type === 'series'
            ? 'series'
            : type === 'movies' || type === 'movie'
            ? 'movie'
            : 'live';

        let found = await localDB.streams.get(`${targetType}_${id}`);
        if (!found) {
          found = await localDB.streams
            .where('stream_id')
            .equals(String(id))
            .filter((s) => s.stream_type === targetType)
            .first();
        }
        if (!found) {
          found = await localDB.streams.where('stream_id').equals(String(id)).first();
        }

        const savedCfg = await getSavedIPTVConfig();
        if (!active) return;
        if (savedCfg) setConfig(savedCfg);

        if (found) {
          if (!found.category_name && found.category_id && localDB.categories) {
            try {
              const cat = await localDB.categories
                .where('category_id')
                .equals(String(found.category_id))
                .first();
              if (cat?.category_name) {
                found = { ...found, category_name: cat.category_name };
              }
            } catch {}
          }

          setItem(found as unknown as BaseStreamItem);

          // Relacionados
          if (found.category_id) {
            let sameCat = await localDB.streams
              .where('category_id')
              .equals(found.category_id)
              .filter((s) => s.stream_id !== id && s.stream_type === found!.stream_type)
              .limit(14)
              .toArray();

            if (sameCat.length < 10) {
              const more = await localDB.streams
                .where('stream_type')
                .equals(found.stream_type)
                .filter((s) => s.stream_id !== id && !sameCat.some((x) => x.stream_id === s.stream_id))
                .limit(12 - sameCat.length)
                .toArray();
              sameCat = [...sameCat, ...more];
            }
            if (active) setRelated(sameCat as unknown as BaseStreamItem[]);
          }

          if (found.stream_type === 'series' && savedCfg) {
            setLoadingSeries(true);
            try {
              const sData: SeriesInfoResponse = await fetchIPTVApi(savedCfg, {
                action: 'get_series_info',
                params: { series_id: found.stream_id },
              });
              if (sData && active) {
                setSeriesInfo(sData);
                const sorted = buildSortedSeasonList(sData);
                const nextEp = findNextEpisodeToWatch(sData, isWatched, watchedList);
                setSelectedSeason(nextEp ? String(nextEp.seasonNumber) : getDefaultSeason(sorted));
              }
            } catch (err) {
              console.warn('Erro ao buscar episódios da série:', err);
              if (localDB?.offline_downloads) {
                const offlineItems = await localDB.offline_downloads
                  .where('stream_id')
                  .equals(String(found.stream_id))
                  .toArray();
                if (offlineItems.length > 0 && active) {
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
                  const fallbackInfo: SeriesInfoResponse = {
                    seasons: seasonsList,
                    episodes: episodesMap,
                    info: {
                      name: found.title || found.name,
                      title: found.title || found.name,
                      cover: found.stream_icon,
                    },
                  };
                  setSeriesInfo(fallbackInfo);
                  setSelectedSeason(String(seasonsList[0]?.season_number || 1));
                }
              }
            } finally {
              if (active) setLoadingSeries(false);
            }
          }
        }
      } catch (err) {
        console.error('Erro em TvInfoView:', err);
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [id, type]);

  // Metadados TMDb / Kitsu / TVMaze
  useEffect(() => {
    if (!item || item.stream_type === 'live') return;
    const title = item.title || item.name;
    if (!title) return;

    let active = true;
    const catParam = item.category_name ? `&category=${encodeURIComponent(item.category_name)}` : '';
    fetch(`/api/metadata?title=${encodeURIComponent(title)}&type=${item.stream_type}${catParam}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: EnrichedMetadata | null) => {
        if (active && data && data.source !== 'none') {
          setEnrichedMetadata(data);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [item]);

  // Metadados dos episódios da temporada selecionada
  useEffect(() => {
    if (!item || item.stream_type !== 'series') return;
    const title = item.title || item.name;
    if (!title) return;

    let active = true;
    const sParam = selectedSeason.toLowerCase().includes('espec')
      ? '0'
      : selectedSeason.replace(/\D/g, '') || '1';
    let url = `/api/metadata/season?title=${encodeURIComponent(title)}&season=${sParam}`;
    if (enrichedMetadata?.tmdbId) url += `&tmdbId=${enrichedMetadata.tmdbId}`;

    fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data?.episodes) {
          setSeasonEpisodesMeta(data.episodes);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [item, selectedSeason, enrichedMetadata?.tmdbId]);

  const seasonList = useMemo(() => buildSortedSeasonList(seriesInfo), [seriesInfo]);
  const currentEpisodes = useMemo(
    () => getEpisodesForSeason(seriesInfo, selectedSeason),
    [seriesInfo, selectedSeason]
  );

  const nextEpisodeInfo = useMemo(() => {
    if (!seriesInfo || item?.stream_type !== 'series') return null;
    return findNextEpisodeToWatch(seriesInfo, isWatched, watchedList);
  }, [seriesInfo, item?.stream_type, isWatched, watchedList]);

  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-3">
        <div className="w-9 h-9 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-neutral-400">Carregando detalhes...</p>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="p-12 text-center space-y-4">
        <p className="text-base font-bold text-white">Título não encontrado no catálogo local.</p>
        <button
          type="button"
          data-tv-focusable="true"
          data-tv-focus="button"
          onClick={() => router.back()}
          className="px-5 py-2.5 rounded-xl bg-violet-600 text-white text-xs font-bold cursor-pointer"
        >
          Voltar
        </button>
      </div>
    );
  }

  const streamType = item.stream_type;
  const isSeries = streamType === 'series';
  const isMovie = streamType === 'movie';
  const favorited = isFavorite(item.stream_id, streamType);
  const watched = isWatched(item.stream_id, streamType);
  const movieDownloaded = isMovie && isDownloaded('movie', item.stream_id);

  const backdrop =
    enrichedMetadata?.backdropUrl ||
    seriesInfo?.info?.backdrop_path?.[0] ||
    item.stream_icon ||
    '';
  const poster = enrichedMetadata?.posterUrl || item.stream_icon || '';
  const overview =
    enrichedMetadata?.overview ||
    seriesInfo?.info?.plot ||
    (item as BaseStreamItem & { plot?: string }).plot ||
    'Sem sinopse disponível para este título.';
  const rating = enrichedMetadata?.rating || item.rating;
  const year = enrichedMetadata?.year || (item as BaseStreamItem & { year?: string }).year;
  const runtime = seriesInfo?.info?.episode_run_time;
  const genres =
    enrichedMetadata?.genres && enrichedMetadata.genres.length > 0
      ? enrichedMetadata.genres
      : item.category_name
      ? [cleanCategoryName(item.category_name) || item.category_name]
      : [];

  const primaryWatchUrl =
    isSeries && nextEpisodeInfo
      ? getTvWatchUrl('series', item.stream_id, nextEpisodeInfo.id, nextEpisodeInfo.seasonNumber)
      : isSeries && currentEpisodes[0]
      ? getTvWatchUrl('series', item.stream_id, currentEpisodes[0].id, selectedSeason)
      : getTvWatchUrl(streamType, item.stream_id);

  const primaryWatchLabel =
    isSeries && nextEpisodeInfo
      ? `Assistir T${nextEpisodeInfo.seasonNumber}:E${nextEpisodeInfo.episode_num}`
      : 'Assistir Agora';

  const handleToggleFavorite = () => {
    if (favorited) {
      removeFavorite(item.stream_id, streamType);
    } else {
      addFavorite({
        streamId: item.stream_id,
        streamType,
        title: item.title || item.name,
        posterUrl: poster,
        categoryName: item.category_name,
        rating,
      });
    }
  };

  const handleToggleWatched = () => {
    if (watched) {
      removeWatched(item.stream_id, streamType);
    } else {
      markWatched(item.stream_id, streamType, item.title || item.name, true, {
        posterUrl: poster,
        categoryName: item.category_name,
        rating,
      });
    }
  };

  const handleMovieDownload = async () => {
    if (!isMovie) return;
    if (movieDownloaded) {
      if (confirm('Remover este filme dos downloads offline?')) {
        await deleteOfflineItem('movie', item.stream_id);
      }
      return;
    }
    if (!config?.server_url) return;
    setDownloadingMovie(true);
    try {
      const host = getEffectiveStreamHost(config.server_url);
      const ext = (item.container_extension || 'mp4').replace(/^\./, '').trim() || 'mp4';
      const url = `${host}/movie/${config.username}/${config.password}/${item.stream_id}.${ext}`;
      await downloadVideoForOffline(
        {
          stream_id: item.stream_id,
          stream_type: 'movie',
          title: item.title || item.name,
          poster_url: poster,
          container_extension: ext,
          rating,
          genre: genres.join(', '),
        },
        url
      );
      await refreshDownloads();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Não foi possível iniciar o download.';
      alert(msg);
    } finally {
      setDownloadingMovie(false);
    }
  };

  return (
    <div className="pb-16" data-tv-zone="content">
      {/* HERO FULL-BLEED CINEMATOGRÁFICO */}
      <section className="relative w-full min-h-[460px] lg:min-h-[520px] flex items-end overflow-hidden bg-black border-b border-white/10">
        {backdrop && (
          <div className="absolute inset-0">
            <img
              src={backdrop}
              alt=""
              className="w-full h-full object-cover object-center opacity-55 scale-[1.02]"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#08090d] via-[#08090d]/65 to-black/30" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#08090d] via-[#08090d]/85 to-transparent" />
          </div>
        )}

        <div className="relative z-10 w-full p-6 sm:p-10 lg:p-12 flex flex-col md:flex-row items-start md:items-end gap-6 lg:gap-8">
          {/* Pôster */}
          <div className="hidden sm:block w-40 lg:w-48 aspect-[3/4] rounded-2xl overflow-hidden bg-[#12131c] border border-white/15 shadow-2xl shrink-0">
            <ImageWithFallback
              src={poster}
              alt={item.title || item.name}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Informações & Ações */}
          <div className="flex-1 min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                tabIndex={0}
                data-tv-focusable="true"
                data-tv-focus="pill"
                onClick={() => router.back()}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Voltar</span>
              </button>

              <span className="px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider bg-violet-600/30 text-violet-200 border border-violet-500/40 flex items-center gap-1">
                {isSeries ? <Video className="w-3.5 h-3.5" /> : isMovie ? <Film className="w-3.5 h-3.5" /> : <Tv className="w-3.5 h-3.5" />}
                {isSeries ? 'Série' : isMovie ? 'Filme' : 'Ao Vivo'}
              </span>

              {year && (
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white/10 text-neutral-200 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-violet-400" />
                  {year}
                </span>
              )}

              {runtime && (
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white/10 text-neutral-200 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-violet-400" />
                  {runtime} min
                </span>
              )}

              {rating && Number(rating) > 0 ? (
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  {Number(rating).toFixed(1)}
                </span>
              ) : null}
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight">
              {item.title || item.name}
            </h1>

            {genres.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {genres.slice(0, 4).map((g) => (
                  <span
                    key={g}
                    className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/5 border border-white/10 text-neutral-300"
                  >
                    {g}
                  </span>
                ))}
                {item.category_id && (
                  <Link
                    href={getTvCatalogUrl(streamType, String(item.category_id))}
                    tabIndex={0}
                    data-tv-focusable="true"
                    data-tv-focus="pill"
                    className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-violet-600/20 border border-violet-500/30 text-violet-300 hover:text-white flex items-center gap-1"
                  >
                    <Layers className="w-3 h-3" />
                    <span>Explorar categoria</span>
                  </Link>
                )}
              </div>
            )}

            <p className="text-xs sm:text-sm text-neutral-200/90 max-w-3xl leading-relaxed line-clamp-4">
              {overview}
            </p>

            {/* Barra de Ações */}
            <div className="flex flex-wrap items-center gap-3 pt-2" data-tv-row="true">
              <Link
                href={primaryWatchUrl}
                tabIndex={0}
                data-tv-focusable="true"
                data-tv-focus="button"
                data-tv-autofocus="true"
                className="px-7 py-3.5 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-black shadow-xl shadow-violet-600/40 flex items-center gap-2.5"
              >
                <Play className="w-5 h-5 fill-white" />
                <span>{primaryWatchLabel}</span>
              </Link>

              {enrichedMetadata?.trailerUrl && (
                <button
                  type="button"
                  tabIndex={0}
                  data-tv-focusable="true"
                  data-tv-focus="button"
                  onClick={() => setIsTrailerOpen(true)}
                  className="px-5 py-3.5 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/15 text-white text-sm font-bold flex items-center gap-2 cursor-pointer"
                >
                  <Film className="w-4 h-4 text-violet-300" />
                  <span>Trailer</span>
                </button>
              )}

              <button
                type="button"
                tabIndex={0}
                data-tv-focusable="true"
                data-tv-focus="button"
                onClick={handleToggleFavorite}
                className={`px-5 py-3.5 rounded-2xl border text-sm font-bold flex items-center gap-2 cursor-pointer ${
                  favorited
                    ? 'bg-rose-600/25 border-rose-500/50 text-rose-200'
                    : 'bg-white/10 hover:bg-white/20 border-white/15 text-white'
                }`}
              >
                <Heart className={`w-4 h-4 ${favorited ? 'fill-rose-500 text-rose-400' : ''}`} />
                <span>{favorited ? 'Favorito' : 'Favoritar'}</span>
              </button>

              {streamType !== 'live' && (
                <button
                  type="button"
                  tabIndex={0}
                  data-tv-focusable="true"
                  data-tv-focus="button"
                  onClick={handleToggleWatched}
                  className={`px-5 py-3.5 rounded-2xl border text-sm font-bold flex items-center gap-2 cursor-pointer ${
                    watched
                      ? 'bg-emerald-600/25 border-emerald-500/50 text-emerald-200'
                      : 'bg-white/10 hover:bg-white/20 border-white/15 text-white'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{watched ? 'Concluído' : 'Marcar Concluído'}</span>
                </button>
              )}

              {isNative && isMovie && (
                <button
                  type="button"
                  tabIndex={0}
                  data-tv-focusable="true"
                  data-tv-focus="button"
                  disabled={downloadingMovie}
                  onClick={handleMovieDownload}
                  className={`px-5 py-3.5 rounded-2xl border text-sm font-bold flex items-center gap-2 cursor-pointer ${
                    movieDownloaded
                      ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-200'
                      : 'bg-white/10 hover:bg-white/20 border-white/15 text-white'
                  }`}
                >
                  {movieDownloaded ? <Trash2 className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                  <span>
                    {downloadingMovie
                      ? 'Iniciando...'
                      : movieDownloaded
                      ? 'Baixado Offline'
                      : 'Baixar'}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="px-6 sm:px-10 lg:px-12 pt-8 space-y-10">
        {/* TEMPORADAS E EPISÓDIOS (PARA SÉRIES) */}
        {isSeries && (
          <section className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-xl font-black text-white">Episódios</h2>
              {loadingSeries && (
                <span className="text-xs text-violet-400 animate-pulse">
                  Carregando temporadas...
                </span>
              )}
            </div>

            {/* Pílulas Horizontais de Temporadas (muito mais fáceis no controle remoto) */}
            {seasonList.length > 0 && (
              <div className="tv-scroll-row flex items-center gap-2 overflow-x-auto pb-2" data-tv-row="true">
                {seasonList.map((season) => {
                  const sNum = String(season.season_number);
                  const active = sNum === String(selectedSeason);
                  return (
                    <button
                      key={sNum}
                      type="button"
                      tabIndex={0}
                      data-tv-focusable="true"
                      data-tv-focus="pill"
                      onClick={() => setSelectedSeason(sNum)}
                      className={`px-4 py-2 rounded-full text-xs font-bold border whitespace-nowrap cursor-pointer transition ${
                        active
                          ? 'bg-violet-600 text-white border-violet-400 shadow-lg shadow-violet-600/30'
                          : 'bg-white/5 hover:bg-white/15 text-neutral-300 border-white/10'
                      }`}
                    >
                      {season.name || `Temporada ${sNum}`} ({season.episode_count ?? 0})
                    </button>
                  );
                })}
              </div>
            )}

            {/* Lista Larga de Episódios estilo Netflix */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {currentEpisodes.map((ep) => {
                const epMeta = seasonEpisodesMeta[Number(ep.episode_num)];
                const epThumb =
                  epMeta?.thumbnailUrl ||
                  ep.info?.movie_image ||
                  ep.info?.cover_big ||
                  backdrop;
                const epWatched = isWatched(String(ep.id), 'series');
                const epTitle = formatEpisodeTitle(
                  ep.episode_num,
                  selectedSeason,
                  epMeta?.name || ep.title
                );

                return (
                  <Link
                    key={ep.id}
                    href={getTvWatchUrl('series', item.stream_id, ep.id, selectedSeason)}
                    tabIndex={0}
                    data-tv-focusable="true"
                    data-tv-focus="card"
                    className={`tv-card group flex items-center gap-4 p-3 rounded-2xl bg-[#12131c] border transition focus:outline-none ${
                      epWatched ? 'border-emerald-500/60' : 'border-white/10'
                    }`}
                  >
                    <div className="relative w-36 sm:w-44 aspect-video rounded-xl overflow-hidden bg-black shrink-0">
                      <ImageWithFallback
                        src={epThumb}
                        alt={epTitle}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/35 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity">
                        <div className="w-10 h-10 rounded-full bg-violet-600 text-white flex items-center justify-center shadow-lg">
                          <Play className="w-4 h-4 fill-white ml-0.5" />
                        </div>
                      </div>
                      {epWatched && (
                        <div className="absolute top-1.5 right-1.5 p-1 rounded-md bg-emerald-600 text-white">
                          <CheckCircle2 className="w-3 h-3" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0 space-y-1">
                      <h3 className="text-sm font-bold text-white line-clamp-1 group-focus:text-violet-300">
                        {epTitle}
                      </h3>
                      {(epMeta?.overview || ep.info?.plot) && (
                        <p className="text-xs text-neutral-400 line-clamp-2 leading-relaxed">
                          {epMeta?.overview || ep.info?.plot}
                        </p>
                      )}
                      {ep.info?.duration && (
                        <span className="inline-block text-[11px] font-semibold text-neutral-500">
                          {ep.info.duration}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* ELENCO */}
        {enrichedMetadata?.cast && enrichedMetadata.cast.length > 0 && (
          <section className="space-y-3" data-tv-row="true">
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-violet-400" />
              <span>Elenco Principal</span>
            </h2>
            <div className="tv-scroll-row flex items-stretch gap-3 overflow-x-auto pb-2">
              {enrichedMetadata.cast.slice(0, 12).map((actor, idx) => (
                <div
                  key={`${actor.name}_${idx}`}
                  className="w-32 flex-none rounded-2xl bg-[#12131c] border border-white/10 p-2.5 text-center space-y-2"
                >
                  <div className="w-16 h-16 rounded-full overflow-hidden mx-auto bg-black border border-white/10">
                    <ImageWithFallback
                      src={actor.profileUrl}
                      alt={actor.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <p className="text-xs font-bold text-white line-clamp-1">{actor.name}</p>
                  {actor.character && (
                    <p className="text-[10px] text-neutral-400 line-clamp-1">{actor.character}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* TÍTULOS RELACIONADOS */}
        {related.length > 0 && (
          <TvHorizontalRow
            title="Títulos Semelhantes"
            icon={<Layers className="w-5 h-5 text-violet-400" />}
          >
            {related.map((rel) => (
              <div
                key={`${rel.stream_type}_${rel.stream_id}`}
                className={
                  rel.stream_type === 'live'
                    ? 'w-[220px] flex-none'
                    : 'w-[165px] sm:w-[180px] flex-none'
                }
              >
                <TvMediaCard item={rel} />
              </div>
            ))}
          </TvHorizontalRow>
        )}
      </div>

      {/* MODAL DE TRAILER */}
      {isTrailerOpen && enrichedMetadata?.trailerUrl && (
        <div
          data-tv-modal="true"
          className="fixed inset-0 z-[1100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6"
        >
          <div className="w-full max-w-4xl bg-[#11121c] border border-white/15 rounded-3xl overflow-hidden shadow-2xl">
            <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between">
              <span className="text-sm font-bold text-white">
                Trailer — {item.title || item.name}
              </span>
              <button
                type="button"
                tabIndex={0}
                data-tv-focusable="true"
                data-tv-focus="button"
                data-tv-autofocus="true"
                onClick={() => setIsTrailerOpen(false)}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white flex items-center gap-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
                <span>Fechar</span>
              </button>
            </div>
            <div className="aspect-video w-full bg-black">
              <iframe
                src={enrichedMetadata.trailerUrl}
                title="Trailer"
                className="w-full h-full border-0"
                allow="autoplay; encrypted-media; fullscreen"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
