'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { isTvDevice, setTvMode, toggleTvMode, initSpatialNavigation, TV_EVENT } from '@/lib/spatial-navigation';

interface TvContextType {
  isTv: boolean;
  toggleTv: () => void;
  enableTv: () => void;
  disableTv: () => void;
}

const TvContext = createContext<TvContextType>({
  isTv: false,
  toggleTv: () => {},
  enableTv: () => {},
  disableTv: () => {},
});

export function TvProvider({ children }: { children: React.ReactNode }) {
  const [isTv, setIsTv] = useState(false);

  useEffect(() => {
    const active = isTvDevice();
    setIsTv(active);
    if (active) {
      document.body.classList.add('tv-mode');
    }

    // Inicializa o ouvinte de navegação espacial (D-Pad)
    const cleanupSpatial = initSpatialNavigation();

    const handleTvChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setIsTv(!!detail?.enabled);
    };

    window.addEventListener(TV_EVENT, handleTvChange);

    return () => {
      cleanupSpatial();
      window.removeEventListener(TV_EVENT, handleTvChange);
    };
  }, []);

  const toggleTv = () => {
    const next = toggleTvMode();
    setIsTv(next);
  };

  const enableTv = () => {
    setTvMode(true);
    setIsTv(true);
  };

  const disableTv = () => {
    setTvMode(false);
    setIsTv(false);
  };

  return (
    <TvContext.Provider value={{ isTv, toggleTv, enableTv, disableTv }}>
      {children}
    </TvContext.Provider>
  );
}

export function useTv() {
  return useContext(TvContext);
}
