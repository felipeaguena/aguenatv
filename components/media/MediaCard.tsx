'use client';
import { useRouter } from 'next/navigation';
import { Play, Heart, CheckCircle2, Info } from 'lucide-react';
import { BaseStreamItem } from '@/lib/types';
import { getWatchUrl, getInfoUrl } from '@/lib/routes';
import { useFavorites } from '@/hooks/useFavorites';
import { useWatched } from '@/hooks/useWatched';
import ImageWithFallback from '@/components/ui/ImageWithFallback';

interface MediaCardProps {
  item: BaseStreamItem;
  streamUrl?: string;
}

function cleanCategoryName(raw?: string): string {
  if (!raw) return '';
  return raw
    .replace(/^Canais\s*\|\s*/i, '')
    .replace(/^Filmes\s*\|\s*/i, '')
    .replace(/^Séries\s*\|\s*/i, '')
    .replace(/^Series\s*\|\s*/i, '')
    .trim();
}

export default function MediaCard({ item, streamUrl }: MediaCardProps) {
  const router = useRouter();
  const { isFavorite, addFavorite, removeFavorite } = useFavorites();
  const { isWatched, markWatched, removeWatched } = useWatched();

  const favorited = isFavorite(item.stream_id, item.stream_type);
  const watched = isWatched(item.stream_id, item.stream_type);

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
      markWatched(item.stream_id, item.stream_type, item.title || item.name, true);
    }
  };

  return (
    <div
      onClick={handleOpenInfo}
      className={`group relative flex flex-col rounded-2xl overflow-hidden cursor-pointer bg-[#13141b] border card-hover-effect transition-all ${
        watched
          ? 'border-emerald-500 shadow-[0_0_18px_rgba(16,185,129,0.3)]'
          : 'border-white/5 hover:border-violet-500/50'
      }`}
    >
      {/* Imagem / Poster com proporção 3:4 */}
      <div className="relative aspect-[3/4] w-full bg-black overflow-hidden">
        <ImageWithFallback
          src={item.stream_icon}
          alt={item.title || item.name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />

        {/* Gradiente sutil sobre a imagem */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0c10] via-transparent to-black/30 pointer-events-none z-[1]" />

        {/* Overlay com Ações ao passar o mouse (z-10: fica abaixo dos badges superiores e favoritos) */}
        <div className="absolute inset-0 z-10 flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/55 backdrop-blur-[2px]">
          {/* Botão Assistir Direto */}
          <button
            onClick={handleDirectPlay}
            className="w-11 h-11 rounded-full bg-violet-600 hover:bg-violet-700 text-white flex items-center justify-center shadow-lg shadow-violet-600/50 hover:scale-110 transition-transform cursor-pointer"
            title="Assistir Agora"
          >
            <Play className="w-5 h-5 fill-white ml-0.5" />
          </button>

          {/* Botão Detalhes */}
          <button
            onClick={handleOpenInfo}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center border border-white/10 hover:scale-110 transition-transform cursor-pointer"
            title="Ver Resumo e Detalhes"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>

        {/* Badges superiores e Botão de Favoritar (z-20: SEMPRE ACIMA DO HOVER E DO BLUR) */}
        <div className="absolute top-2.5 left-2.5 right-2.5 z-20 flex items-center justify-between pointer-events-none">
          {/* Tag de Categoria e Tipo */}
          <div className="flex items-center gap-1.5 max-w-[65%] truncate pointer-events-auto">
            <span
              className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-md tracking-wider bg-black/75 backdrop-blur-md text-neutral-200 border border-white/15 truncate shadow-md"
              title={item.category_name || (item.stream_type === 'live' ? 'TV' : item.stream_type === 'movie' ? 'Filme' : 'Série')}
            >
              {cleanCategoryName(item.category_name) || (item.stream_type === 'live' ? 'TV' : item.stream_type === 'movie' ? 'Filme' : 'Série')}
            </span>
          </div>

          {/* Ações Rápidas: Assistido e Favoritos (Clicáveis e com Destaque Máximo) */}
          <div className="flex items-center gap-1.5 pointer-events-auto">
            {/* Ícone Verde de Já Assistido */}
            {watched && (
              <button
                onClick={handleWatchedClick}
                className="p-1.5 rounded-lg bg-black/80 backdrop-blur-md text-emerald-400 border border-emerald-500/40 hover:scale-110 transition shadow-lg cursor-pointer"
                title="Já assistido (clique para desmarcar)"
              >
                <CheckCircle2 className="w-3.5 h-3.5 fill-emerald-500/20" />
              </button>
            )}

            {/* Botão de Favoritar */}
            <button
              onClick={handleFavoriteClick}
              className={`p-1.5 rounded-lg backdrop-blur-md transition border shadow-lg cursor-pointer ${
                favorited
                  ? 'bg-rose-500 text-white border-rose-400 scale-105'
                  : 'bg-black/70 text-neutral-300 border-white/15 hover:text-white hover:bg-black hover:scale-110'
              }`}
              title={favorited ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
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
          <span className="truncate max-w-[120px]">{item.category_name || 'Geral'}</span>
          {item.rating && (
            <span className="text-amber-400 font-medium">★ {item.rating}</span>
          )}
        </div>
      </div>
    </div>
  );
}
