'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Tv,
  Film,
  Video,
  Heart,
  Play,
  Info,
  ChevronLeft,
  ChevronRight,
  Star,
  RotateCw,
  Clock,
  Layers,
  X,
} from 'lucide-react';
import { localDB } from '@/lib/db-local';
import { BaseStreamItem, EnrichedMetadata } from '@/lib/types';
import { useFavorites } from '@/hooks/useFavorites';
import { useContinueWatching } from '@/hooks/useContinueWatching';
import { getSortScore, isRecentlyAdded, cleanCategoryName } from '@/lib/stream-utils';
import { getTvWatchUrl, getTvInfoUrl, getTvCatalogUrl } from '@/lib/tv-routes';
import TvMediaCard from '@/components/tv/TvMediaCard';
import TvHorizontalRow from '@/components/tv/TvHorizontalRow';
import ImageWithFallback from '@/components/ui/ImageWithFallback';

function is4kOrDubbed(item: BaseStreamItem): boolean {
  const rawTitle = (item.title || item.name || '').toLowerCase();
  const rawCat = (item.category_name || '').toLowerCase();
  const is4K = /\b(4k|uhd|2160p)\b/i.test(rawTitle) || /\b(4k|uhd)\b/i.test(rawCat);
  const hasLegendado =
    /\[\s*l\s*\]|\(\s*l\s*\)|\[\s*leg\s*\]|\(\s*leg\s*\)|\blegendado\b/i.test(rawTitle);
  return is4K || !hasLegendado;
}

interface CategoryRail {
  id: string;
  name: string;
  type: 'movie' | 'series';
  items: BaseStreamItem[];
}

export default function TvHomePage() {
  const router = useRouter();
  const { favorites, isFavorite, addFavorite, removeFavorite } = useFavorites();
  const { items: continueItems, removeItem: removeContinue } = useContinueWatching();

  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(true);
  const [heroItems, setHeroItems] = useState<BaseStreamItem[]>([]);
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroPaused, setHeroPaused] = useState(false);
  const [heroMetaMap, setHeroMetaMap] = useState<Record<string, EnrichedMetadata>>({});

  const [recentMovies, setRecentMovies] = useState<BaseStreamItem[]>([]);
  const [recentSeries, setRecentSeries] = useState<BaseStreamItem[]>([]);
  const [liveChannels, setLiveChannels] = useState<BaseStreamItem[]>([]);
  const [categoryRails, setCategoryRails] = useState<CategoryRail[]>([]);
  const [focusedPreview, setFocusedPreview] = useState<BaseStreamItem | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      if (!localDB) return;
      try {
        const totalStreams = await localDB.streams.count();
        if (totalStreams === 0) {
          if (isMounted) {
            setHasData(false);
            setLoading(false);
          }
          return;
        }

        const [allLive, allMovies, allSeries, movieCats, seriesCats] = await Promise.all([
          localDB.streams.where('stream_type').equals('live').toArray(),
          localDB.streams.where('stream_type').equals('movie').toArray(),
          localDB.streams.where('stream_type').equals('series').toArray(),
          localDB.categories.where('type').equals('movie').toArray(),
          localDB.categories.where('type').equals('series').toArray(),
        ]);

        if (!isMounted) return;

        const moviesList = allMovies as unknown as BaseStreamItem[];
        const seriesList = allSeries as unknown as BaseStreamItem[];
        const liveList = allLive as unknown as BaseStreamItem[];

        const sortedMovies = [...moviesList]
          .filter(is4kOrDubbed)
          .sort((a, b) => getSortScore(b) - getSortScore(a));
        const sortedAllMovies =
          sortedMovies.length > 0
            ? sortedMovies
            : [...moviesList].sort((a, b) => getSortScore(b) - getSortScore(a));

        const sortedSeries = [...seriesList].sort((a, b) => getSortScore(b) - getSortScore(a));

        const heroCandidates = [
          ...sortedAllMovies.slice(0, 12),
          ...sortedSeries.slice(0, 12),
        ]
          .filter((i) => i.stream_icon)
          .sort((a, b) => getSortScore(b) - getSortScore(a))
          .slice(0, 8);

        // Agrupa categorias com maior destaque para trilhos estilo Netflix
        const buildTopCategoryRails = (
          items: BaseStreamItem[],
          cats: { category_id: string; category_name: string }[],
          type: 'movie' | 'series',
          maxRails: number
        ): CategoryRail[] => {
          const catMap = new Map<string, BaseStreamItem[]>();
          for (const item of items) {
            const cId = String(item.category_id || '');
            if (!cId) continue;
            const list = catMap.get(cId);
            if (list) list.push(item);
            else catMap.set(cId, [item]);
          }

          const rails: { rail: CategoryRail; maxScore: number }[] = [];
          for (const cat of cats) {
            const list = catMap.get(cat.category_id);
            if (!list || list.length < 6) continue;
            const sorted = [...list].sort((a, b) => getSortScore(b) - getSortScore(a));
            rails.push({
              rail: {
                id: cat.category_id,
                name: cleanCategoryName(cat.category_name) || cat.category_name,
                type,
                items: sorted.slice(0, 16),
              },
              maxScore: getSortScore(sorted[0]),
            });
          }

          return rails
            .sort((a, b) => b.maxScore - a.maxScore)
            .slice(0, maxRails)
            .map((entry) => entry.rail);
        };

        const movieRails = buildTopCategoryRails(moviesList, movieCats, 'movie', 4);
        const seriesRails = buildTopCategoryRails(seriesList, seriesCats, 'series', 3);

        // Intercala trilhos de filmes e séries
        const interleavedRails: CategoryRail[] = [];
        const maxLen = Math.max(movieRails.length, seriesRails.length);
        for (let i = 0; i < maxLen; i++) {
          if (movieRails[i]) interleavedRails.push(movieRails[i]);
          if (seriesRails[i]) interleavedRails.push(seriesRails[i]);
        }

        setHasData(true);
        setHeroItems(heroCandidates);
        setRecentMovies(
          sortedAllMovies.slice(0, 18).map((m, idx) => ({
            ...m,
            isNew: idx < 6 || isRecentlyAdded(m),
          }))
        );
        setRecentSeries(
          sortedSeries.slice(0, 18).map((s, idx) => ({
            ...s,
            isNew: idx < 6 || isRecentlyAdded(s),
          }))
        );
        setLiveChannels(liveList.slice(0, 18));
        setCategoryRails(interleavedRails);
        setLoading(false);
      } catch (err) {
        console.error('Erro ao carregar dados para TV:', err);
        if (isMounted) setLoading(false);
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  const currentHero = heroItems[heroIndex] || null;
  const heroTotal = heroItems.length;

  const nextHero = useCallback(() => {
    if (heroTotal <= 1) return;
    setHeroIndex((prev) => (prev + 1) % heroTotal);
  }, [heroTotal]);

  const prevHero = useCallback(() => {
    if (heroTotal <= 1) return;
    setHeroIndex((prev) => (prev - 1 + heroTotal) % heroTotal);
  }, [heroTotal]);

  useEffect(() => {
    if (heroTotal <= 1 || heroPaused) return;
    const timer = setInterval(nextHero, 7000);
    return () => clearInterval(timer);
  }, [heroTotal, heroPaused, nextHero]);

  // Enriquece o Hero atual com backdrop em alta resolução via /api/metadata
  useEffect(() => {
    if (!currentHero) return;
    const key = `${currentHero.stream_type}_${currentHero.stream_id}`;
    if (heroMetaMap[key]) return;

    let active = true;
    const title = currentHero.title || currentHero.name;
    const cat = currentHero.category_name ? `&category=${encodeURIComponent(currentHero.category_name)}` : '';
    fetch(`/api/metadata?title=${encodeURIComponent(title)}&type=${currentHero.stream_type}${cat}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: EnrichedMetadata | null) => {
        if (active && data && data.source !== 'none') {
          setHeroMetaMap((prev) => ({ ...prev, [key]: data }));
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [currentHero, heroMetaMap]);

  const recentFavorites = useMemo(() => {
    return [...favorites]
      .sort((a, b) => {
        const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tB - tA;
      })
      .slice(0, 18);
  }, [favorites]);

  const heroMeta = currentHero
    ? heroMetaMap[`${currentHero.stream_type}_${currentHero.stream_id}`]
    : undefined;
  const heroBackdrop = heroMeta?.backdropUrl || currentHero?.stream_icon || '';
  const heroFavorited = currentHero
    ? isFavorite(currentHero.stream_id, currentHero.stream_type)
    : false;

  const toggleHeroFavorite = () => {
    if (!currentHero) return;
    if (heroFavorited) {
      removeFavorite(currentHero.stream_id, currentHero.stream_type);
    } else {
      addFavorite({
        streamId: currentHero.stream_id,
        streamType: currentHero.stream_type,
        title: currentHero.title || currentHero.name,
        posterUrl: currentHero.stream_icon,
        categoryName: currentHero.category_name,
        rating: currentHero.rating,
      });
    }
  };

  return (
    <div className="flex flex-col pb-16" data-tv-zone="content">
      {/* HERO SHOWCASE CINEMATOGRÁFICO ESTILO NETFLIX */}
      {currentHero && (
        <section
          data-tv-zone="hero"
          onMouseEnter={() => setHeroPaused(true)}
          onMouseLeave={() => setHeroPaused(false)}
          onFocusCapture={() => setHeroPaused(true)}
          onBlurCapture={() => setHeroPaused(false)}
          className="relative w-full h-[54vh] min-h-[380px] max-h-[560px] overflow-hidden bg-black flex items-end p-6 sm:p-10 lg:p-12 border-b border-white/10"
        >
          {/* Backdrop com degradê cinematográfico */}
          <div className="absolute inset-0">
            <img
              key={heroBackdrop}
              src={heroBackdrop}
              alt={currentHero.title || currentHero.name}
              className="w-full h-full object-cover object-center opacity-75 scale-[1.02] transition-opacity duration-700"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#08090d] via-[#08090d]/45 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#08090d] via-[#08090d]/70 to-transparent" />
          </div>

          {/* Controles do Slide no canto superior direito */}
          {heroTotal > 1 && (
            <div className="absolute top-5 right-6 z-20 flex items-center gap-2">
              <button
                type="button"
                tabIndex={0}
                data-tv-focusable="true"
                data-tv-focus="button"
                onClick={prevHero}
                aria-label="Destaque anterior"
                className="p-2 rounded-xl bg-black/60 hover:bg-violet-600/80 border border-white/15 text-white transition cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="px-3 py-1.5 rounded-xl bg-black/60 border border-white/15 text-xs font-mono font-bold text-neutral-200">
                {String(heroIndex + 1).padStart(2, '0')} / {String(heroTotal).padStart(2, '0')}
              </div>
              <button
                type="button"
                tabIndex={0}
                data-tv-focusable="true"
                data-tv-focus="button"
                onClick={nextHero}
                aria-label="Próximo destaque"
                className="p-2 rounded-xl bg-black/60 hover:bg-violet-600/80 border border-white/15 text-white transition cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Conteúdo do Destaque */}
          <div className="relative z-10 max-w-3xl space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-violet-600 text-white shadow-lg shadow-violet-600/40">
                {currentHero.stream_type === 'series' ? 'Série em Destaque' : 'Filme em Destaque'}
              </span>
              {heroMeta?.year && (
                <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-white/10 text-neutral-200 border border-white/10">
                  {heroMeta.year}
                </span>
              )}
              {(heroMeta?.rating || currentHero.rating) &&
              Number(heroMeta?.rating || currentHero.rating) > 0 ? (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-black/60 text-amber-300 border border-white/15">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  {Number(heroMeta?.rating || currentHero.rating).toFixed(1)}
                </span>
              ) : null}
              {currentHero.category_name && (
                <span className="text-xs text-neutral-300 font-semibold">
                  • {cleanCategoryName(currentHero.category_name) || currentHero.category_name}
                </span>
              )}
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white drop-shadow-md leading-tight">
              {currentHero.title || currentHero.name}
            </h1>

            <p className="text-xs sm:text-sm text-neutral-200/90 line-clamp-2 sm:line-clamp-3 max-w-2xl leading-relaxed">
              {heroMeta?.overview ||
                (currentHero as BaseStreamItem & { plot?: string }).plot ||
                'Assista em alta definição diretamente na sua Smart TV, Tablet ou Desktop.'}
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                href={getTvWatchUrl(currentHero.stream_type, currentHero.stream_id)}
                tabIndex={0}
                data-tv-focusable="true"
                data-tv-focus="button"
                data-tv-autofocus="true"
                className="px-6 py-3 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold shadow-xl shadow-violet-600/40 flex items-center gap-2 focus:outline-none transition"
              >
                <Play className="w-5 h-5 fill-white" />
                <span>Assistir Agora</span>
              </Link>

              <Link
                href={getTvInfoUrl(currentHero.stream_type, currentHero.stream_id)}
                tabIndex={0}
                data-tv-focusable="true"
                data-tv-focus="button"
                className="px-5 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white text-sm font-bold border border-white/15 backdrop-blur-md flex items-center gap-2 focus:outline-none transition"
              >
                <Info className="w-5 h-5 text-neutral-200" />
                <span>Mais Informações</span>
              </Link>

              <button
                type="button"
                tabIndex={0}
                data-tv-focusable="true"
                data-tv-focus="button"
                onClick={toggleHeroFavorite}
                className={`px-4 py-3 rounded-2xl text-sm font-bold border backdrop-blur-md flex items-center gap-2 cursor-pointer transition focus:outline-none ${
                  heroFavorited
                    ? 'bg-rose-600/25 border-rose-500/50 text-rose-200'
                    : 'bg-white/10 hover:bg-white/20 border-white/15 text-white'
                }`}
              >
                <Heart className={`w-4 h-4 ${heroFavorited ? 'fill-rose-500 text-rose-400' : ''}`} />
                <span>{heroFavorited ? 'Favorito' : 'Favoritar'}</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Barra dinâmica de Preview do item focado (estilo Netflix TV) */}
      {focusedPreview && (
        <div className="mx-6 sm:mx-8 mt-5 px-4 py-2.5 rounded-2xl bg-[#11121c]/90 border border-white/10 flex items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="px-2 py-0.5 rounded bg-violet-600/25 text-violet-300 border border-violet-500/30 font-bold uppercase text-[10px] shrink-0">
              {focusedPreview.stream_type === 'live'
                ? 'Ao Vivo'
                : focusedPreview.stream_type === 'series'
                ? 'Série'
                : 'Filme'}
            </span>
            <span className="font-bold text-white truncate">
              {focusedPreview.title || focusedPreview.name}
            </span>
            {focusedPreview.category_name && (
              <span className="text-neutral-400 truncate hidden sm:inline">
                • {cleanCategoryName(focusedPreview.category_name) || focusedPreview.category_name}
              </span>
            )}
          </div>
          {focusedPreview.rating && Number(focusedPreview.rating) > 0 ? (
            <span className="flex items-center gap-1 text-amber-300 font-bold shrink-0">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              {Number(focusedPreview.rating).toFixed(1)}
            </span>
          ) : null}
        </div>
      )}

      {/* CONTEÚDO PRINCIPAL EM TRILHOS HORIZONTAIS */}
      <div className="px-6 sm:px-8 pt-6 space-y-10">
        {loading && (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-neutral-400">
            <div className="w-9 h-9 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-medium">Preparando seu catálogo TV & Tablet...</p>
          </div>
        )}

        {!loading && !hasData && (
          <div className="p-10 rounded-3xl bg-[#12131c] border border-white/10 text-center space-y-4 max-w-xl mx-auto my-8">
            <div className="w-14 h-14 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center mx-auto text-violet-400">
              <RotateCw className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-black text-white">Nenhuma lista IPTV sincronizada</h2>
            <p className="text-xs sm:text-sm text-neutral-400">
              Acesse as configurações de TV para adicionar ou sincronizar sua playlist Xtream / M3U.
            </p>
            <Link
              href="/tv/settings"
              data-tv-focusable="true"
              data-tv-focus="button"
              data-tv-autofocus="true"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold shadow-lg shadow-violet-600/30"
            >
              <RotateCw className="w-4 h-4" />
              <span>Sincronizar Lista Agora</span>
            </Link>
          </div>
        )}

        {/* 1. CONTINUE ASSISTINDO */}
        {continueItems.length > 0 && (
          <TvHorizontalRow
            title="Continue Assistindo"
            subtitle="Retome filmes e episódios exatamente de onde parou"
            icon={<Clock className="w-5 h-5 text-violet-400" />}
          >
            {continueItems.slice(0, 18).map((c) => {
              const resumeUrl = getTvWatchUrl(
                c.stream_type,
                c.stream_id,
                c.episode_id,
                c.season_num,
                Math.floor(c.current_time)
              );
              const infoUrl = getTvInfoUrl(c.stream_type, c.stream_id);
              const percent = Math.min(100, Math.max(4, c.progress_percentage || 0));

              return (
                <div
                  key={c.id}
                  tabIndex={0}
                  role="button"
                  data-tv-focusable="true"
                  data-tv-focus="card"
                  onClick={() => router.push(resumeUrl)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      router.push(resumeUrl);
                    }
                  }}
                  className="tv-card group relative flex-none w-[260px] sm:w-[290px] rounded-2xl overflow-hidden bg-[#12131c] border border-white/10 cursor-pointer focus:outline-none flex flex-col justify-between"
                >
                  <div className="relative aspect-video w-full bg-black">
                    <ImageWithFallback
                      src={c.backdrop_url || c.poster_url}
                      alt={c.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/25" />

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeContinue(c.id);
                      }}
                      title="Remover de Continue Assistindo"
                      className="absolute top-2 right-2 z-20 p-1.5 rounded-full bg-black/70 hover:bg-rose-600 text-neutral-300 hover:text-white opacity-0 group-hover:opacity-100 transition cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>

                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity">
                      <div className="w-11 h-11 rounded-full bg-violet-600 text-white flex items-center justify-center shadow-xl">
                        <Play className="w-5 h-5 fill-white ml-0.5" />
                      </div>
                    </div>

                    <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-neutral-800">
                      <div
                        className="h-full bg-gradient-to-r from-violet-600 to-rose-500 rounded-r-full"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>

                  <div className="p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="text-xs sm:text-sm font-bold text-white truncate">{c.title}</h4>
                      {c.stream_type === 'series' && (
                        <p className="text-[11px] text-neutral-400 truncate">
                          {c.season_num !== undefined ? `T${c.season_num}` : ''}
                          {c.episode_num !== undefined ? `:E${c.episode_num}` : ''}
                          {c.episode_title ? ` • ${c.episode_title}` : ''}
                        </p>
                      )}
                    </div>
                    <Link
                      href={infoUrl}
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-neutral-300 hover:text-white shrink-0"
                      title="Detalhes"
                    >
                      <Info className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </TvHorizontalRow>
        )}

        {/* 2. FILMES RECENTES (4K & DUBLADOS) */}
        {recentMovies.length > 0 && (
          <TvHorizontalRow
            title="Filmes Recentes"
            badge="4K & Dublados"
            icon={<Film className="w-5 h-5 text-indigo-400" />}
            seeAllHref="/tv/movies"
          >
            {recentMovies.map((item) => (
              <div key={`movie_${item.stream_id}`} className="w-[165px] sm:w-[185px] flex-none">
                <TvMediaCard item={item} onFocusItem={setFocusedPreview} />
              </div>
            ))}
          </TvHorizontalRow>
        )}

        {/* 3. SÉRIES RECÉM-ATUALIZADAS */}
        {recentSeries.length > 0 && (
          <TvHorizontalRow
            title="Séries em Alta"
            badge="Atualizadas"
            icon={<Video className="w-5 h-5 text-emerald-400" />}
            seeAllHref="/tv/series"
            seeAllLabel="Ver todas"
          >
            {recentSeries.map((item) => (
              <div key={`series_${item.stream_id}`} className="w-[165px] sm:w-[185px] flex-none">
                <TvMediaCard item={item} onFocusItem={setFocusedPreview} />
              </div>
            ))}
          </TvHorizontalRow>
        )}

        {/* 4. CANAIS AO VIVO */}
        {liveChannels.length > 0 && (
          <TvHorizontalRow
            title="TV Ao Vivo"
            icon={<Tv className="w-5 h-5 text-rose-400" />}
            seeAllHref="/tv/live"
          >
            {liveChannels.map((item) => (
              <div key={`live_${item.stream_id}`} className="w-[225px] sm:w-[250px] flex-none">
                <TvMediaCard item={item} onFocusItem={setFocusedPreview} />
              </div>
            ))}
          </TvHorizontalRow>
        )}

        {/* 5. MEUS FAVORITOS */}
        {recentFavorites.length > 0 && (
          <TvHorizontalRow
            title="Meus Favoritos"
            icon={<Heart className="w-5 h-5 text-rose-500 fill-rose-500" />}
            seeAllHref="/tv/favorites"
          >
            {recentFavorites.map((fav) => (
              <div
                key={`fav_${fav.stream_type}_${fav.stream_id}`}
                className={
                  fav.stream_type === 'live'
                    ? 'w-[225px] sm:w-[250px] flex-none'
                    : 'w-[165px] sm:w-[185px] flex-none'
                }
              >
                <TvMediaCard
                  onFocusItem={setFocusedPreview}
                  item={{
                    stream_id: fav.stream_id,
                    stream_type: fav.stream_type,
                    name: fav.title || '',
                    title: fav.title,
                    stream_icon: fav.poster_url,
                    category_name: fav.category_name,
                    rating: fav.rating,
                  }}
                />
              </div>
            ))}
          </TvHorizontalRow>
        )}

        {/* 6. TRILHOS DINÂMICOS POR CATEGORIAS DO SERVIDOR */}
        {categoryRails.map((rail) => (
          <TvHorizontalRow
            key={`${rail.type}_${rail.id}`}
            title={rail.name}
            badge={rail.type === 'series' ? 'Séries' : 'Filmes'}
            icon={<Layers className="w-5 h-5 text-violet-400" />}
            seeAllHref={getTvCatalogUrl(rail.type, rail.id)}
            seeAllLabel="Ver categoria"
          >
            {rail.items.map((item) => (
              <div key={`${rail.type}_${rail.id}_${item.stream_id}`} className="w-[165px] sm:w-[185px] flex-none">
                <TvMediaCard item={item} onFocusItem={setFocusedPreview} />
              </div>
            ))}
          </TvHorizontalRow>
        ))}
      </div>
    </div>
  );
}
