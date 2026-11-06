'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  Tv,
  Film,
  Video,
  Heart,
  Play,
  Info,
  ChevronRight,
  RotateCw,
  Search,
} from 'lucide-react';
import { localDB } from '@/lib/db-local';
import { BaseStreamItem } from '@/lib/types';
import { useFavorites } from '@/hooks/useFavorites';
import { useContinueWatching } from '@/hooks/useContinueWatching';
import { getWatchUrl, getInfoUrl } from '@/lib/routes';
import TvNavbar from '@/components/tv/TvNavbar';
import TvMediaCard from '@/components/tv/TvMediaCard';
import ImageWithFallback from '@/components/ui/ImageWithFallback';

export default function TvHomePage() {
  const router = useRouter();
  const { favorites } = useFavorites();
  const { items: continueItems } = useContinueWatching();

  const [activeTab, setActiveTab] = useState<'all' | 'live' | 'movies' | 'series' | 'favorites'>('all');
  const [loading, setLoading] = useState(true);
  const [liveChannels, setLiveChannels] = useState<BaseStreamItem[]>([]);
  const [movies, setMovies] = useState<BaseStreamItem[]>([]);
  const [series, setSeries] = useState<BaseStreamItem[]>([]);
  const [heroItem, setHeroItem] = useState<BaseStreamItem | null>(null);

  // Carrega os dados locais do IndexedDB
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      if (!localDB) return;
      try {
        const [allLive, allMovies, allSeries] = await Promise.all([
          localDB.streams.where('stream_type').equals('live').limit(150).toArray(),
          localDB.streams.where('stream_type').equals('movie').limit(150).toArray(),
          localDB.streams.where('stream_type').equals('series').limit(150).toArray(),
        ]);

        if (isMounted) {
          setLiveChannels(allLive);
          setMovies(allMovies);
          setSeries(allSeries);

          // Escolhe um filme ou série com imagem para destaque no Hero
          const candidates = [...allMovies, ...allSeries].filter((i) => i.stream_icon);
          if (candidates.length > 0) {
            setHeroItem(candidates[Math.floor(Math.random() * Math.min(candidates.length, 10))]);
          }
          setLoading(false);
        }
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

  return (
    <div className="flex flex-col min-h-screen">
      <TvNavbar activeTab={activeTab} onSelectTab={setActiveTab} />

      {/* Hero Banner Widescreen em Destaque */}
      {heroItem && activeTab === 'all' && (
        <section className="relative w-full h-[52vh] min-h-[380px] max-h-[520px] overflow-hidden bg-black flex items-end p-8 sm:p-12 border-b border-white/10">
          {/* Fundo com Backdrop Escurecido */}
          <div className="absolute inset-0">
            <ImageWithFallback
              src={heroItem.stream_icon}
              alt=""
              className="w-full h-full object-cover opacity-35 scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#08090d] via-[#08090d]/60 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#08090d] via-[#08090d]/70 to-transparent" />
          </div>

          {/* Conteúdo do Destaque */}
          <div className="relative z-10 max-w-3xl space-y-3">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded text-[11px] font-black uppercase tracking-wider bg-violet-600 text-white shadow-md shadow-violet-600/40">
                {heroItem.stream_type === 'series' ? 'Série em Destaque' : 'Filme em Destaque'}
              </span>
              {heroItem.category_name && (
                <span className="text-xs text-neutral-300 font-semibold">• {heroItem.category_name}</span>
              )}
            </div>

            <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white drop-shadow-md">
              {heroItem.title || heroItem.name}
            </h1>

            <p className="text-sm text-neutral-300 line-clamp-2 max-w-2xl leading-relaxed">
              {(heroItem as any).plot || 'Assista em alta resolução com áudio imersivo diretamente na sua Smart TV ou Tablet.'}
            </p>

            <div className="flex items-center gap-3 pt-2">
              <Link
                href={getWatchUrl(heroItem.stream_type, heroItem.stream_id)}
                tabIndex={0}
                data-tv-focusable="true"
                className="px-6 py-3 rounded-2xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold shadow-xl shadow-violet-600/40 flex items-center gap-2 focus:outline-none"
              >
                <Play className="w-5 h-5 fill-white" />
                <span>Assistir Agora</span>
              </Link>

              <Link
                href={getInfoUrl(heroItem.stream_type, heroItem.stream_id)}
                tabIndex={0}
                data-tv-focusable="true"
                className="px-5 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white text-sm font-bold border border-white/15 backdrop-blur-md flex items-center gap-2 focus:outline-none"
              >
                <Info className="w-5 h-5 text-neutral-300" />
                <span>Mais Informações</span>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Conteúdo Principal conforme a aba selecionada */}
      <div className="flex-1 p-6 sm:p-10 space-y-10">
        {/* ABA: TODOS (HOME DA TV) */}
        {activeTab === 'all' && (
          <>
            {/* Continue Assistindo */}
            {continueItems.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-violet-400" />
                    <span>Continue Assistindo</span>
                  </h2>
                </div>
                <div className="tv-scroll-row flex items-center gap-4 overflow-x-auto pb-4">
                  {continueItems.map((c) => (
                    <div
                      key={c.id}
                      tabIndex={0}
                      role="button"
                      data-tv-focusable="true"
                      onClick={() => {
                        const url =
                          c.stream_type === 'series'
                            ? `/series/${c.stream_id}/watch?t=${Math.floor(c.current_time)}`
                            : `/movie/${c.stream_id}/watch?t=${Math.floor(c.current_time)}`;
                        router.push(url);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const url =
                            c.stream_type === 'series'
                              ? `/series/${c.stream_id}/watch?t=${Math.floor(c.current_time)}`
                              : `/movie/${c.stream_id}/watch?t=${Math.floor(c.current_time)}`;
                          router.push(url);
                        }
                      }}
                      className="tv-card group flex-none w-[280px] rounded-2xl overflow-hidden bg-[#12131a] border border-white/10 cursor-pointer focus:outline-none"
                    >
                      <div className="relative aspect-video w-full bg-black">
                        <ImageWithFallback
                          src={c.backdrop_url || c.poster_url}
                          alt={c.title}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
                        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-neutral-800">
                          <div
                            className="h-full bg-violet-600 rounded-r-full"
                            style={{ width: `${Math.min(100, c.progress_percentage || 0)}%` }}
                          />
                        </div>
                      </div>
                      <div className="p-3">
                        <h4 className="text-xs font-bold text-white truncate">{c.title}</h4>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Fileira de Canais Ao Vivo (16:9) */}
            {liveChannels.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                    <Tv className="w-5 h-5 text-violet-400" />
                    <span>Canais Ao Vivo</span>
                  </h2>
                  <button
                    type="button"
                    tabIndex={0}
                    data-tv-focusable="true"
                    onClick={() => setActiveTab('live')}
                    className="text-xs font-bold text-violet-400 hover:text-violet-300 flex items-center gap-1 focus:outline-none"
                  >
                    <span>Ver todos</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                <div className="tv-scroll-row flex items-center gap-4 overflow-x-auto pb-4">
                  {liveChannels.slice(0, 16).map((item) => (
                    <div key={item.stream_id} className="w-[240px] flex-none">
                      <TvMediaCard item={item} />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Fileira de Filmes em Destaque */}
            {movies.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                    <Film className="w-5 h-5 text-indigo-400" />
                    <span>Filmes Recentes</span>
                  </h2>
                  <button
                    type="button"
                    tabIndex={0}
                    data-tv-focusable="true"
                    onClick={() => setActiveTab('movies')}
                    className="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 focus:outline-none"
                  >
                    <span>Ver todos</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                <div className="tv-scroll-row flex items-center gap-4 overflow-x-auto pb-4">
                  {movies.slice(0, 16).map((item) => (
                    <div key={item.stream_id} className="w-[180px] flex-none">
                      <TvMediaCard item={item} />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Fileira de Séries */}
            {series.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                    <Video className="w-5 h-5 text-emerald-400" />
                    <span>Séries Populares</span>
                  </h2>
                  <button
                    type="button"
                    tabIndex={0}
                    data-tv-focusable="true"
                    onClick={() => setActiveTab('series')}
                    className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 focus:outline-none"
                  >
                    <span>Ver todas</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                <div className="tv-scroll-row flex items-center gap-4 overflow-x-auto pb-4">
                  {series.slice(0, 16).map((item) => (
                    <div key={item.stream_id} className="w-[180px] flex-none">
                      <TvMediaCard item={item} />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* ABA: CANAIS AO VIVO */}
        {activeTab === 'live' && (
          <section className="space-y-6">
            <h2 className="text-2xl font-black text-white">Todos os Canais Ao Vivo</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {liveChannels.map((item) => (
                <TvMediaCard key={item.stream_id} item={item} />
              ))}
            </div>
          </section>
        )}

        {/* ABA: FILMES */}
        {activeTab === 'movies' && (
          <section className="space-y-6">
            <h2 className="text-2xl font-black text-white">Catálogo de Filmes</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-4">
              {movies.map((item) => (
                <TvMediaCard key={item.stream_id} item={item} />
              ))}
            </div>
          </section>
        )}

        {/* ABA: SÉRIES */}
        {activeTab === 'series' && (
          <section className="space-y-6">
            <h2 className="text-2xl font-black text-white">Catálogo de Séries</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-4">
              {series.map((item) => (
                <TvMediaCard key={item.stream_id} item={item} />
              ))}
            </div>
          </section>
        )}

        {/* ABA: FAVORITOS */}
        {activeTab === 'favorites' && (
          <section className="space-y-6">
            <h2 className="text-2xl font-black text-white">Seus Favoritos</h2>
            {favorites.length === 0 ? (
              <div className="p-12 text-center text-neutral-400 bg-white/5 rounded-3xl border border-white/10 max-w-md mx-auto">
                <Heart className="w-10 h-10 text-neutral-500 mx-auto mb-3" />
                <p className="font-bold text-white">Nenhum favorito salvo ainda</p>
                <p className="text-xs text-neutral-400 mt-1">
                  Marque conteúdos como favoritos para encontrá-los rapidamente aqui.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-4">
                {favorites.map((fav) => (
                  <TvMediaCard
                    key={`${fav.stream_type}_${fav.stream_id}`}
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
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
