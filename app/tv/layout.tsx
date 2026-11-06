'use client';

import { useEffect } from 'react';
import './tv.css';
import { PlayerProvider } from '@/context/PlayerContext';
import FloatingPlayer from '@/components/player/FloatingPlayer';
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
        <main className="flex-1">{children}</main>
        <FloatingPlayer />
      </div>
    </PlayerProvider>
  );
}
