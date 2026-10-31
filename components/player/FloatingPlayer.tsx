'use client';
import { usePlayer } from '@/context/PlayerContext';
import VideoPlayer from './VideoPlayer';
import { X, Minimize2, Maximize2, Heart, CheckCircle2 } from 'lucide-react';
import { useFavorites } from '@/hooks/useFavorites';
import { useWatched } from '@/hooks/useWatched';

export default function FloatingPlayer() {
  const { activeMedia, isOpen, isPopup, close, togglePopup } = usePlayer();
  const { isFavorite, addFavorite, removeFavorite } = useFavorites();
  const { isWatched, markWatched, removeWatched } = useWatched();

  if (!isOpen || !activeMedia) return null;

  const favorited = isFavorite(activeMedia.streamId, activeMedia.streamType);
  const watched = isWatched(activeMedia.streamId, activeMedia.streamType);

  const handleFavoriteToggle = () => {
    if (favorited) {
      removeFavorite(activeMedia.streamId, activeMedia.streamType);
    } else {
      addFavorite({
        streamId: activeMedia.streamId,
        streamType: activeMedia.streamType,
        title: activeMedia.title,
        posterUrl: activeMedia.posterUrl,
        categoryName: activeMedia.categoryName,
      });
    }
  };

  const handleWatchedToggle = () => {
    if (watched) {
      removeWatched(activeMedia.streamId, activeMedia.streamType);
    } else {
      markWatched(activeMedia.streamId, activeMedia.streamType, activeMedia.title, true);
    }
  };

  // Modo Popup Flutuante no canto inferior direito (estilo MiniPlayer)
  if (isPopup) {
    return (
      <div className="fixed bottom-6 right-6 z-50 w-96 max-w-[90vw] bg-[#13141b] rounded-2xl border border-white/10 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-6 duration-300">
        {/* Header do MiniPlayer */}
        <div className="px-4 py-2.5 bg-[#0b0c10]/90 backdrop-blur-md flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-2 truncate pr-2">
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider bg-violet-600/30 text-violet-300 border border-violet-500/30">
              {activeMedia.streamType}
            </span>
            <span className="text-xs font-semibold text-neutral-200 truncate">
              {activeMedia.title}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleFavoriteToggle}
              className={`p-1.5 rounded-lg transition ${
                favorited ? 'text-rose-500 hover:bg-rose-500/10' : 'text-neutral-400 hover:text-white hover:bg-white/5'
              }`}
              title={favorited ? 'Remover dos favoritos' : 'Favoritar'}
            >
              <Heart className={`w-3.5 h-3.5 ${favorited ? 'fill-rose-500' : ''}`} />
            </button>

            <button
              onClick={handleWatchedToggle}
              className={`p-1.5 rounded-lg transition ${
                watched ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-neutral-400 hover:text-white hover:bg-white/5'
              }`}
              title={watched ? 'Marcado como assistido' : 'Marcar como assistido'}
            >
              <CheckCircle2 className={`w-3.5 h-3.5 ${watched ? 'fill-emerald-500/20' : ''}`} />
            </button>

            <button
              onClick={togglePopup}
              className="p-1.5 text-neutral-400 hover:text-white hover:bg-white/5 rounded-lg transition"
              title="Expandir para modo teatro"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={close}
              className="p-1.5 text-neutral-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
              title="Fechar reprodução"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Vídeo */}
        <div className="aspect-video w-full bg-black">
          <VideoPlayer
            streamUrl={activeMedia.streamUrl}
            title={activeMedia.title}
            streamId={activeMedia.streamId}
            streamType={activeMedia.streamType}
          />
        </div>
      </div>
    );
  }

  // Modo Teatro Modal / Expandido
  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl bg-[#13141b] rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col">
        {/* Barra superior do Player Modal */}
        <div className="px-6 py-4 bg-[#0b0c10]/80 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold px-2.5 py-1 rounded-md uppercase tracking-wider bg-violet-600/30 text-violet-300 border border-violet-500/30">
              {activeMedia.streamType}
            </span>
            <h2 className="text-base md:text-lg font-bold text-neutral-100 truncate max-w-xl">
              {activeMedia.title}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleFavoriteToggle}
              className={`p-2 rounded-xl border transition flex items-center gap-1.5 text-xs font-medium ${
                favorited
                  ? 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                  : 'bg-white/5 border-white/5 text-neutral-300 hover:bg-white/10'
              }`}
            >
              <Heart className={`w-4 h-4 ${favorited ? 'fill-rose-500' : ''}`} />
              <span className="hidden sm:inline">{favorited ? 'Favoritado' : 'Favoritar'}</span>
            </button>

            <button
              onClick={handleWatchedToggle}
              className={`p-2 rounded-xl border transition flex items-center gap-1.5 text-xs font-medium ${
                watched
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                  : 'bg-white/5 border-white/5 text-neutral-300 hover:bg-white/10'
              }`}
            >
              <CheckCircle2 className={`w-4 h-4 ${watched ? 'fill-emerald-500/20' : ''}`} />
              <span className="hidden sm:inline">{watched ? 'Assistido' : 'Marcar Assistido'}</span>
            </button>

            <button
              onClick={togglePopup}
              className="p-2 text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition"
              title="Minimizar para MiniPlayer flutuante"
            >
              <Minimize2 className="w-4 h-4" />
            </button>

            <button
              onClick={close}
              className="p-2 text-neutral-400 hover:text-rose-400 bg-white/5 hover:bg-rose-500/15 rounded-xl transition"
              title="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Player de Vídeo em Alta Resolução */}
        <div className="aspect-video w-full bg-black">
          <VideoPlayer
            streamUrl={activeMedia.streamUrl}
            title={activeMedia.title}
            streamId={activeMedia.streamId}
            streamType={activeMedia.streamType}
          />
        </div>
      </div>
    </div>
  );
}
