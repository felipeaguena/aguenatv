'use client';

import { useState, useEffect, useRef } from 'react';
import { RotateCw } from 'lucide-react';

export default function PullToRefresh() {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef(0);
  const isDragging = useRef(false);

  useEffect(() => {
    // Não ativa pull-to-refresh na página do player para não colidir com controles de vídeo
    if (typeof window !== 'undefined' && window.location.pathname.includes('/watch')) {
      return;
    }

    const handleTouchStart = (e: TouchEvent) => {
      if (window.scrollY === 0 && e.touches.length === 1) {
        startY.current = e.touches[0].clientY;
        isDragging.current = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging.current || window.scrollY > 0) {
        setPullDistance(0);
        return;
      }

      const currentY = e.touches[0].clientY;
      const diff = currentY - startY.current;

      if (diff > 0) {
        // Amortecimento logarítmico para sensação suave
        const dampening = Math.min(100, diff * 0.45);
        setPullDistance(dampening);
      } else {
        setPullDistance(0);
      }
    };

    const handleTouchEnd = () => {
      if (!isDragging.current) return;
      isDragging.current = false;

      if (pullDistance > 65 && !isRefreshing) {
        setIsRefreshing(true);
        setPullDistance(55);
        setTimeout(() => {
          window.location.reload();
        }, 300);
      } else {
        setPullDistance(0);
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [pullDistance, isRefreshing]);

  if (pullDistance === 0 && !isRefreshing) return null;

  return (
    <div
      style={{
        transform: `translateY(${pullDistance}px)`,
        transition: isDragging.current ? 'none' : 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
      className="fixed top-0 inset-x-0 z-50 flex items-center justify-center pointer-events-none"
    >
      <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#181924]/95 border border-violet-500/30 text-white shadow-2xl backdrop-blur-md">
        <RotateCw
          className={`w-4 h-4 text-violet-400 ${
            isRefreshing || pullDistance > 65 ? 'animate-spin' : ''
          }`}
          style={{
            transform: isRefreshing ? 'none' : `rotate(${pullDistance * 3.6}deg)`,
          }}
        />
        <span className="text-xs font-bold text-neutral-200">
          {isRefreshing
            ? 'Atualizando aplicação...'
            : pullDistance > 65
            ? 'Solte para atualizar'
            : 'Puxe para atualizar'}
        </span>
      </div>
    </div>
  );
}
