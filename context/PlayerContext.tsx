'use client';
import React, { createContext, useContext, useState, useCallback } from 'react';
import { StreamType } from '@/lib/types';

export interface ActiveMedia {
  streamId: string;
  streamType: StreamType;
  title: string;
  streamUrl: string;
  posterUrl?: string;
  categoryName?: string;
}

interface PlayerContextType {
  activeMedia: ActiveMedia | null;
  isPopup: boolean;
  isOpen: boolean;
  play: (media: ActiveMedia, options?: { popup?: boolean }) => void;
  close: () => void;
  togglePopup: () => void;
  setIsPopup: (val: boolean) => void;
}

const PlayerContext = createContext<PlayerContextType | null>(null);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [activeMedia, setActiveMedia] = useState<ActiveMedia | null>(null);
  const [isPopup, setIsPopup] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const play = useCallback((media: ActiveMedia, options?: { popup?: boolean }) => {
    setActiveMedia(media);
    setIsOpen(true);
    if (options?.popup !== undefined) {
      setIsPopup(options.popup);
    }
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setActiveMedia(null);
  }, []);

  const togglePopup = useCallback(() => {
    setIsPopup((prev) => !prev);
  }, []);

  return (
    <PlayerContext.Provider
      value={{
        activeMedia,
        isPopup,
        isOpen,
        play,
        close,
        togglePopup,
        setIsPopup,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer deve ser utilizado dentro de um PlayerProvider');
  }
  return context;
}
