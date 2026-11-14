'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { RotateCw } from 'lucide-react';

function isFullscreenPlaybackActive(): boolean {
  if (typeof document === 'undefined') return false;
  return Boolean(
    document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      document.documentElement.classList.contains('art-immersive-active') ||
      document.body.classList.contains('art-immersive-active')
  );
}

export default function PullToRefresh() {
  const pathname = usePathname();
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef(0);
  const isDragging = useRef(false);

  useEffect(() => {
    const isWatchPage = Boolean(pathname?.includes('/watch'));
    setPullDistance(0);
    setIsRefreshing(false);
    isDragging.current = false;

    try {
      (window as any).AndroidBridge?.setPullToRefreshEnabled?.(!isWatchPage);
    } catch {}
  }, [pathname]);

  useEffect(() => {
    // Não ativa pull-to-refresh na página do player para não colidir com controles de vídeo
    if (pathname?.includes('/watch')) {
      return;
    }

    const handleTouchStart = (e: TouchEvent) => {
      if (window.location.pathname.includes('/watch') || isFullscreenPlaybackActive()) {
        isDragging.current = false;
        return;
      }
      if (window.scrollY === 0 && e.touches.length === 1) {
        const y = e.touches[0].clientY;
        // Ignora gestos iniciados na borda superior (puxar barra de status / notificações do Android)
        if (y < 80) {
          isDragging.current = false;
          return;
        }
        startY.current = y;
        isDragging.current = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging.current || window.scrollY > 0 || isFullscreenPlaybackActive()) {
        isDragging.current = false;
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

      if (isFullscreenPlaybackActive()) {
        setPullDistance(0);
        return;
      }

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

    const handleTouchCancel = () => {
      isDragging.current = false;
      setPullDistance(0);
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('touchcancel', handleTouchCancel, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, [pullDistance, isRefreshing, pathname]);

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
