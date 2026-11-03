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
  Sparkles,
  Layers,
  Clock,
  ChevronDown,
  Film,
  Tv,
  Users,
  Video,
  X,
  ExternalLink,
  Calendar,
  AlertCircle,
  Search,
  Languages,
  Eye,
} from 'lucide-react';
import { localDB, getSavedIPTVConfig } from '@/lib/db-local';
import { fetchIPTVApi } from '@/lib/iptv-client';
import {
  BaseStreamItem,
  StreamType,
  SeriesInfoResponse,
  SeriesEpisode,
  SeriesSeason,
  EnrichedMetadata,
  EnrichedEpisodeMetadata,
  SeasonOfficialMetadata,
} from '@/lib/types';
import { getWatchUrl, getRouteType } from '@/lib/routes';
import { buildSortedSeasonList, getDefaultSeason, getEpisodesForSeason, formatEpisodeTitle, isSpecialSeason } from '@/lib/series';
import { useFavorites } from '@/hooks/useFavorites';
import { useWatched } from '@/hooks/useWatched';
import MediaCard from '@/components/media/MediaCard';
import ImageWithFallback from '@/components/ui/ImageWithFallback';

interface InfoViewProps {
  type: string;
  id: string;
}

export default function InfoView({ type, id }: InfoViewProps) {
  const router = useRouter();

  const [item, setItem] = useState<BaseStreamItem | null>(null);
  const [related, setRelated] = useState<BaseStreamItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Estados de episódios para Séries
  const [seriesInfo, setSeriesInfo] = useState<SeriesInfoResponse | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<string>('1');
  const [isSeasonDropdownOpen, setIsSeasonDropdownOpen] = useState(false);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [seasonEpisodesMeta, setSeasonEpisodesMeta] = useState<Record<string | number, EnrichedEpisodeMetadata>>({});
  const [seasonOfficialMeta, setSeasonOfficialMeta] = useState<SeasonOfficialMetadata | null>(null);

  // Metadados enriquecidos (TMDb / Kitsu / TVMaze)
  const [enrichedMetadata, setEnrichedMetadata] = useState<EnrichedMetadata | null>(null);
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const [isTrailerModalOpen, setIsTrailerModalOpen] = useState(false);

  const { isFavorite, addFavorite, removeFavorite } = useFavorites();
  const { isWatched, markWatched, removeWatched } = useWatched();

  // 1. Carrega dados do item no banco local ou busca fallback
  useEffect(() => {
    let isMounted = true;
    async function loadItem() {
      if (!localDB) return;
      try {
        const targetType: StreamType =
          type === 'series'
            ? 'series'
            : type === 'movies' || type === 'movie'
            ? 'movie'
            : 'live';

        // 1. Tenta buscar pela chave composta primária (stream_type + stream_id) para evitar colisões de ID
        let found = await localDB.streams.get(`${targetType}_${id}`);

        // 2. Se não encontrar pela chave primária, busca filtrando estritamente pelo stream_type correto
        if (!found) {
          found = await localDB.streams
            .where('stream_id')
            .equals(String(id))
            .filter((s) => s.stream_type === targetType)
            .first();
        }

        // 3. Fallback amplo caso não encontre
        if (!found) {
          found = await localDB.streams.where('stream_id').equals(String(id)).first();
        }

        const savedCfg = await getSavedIPTVConfig();

        if (!isMounted) return;

        if (found) {
          setItem(found as unknown as BaseStreamItem);

          if (found.category_id) {
            let sameCategory = await localDB.streams
              .where('category_id')
              .equals(found.category_id)
              .filter((s) => s.stream_id !== id && s.stream_type === found.stream_type)
              .limit(12)
              .toArray();

            // Se a categoria tiver menos de 12 itens, complementa com itens do mesmo tipo
            if (sameCategory.length < 12) {
              const more = await localDB.streams
                .where('stream_type')
                .equals(found.stream_type)
                .filter((s) => s.stream_id !== id && !sameCategory.some((item) => item.stream_id === s.stream_id))
                .limit(12 - sameCategory.length)
                .toArray();
              sameCategory = [...sameCategory, ...more];
            }

            if (isMounted) setRelated(sameCategory as unknown as BaseStreamItem[]);
          } else {
            const sameType = await localDB.streams
              .where('stream_type')
              .equals(found.stream_type)
              .filter((s) => s.stream_id !== id)
              .limit(12)
              .toArray();
            if (isMounted) setRelated(sameType as unknown as BaseStreamItem[]);
          }

          // Se for série, busca temporadas e episódios
          if (found.stream_type === 'series' && savedCfg) {
            setLoadingSeries(true);
            try {
              const sData: SeriesInfoResponse = await fetchIPTVApi(savedCfg, {
                action: 'get_series_info',
                params: { series_id: found.stream_id },
              });

              if (sData && isMounted) {
                setSeriesInfo(sData);
                const sorted = buildSortedSeasonList(sData);
                setSelectedSeason(getDefaultSeason(sorted));
              }
            } catch (err) {
              console.error('Erro ao carregar capítulos da série:', err);
            } finally {
              if (isMounted) setLoadingSeries(false);
            }
          }
        } else if (savedCfg && type === 'series') {
          // Fallback se não estiver no Dexie
          setLoadingSeries(true);
          try {
            const sData: SeriesInfoResponse = await fetchIPTVApi(savedCfg, {
              action: 'get_series_info',
              params: { series_id: id },
            });

            if (sData && isMounted) {
              setSeriesInfo(sData);
              setItem({
                stream_id: String(id),
                name: sData.info?.name || sData.info?.title || 'Série',
                title: sData.info?.name || sData.info?.title || 'Série',
                stream_type: 'series',
                stream_icon: sData.info?.cover,
                category_name: sData.info?.genre || 'Séries',
              });
              const sorted = buildSortedSeasonList(sData);
              setSelectedSeason(getDefaultSeason(sorted));
            }
          } catch (err) {
            console.error('Erro ao buscar detalhes da série no servidor:', err);
          } finally {
            if (isMounted) setLoadingSeries(false);
          }
        }
      } catch (e) {
        console.error('Erro ao buscar detalhes:', e);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadItem();
    return () => {
      isMounted = false;
    };
  }, [id, type]);

  // 2. Busca Metadados Gratuitos Enriquecidos (TMDb / Kitsu / TVMaze)
  useEffect(() => {
    if (!item?.title && !item?.name) return;

    let isMounted = true;
    async function fetchMetadata() {
      setLoadingMetadata(true);
      try {
        const titleToSearch = item!.title || item!.name;
        const categoryParam = item!.category_name ? `&category=${encodeURIComponent(item!.category_name)}` : '';
        const res = await fetch(
          `/api/metadata?title=${encodeURIComponent(titleToSearch)}&type=${item!.stream_type}${categoryParam}`
        );

        if (res.ok && isMounted) {
          const data: EnrichedMetadata = await res.json();
          if (data.source !== 'none') {
            setEnrichedMetadata(data);
          }
        }
      } catch (err) {
        console.warn('Erro ao carregar metadados adicionais:', err);
      } finally {
        if (isMounted) setLoadingMetadata(false);
      }
    }

    fetchMetadata();
    return () => {
      isMounted = false;
    };
  }, [item?.title, item?.name, item?.stream_type]);

  // 3. Busca Metadados de Cada Episódio da Temporada Ativa (TMDb: Nome, Sinopse, Data e Thumb)
  useEffect(() => {
    if (type !== 'series' && item?.stream_type !== 'series') return;
    if (!item?.title && !item?.name) return;

    let isMounted = true;
    async function loadSeasonEpisodesMetadata() {
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
          const data: SeasonOfficialMetadata = await res.json();
          if (data.episodes) {
            setSeasonEpisodesMeta(data.episodes);
          }
          setSeasonOfficialMeta(data);
        }
      } catch (err) {
        console.warn('Erro ao carregar metadados dos episódios da temporada:', err);
      }
    }

    setSeasonOfficialMeta(null);
    loadSeasonEpisodesMetadata();
    return () => {
      isMounted = false;
    };
  }, [item?.title, item?.name, item?.stream_type, selectedSeason, enrichedMetadata?.tmdbId, type]);

  const seasonList: SeriesSeason[] = useMemo(() => {
    return buildSortedSeasonList(seriesInfo);
  }, [seriesInfo]);

  const activeSeasonData = useMemo(() => {
    return seasonList.find((s) => String(s.season_number) === String(selectedSeason));
  }, [seasonList, selectedSeason]);

  const currentSeasonEpisodes: SeriesEpisode[] = useMemo(() => {
    return getEpisodesForSeason(seriesInfo, selectedSeason);
  }, [seriesInfo, selectedSeason]);

  // Soma de todos os episódios de temporadas regulares disponíveis no servidor (excluindo Especiais)
  const totalRegularEpisodes = useMemo(() => {
    if (!seasonList || seasonList.length === 0) return 0;
    return seasonList
      .filter((s) => !isSpecialSeason(s))
      .reduce((acc, s) => acc + (s.episode_count || 0), 0);
  }, [seasonList]);

  // Comparação de disponibilidade da SÉRIE COMPLETA (soma de todos os episódios sem especiais vs lançamentos oficiais)
  const seriesComparison = useMemo(() => {
    if (type !== 'series' && item?.stream_type !== 'series') return null;

    const availableCount = totalRegularEpisodes;
    const officialCount =
      enrichedMetadata?.totalEpisodes ||
      seasonOfficialMeta?.showTotalEpisodes ||
      seasonOfficialMeta?.officialEpisodeCount ||
      0;
    const releasedCount =
      seasonOfficialMeta?.releasedEpisodeCount && seasonOfficialMeta.releasedEpisodeCount > availableCount
        ? seasonOfficialMeta.releasedEpisodeCount
        : officialCount;

    if (officialCount === 0) {
      return {
        hasOfficialData: false,
        availableCount,
        officialCount: 0,
        releasedCount: 0,
        isComplete: true,
        isUpToDate: true,
        missingOfficial: 0,
        missingAired: 0,
        badgeLabel: 'Disponível',
        badgeClass: 'bg-white/10 text-neutral-300 border-white/10',
        statusText: `${availableCount} episódios regulares catalogados no servidor IPTV (sem contar especiais).`,
      };
    }

    const isComplete = availableCount >= officialCount;
    const isUpToDate = availableCount >= releasedCount;
    const missingOfficial = Math.max(0, officialCount - availableCount);
    const missingAired = Math.max(0, releasedCount - availableCount);

    let statusText = '';
    let badgeLabel = '';
    let badgeClass = '';

    if (isComplete) {
      badgeLabel = 'Série Completa';
      badgeClass = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      statusText = `Todos os ${officialCount} episódios oficiais da série lançados estão disponíveis no servidor IPTV (100% Completa, sem contar especiais).`;
    } else if (isUpToDate) {
      badgeLabel = 'Em Lançamento (Em Dia)';
      badgeClass = 'bg-sky-500/20 text-sky-300 border-sky-500/40';
      statusText = `O servidor possui todos os ${releasedCount} episódios já exibidos oficialmente da série. Mais episódios ainda serão lançados na TV.`;
    } else {
      badgeLabel = 'Série Incompleta';
      badgeClass = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      statusText = `Disponíveis ${availableCount} de ${officialCount} episódios oficiais da série no servidor IPTV (excluindo especiais). Faltam ${missingOfficial} episódio${missingOfficial > 1 ? 's' : ''}.${releasedCount < officialCount ? ` (${releasedCount} já foram ao ar).` : ''}`;
    }

    return {
      hasOfficialData: true,
      availableCount,
      officialCount,
      releasedCount,
      isComplete,
      isUpToDate,
      missingOfficial,
      missingAired,
      badgeLabel,
      badgeClass,
      statusText,
    };
  }, [type, item?.stream_type, totalRegularEpisodes, enrichedMetadata?.totalEpisodes, seasonOfficialMeta]);

  // Lista de sinônimos/aliases que não repetem os títulos principais já exibidos
  const otherAliases = useMemo(() => {
    if (!enrichedMetadata?.aliases || enrichedMetadata.aliases.length === 0) return [];
    const mainTitles = [
      (item?.title || '').toLowerCase().trim(),
      (item?.name || '').toLowerCase().trim(),
      (enrichedMetadata.titlePortuguese || '').toLowerCase().trim(),
      (enrichedMetadata.titleEnglish || '').toLowerCase().trim(),
      (enrichedMetadata.titleRomanized || '').toLowerCase().trim(),
      (enrichedMetadata.originalTitle || '').toLowerCase().trim(),
    ].filter(Boolean);

    return enrichedMetadata.aliases.filter((alias) => {
      const a = alias.toLowerCase().trim();
      return a.length > 1 && !mainTitles.includes(a);
    });
  }, [item?.title, item?.name, enrichedMetadata]);

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center gap-3">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-neutral-400 font-medium">Carregando detalhes do título...</p>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center space-y-4">
        <h2 className="text-xl font-bold text-white">Título não encontrado no catálogo</h2>
        <p className="text-xs text-neutral-400">
          O item selecionado pode ter sido removido ou sua lista precisa ser sincronizada.
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

  const streamType = item.stream_type as StreamType;
  const isSeries = streamType === 'series';
  const favorited = isFavorite(item.stream_id, streamType);
  const watched = isWatched(item.stream_id, streamType);

  // Imagens priorizadas com alta definição (Backdrop e Poster)
  const backdropImage = enrichedMetadata?.backdropUrl || item.stream_icon;
  const posterImage = enrichedMetadata?.posterUrl || item.stream_icon;
  const heroImage = backdropImage || posterImage;

  // Sinopse consolidada
  const plotSynopsis =
    enrichedMetadata?.overview ||
    seriesInfo?.info?.plot ||
    (streamType === 'live'
      ? `Transmissão em alta definição ao vivo do canal ${item.title || item.name}. Acesse a reprodução instantânea com suporte a HLS e seleção de áudio/vídeo.`
      : streamType === 'movie'
      ? `Filme completo disponível sob demanda na categoria ${item.category_name}. Reproduza em qualidade máxima com controle de histórico e progresso.`
      : `Série completa disponível no catálogo com temporadas e episódios organizados sob demanda.`);

  // Gêneros consolidados
  const genresList = enrichedMetadata?.genres && enrichedMetadata.genres.length > 0
    ? enrichedMetadata.genres
    : item.category_name
    ? [item.category_name]
    : ['Geral'];

  // Nota consolidada
  const displayRating = enrichedMetadata?.rating || item.rating;

  // Link para o primeiro episódio se for série, ou stream direto
  const firstEpId = currentSeasonEpisodes[0]?.id;
  const watchUrl = isSeries && firstEpId
    ? getWatchUrl('series', item.stream_id, firstEpId)
    : getWatchUrl(streamType, item.stream_id);

  return (
    <div className="space-y-10 pb-16">
      {/* 1. Hero Backdrop Panorâmico com Fade Gradiente */}
      <section className="relative w-full min-h-[520px] sm:min-h-[560px] md:min-h-[500px] bg-neutral-950 flex items-end overflow-hidden">
        {heroImage ? (
          <div className="absolute inset-0">
            <img
              src={heroImage}
              alt={item.title || item.name}
              className="w-full h-full object-cover object-top sm:object-center md:filter md:blur-sm opacity-60 md:opacity-35 scale-100 md:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0b0c10] via-[#0b0c10]/75 md:via-[#0b0c10]/75 to-transparent" />
            <div className="hidden md:block absolute inset-0 bg-gradient-to-r from-[#0b0c10] via-[#0b0c10]/85 to-transparent" />
          </div>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-violet-950/20 via-[#0b0c10] to-[#0b0c10]" />
        )}

        {/* Botão Voltar integrado ao container principal (estilo WatchView) */}
        <div className="absolute top-6 inset-x-0 z-20 pointer-events-none">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <button
              onClick={() => {
                if (typeof window !== 'undefined' && window.history.length > 1) {
                  router.back();
                } else {
                  router.push(`/${getRouteType(streamType)}`);
                }
              }}
              className="pointer-events-auto p-2 sm:px-3 sm:py-2 rounded-xl bg-[#13141b]/80 hover:bg-[#1a1c26] text-neutral-300 hover:text-white border border-white/10 hover:border-violet-500/40 transition cursor-pointer backdrop-blur-md shadow-xl flex items-center gap-2 text-xs font-semibold"
              title="Voltar"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar</span>
            </button>
          </div>
        </div>

        {/* Conteúdo Principal do Resumo com padding-top ampliado no mobile */}
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10 pt-48 sm:pt-56 md:pt-0 w-full z-10">
          <div className="flex flex-col md:flex-row items-start md:items-end gap-6 sm:gap-8">
            {/* Poster Vertical 3:4 (oculto no mobile pois a imagem principal já compõe o background, visível no desktop) */}
            <div className="hidden md:block w-48 sm:w-56 aspect-[3/4] rounded-3xl overflow-hidden bg-black border-2 border-white/10 shadow-2xl shrink-0 relative group">
              <ImageWithFallback
                src={posterImage}
                alt={item.title}
                className="w-full h-full object-cover"
              />

              {watched && (
                <div className="absolute top-3 right-3 bg-neutral-950/90 text-emerald-400 p-1.5 rounded-full border border-emerald-500/40 shadow-lg">
                  <CheckCircle2 className="w-4 h-4 fill-emerald-500/20" />
                </div>
              )}
            </div>

            {/* Informações Textuais e Botões de Ação */}
            <div className="flex-1 space-y-4 text-left flex flex-col">
              {/* Título Principal & Títulos Multilíngues (Português, Inglês e Romaji) */}
              <div className="order-1 md:order-2 space-y-2">
                {/* Thumbnail Menor em cima do título no mobile */}
                <div className="md:hidden mb-3">
                  <div className="w-20 sm:w-24 aspect-[3/4] rounded-2xl overflow-hidden bg-black/80 border border-white/20 shadow-2xl relative group">
                    <ImageWithFallback
                      src={posterImage}
                      alt={item.title || item.name}
                      className="w-full h-full object-cover"
                      isSmallThumb={true}
                    />
                    {watched && (
                      <div className="absolute top-1.5 right-1.5 bg-neutral-950/90 text-emerald-400 p-1 rounded-full border border-emerald-500/40 shadow-lg">
                        <CheckCircle2 className="w-3 h-3 fill-emerald-500/20" />
                      </div>
                    )}
                  </div>
                </div>

                <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight leading-tight">
                  {item.title || item.name}
                </h1>

                {/* Badges de Títulos Multilíngues (ocultos na visualização mobile conforme solicitado) */}
                {(enrichedMetadata?.titlePortuguese ||
                  enrichedMetadata?.titleEnglish ||
                  enrichedMetadata?.titleRomanized ||
                  enrichedMetadata?.originalTitle ||
                  otherAliases.length > 0) && (
                  <div className="hidden md:flex flex-wrap items-center justify-start gap-2 pt-0.5">
                    {/* Título em Português */}
                    {enrichedMetadata?.titlePortuguese &&
                      enrichedMetadata.titlePortuguese.toLowerCase().trim() !==
                        (item.title || item.name || '').toLowerCase().trim() && (
                        <div
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-300 backdrop-blur-sm"
                          title="Título oficial em Português (Brasil)"
                        >
                          <span className="font-extrabold text-[9px] uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-200 tracking-wider">
                            PT-BR
                          </span>
                          <span className="font-semibold">{enrichedMetadata.titlePortuguese}</span>
                        </div>
                      )}

                    {/* Título em Inglês */}
                    {enrichedMetadata?.titleEnglish &&
                      enrichedMetadata.titleEnglish.toLowerCase().trim() !==
                        (item.title || item.name || '').toLowerCase().trim() && (
                        <div
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-indigo-500/10 border border-indigo-500/25 text-xs text-indigo-300 backdrop-blur-sm"
                          title="Título oficial em Inglês (Global)"
                        >
                          <span className="font-extrabold text-[9px] uppercase px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-200 tracking-wider">
                            EN
                          </span>
                          <span className="font-semibold">{enrichedMetadata.titleEnglish}</span>
                        </div>
                      )}

                    {/* Título Romanizado / Japonês Original */}
                    {(enrichedMetadata?.titleRomanized || enrichedMetadata?.originalTitle) &&
                      (enrichedMetadata.titleRomanized || enrichedMetadata?.originalTitle)
                        ?.toLowerCase()
                        .trim() !== (item.title || item.name || '').toLowerCase().trim() && (
                        <div
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-300 backdrop-blur-sm"
                          title="Título original Romanizado / Japonês"
                        >
                          <span className="font-extrabold text-[9px] uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 tracking-wider">
                            ROMAJI / JP
                          </span>
                          <span className="font-semibold italic">
                            {enrichedMetadata.titleRomanized || enrichedMetadata.originalTitle}
                          </span>
                        </div>
                      )}

                    {/* Sinônimos & Abreviações de Busca (ex: AoT, SnK, etc) - Clicáveis para buscar no catálogo */}
                    {otherAliases.slice(0, 4).map((alias) => (
                      <button
                        key={`alias_${alias}`}
                        onClick={() => router.push(`/search?q=${encodeURIComponent(alias)}`)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-neutral-300 hover:text-white transition cursor-pointer"
                        title={`Pesquisar por "${alias}" no catálogo`}
                      >
                        <Search className="w-3 h-3 text-neutral-400" />
                        <span className="font-medium">{alias}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Badges de Categoria, Ano, Status e API de Origem (abaixo do nome no mobile) */}
              <div className="order-2 md:order-1 flex flex-wrap items-center justify-start gap-2">
                <span className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider bg-violet-600 text-white shadow-md shadow-violet-600/30">
                  {streamType === 'live' ? 'TV ao Vivo' : streamType === 'movie' ? 'Filme' : 'Série'}
                </span>

                {genresList.slice(0, 3).map((genre) => (
                  <span
                    key={`genre_${genre}`}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white/10 text-neutral-300 border border-white/10 backdrop-blur-md"
                  >
                    {genre}
                  </span>
                ))}

                {displayRating && (
                  <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> {displayRating}
                  </span>
                )}

                {enrichedMetadata?.year && (
                  <span className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white/5 text-neutral-400 border border-white/5">
                    {enrichedMetadata.year}
                  </span>
                )}

                {enrichedMetadata?.status && (
                  <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    {enrichedMetadata.status}
                  </span>
                )}

                {enrichedMetadata?.source && enrichedMetadata.source !== 'none' && (
                  <span className="px-2 py-0.5 rounded text-[9px] font-extrabold uppercase bg-violet-950/60 text-violet-300 border border-violet-500/30">
                    Dados via {enrichedMetadata.source.toUpperCase()}
                  </span>
                )}

                {/* Badge de Comparação de Episódios da Série: Completa vs Em Lançamento */}
                {isSeries && seriesComparison?.hasOfficialData && (
                  <span
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border flex items-center gap-1.5 ${seriesComparison.badgeClass}`}
                    title={seriesComparison.statusText}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                    {seriesComparison.badgeLabel} ({seriesComparison.availableCount}/{seriesComparison.officialCount} eps)
                  </span>
                )}
              </div>

              {/* Sinopse Completa */}
              <p className="order-3 text-xs sm:text-sm text-neutral-300 max-w-3xl leading-relaxed line-clamp-4">
                {plotSynopsis}
              </p>

              {/* Botões de Ação estilo Miruro (ícones circulares no mobile) */}
              <div className="order-4 flex flex-wrap items-center justify-start gap-3 pt-2">
                {/* Botão Assistir Agora */}
                <Link
                  href={watchUrl}
                  title="Assistir Agora"
                  aria-label="Assistir Agora"
                  className="w-12 h-12 rounded-full md:w-auto md:h-auto md:rounded-2xl md:px-8 md:py-3.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-extrabold shadow-xl shadow-violet-600/40 hover:scale-105 transition-all flex items-center justify-center gap-2 cursor-pointer border border-violet-500/30 shrink-0"
                >
                  <Play className="w-5 h-5 fill-white md:w-4 md:h-4 ml-0.5 md:ml-0" />
                  <span className="hidden md:inline">Assistir Agora</span>
                </Link>

                {/* Botão Trailer do YouTube (quando disponível via TMDb ou Kitsu) */}
                {enrichedMetadata?.trailerEmbedUrl && (
                  <button
                    onClick={() => setIsTrailerModalOpen(true)}
                    title="Ver Trailer"
                    aria-label="Ver Trailer"
                    className="w-12 h-12 rounded-full md:w-auto md:h-auto md:rounded-2xl md:px-5 md:py-3.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-rose-600/10 shrink-0"
                  >
                    <Video className="w-5 h-5 md:w-4 md:h-4 text-rose-400" />
                    <span className="hidden md:inline">Ver Trailer</span>
                  </button>
                )}

                {/* Botão Favoritar */}
                <button
                  onClick={() => {
                    if (favorited) {
                      removeFavorite(item.stream_id, streamType);
                    } else {
                      addFavorite({
                        streamId: item.stream_id,
                        streamType,
                        title: item.title || item.name,
                        posterUrl: posterImage,
                        categoryName: item.category_name,
                        rating: displayRating,
                      });
                    }
                  }}
                  title={favorited ? 'Remover dos Favoritos' : 'Adicionar aos Favoritos'}
                  aria-label={favorited ? 'Remover dos Favoritos' : 'Adicionar aos Favoritos'}
                  className={`w-12 h-12 rounded-full md:w-auto md:h-auto md:rounded-2xl md:px-5 md:py-3.5 border text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shrink-0 ${
                    favorited
                      ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                      : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Heart className={`w-5 h-5 md:w-4 md:h-4 ${favorited ? 'fill-rose-500 text-rose-500' : ''}`} />
                  <span className="hidden md:inline">{favorited ? 'Favoritado' : 'Adicionar aos Favoritos'}</span>
                </button>

                {/* Botão Marcar Concluído */}
                <button
                  onClick={() => {
                    if (watched) {
                      removeWatched(item.stream_id, streamType);
                    } else {
                      markWatched(item.stream_id, streamType, item.title || item.name, true, {
                        posterUrl: posterImage,
                        categoryName: item.category_name,
                        rating: displayRating || item.rating,
                      });
                    }
                  }}
                  title={watched ? 'Desmarcar concluído' : 'Marcar como concluído'}
                  aria-label={watched ? 'Desmarcar concluído' : 'Marcar como concluído'}
                  className={`w-12 h-12 rounded-full md:w-auto md:h-auto md:rounded-2xl md:px-4 md:py-3.5 border text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shrink-0 ${
                    watched
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                      : 'bg-white/5 border-white/10 text-neutral-400 hover:bg-white/10 hover:text-neutral-200'
                  }`}
                >
                  <CheckCircle2 className={`w-5 h-5 md:w-4 md:h-4 ${watched ? 'fill-emerald-500/20 text-emerald-400' : ''}`} />
                  <span className="hidden md:inline">{watched ? 'Concluído' : 'Marcar Concluído'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Se for Série: Lista Completa de Temporadas e Episódios com DROPDOWN ELEGANTE */}
      {isSeries && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
            <div className="flex items-center gap-2.5">
              <Layers className="w-5 h-5 text-violet-400" />
              <div>
                <h2 className="text-lg font-bold text-white">Capítulos & Temporadas</h2>
                <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400 mt-0.5">
                  <span>
                    No servidor IPTV: <strong className="text-white">{totalRegularEpisodes} eps da série</strong> (sem especiais)
                  </span>
                  {seriesComparison?.hasOfficialData && (
                    <>
                      <span className="text-neutral-600">•</span>
                      <span>
                        Total oficial (TMDb): <strong className="text-violet-300">{seriesComparison.officialCount} eps</strong>
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Seletor Dropdown de Temporada - Tamanho padronizado e alinhado */}
            <div className="relative w-full sm:w-64">
              <button
                onClick={() => setIsSeasonDropdownOpen(!isSeasonDropdownOpen)}
                className="w-full h-11 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-bold border border-white/10 flex items-center justify-between gap-3 transition cursor-pointer shadow-lg"
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="w-2.5 h-2.5 rounded-full bg-violet-400 shrink-0" />
                  <span className="truncate">
                    {activeSeasonData?.name || `Temporada ${selectedSeason}`}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {activeSeasonData?.episode_count !== undefined ? (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-violet-600/30 text-violet-300 font-bold border border-violet-500/30">
                      {activeSeasonData.episode_count} eps
                    </span>
                  ) : null}
                  <ChevronDown
                    className={`w-4 h-4 text-neutral-400 transition-transform duration-200 ${
                      isSeasonDropdownOpen ? 'rotate-180 text-violet-400' : ''
                    }`}
                  />
                </div>
              </button>

              {/* Menu Suspenso de Temporadas - Largura padronizada idêntica à do botão */}
              {isSeasonDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-1.5 z-30 w-full bg-[#181924] border border-white/10 rounded-2xl shadow-2xl p-1.5 max-h-60 overflow-y-auto space-y-1 backdrop-blur-md">
                  {seasonList.map((season) => {
                    const isCurrent = String(season.season_number) === String(selectedSeason);
                    return (
                      <button
                        key={`dropdown_season_${season.season_number}`}
                        onClick={() => {
                          setSelectedSeason(String(season.season_number));
                          setIsSeasonDropdownOpen(false);
                        }}
                        className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between text-left transition cursor-pointer ${
                          isCurrent
                            ? 'bg-violet-600 text-white shadow-md'
                            : 'text-neutral-300 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <span className="truncate">{season.name || `Temporada ${season.season_number}`}</span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-bold shrink-0 ml-2 ${
                            isCurrent ? 'bg-violet-800 text-violet-200' : 'bg-white/5 text-neutral-400'
                          }`}
                        >
                          {season.episode_count ?? 0} eps
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Card de Comparação de Disponibilidade com Dados Oficiais do TMDb */}
          {seriesComparison?.hasOfficialData && (
            <div
              className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all shadow-lg ${
                seriesComparison.isComplete
                  ? 'bg-emerald-950/20 border-emerald-500/30'
                  : seriesComparison.isUpToDate
                  ? 'bg-sky-950/20 border-sky-500/30'
                  : 'bg-amber-950/20 border-amber-500/30'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`p-2.5 rounded-xl shrink-0 ${
                    seriesComparison.isComplete
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : seriesComparison.isUpToDate
                      ? 'bg-sky-500/20 text-sky-400'
                      : 'bg-amber-500/20 text-amber-400'
                  }`}
                >
                  {seriesComparison.isComplete ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <AlertCircle className="w-5 h-5" />
                  )}
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-xs sm:text-sm font-bold text-white">
                      Status da Série: {seriesComparison.badgeLabel}
                    </h4>
                    <span
                      className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border ${seriesComparison.badgeClass}`}
                    >
                      {seriesComparison.availableCount} / {seriesComparison.officialCount} EPS
                    </span>
                  </div>

                  <p className="text-xs text-neutral-300 mt-1 leading-relaxed">
                    {seriesComparison.statusText}
                  </p>
                </div>
              </div>

              {/* Barra de Progresso de Cobertura */}
              <div className="sm:text-right shrink-0 min-w-[150px] space-y-1.5 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/5">
                <div className="flex justify-between sm:justify-end gap-2 text-[11px] font-semibold">
                  <span className="text-neutral-400">Disponibilidade:</span>
                  <span
                    className={
                      seriesComparison.isComplete
                        ? 'text-emerald-400 font-bold'
                        : 'text-amber-400 font-bold'
                    }
                  >
                    {Math.min(
                      100,
                      Math.round(
                        (seriesComparison.availableCount / seriesComparison.officialCount) * 100
                      )
                    )}
                    %
                  </span>
                </div>
                <div className="w-full sm:w-36 h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      seriesComparison.isComplete
                        ? 'bg-emerald-500'
                        : seriesComparison.isUpToDate
                        ? 'bg-sky-500'
                        : 'bg-amber-500'
                    }`}
                    style={{
                      width: `${Math.min(
                        100,
                        (seriesComparison.availableCount / seriesComparison.officialCount) * 100
                      )}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Grid de Episódios */}
          {loadingSeries ? (
            <div className="p-12 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-3 border-violet-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-neutral-400">Carregando episódios da série...</p>
            </div>
          ) : currentSeasonEpisodes.length === 0 ? (
            <div className="p-8 rounded-2xl bg-[#13141b] border border-white/10 text-center text-xs text-neutral-400 space-y-1">
              <p className="font-semibold text-neutral-300">Nenhum episódio cadastrado para esta temporada.</p>
              <p className="text-[11px] text-neutral-500">
                O servidor do provedor IPTV não disponibilizou arquivos de vídeo para esta temporada.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {currentSeasonEpisodes.map((ep) => {
                const epWatched = isWatched(String(ep.id), 'series');
                const epMeta = seasonEpisodesMeta[Number(ep.episode_num)];
                const formattedTitle = formatEpisodeTitle(
                  ep.episode_num,
                  selectedSeason,
                  epMeta?.name || ep.title
                );
                const thumbUrl =
                  epMeta?.thumbnailUrl ||
                  ep.info?.movie_image ||
                  ep.info?.cover_big ||
                  item.stream_icon;
                const epSynopsis = epMeta?.overview || ep.info?.plot;
                const formattedAirDate = epMeta?.airDate
                  ? epMeta.airDate.split('-').reverse().join('/')
                  : null;

                return (
                  <Link
                    key={`grid_ep_${ep.id}`}
                    href={getWatchUrl('series', item.stream_id, ep.id)}
                    className="p-3.5 rounded-2xl bg-[#13141b] hover:bg-[#1a1c26] border border-white/5 hover:border-violet-500/50 transition-all flex flex-col sm:flex-row gap-3.5 group shadow-md relative overflow-hidden"
                  >
                    {/* Thumbnail 16:9 */}
                    <div className="w-full sm:w-36 h-24 rounded-xl bg-black overflow-hidden shrink-0 relative flex items-center justify-center border border-white/5">
                      <ImageWithFallback
                        src={thumbUrl}
                        alt={formattedTitle}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />

                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Play className="w-6 h-6 text-violet-400 fill-violet-400" />
                      </div>

                      <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 text-[9px] font-bold rounded bg-black/85 text-white backdrop-blur-sm">
                        E{ep.episode_num}
                      </span>
                    </div>

                    {/* Informações do Episódio */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between gap-2 pr-14 sm:pr-20">
                          <p className="text-xs font-bold text-neutral-200 group-hover:text-violet-300 transition-colors line-clamp-1">
                            {formattedTitle}
                          </p>
                        </div>

                        {/* Sinopse do Episódio */}
                        {epSynopsis && (
                          <p className="text-[11px] text-neutral-400 line-clamp-2 leading-relaxed mt-1">
                            {epSynopsis}
                          </p>
                        )}
                      </div>

                      {/* Metadados: Data de Lançamento, Duração e Rating */}
                      <div className="flex flex-wrap items-center gap-2.5 text-[10px] text-neutral-500 mt-2 pt-2 border-t border-white/5">
                        {formattedAirDate && (
                          <span className="flex items-center gap-1 text-neutral-400 font-medium">
                            <Calendar className="w-3 h-3 text-violet-400" />
                            {formattedAirDate}
                          </span>
                        )}
                        {ep.info?.duration && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-neutral-500" />
                            {ep.info.duration}
                          </span>
                        )}
                        {epMeta?.rating ? (
                          <span className="flex items-center gap-0.5 text-amber-400 font-bold">
                            <Star className="w-2.5 h-2.5 fill-amber-400" />
                            {epMeta.rating}
                          </span>
                        ) : null}
                        <span className="uppercase font-mono text-[9px] px-1.5 py-0.2 rounded bg-white/5 text-neutral-400">
                          {ep.container_extension || 'mp4'}
                        </span>
                      </div>
                    </div>

                    {/* Botão de Marcar / Desmarcar como Assistido (Ícone de Olho) */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (epWatched) {
                          removeWatched(String(ep.id), 'series');
                        } else {
                          markWatched(String(ep.id), 'series', formattedTitle, true);
                        }
                      }}
                      className={`absolute top-2.5 right-2.5 z-10 p-1.5 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 shadow-md ${
                        epWatched
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                          : 'bg-black/60 text-neutral-400 border-white/10 hover:text-white hover:border-violet-500/40 hover:bg-white/10'
                      }`}
                      title={epWatched ? 'Marcar como não assistido' : 'Marcar como assistido'}
                      aria-label={epWatched ? 'Marcar como não assistido' : 'Marcar como assistido'}
                    >
                      <Eye className={`w-3.5 h-3.5 ${epWatched ? 'text-emerald-400' : ''}`} />
                      {epWatched && (
                        <span className="text-[10px] font-bold text-emerald-400 hidden sm:inline">
                          Visto
                        </span>
                      )}
                    </button>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* 3. Se houver Elenco Principal (Cast) enriquecido via TMDb */}
      {enrichedMetadata?.cast && enrichedMetadata.cast.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
          <div className="flex items-center gap-2 border-b border-white/5 pb-3">
            <Users className="w-5 h-5 text-violet-400" />
            <h2 className="text-base font-bold text-white">Elenco Principal</h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-3">
            {enrichedMetadata.cast.map((actor, idx) => (
              <div
                key={`cast_${idx}_${actor.name}`}
                className="p-2 rounded-2xl bg-[#13141b] border border-white/5 flex flex-col items-center text-center space-y-2"
              >
                <div className="w-16 h-16 rounded-full overflow-hidden bg-neutral-900 border border-white/10 shrink-0">
                  {actor.profileUrl ? (
                    <img
                      src={actor.profileUrl}
                      alt={actor.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs font-bold text-neutral-500">
                      {actor.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="w-full truncate">
                  <p className="text-xs font-semibold text-neutral-200 truncate">{actor.name}</p>
                  {actor.character && (
                    <p className="text-[10px] text-neutral-500 truncate">{actor.character}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 4. Especificações Técnicas e Metadados */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="p-6 rounded-3xl bg-[#13141b] border border-white/10 shadow-xl space-y-4">
          <h2 className="text-sm font-extrabold text-white flex items-center gap-2 uppercase tracking-wider text-neutral-300">
            <Sparkles className="w-4 h-4 text-violet-400" />
            Detalhes da Transmissão
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5">
              <span className="text-neutral-500 block text-[11px] mb-0.5">ID da Transmissão</span>
              <span className="font-mono font-bold text-neutral-200">{item.stream_id}</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5">
              <span className="text-neutral-500 block text-[11px] mb-0.5">Formato / Codec</span>
              <span className="font-bold text-neutral-200 uppercase">{item.container_extension || 'm3u8 / HLS'}</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5">
              <span className="text-neutral-500 block text-[11px] mb-0.5">Categoria Principal</span>
              <span className="font-bold text-neutral-200 truncate block">{item.category_name || 'Geral'}</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5">
              <span className="text-neutral-500 block text-[11px] mb-0.5">Status da Conta</span>
              <span className="font-bold text-emerald-400">Ativo para Reprodução</span>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Títulos Relacionados (12 itens) */}
      {related.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-violet-400" />
              <h2 className="text-base font-bold text-white">
                {item.category_name ? `Mais em ${item.category_name}` : 'Títulos Relacionados'}
              </h2>
            </div>
            <span className="text-xs text-neutral-500">
              {related.length} {streamType === 'live' ? 'canais relacionados' : 'títulos relacionados'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {related.slice(0, 12).map((rel) => (
              <MediaCard key={`rel_${rel.stream_type}_${rel.stream_id || rel.id}`} item={rel} />
            ))}
          </div>
        </section>
      )}

      {/* Modal de Trailer do YouTube */}
      {isTrailerModalOpen && enrichedMetadata?.trailerEmbedUrl && (
        <div
          onClick={() => setIsTrailerModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-4xl aspect-video rounded-3xl overflow-hidden bg-black border border-white/10 shadow-2xl"
          >
            <button
              onClick={() => setIsTrailerModalOpen(false)}
              className="absolute top-4 right-4 z-10 p-2.5 rounded-full bg-black/70 hover:bg-black text-neutral-300 hover:text-white transition cursor-pointer border border-white/10"
              title="Fechar trailer"
            >
              <X className="w-5 h-5" />
            </button>
            <iframe
              src={`${enrichedMetadata.trailerEmbedUrl}?autoplay=1`}
              title="Trailer Oficial"
              className="w-full h-full"
              allowFullScreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            />
          </div>
        </div>
      )}
    </div>
  );
}
