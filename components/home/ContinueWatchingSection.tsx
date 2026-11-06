'use client';
import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Play,
  Info,
  X,
  ChevronLeft,
  ChevronRight,
  Clock,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { useContinueWatching } from '@/hooks/useContinueWatching';
import ImageWithFallback from '@/components/ui/ImageWithFallback';
import { ContinueWatchingItem } from '@/lib/types';
import { getInfoUrl } from '@/lib/routes';

function formatTimeRemaining(current: number, duration: number): string {
  if (!duration || duration <= 0) {
    const mins = Math.max(1, Math.floor(current / 60));
    return `${mins} min assistidos`;
  }
  const remaining = duration - current;
  if (remaining <= 60) return 'Quase no fim';
  const remMin = Math.round(remaining / 60);
  if (remMin >= 60) {
    const h = Math.floor(remMin / 60);
    const m = remMin % 60;
    return `Restam ${h}h ${m}m`;
  }
  return `Restam ${remMin} min`;
}

function getResumeUrl(item: ContinueWatchingItem): string {
  const t = Math.max(0, Math.floor(item.current_time));
  if (item.stream_type === 'series') {
    let url = `/series/${item.stream_id}/watch?t=${t}`;
    if (item.episode_id) url += `&ep=${item.episode_id}`;
    if (item.season_num) url += `&season=${item.season_num}`;
    return url;
  }
  return `/movie/${item.stream_id}/watch?t=${t}`;
}

export default function ContinueWatchingSection() {
  const router = useRouter();
  const { items, removeItem, loading } = useContinueWatching();
  const [mounted, setMounted] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || items.length === 0) return null;

  const scrollLeft = () => {
    if (!scrollContainerRef.current) return;
    scrollContainerRef.current.scrollBy({ left: -460, behavior: 'smooth' });
  };

  const scrollRight = () => {
    if (!scrollContainerRef.current) return;
    scrollContainerRef.current.scrollBy({ left: 460, behavior: 'smooth' });
  };

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
      {/* Cabeçalho da Seção com Título e Botões de Scroll Netflix */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-violet-600/20 text-violet-400 border border-violet-500/30 flex items-center justify-center">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
              Continue Assistindo
            </h2>
            <p className="text-[11px] text-neutral-400">
              Retome seus filmes e episódios de onde você parou
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500 hidden sm:inline">
            {items.length} {items.length === 1 ? 'item' : 'itens'} em andamento
          </span>

          <div className="flex items-center gap-1">
            <button
              onClick={scrollLeft}
              aria-label="Rolar carrossel para a esquerda"
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 hover:text-white transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={scrollRight}
              aria-label="Rolar carrossel para a direita"
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 hover:text-white transition cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Carrossel Horizontal Estilo Netflix */}
      <div
        ref={scrollContainerRef}
        className="flex items-stretch gap-4 overflow-x-auto pb-4 pt-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent snap-x scroll-smooth"
        style={{ scrollbarWidth: 'thin' }}
      >
        {items.slice(0, 24).map((item) => {
          const isSeries = item.stream_type === 'series';
          const resumeUrl = getResumeUrl(item);
          const infoUrl = getInfoUrl(item.stream_type, item.stream_id);
          const percent = Math.min(100, Math.max(3, item.progress_percentage || 0));
          const timeText = formatTimeRemaining(item.current_time, item.duration);
          const displayImage = item.backdrop_url || item.poster_url;

          return (
            <div
              key={item.id}
              tabIndex={0}
              role="button"
              data-tv-focusable="true"
              onClick={() => router.push(resumeUrl)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  router.push(resumeUrl);
                }
              }}
              className="group relative flex-none w-[260px] sm:w-[300px] snap-start rounded-2xl overflow-hidden bg-[#13141b] border border-white/10 hover:border-violet-500/40 transition-all duration-300 hover:shadow-2xl hover:shadow-violet-600/20 flex flex-col justify-between cursor-pointer focus:outline-none"
            >
              {/* Thumbnail 16:9 Cinema */}
              <div className="relative aspect-video w-full overflow-hidden bg-black">
                <ImageWithFallback
                  src={displayImage}
                  alt={item.title}
                  className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                />

                {/* Gradiente Escuro no fundo do thumbnail */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />

                {/* Badge de Tipo no Topo Esquerdo */}
                <div className="absolute top-2.5 left-2.5 z-10 pointer-events-none">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider backdrop-blur-md border ${
                      isSeries
                        ? 'bg-indigo-600/40 text-indigo-200 border-indigo-400/40'
                        : 'bg-emerald-600/40 text-emerald-200 border-emerald-400/40'
                    }`}
                  >
                    {isSeries ? 'Série' : 'Filme'}
                  </span>
                </div>

                {/* Botão de Remover "X" no Topo Direito */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    removeItem(item.id);
                  }}
                  title="Remover de Continue Assistindo"
                  className="absolute top-2.5 right-2.5 z-20 p-1.5 rounded-full bg-black/60 hover:bg-rose-600 text-white/70 hover:text-white transition backdrop-blur-md opacity-0 group-hover:opacity-100 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>

                {/* Overlay Central com Botão de Play (Estilo Netflix) */}
                <Link
                  href={resumeUrl}
                  className="absolute inset-0 z-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-[1px]"
                >
                  <div className="w-12 h-12 rounded-full bg-violet-600 text-white flex items-center justify-center shadow-xl shadow-violet-600/50 transform group-hover:scale-110 transition-transform">
                    <Play className="w-5 h-5 fill-white ml-0.5" />
                  </div>
                </Link>

                {/* Barra de Progresso Vermelha / Violeta na Borda Inferior da Imagem */}
                <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-neutral-800/80 z-20 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-violet-600 via-fuchsia-500 to-rose-500 transition-all duration-300 rounded-r-full shadow-sm shadow-violet-500/50"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>

              {/* Informações Abaixo da Imagem */}
              <div className="p-3.5 space-y-1.5 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-white truncate max-w-full" title={item.title}>
                    {item.title}
                  </h3>

                  {isSeries && (
                    <p className="text-[11px] text-neutral-400 font-medium truncate">
                      {item.season_num !== undefined ? `T${item.season_num}` : ''}
                      {item.episode_num !== undefined ? `:E${item.episode_num}` : ''}
                      {item.episode_title ? ` • ${item.episode_title}` : ''}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-white/5">
                  <span className="text-violet-400 font-semibold flex items-center gap-1">
                    <RotateCcw className="w-3 h-3" />
                    {timeText}
                  </span>

                  <Link
                    href={infoUrl}
                    className="text-neutral-500 hover:text-white transition flex items-center gap-1"
                    title="Ver página de detalhes"
                  >
                    <Info className="w-3 h-3" />
                    <span className="hidden sm:inline">Info</span>
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
