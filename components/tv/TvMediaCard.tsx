'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Info, Tv, Star, Heart, CheckCircle2 } from 'lucide-react';
import { BaseStreamItem } from '@/lib/types';
import { getTvWatchUrl, getTvInfoUrl } from '@/lib/tv-routes';
import { useFavorites } from '@/hooks/useFavorites';
import { useWatched } from '@/hooks/useWatched';
import ImageWithFallback from '@/components/ui/ImageWithFallback';
import { cleanCategoryName, isRecentlyAdded } from '@/lib/stream-utils';

interface TvMediaCardProps {
  item: BaseStreamItem;
  isNew?: boolean;
  onFocusItem?: (item: BaseStreamItem) => void;
  onSelect?: (item: BaseStreamItem) => void;
  autoFocus?: boolean;
}

export default function TvMediaCard({
  item,
  isNew,
  onFocusItem,
  onSelect,
  autoFocus = false,
}: TvMediaCardProps) {
  const router = useRouter();
  const { isFavorite } = useFavorites();
  const { isWatched } = useWatched();

  const isLive = item.stream_type === 'live';
  const favorited = isFavorite(item.stream_id, item.stream_type);
  const watched = !isLive && isWatched(item.stream_id, item.stream_type);
  const extraItem = item as BaseStreamItem & { isNew?: boolean; is_new?: boolean };
  const isItemNew = Boolean(
    !isLive && (isNew || extraItem.isNew || extraItem.is_new || isRecentlyAdded(item))
  );

  const cleanIcon =
    item.stream_icon &&
    typeof item.stream_icon === 'string' &&
    item.stream_icon.trim() &&
    item.stream_icon !== 'undefined' &&
    item.stream_icon !== 'null'
      ? item.stream_icon.trim()
      : null;

  const resolutionTag = useMemo(() => {
    const text = `${item.title || ''} ${item.name || ''}`;
    const match = text.match(/\b(4K|UHD|FHD|1080p|720p|60FPS)\b/i);
    return match ? match[0].toUpperCase() : null;
  }, [item.title, item.name]);

  const handleAction = () => {
    if (onSelect) {
      onSelect(item);
      return;
    }
    if (isLive) {
      router.push(getTvWatchUrl(item.stream_type, item.stream_id));
    } else {
      router.push(getTvInfoUrl(item.stream_type, item.stream_id));
    }
  };

  return (
    <div
      tabIndex={0}
      role="button"
      data-tv-focusable="true"
      data-tv-focus="card"
      data-tv-autofocus={autoFocus ? 'true' : undefined}
      onClick={handleAction}
      onFocus={() => onFocusItem?.(item)}
      onMouseEnter={() => onFocusItem?.(item)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleAction();
        }
      }}
      className={`tv-card group relative flex flex-col rounded-2xl overflow-hidden cursor-pointer bg-[#12131c] border transition-all duration-200 focus:outline-none shrink-0 ${
        watched
          ? 'border-emerald-500/70 shadow-[0_0_14px_rgba(16,185,129,0.2)]'
          : 'border-white/10'
      }`}
    >
      {/* Imagem / Poster */}
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

        {/* Overlay de ação ao focar ou passar mouse */}
        <div className="absolute inset-0 z-10 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity bg-black/35 pointer-events-none">
          <div className="w-11 h-11 rounded-full bg-violet-600/95 text-white flex items-center justify-center shadow-xl shadow-violet-600/40 border border-white/20">
            {isLive ? <Play className="w-5 h-5 fill-white ml-0.5" /> : <Info className="w-5 h-5" />}
          </div>
        </div>

        {/* Badges superiores */}
        <div className="absolute top-2 left-2 right-2 z-20 flex items-center justify-between gap-1 pointer-events-none">
          <div className="flex items-center gap-1 truncate">
            {isLive ? (
              <>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded bg-rose-600 text-white shadow-md">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  AO VIVO
                </span>
                {resolutionTag && (
                  <span className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider rounded bg-black/70 text-neutral-200 border border-white/15">
                    {resolutionTag}
                  </span>
                )}
              </>
            ) : (
              <>
                {isItemNew && (
                  <span className="px-1.5 py-0.5 text-[9px] font-black uppercase rounded tracking-wider bg-emerald-500 text-black shadow">
                    NOVO
                  </span>
                )}
                {resolutionTag === '4K' || resolutionTag === 'UHD' ? (
                  <span className="px-1.5 py-0.5 text-[9px] font-black uppercase rounded bg-amber-500/25 text-amber-300 border border-amber-500/40">
                    4K
                  </span>
                ) : null}
                {item.rating && Number(item.rating) > 0 ? (
                  <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-black/70 text-amber-300 border border-white/15">
                    <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                    {Number(item.rating).toFixed(1)}
                  </span>
                ) : null}
              </>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {watched && (
              <div className="p-1 rounded-md bg-emerald-600 text-white shadow">
                <CheckCircle2 className="w-3 h-3" />
              </div>
            )}
            {favorited && (
              <div className="p-1 rounded-md bg-rose-600 text-white shadow">
                <Heart className="w-3 h-3 fill-white" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detalhes do Card */}
      <div className="p-3 flex flex-col justify-between flex-1">
        <h3 className="text-xs sm:text-sm font-bold text-neutral-100 line-clamp-1 group-focus:text-violet-300 group-hover:text-violet-300 transition-colors">
          {item.title || item.name}
        </h3>
        <div className="flex items-center justify-between text-[11px] text-neutral-400 mt-1 gap-2">
          <span className="truncate">
            {cleanCategoryName(item.category_name || '') || item.category_name || (isLive ? 'Canal' : 'Geral')}
          </span>
          <span className="text-[10px] font-bold text-violet-400 shrink-0">
            {isLive ? 'Assistir' : 'Detalhes'}
          </span>
        </div>
      </div>
    </div>
  );
}
