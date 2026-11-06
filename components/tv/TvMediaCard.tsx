'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Info, Tv, Star, Heart } from 'lucide-react';
import { BaseStreamItem } from '@/lib/types';
import { getWatchUrl, getInfoUrl } from '@/lib/routes';
import { useFavorites } from '@/hooks/useFavorites';
import ImageWithFallback from '@/components/ui/ImageWithFallback';
import { cleanCategoryName } from '@/lib/stream-utils';

interface TvMediaCardProps {
  item: BaseStreamItem;
}

export default function TvMediaCard({ item }: TvMediaCardProps) {
  const router = useRouter();
  const { isFavorite } = useFavorites();

  const isLive = item.stream_type === 'live';
  const favorited = isFavorite(item.stream_id, item.stream_type);

  const cleanIcon =
    item.stream_icon &&
    typeof item.stream_icon === 'string' &&
    item.stream_icon.trim() &&
    item.stream_icon !== 'undefined' &&
    item.stream_icon !== 'null'
      ? item.stream_icon.trim()
      : null;

  const resolutionTag = useMemo(() => {
    if (!isLive) return null;
    const text = `${item.title || ''} ${item.name || ''}`;
    const match = text.match(/\b(4K|UHD|FHD|1080p|720p|60FPS)\b/i);
    return match ? match[0].toUpperCase() : null;
  }, [isLive, item.title, item.name]);

  const handleAction = () => {
    if (isLive) {
      router.push(getWatchUrl(item.stream_type, item.stream_id));
    } else {
      router.push(getInfoUrl(item.stream_type, item.stream_id));
    }
  };

  return (
    <div
      tabIndex={0}
      role="button"
      data-tv-focusable="true"
      onClick={handleAction}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleAction();
        }
      }}
      className="tv-card group relative flex flex-col rounded-2xl overflow-hidden cursor-pointer bg-[#12131a] border border-white/10 transition-all duration-200 focus:outline-none shrink-0"
    >
      {/* Imagem / Poster com proporção 16:9 widescreen para TV ao vivo ou 3:4 para filmes/séries */}
      <div className={`relative w-full bg-[#0a0a0f] overflow-hidden ${isLive ? 'aspect-video' : 'aspect-[3/4]'}`}>
        {isLive ? (
          <>
            {cleanIcon ? (
              <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
                <img
                  src={cleanIcon}
                  alt=""
                  aria-hidden="true"
                  className="w-full h-full object-cover scale-150 blur-2xl opacity-35 saturate-150"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0e1017] via-[#0e1017]/70 to-[#0e1017]/35" />
              </div>
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-violet-950/20 via-[#12131a] to-[#0a0a0f]" />
            )}

            <div className="relative z-10 w-full h-full flex items-center justify-center p-4 select-none">
              <div className="relative w-full h-full max-h-[75%] max-w-[75%] flex items-center justify-center">
                <ImageWithFallback
                  src={cleanIcon}
                  alt={item.title || item.name}
                  className="w-auto h-auto max-w-full max-h-full object-contain drop-shadow-[0_4px_16px_rgba(0,0,0,0.9)]"
                  fallbackClassName="bg-transparent border-0"
                  customFallback={
                    <div className="flex flex-col items-center justify-center gap-1.5 p-2 text-center">
                      <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-violet-400">
                        <Tv className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] font-bold text-neutral-300 line-clamp-1 max-w-[120px]">
                        {item.title || item.name}
                      </span>
                    </div>
                  }
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <ImageWithFallback
              src={item.stream_icon}
              alt={item.title || item.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0b0c10] via-transparent to-black/30 pointer-events-none z-[1]" />
          </>
        )}

        {/* Badges superiores (AO VIVO, 4K, Favorito) */}
        <div className="absolute top-2 left-2 right-2 z-20 flex items-center justify-between pointer-events-none">
          <div className="flex items-center gap-1.5 truncate">
            {isLive ? (
              <>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded bg-rose-600 text-white shadow-md">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  AO VIVO
                </span>
                {resolutionTag && (
                  <span className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider rounded bg-black/60 text-neutral-200 border border-white/15">
                    {resolutionTag}
                  </span>
                )}
              </>
            ) : (
              item.rating && Number(item.rating) > 0 && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-black/60 text-amber-300 border border-white/15">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  {item.rating}
                </span>
              )
            )}
          </div>

          {favorited && (
            <div className="p-1 rounded-md bg-rose-600 text-white shadow">
              <Heart className="w-3 h-3 fill-white" />
            </div>
          )}
        </div>
      </div>

      {/* Detalhes do Card */}
      <div className="p-3 flex flex-col justify-between flex-1">
        <h3 className="text-xs sm:text-sm font-bold text-neutral-100 line-clamp-1 group-focus:text-violet-400">
          {item.title || item.name}
        </h3>
        <div className="flex items-center justify-between text-[11px] text-neutral-400 mt-1">
          <span className="truncate max-w-[130px]">
            {cleanCategoryName(item.category_name) || item.category_name || (isLive ? 'Canal' : 'Geral')}
          </span>
          <span className="text-[10px] font-semibold text-violet-400 flex items-center gap-1">
            {isLive ? 'Assistir' : 'Detalhes'}
          </span>
        </div>
      </div>
    </div>
  );
}
