'use client';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Sparkles, Tv, Film, Video, RotateCw, Heart, Layers, ArrowRight } from 'lucide-react';
import { localDB } from '@/lib/db-local';
import { BaseStreamItem } from '@/lib/types';
import { getSortScore, isRecentlyAdded } from '@/lib/stream-utils';
import MediaCard from '@/components/media/MediaCard';
import SyncModal from '@/components/ui/SyncModal';
import HeroSlider from '@/components/home/HeroSlider';
import ContinueWatchingSection from '@/components/home/ContinueWatchingSection';
import { useFavorites } from '@/hooks/useFavorites';

// Filtra filmes para exibir SOMENTE versão 4K ou Dublada (sem a tag [L] no título)
function is4kOrDubbed(item: BaseStreamItem): boolean {
  const rawTitle = (item.title || item.name || '').toLowerCase();
  const rawCat = (item.category_name || '').toLowerCase();

  // Verifica se é 4K
  const is4K =
    /\b(4k|uhd|2160p)\b/i.test(rawTitle) ||
    /\b(4k|uhd)\b/i.test(rawCat);

  // Verifica se possui tags de legendado ([L], (L), [LEG], etc.)
  const hasLegendadoTag =
    /\[\s*l\s*\]/i.test(rawTitle) ||
    /\(\s*l\s*\)/i.test(rawTitle) ||
    /\[\s*leg\s*\]/i.test(rawTitle) ||
    /\(\s*leg\s*\)/i.test(rawTitle) ||
    /\blegendado\b/i.test(rawTitle);

  // Atende se for 4K OU se for versão dublada (sem tag [L]/legendado)
  return is4K || !hasLegendadoTag;
}

export default function HomePage() {
  const { favorites } = useFavorites();
  const [mounted, setMounted] = useState(false);

  const [heroItems, setHeroItems] = useState<BaseStreamItem[]>([]);
  const [recentMovies, setRecentMovies] = useState<BaseStreamItem[]>([]);
  const [recentSeries, setRecentSeries] = useState<BaseStreamItem[]>([]);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [hasData, setHasData] = useState(true);

  // Últimos 12 títulos adicionados aos favoritos, ordenados pelos mais recentes
  const recentFavorites = useMemo(() => {
    return [...favorites]
      .sort((a, b) => {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return timeB - timeA;
      })
      .slice(0, 12);
  }, [favorites]);

  const loadLocalData = async () => {
    if (!localDB) return;

    try {
      const count = await localDB.streams.count();
      if (count === 0) {
        setHasData(false);
        return;
      }
      setHasData(true);

      const [allMovies, allSeries] = await Promise.all([
        localDB.streams.where('stream_type').equals('movie').toArray(),
        localDB.streams.where('stream_type').equals('series').toArray(),
      ]);

      const moviesList = allMovies as unknown as BaseStreamItem[];
      const seriesList = allSeries as unknown as BaseStreamItem[];

      // 1. Filmes ordenados por novidade (decrescente) e filtrados por 4K ou Dublado (sem [L])
      const filteredSortedMovies = moviesList
        .filter(is4kOrDubbed)
        .sort((a, b) => getSortScore(b) - getSortScore(a));

      // 2. Séries ordenadas por novidade (decrescente)
      const sortedSeries = seriesList.sort((a, b) => getSortScore(b) - getSortScore(a));

      // 3. Top 10 Updates combinados de Séries e Filmes para a Hero
      const combinedRecent = [...filteredSortedMovies.slice(0, 20), ...sortedSeries.slice(0, 20)]
        .sort((a, b) => getSortScore(b) - getSortScore(a))
        .slice(0, 10);

      setHeroItems(combinedRecent);
      const moviesWithNewTag = filteredSortedMovies.slice(0, 12).map((m, idx) => ({
        ...m,
        isNew: idx < 6 || isRecentlyAdded(m),
      }));
      setRecentMovies(moviesWithNewTag as BaseStreamItem[]);

      const seriesWithNewTag = sortedSeries.slice(0, 12).map((s, idx) => ({
        ...s,
        isNew: idx < 6 || isRecentlyAdded(s),
      }));
      setRecentSeries(seriesWithNewTag as BaseStreamItem[]);
    } catch (e) {
      console.warn('Erro ao carregar dados locais:', e);
    }
  };

  useEffect(() => {
    setMounted(true);
    loadLocalData();
  }, []);

  return (
    <div className="space-y-10 pb-16">
      {/* 1. HERO SLIDER COM CONTROLES NO CANTO DIREITO INFERIOR (10 Últimos Updates do Servidor) */}
      <HeroSlider
        items={heroItems}
        onSyncClick={() => setIsSyncModalOpen(true)}
      />

      {/* 2. CONTINUE ASSISTINDO (Diretamente após a Hero - Carrossel Netflix até 12 itens) */}
      <ContinueWatchingSection />

      {/* Se não houver dados no IndexedDB ainda */}
      {!hasData && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="p-8 rounded-3xl bg-[#13141b] border border-white/10 text-center space-y-4 shadow-xl">
            <div className="w-12 h-12 rounded-2xl bg-violet-600/20 text-violet-400 border border-violet-500/30 flex items-center justify-center mx-auto">
              <RotateCw className="w-6 h-6 animate-spin" />
            </div>
            <h2 className="text-lg font-bold text-white">Nenhuma lista sincronizada no navegador</h2>
            <p className="text-xs text-neutral-400 max-w-md mx-auto">
              Clique no botão abaixo para informar a URL do seu servidor IPTV, usuário e senha para importar sua lista.
            </p>
            <button
              onClick={() => setIsSyncModalOpen(true)}
              className="px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold shadow-lg shadow-violet-600/30 transition cursor-pointer"
            >
              Configurar Servidor IPTV
            </button>
          </div>
        </section>
      )}

      {/* 3. Meus Favoritos (se houver) - Grid de 6 colunas no desktop com os últimos 12 títulos */}
      {mounted && favorites.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Heart className="w-5 h-5 text-rose-500 fill-rose-500" />
              <h2 className="text-lg font-bold text-white">Meus Favoritos</h2>
            </div>
            <Link
              href="/favorites"
              className="text-xs text-violet-400 hover:text-violet-300 font-semibold flex items-center gap-1 transition"
            >
              Ver todos ({favorites.length})
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-6 gap-4 sm:gap-5">
            {recentFavorites.map((fav) => (
              <MediaCard
                key={`fav_${fav.id || fav.stream_id}`}
                item={{
                  id: fav.stream_id,
                  stream_id: fav.stream_id,
                  name: fav.title,
                  title: fav.title,
                  stream_type: fav.stream_type,
                  stream_icon: fav.poster_url,
                  category_name: fav.category_name,
                  rating: fav.rating,
                }}
              />
            ))}
          </div>
        </section>
      )}

      {/* 4. Últimos Updates de Filmes (Apenas 4K ou Dublados, sem [L]) - Grid de 6 colunas no desktop (12 itens) */}
      {recentMovies.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-violet-600/20 text-violet-400 border border-violet-500/30 flex items-center justify-center">
                <Film className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-black text-white tracking-tight">
                    Últimos Updates de Filmes
                  </h2>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-wider">
                    4K & Dublados
                  </span>
                </div>
                <p className="text-[11px] text-neutral-400">
                  Lançamentos e filmes recém-adicionados ao servidor
                </p>
              </div>
            </div>

            <Link
              href="/movies"
              className="text-xs text-violet-400 hover:text-violet-300 font-semibold flex items-center gap-1 transition self-start sm:self-auto"
            >
              Ver catálogo completo
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-6 gap-4 sm:gap-5">
            {recentMovies.map((movie) => (
              <MediaCard key={`movie_${movie.id || movie.stream_id}`} item={movie} />
            ))}
          </div>
        </section>
      )}

      {/* 6. ÚLTIMOS UPDATES DE SÉRIES (No final da página inicial) - Grid de 6 colunas no desktop (12 itens) */}
      {recentSeries.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-violet-600/20 text-violet-400 border border-violet-500/30 flex items-center justify-center">
                <Video className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-black text-white tracking-tight">
                    Últimos Updates de Séries
                  </h2>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase tracking-wider">
                    Recém-Atualizadas
                  </span>
                </div>
                <p className="text-[11px] text-neutral-400">
                  Novas séries e temporadas adicionadas ao servidor
                </p>
              </div>
            </div>

            <Link
              href="/series"
              className="text-xs text-violet-400 hover:text-violet-300 font-semibold flex items-center gap-1 transition self-start sm:self-auto"
            >
              Ver todas as séries
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-6 gap-4 sm:gap-5">
            {recentSeries.map((series) => (
              <MediaCard key={`series_${series.id || series.stream_id}`} item={series} />
            ))}
          </div>
        </section>
      )}

      {/* Modal de Sincronização */}
      <SyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        onSyncComplete={loadLocalData}
      />
    </div>
  );
}
