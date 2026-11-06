'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Play, Info, ChevronLeft, ChevronRight, Star, Sparkles, Film, Video } from 'lucide-react';
import { BaseStreamItem, EnrichedMetadata } from '@/lib/types';
import { getInfoUrl, getWatchUrl } from '@/lib/routes';

interface HeroSliderProps {
  items: BaseStreamItem[];
  onSyncClick?: () => void;
}

export default function HeroSlider({ items, onSyncClick }: HeroSliderProps) {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [metadataMap, setMetadataMap] = useState<Record<string, EnrichedMetadata>>({});
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const total = items.length;
  const currentItem = items[currentIndex];

  // Avança para o próximo slide
  const nextSlide = useCallback(() => {
    if (total === 0) return;
    setCurrentIndex((prev) => (prev + 1) % total);
  }, [total]);

  // Volta para o slide anterior
  const prevSlide = useCallback(() => {
    if (total === 0) return;
    setCurrentIndex((prev) => (prev - 1 + total) % total);
  }, [total]);

  // Auto-avanço a cada 6 segundos
  useEffect(() => {
    if (total <= 1 || isPaused) return;

    timerRef.current = setInterval(() => {
      nextSlide();
    }, 6000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [total, isPaused, nextSlide, currentIndex]);

  // Busca metadados enriquecidos para o item atual (backdrop em alta resolução e sinopse real)
  useEffect(() => {
    if (!currentItem) return;
    const key = `${currentItem.stream_type}_${currentItem.stream_id}`;
    if (metadataMap[key]) return;

    let isMounted = true;
    async function fetchMeta() {
      try {
        const titleToSearch = currentItem.title || currentItem.name;
        const catParam = currentItem.category_name
          ? `&category=${encodeURIComponent(currentItem.category_name)}`
          : '';
        const res = await fetch(
          `/api/metadata?title=${encodeURIComponent(titleToSearch)}&type=${currentItem.stream_type}${catParam}`
        );
        if (res.ok && isMounted) {
          const data: EnrichedMetadata = await res.json();
          if (data && data.source !== 'none') {
            setMetadataMap((prev) => ({ ...prev, [key]: data }));
          }
        }
      } catch (e) {
        // Silencioso em caso de falha de metadados
      }
    }

    fetchMeta();
    return () => {
      isMounted = false;
    };
  }, [currentItem, metadataMap]);

  if (!currentItem) {
    return (
      <section className="relative w-full h-[55vh] min-h-[420px] max-h-[580px] overflow-hidden bg-neutral-950 flex items-center justify-center">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-950/20 via-[#0b0c10] to-[#0b0c10]" />
        <div className="relative z-10 text-center px-4 max-w-xl space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center mx-auto text-violet-400">
            <Sparkles className="w-6 h-6" />
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-white">Bem-vindo ao AGUENATV</h1>
          <p className="text-xs sm:text-sm text-neutral-400">
            Sincronize sua lista para aproveitar as novidades, filmes, séries e transmissões ao vivo.
          </p>
          {onSyncClick && (
            <button
              onClick={onSyncClick}
              className="px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition shadow-lg shadow-violet-600/30 cursor-pointer"
            >
              Sincronizar Lista IPTV
            </button>
          )}
        </div>
      </section>
    );
  }

  const currentMeta = metadataMap[`${currentItem.stream_type}_${currentItem.stream_id}`];
  const backdropImage =
    currentMeta?.backdropUrl || currentItem.stream_icon || '/placeholder.png';
  const isSeries = currentItem.stream_type === 'series';
  const watchUrl = getWatchUrl(currentItem.stream_type, currentItem.stream_id);
  const infoUrl = getInfoUrl(currentItem.stream_type, currentItem.stream_id);

  // Classificação ou 4K tag
  const is4K =
    /\b(4k|uhd|2160p)\b/i.test(currentItem.title || currentItem.name || '') ||
    /\b(4k|uhd)\b/i.test(currentItem.category_name || '');

  return (
    <section
      className="relative w-full h-[70vh] min-h-[480px] max-h-[660px] overflow-hidden bg-neutral-950 flex items-end select-none"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Background Image com Cross-Fade Suave - Camadas Leves para Alta Visibilidade */}
      <div className="absolute inset-0">
        <img
          key={backdropImage}
          src={backdropImage}
          alt={currentItem.title || currentItem.name}
          className="w-full h-full object-cover object-center opacity-85 sm:opacity-90 scale-105 transition-all duration-1000 ease-out"
          onError={(e) => {
            (e.target as HTMLElement).style.display = 'none';
          }}
        />
        {/* Gradientes suaves e cinematográficos: protegem o texto à esquerda mantendo a imagem nítida e iluminada no centro e à direita */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0c10] via-[#0b0c10]/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0b0c10]/95 via-[#0b0c10]/40 to-transparent" />
      </div>

      {/* Conteúdo Principal do Slide */}
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-14 sm:pb-16 w-full z-10 flex flex-col items-start gap-4">
        {/* Badges de Identificação e Categoria */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider bg-violet-600 text-white shadow-lg shadow-violet-600/30 flex items-center gap-1.5">
            <Sparkles className="w-3 h-3" />
            Último Update
          </span>

          <span
            className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider border ${
              isSeries
                ? 'bg-indigo-600/25 text-indigo-300 border-indigo-500/40'
                : 'bg-emerald-600/25 text-emerald-300 border-emerald-500/40'
            }`}
          >
            {isSeries ? 'Série' : 'Filme'}
          </span>

          {is4K && (
            <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-widest">
              4K Ultra HD
            </span>
          )}

          {currentItem.rating && Number(currentItem.rating) > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-white/10 text-amber-300 border border-white/10">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              {Number(currentItem.rating).toFixed(1)}
            </span>
          )}

          <span className="text-xs text-neutral-400 font-medium hidden sm:inline">
            • {currentItem.category_name || 'Geral'}
          </span>
        </div>

        {/* Título de Grande Impacto */}
        <h1 className="text-2xl sm:text-4xl md:text-5xl font-black tracking-tight text-white max-w-3xl leading-tight drop-shadow-md">
          {currentItem.title || currentItem.name}
        </h1>

        {/* Sinopse / Plot Clamped */}
        <p className="text-xs sm:text-sm text-neutral-300 max-w-2xl line-clamp-2 sm:line-clamp-3 leading-relaxed drop-shadow">
          {currentMeta?.overview ||
            (currentItem as any).plot ||
            'Adicionado recentemente ao catálogo do servidor com alta qualidade de transmissão e reprodução instantânea.'}
        </p>

        {/* Botões de Ação */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Link
            href={watchUrl}
            tabIndex={0}
            data-tv-focusable="true"
            className="px-6 py-3 rounded-2xl bg-violet-600 hover:bg-violet-700 text-white text-xs sm:text-sm font-bold shadow-xl shadow-violet-600/40 transition-all flex items-center gap-2 group cursor-pointer hover:scale-105 active:scale-95 focus:outline-none"
          >
            <Play className="w-4 h-4 fill-white group-hover:scale-110 transition-transform" />
            Assistir Agora
          </Link>

          <Link
            href={infoUrl}
            tabIndex={0}
            data-tv-focusable="true"
            className="px-5 py-3 rounded-2xl bg-white/10 hover:bg-white/15 text-white text-xs sm:text-sm font-bold border border-white/15 backdrop-blur-md transition-all flex items-center gap-2 cursor-pointer hover:scale-105 active:scale-95 focus:outline-none"
          >
            <Info className="w-4 h-4 text-neutral-300" />
            Mais Detalhes
          </Link>
        </div>
      </div>

      {/* CONTROLES NO CANTO DIREITO INFERIOR (Requisito Explícito do Usuário) */}
      <div className="absolute bottom-5 sm:bottom-7 right-4 sm:right-8 z-30 flex flex-col items-end gap-3 pointer-events-auto">
        {/* Indicador de Slide Numérico (Ex: 01 / 10) */}
        <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/10 text-xs shadow-xl">
          <span className="font-mono font-black text-white text-sm">
            {String(currentIndex + 1).padStart(2, '0')}
          </span>
          <span className="text-neutral-500 font-mono text-xs">/</span>
          <span className="font-mono text-neutral-400 text-xs">
            {String(total).padStart(2, '0')}
          </span>
        </div>

        {/* Botões de Navegação Prev/Next e Barra de Indicadores */}
        <div className="flex items-center gap-2">
          {/* Botão Anterior */}
          <button
            onClick={prevSlide}
            aria-label="Slide anterior"
            className="p-2.5 sm:p-3 rounded-2xl bg-black/60 hover:bg-violet-600/80 border border-white/10 hover:border-violet-500/50 text-white transition-all backdrop-blur-md cursor-pointer hover:scale-110 active:scale-95 shadow-xl group"
          >
            <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5 group-hover:-translate-x-0.5 transition-transform" />
          </button>

          {/* Indicadores Visuais de Cada Slide */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 shadow-xl">
            {items.map((_, idx) => (
              <button
                key={`dot_${idx}`}
                onClick={() => setCurrentIndex(idx)}
                aria-label={`Ir para slide ${idx + 1}`}
                className={`transition-all duration-300 rounded-full cursor-pointer ${
                  idx === currentIndex
                    ? 'w-6 h-1.5 bg-violet-500 shadow-md shadow-violet-500/50'
                    : 'w-1.5 h-1.5 bg-white/30 hover:bg-white/60'
                }`}
              />
            ))}
          </div>

          {/* Botão Próximo */}
          <button
            onClick={nextSlide}
            aria-label="Próximo slide"
            className="p-2.5 sm:p-3 rounded-2xl bg-black/60 hover:bg-violet-600/80 border border-white/10 hover:border-violet-500/50 text-white transition-all backdrop-blur-md cursor-pointer hover:scale-110 active:scale-95 shadow-xl group"
          >
            <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </div>
    </section>
  );
}
