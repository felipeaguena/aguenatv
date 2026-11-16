'use client';

import { useState, useMemo } from 'react';
import { Heart, Search, Trash2 } from 'lucide-react';
import { useFavorites } from '@/hooks/useFavorites';
import TvMediaCard from '@/components/tv/TvMediaCard';
import { StreamType } from '@/lib/types';

type FavTab = 'all' | 'live' | 'movie' | 'series';

export default function TvFavoritesPage() {
  const { favorites, removeFavorite, loading } = useFavorites();
  const [activeTab, setActiveTab] = useState<FavTab>('all');
  const [filterText, setFilterText] = useState('');
  const [manageMode, setManageMode] = useState(false);

  const filteredFavorites = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    return favorites.filter((fav) => {
      if (activeTab !== 'all' && fav.stream_type !== activeTab) return false;
      if (q) {
        const hay = `${fav.title || ''} ${fav.category_name || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [favorites, activeTab, filterText]);

  const counts = useMemo(
    () => ({
      all: favorites.length,
      live: favorites.filter((f) => f.stream_type === 'live').length,
      movie: favorites.filter((f) => f.stream_type === 'movie').length,
      series: favorites.filter((f) => f.stream_type === 'series').length,
    }),
    [favorites]
  );

  return (
    <div className="p-6 sm:p-8 space-y-6" data-tv-zone="content">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-rose-600/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
            <Heart className="w-5 h-5 fill-rose-500" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">Meus Favoritos</h1>
            <p className="text-xs text-neutral-400">
              Seus canais, filmes e séries salvos para acesso imediato
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              data-tv-focusable="true"
              data-tv-focus="input"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filtrar favoritos..."
              className="w-48 sm:w-60 bg-[#131420] border border-white/15 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder:text-neutral-500"
            />
          </div>

          {favorites.length > 0 && (
            <button
              type="button"
              tabIndex={0}
              data-tv-focusable="true"
              data-tv-focus="button"
              onClick={() => setManageMode((prev) => !prev)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 cursor-pointer transition ${
                manageMode
                  ? 'bg-rose-600 text-white border-rose-400'
                  : 'bg-white/5 hover:bg-white/10 text-neutral-300 border-white/10'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{manageMode ? 'Concluir Remoção' : 'Gerenciar'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Filtros por Tipo */}
      <div className="flex flex-wrap items-center gap-2" data-tv-row="true">
        {(
          [
            { id: 'all', label: 'Todos', count: counts.all },
            { id: 'live', label: 'TV Ao Vivo', count: counts.live },
            { id: 'movie', label: 'Filmes', count: counts.movie },
            { id: 'series', label: 'Séries', count: counts.series },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            tabIndex={0}
            data-tv-focusable="true"
            data-tv-focus="pill"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-full text-xs font-bold border flex items-center gap-2 cursor-pointer transition ${
              activeTab === tab.id
                ? 'bg-violet-600 text-white border-violet-400 shadow-lg shadow-violet-600/30'
                : 'bg-white/5 hover:bg-white/10 text-neutral-300 border-white/10'
            }`}
          >
            <span>{tab.label}</span>
            <span className="text-[10px] font-mono opacity-80">{tab.count}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredFavorites.length === 0 ? (
        <div className="p-14 rounded-3xl bg-[#12131c] border border-white/10 text-center max-w-md mx-auto space-y-3">
          <Heart className="w-10 h-10 text-neutral-500 mx-auto" />
          <p className="font-bold text-white">Nenhum favorito encontrado</p>
          <p className="text-xs text-neutral-400">
            Marque canais, filmes ou séries como favoritos para exibi-los aqui.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filteredFavorites.map((fav, idx) => (
            <div key={`${fav.stream_type}_${fav.stream_id}`} className="relative">
              <TvMediaCard
                autoFocus={idx === 0}
                onSelect={
                  manageMode
                    ? () => removeFavorite(fav.stream_id, fav.stream_type)
                    : undefined
                }
                item={{
                  stream_id: fav.stream_id,
                  stream_type: fav.stream_type as StreamType,
                  name: fav.title || '',
                  title: fav.title,
                  stream_icon: fav.poster_url,
                  category_name: fav.category_name,
                  rating: fav.rating,
                }}
              />
              {manageMode && (
                <div className="mt-1.5 text-center text-[11px] font-bold text-rose-400">
                  Clique / Enter para remover
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
