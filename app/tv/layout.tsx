'use client';

import { Suspense, useEffect } from 'react';
import './tv.css';
import { PlayerProvider } from '@/context/PlayerContext';
import FloatingPlayer from '@/components/player/FloatingPlayer';
import TvShell from '@/components/tv/TvShell';
import { initTvSpatialNavigation } from '@/lib/tv-spatial-navigation';

export default function TvLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const cleanup = initTvSpatialNavigation();
    return () => {
      cleanup();
    };
  }, []);

  return (
    <PlayerProvider>
      <div className="tv-root min-h-screen flex flex-col bg-[#08090d] text-white selection:bg-violet-600">
        <Suspense
          fallback={
            <div className="min-h-screen flex items-center justify-center bg-[#08090d]">
              <div className="w-9 h-9 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
          }
        >
          <TvShell>{children}</TvShell>
        </Suspense>
        <FloatingPlayer />
      </div>
    </PlayerProvider>
  );
}
