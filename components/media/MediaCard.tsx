'use client';
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Heart, CheckCircle2, Info, Tv } from 'lucide-react';
import { BaseStreamItem } from '@/lib/types';
import { getWatchUrl, getInfoUrl } from '@/lib/routes';
import { useFavorites } from '@/hooks/useFavorites';
import { useWatched } from '@/hooks/useWatched';
import { isRecentlyAdded, cleanCategoryName } from '@/lib/stream-utils';
import ImageWithFallback from '@/components/ui/ImageWithFallback';

interface MediaCardProps {
  item: BaseStreamItem;
  streamUrl?: string;
}

export default function MediaCard({ item }: MediaCardProps) {
  const router = useRouter();
  const { isFavorite, addFavorite, removeFavorite } = useFavorites();
  const { isWatched, markWatched, removeWatched } = useWatched();

  const isLive = item.stream_type === 'live';
  const favorited = isFavorite(item.stream_id, item.stream_type);
  const watched = isWatched(item.stream_id, item.stream_type);
  const isItemNew = Boolean(
    (item as any).isNew ||
    (item as any).is_new ||
    isRecentlyAdded(item)
  );

  const cleanIcon =
    item.stream_icon && typeof item.stream_icon === 'string' && item.stream_icon.trim() && item.stream_icon !== 'undefined' && item.stream_icon !== 'null'
      ? item.stream_icon.trim()
      : null;

  // Extrai tags de resolução caso estejam presentes no nome do canal (ex: 4K, FHD, 60FPS, HD)
  const resolutionTag = useMemo(() => {
    if (!isLive) return null;
    const text = `${item.title || ''} ${item.name || ''}`;
    const match = text.match(/\b(4K|UHD|FHD|1080p|720p|60FPS)\b/i);
    return match ? match[0].toUpperCase() : null;
  }, [isLive, item.title, item.name]);

  // Clicar no card abre a página de RESUMO / INFO estilo Miruro
  const handleOpenInfo = () => {
    router.push(getInfoUrl(item.stream_type, item.stream_id));
  };

  // Clicar no botão Play no hover vai direto para o player
  const handleDirectPlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(getWatchUrl(item.stream_type, item.stream_id));
  };

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (favorited) {
      removeFavorite(item.stream_id, item.stream_type);
    } else {
      addFavorite({
        streamId: item.stream_id,
        streamType: item.stream_type,
        title: item.title || item.name,
        posterUrl: item.stream_icon,
        categoryName: item.category_name,
        rating: item.rating,
      });
    }
  };

  const handleWatchedClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (watched) {
      removeWatched(item.stream_id, item.stream_type);
    } else {
      markWatched(
        item.stream_id,
        item.stream_type,
        item.title || item.name,
        true,
        {
          posterUrl: item.stream_icon,
          categoryName: item.category_name,
          rating: item.rating,
        }
      );
    }
  };

  return (
    <div
      onClick={handleOpenInfo}
      tabIndex={0}
      role="button"
      data-tv-focusable="true"
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (isLive) {
            router.push(getWatchUrl(item.stream_type, item.stream_id));
          } else {
            handleOpenInfo();
          }
        }
      }}
      className={`group relative flex flex-col rounded-2xl overflow-hidden cursor-pointer bg-[#13141b] border card-hover-effect transition-all focus:outline-none ${
        watched && !isLive
          ? 'border-emerald-500 shadow-[0_0_18px_rgba(16,185,129,0.3)]'
          : isLive
          ? 'border-white/5 hover:border-violet-500/50 hover:shadow-[0_8px_24px_rgba(139,92,246,0.18)]'
          : 'border-white/5 hover:border-violet-500/50'
      }`}
    >
      {/* Imagem / Poster com proporção 3:4 para filmes/séries e 16:9 widescreen para TV ao Vivo */}
      <div className={`relative w-full bg-[#0a0a0f] overflow-hidden ${isLive ? 'aspect-video' : 'aspect-[3/4]'}`}>
        {isLive ? (
          <>
            {/* Camada 1: Efeito Luz Ambiente (Glow Desfocado das cores do canal) */}
            {cleanIcon ? (
              <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
                <img
                  src={cleanIcon}
                  alt=""
                  aria-hidden="true"
                  className="w-full h-full object-cover scale-150 blur-2xl opacity-35 saturate-150 transition-all duration-700 group-hover:scale-175 group-hover:opacity-50"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
                {/* Gradiente escuro para contraste profissional e elegância */}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0e1017] via-[#0e1017]/70 to-[#0e1017]/35" />
              </div>
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-violet-950/20 via-[#12131a] to-[#0a0a0f]" />
            )}

            {/* Camada 2: Logo Nítido Centralizado com Drop-Shadow */}
            <div className="relative z-10 w-full h-full flex items-center justify-center p-4 sm:p-5 pointer-events-none select-none">
              <div className="relative w-full h-full max-h-[72%] max-w-[72%] flex items-center justify-center">
                <ImageWithFallback
                  src={cleanIcon}
                  alt={item.title || item.name}
                  className="w-auto h-auto max-w-full max-h-full object-contain drop-shadow-[0_4px_16px_rgba(0,0,0,0.85)] transition-transform duration-300 group-hover:scale-110 filter"
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
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            {/* Gradiente sutil sobre a imagem */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0b0c10] via-transparent to-black/30 pointer-events-none z-[1]" />
          </>
        )}

        {/* Overlay com Ações ao passar o mouse */}
        <div className="absolute inset-0 z-10 flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/55 backdrop-blur-[2px]">
          {/* Botão Assistir Direto */}
          <button
            type="button"
            onClick={handleDirectPlay}
            className="w-11 h-11 rounded-full bg-violet-600 hover:bg-violet-700 text-white flex items-center justify-center shadow-lg shadow-violet-600/50 hover:scale-110 transition-transform cursor-pointer"
            title="Assistir Agora"
          >
            <Play className="w-5 h-5 fill-white ml-0.5" />
          </button>

          {/* Botão Detalhes */}
          <button
            type="button"
            onClick={handleOpenInfo}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center border border-white/10 hover:scale-110 transition-transform cursor-pointer"
            title="Ver Resumo e Detalhes"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>

        {/* Badges superiores e Botões Fixos de Concluído e Favorito (z-20: sempre visíveis) */}
        <div className="absolute top-2.5 left-2.5 right-2.5 z-20 flex items-center justify-between pointer-events-none">
          {/* Tag NOVO ou AO VIVO no canto superior esquerdo */}
          <div className="flex items-center gap-1.5 max-w-[65%] truncate pointer-events-auto">
            {isLive ? (
              <>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9.5px] font-black uppercase tracking-wider rounded-md bg-rose-600/95 text-white shadow-lg shadow-rose-600/35 border border-rose-400/30 backdrop-blur-md">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  AO VIVO
                </span>
                {resolutionTag && (
                  <span className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider rounded bg-black/60 text-neutral-200 border border-white/15 backdrop-blur-md">
                    {resolutionTag}
                  </span>
                )}
              </>
            ) : (
              isItemNew && (
                <span className="px-1.5 py-0.5 text-[9px] font-black uppercase rounded-md tracking-wider bg-emerald-500 text-black shadow-lg shadow-emerald-500/50 shrink-0 animate-pulse">
                  NOVO
                </span>
              )
            )}
          </div>

          {/* Ações Rápidas Fixas: Concluído / Não Concluído e Favoritos */}
          <div className="flex items-center gap-1.5 pointer-events-auto">
            {/* Botão Fixo de Concluído / Não Concluído (apenas filmes e séries) */}
            {!isLive && (
              <button
                type="button"
                onClick={handleWatchedClick}
                className={`p-1.5 rounded-lg backdrop-blur-md transition-all border shadow-lg cursor-pointer ${
                  watched
                    ? 'bg-emerald-600 text-white border-emerald-400 scale-105 shadow-emerald-600/40'
                    : 'bg-black/70 text-neutral-400 border-white/15 hover:text-white hover:bg-black/90 hover:border-emerald-500/50 hover:scale-110'
                }`}
                title={watched ? 'Concluído (clique para desmarcar)' : 'Marcar como concluído'}
                aria-label={watched ? 'Concluído (clique para desmarcar)' : 'Marcar como concluído'}
              >
                <CheckCircle2 className={`w-3.5 h-3.5 ${watched ? 'fill-emerald-400 text-white' : ''}`} />
              </button>
            )}

            {/* Botão Fixo de Favoritos */}
            <button
              type="button"
              onClick={handleFavoriteClick}
              className={`p-1.5 rounded-lg backdrop-blur-md transition-all border shadow-lg cursor-pointer ${
                favorited
                  ? 'bg-rose-500 text-white border-rose-400 scale-105 shadow-rose-500/40'
                  : 'bg-black/70 text-neutral-400 border-white/15 hover:text-white hover:bg-black/90 hover:border-rose-500/50 hover:scale-110'
              }`}
              title={favorited ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
              aria-label={favorited ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
            >
              <Heart className={`w-3.5 h-3.5 ${favorited ? 'fill-white text-white' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Detalhes do Card */}
      <div className="p-3 flex flex-col justify-between flex-1">
        <h3 className="text-xs font-semibold text-neutral-100 line-clamp-1 group-hover:text-violet-400 transition-colors">
          {item.title || item.name}
        </h3>
        <div className="flex items-center justify-between text-[11px] text-neutral-400 mt-1">
          <span className="truncate max-w-[140px]" title={item.category_name || 'Geral'}>
            {cleanCategoryName(item.category_name) || item.category_name || (isLive ? 'Canal de TV' : 'Geral')}
          </span>
          {isLive ? (
            <span className="text-[10px] font-semibold text-violet-400/90 flex items-center gap-1 shrink-0">
              <Tv className="w-3 h-3" />
              Canal
            </span>
          ) : (
            item.rating && (
              <span className="text-amber-400 font-medium">★ {item.rating}</span>
            )
          )}
        </div>
      </div>
    </div>
  );
}
