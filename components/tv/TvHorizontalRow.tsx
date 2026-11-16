'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface TvHorizontalRowProps {
  title: string;
  subtitle?: string;
  badge?: string;
  icon?: React.ReactNode;
  seeAllHref?: string;
  seeAllLabel?: string;
  children: React.ReactNode;
}

export default function TvHorizontalRow({
  title,
  subtitle,
  badge,
  icon,
  seeAllHref,
  seeAllLabel = 'Ver todos',
  children,
}: TvHorizontalRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const distance = Math.max(420, Math.floor(scrollRef.current.clientWidth * 0.72));
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -distance : distance,
      behavior: 'smooth',
    });
  };

  return (
    <section className="space-y-3" data-tv-row="true">
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2.5 min-w-0">
          {icon && <div className="shrink-0">{icon}</div>}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-black text-white tracking-tight truncate">
                {title}
              </h2>
              {badge && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-violet-600/20 text-violet-300 border border-violet-500/30 shrink-0">
                  {badge}
                </span>
              )}
            </div>
            {subtitle && (
              <p className="text-[11px] text-neutral-400 truncate">{subtitle}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Setas úteis no APK Desktop e Tablet */}
          <div className="hidden sm:flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleScroll('left')}
              aria-label={`Rolar ${title} para esquerda`}
              className="p-1.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-neutral-300 hover:text-white transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handleScroll('right')}
              aria-label={`Rolar ${title} para direita`}
              className="p-1.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-neutral-300 hover:text-white transition cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {seeAllHref && (
            <Link
              href={seeAllHref}
              tabIndex={0}
              data-tv-focusable="true"
              data-tv-focus="pill"
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-violet-600/25 border border-white/10 hover:border-violet-500/40 text-xs font-bold text-violet-300 hover:text-white flex items-center gap-1 transition focus:outline-none"
            >
              <span>{seeAllLabel}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="tv-scroll-row flex items-stretch gap-4 overflow-x-auto pb-4 pt-2 px-1 scroll-smooth"
      >
        {children}
      </div>
    </section>
  );
}
