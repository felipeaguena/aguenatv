'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Artplayer from 'artplayer';
import Hls from 'hls.js';
import { Play, Pause, SkipForward, FastForward, AlertTriangle, RotateCcw } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { StatusBar } from '@capacitor/status-bar';
import { useWatched } from '@/hooks/useWatched';
import { StreamType, SkipTimesData } from '@/lib/types';

export interface PlayerVideoInfo {
  duration?: number;
  formattedDuration?: string;
  width?: number;
  height?: number;
  dimensions?: string;
  codec?: string;
}

interface VideoPlayerProps {
  streamUrl: string;
  title: string;
  streamId: string;
  streamType: StreamType;
  posterUrl?: string;
  autoPlay?: boolean;
  initialTime?: number;
  skipTimes?: SkipTimesData | null;
  onEnded?: () => void;
  onVideoInfo?: (info: PlayerVideoInfo) => void;
  onProgress?: (progress: { currentTime: number; duration: number; immediate?: boolean }) => void;
  hasPrevEpisode?: boolean;
  onPrevEpisode?: () => void;
  prevEpisodeLabel?: string;
  hasNextEpisode?: boolean;
  onNextEpisode?: () => void;
  nextEpisodeLabel?: string;
}

function formatSeconds(sec: number): string {
  if (isNaN(sec) || sec < 0) return '0:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export type DeviceCategory = 'mobile' | 'tablet' | 'desktop';

export function getDeviceCategory(): DeviceCategory {
  if (typeof window === 'undefined') return 'desktop';

  // 1. APK nativo Capacitor
  if (Capacitor.isNativePlatform()) {
    const minD = Math.min(window.innerWidth || 0, window.innerHeight || 0);
    return minD < 600 ? 'mobile' : 'tablet';
  }

  // 2. User Agent e capacidades de toque
  const ua = navigator.userAgent || '';
  const isPhoneUA = /iPhone|iPod|Android.*Mobile|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isTabletUA = /iPad|Android(?!.*Mobile)/i.test(ua);
  const minDim = Math.min(window.innerWidth, window.innerHeight);
  const maxDim = Math.max(window.innerWidth, window.innerHeight);
  const hasTouch = 'ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);

  // Smartphone em qualquer orientação (largura em retrato ou altura em paisagem < 550px)
  if (isPhoneUA || (hasTouch && minDim < 550)) {
    return 'mobile';
  }

  // Tablet (iPad, Android tablet com tela média touch)
  if (isTabletUA || (hasTouch && minDim >= 550 && maxDim <= 1366)) {
    return 'tablet';
  }

  // Desktop (mouse com cursor fino e tela ampla)
  return 'desktop';
}

function isMobileDevice(): boolean {
  return getDeviceCategory() !== 'desktop';
}

function setDynamicViewportCover(enable: boolean) {
  if (typeof document === 'undefined') return;
  try {
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'viewport');
      document.head.appendChild(meta);
    }
    let themeMeta = document.querySelector('meta[name="theme-color"]');
    if (!themeMeta) {
      themeMeta = document.createElement('meta');
      themeMeta.setAttribute('name', 'theme-color');
      document.head.appendChild(themeMeta);
    }
    if (enable) {
      meta.setAttribute(
        'content',
        'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'
      );
      themeMeta.setAttribute('content', '#000000');
      document.documentElement.classList.add('art-immersive-active');
      document.body.classList.add('art-immersive-active');
    } else {
      meta.setAttribute(
        'content',
        'width=device-width, initial-scale=1, maximum-scale=1'
      );
      themeMeta.setAttribute('content', '#0b0c10');
      document.documentElement.classList.remove('art-immersive-active');
      document.body.classList.remove('art-immersive-active');
    }
  } catch (e) {}
}

async function setFullscreenCutoutMode(enable: boolean) {
  setDynamicViewportCover(enable);

  // 1. Bridge nativa do Android (LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES e ocultação de barras)
  try {
    if (typeof window !== 'undefined' && (window as any).AndroidBridge?.setCutoutFullscreen) {
      (window as any).AndroidBridge.setCutoutFullscreen(enable);
    }
  } catch (e) {}

  // 2. Plugins Capacitor (StatusBar e ScreenOrientation)
  if (Capacitor.isNativePlatform()) {
    try {
      if (enable) {
        await StatusBar.hide().catch(() => {});
        await ScreenOrientation.lock({ orientation: 'landscape' }).catch(() => {});
      } else {
        await StatusBar.show().catch(() => {});
        await StatusBar.setBackgroundColor({ color: '#0b0c10' }).catch(() => {});
        await ScreenOrientation.unlock().catch(() => {});
      }
    } catch (e) {}
  } else if (typeof window !== 'undefined' && window.screen?.orientation) {
    try {
      if (enable && typeof (window.screen.orientation as any).lock === 'function') {
        (window.screen.orientation as any).lock('landscape').catch(() => {});
      } else if (!enable && typeof (window.screen.orientation as any).unlock === 'function') {
        (window.screen.orientation as any).unlock();
      }
    } catch (e) {}
  }
}

export default function VideoPlayer({
  streamUrl,
  title,
  streamId,
  streamType,
  posterUrl,
  autoPlay = true,
  initialTime,
  skipTimes,
  onEnded,
  onVideoInfo,
  onProgress,
  hasPrevEpisode = false,
  onPrevEpisode,
  prevEpisodeLabel = 'Capítulo Anterior',
  hasNextEpisode = false,
  onNextEpisode,
  nextEpisodeLabel = 'Próximo Episódio',
}: VideoPlayerProps) {
  const artContainerRef = useRef<HTMLDivElement>(null);
  const artInstanceRef = useRef<Artplayer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // Estados de contagem regressiva e autoplay do Próximo Episódio (30s antes do final)
  const [nextEpisodeCountdown, setNextEpisodeCountdown] = useState<number | null>(null);
  const hasAutoAdvancedRef = useRef(false);
  const hasRestoredRef = useRef(false);
  const isFullscreenRef = useRef(false);

  // Estados para exibição e dinâmica dos controles adaptados por categoria de aparelho (Mobile, Tablet, Desktop)
  const [playerMountNode, setPlayerMountNode] = useState<HTMLDivElement | null>(null);
  const [deviceCategory, setDeviceCategory] = useState<DeviceCategory>('desktop');
  const deviceCategoryRef = useRef<DeviceCategory>('desktop');
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const isControlsVisibleRef = useRef(true);
  const isPlayingRef = useRef(true);
  const lastTouchTimestampRef = useRef(0);
  const lastDoubleActionTimeRef = useRef(0);

  useEffect(() => {
    const updateCategory = () => {
      const cat = getDeviceCategory();
      setDeviceCategory(cat);
      deviceCategoryRef.current = cat;
    };
    updateCategory();
    window.addEventListener('resize', updateCategory, { passive: true });
    window.addEventListener('orientationchange', updateCategory, { passive: true });
    return () => {
      window.removeEventListener('resize', updateCategory);
      window.removeEventListener('orientationchange', updateCategory);
    };
  }, []);

  const triedExtensionsRef = useRef<Set<string>>(new Set());
  const retryCountRef = useRef(0);
  const showControlsRef = useRef<() => void>(() => {});
  const resetInactivityTimerRef = useRef<(delay?: number) => void>(() => {});

  // Estados e controle de Pular Abertura (Intro) e Encerramento (Outro)
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const [showSkipOutro, setShowSkipOutro] = useState(false);
  const [autoSkipIntro, setAutoSkipIntro] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('iptv_autoskip_intro') === 'true';
    }
    return false;
  });
  const [autoSkipOutro, setAutoSkipOutro] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('iptv_autoskip_outro') === 'true';
    }
    return false;
  });

  const skipTimesRef = useRef(skipTimes);
  const showSkipIntroRef = useRef(false);
  const showSkipOutroRef = useRef(false);
  const autoSkipIntroRef = useRef(autoSkipIntro);
  const autoSkipOutroRef = useRef(autoSkipOutro);
  const hasAutoSkippedIntroRef = useRef(false);
  const hasAutoSkippedOutroRef = useRef(false);

  const { markWatched } = useWatched();
  const hasMarkedRef = useRef(false);
  const markWatchedRef = useRef(markWatched);
  const onEndedRef = useRef(onEnded);
  const onVideoInfoRef = useRef(onVideoInfo);
  const onProgressRef = useRef(onProgress);
  const onNextEpisodeRef = useRef(onNextEpisode);
  const hasNextEpisodeRef = useRef(hasNextEpisode);
  const onPrevEpisodeRef = useRef(onPrevEpisode);
  const hasPrevEpisodeRef = useRef(hasPrevEpisode);

  const streamIdRef = useRef(streamId);
  const titleRef = useRef(title);
  const streamTypeRef = useRef(streamType);
  const posterUrlRef = useRef(posterUrl);
  const prevEpisodeLabelRef = useRef(prevEpisodeLabel);
  const nextEpisodeLabelRef = useRef(nextEpisodeLabel);
  const prevStreamUrlRef = useRef(streamUrl);
  const prevStreamTypeRef = useRef(streamType);
  const lastReportedTimeRef = useRef(0);
  const lastDurationRef = useRef(0);

  useEffect(() => {
    isControlsVisibleRef.current = isControlsVisible;
    isPlayingRef.current = isPlaying;
    skipTimesRef.current = skipTimes;
    showSkipIntroRef.current = showSkipIntro;
    showSkipOutroRef.current = showSkipOutro;
    autoSkipIntroRef.current = autoSkipIntro;
    autoSkipOutroRef.current = autoSkipOutro;
    markWatchedRef.current = markWatched;
    onEndedRef.current = onEnded;
    onVideoInfoRef.current = onVideoInfo;
    onProgressRef.current = onProgress;
    onNextEpisodeRef.current = onNextEpisode;
    hasNextEpisodeRef.current = hasNextEpisode;
    onPrevEpisodeRef.current = onPrevEpisode;
    hasPrevEpisodeRef.current = hasPrevEpisode;
    streamIdRef.current = streamId;
    titleRef.current = title;
    streamTypeRef.current = streamType;
    posterUrlRef.current = posterUrl;
    prevEpisodeLabelRef.current = prevEpisodeLabel;
    nextEpisodeLabelRef.current = nextEpisodeLabel;

    // Atualiza dinamicamente os controles na barra do player se a instância já estiver ativa
    const art = artInstanceRef.current;
    if (art && !art.isDestroy) {
      const prevBtn = art.template?.$controls?.querySelector('.art-control-prev-chapter') as HTMLElement | null;
      if (prevBtn) {
        prevBtn.style.display = hasPrevEpisode && onPrevEpisode ? '' : 'none';
        prevBtn.setAttribute('data-tooltip', prevEpisodeLabel || 'Capítulo Anterior');
      }
      const nextBtn = art.template?.$controls?.querySelector('.art-control-next-chapter') as HTMLElement | null;
      if (nextBtn) {
        nextBtn.style.display = hasNextEpisode && onNextEpisode ? '' : 'none';
        nextBtn.setAttribute('data-tooltip', nextEpisodeLabel || 'Próximo Capítulo');
      }
    }
  });

  const lastHideControlsTimeRef = useRef(0);
  const lastToggleTimeRef = useRef(0);

  const handleTogglePlay = useCallback((e?: React.MouseEvent | Event) => {
    if (e) {
      try {
        e.stopPropagation();
        (e as any).preventDefault?.();
        (e as any).nativeEvent?.stopImmediatePropagation?.();
      } catch (err) {}
    }
    const now = Date.now();
    // Bloqueia rigorosamente múltiplos acionamentos no mesmo clique (debounce de 320ms)
    if (now - lastToggleTimeRef.current < 320) {
      return;
    }
    lastToggleTimeRef.current = now;

    const art = artInstanceRef.current;
    if (!art || art.isDestroy) return;

    if (art.playing) {
      art.pause();
    } else {
      art.play().catch(() => {});
    }
    showControlsRef.current?.();
    resetInactivityTimerRef.current?.();
  }, []);

  const handleHideControls = useCallback((e?: React.MouseEvent | Event) => {
    if (e) {
      e.stopPropagation();
      try {
        (e as any).preventDefault?.();
        (e as any).nativeEvent?.stopImmediatePropagation?.();
      } catch (err) {}
    }
    const art = artInstanceRef.current;
    if (!art || art.isDestroy) return;
    if (art.setting?.show || art.contextmenu?.show) return;

    lastHideControlsTimeRef.current = Date.now();
    try {
      art.controls.show = false;
    } catch (err) {}
    const playerEl = art.template?.$player;
    if (playerEl) {
      playerEl.classList.remove('art-control-show');
      playerEl.classList.add('art-hide-cursor');
    }
    setIsControlsVisible(false);
    isControlsVisibleRef.current = false;
  }, []);

  const handleSkipIntro = useCallback((e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const art = artInstanceRef.current;
    const intro = skipTimesRef.current?.intro;
    if (art && intro) {
      art.currentTime = intro.end;
      art.notice.show = 'Abertura pulada';
      setShowSkipIntro(false);
      showSkipIntroRef.current = false;
    }
  }, []);

  const handleSkipOutro = useCallback((e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const art = artInstanceRef.current;
    if (hasNextEpisodeRef.current && onNextEpisodeRef.current) {
      setShowSkipOutro(false);
      showSkipOutroRef.current = false;
      onNextEpisodeRef.current();
    } else if (art && skipTimesRef.current?.outro) {
      art.currentTime = skipTimesRef.current.outro.end || art.duration;
      art.notice.show = 'Encerramento pulado';
      setShowSkipOutro(false);
      showSkipOutroRef.current = false;
    }
  }, []);

  // Alterna tela cheia: suporta tanto desktop (fullscreen nativo e web) quanto mobile (fullscreenWeb imersivo)
  const toggleFullscreen = useCallback((art: Artplayer) => {
    const isCurrentlyFullscreen = Boolean(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      art.fullscreen ||
      art.fullscreenWeb ||
      isFullscreenRef.current
    );

    if (isCurrentlyFullscreen) {
      // Sair do fullscreen: restaura o tamanho original da página
      if (document.fullscreenElement || (document as any).webkitFullscreenElement || (document as any).mozFullScreenElement || art.fullscreen) {
        try {
          if (document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
          } else if ((document as any).webkitExitFullscreen) {
            (document as any).webkitExitFullscreen();
          }
        } catch (e) {}
        try {
          art.fullscreen = false;
        } catch (e) {}
      }

      if (art.fullscreenWeb) {
        art.fullscreenWeb = false;
      }

      isFullscreenRef.current = false;
      setFullscreenCutoutMode(false);
    } else {
      // Entrar no fullscreen
      if (isMobileDevice()) {
        art.fullscreenWeb = true;
      } else {
        try {
          art.fullscreen = true;
        } catch (e) {
          art.fullscreenWeb = true;
        }
      }

      isFullscreenRef.current = true;
      setFullscreenCutoutMode(true);
    }
  }, []);

  // Suporte ao botão voltar nativo do Android no APK: sair do fullscreen antes de fechar a página
  useEffect(() => {
    let removeListener: (() => void) | null = null;
    if (Capacitor.isNativePlatform()) {
      import('@capacitor/app').then(({ App }) => {
        App.addListener('backButton', () => {
          if (isFullscreenRef.current && artInstanceRef.current) {
            toggleFullscreen(artInstanceRef.current);
          }
        }).then((handler) => {
          removeListener = () => handler.remove();
        }).catch(() => {});
      }).catch(() => {});
    }

    return () => {
      if (removeListener) removeListener();
    };
  }, [toggleFullscreen]);

  // Monitora alterações de tela cheia para manter estado sempre sincronizado
  useEffect(() => {
    const handleFullscreenExitCheck = () => {
      const isFs = Boolean(
        document.fullscreenElement ||
          (document as any).webkitFullscreenElement ||
          (document as any).mozFullScreenElement ||
          artInstanceRef.current?.fullscreen ||
          artInstanceRef.current?.fullscreenWeb
      );

      if (!isFs && isFullscreenRef.current) {
        isFullscreenRef.current = false;
        setFullscreenCutoutMode(false);
        if (artInstanceRef.current?.fullscreenWeb) {
          artInstanceRef.current.fullscreenWeb = false;
        }
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenExitCheck);
    document.addEventListener('webkitfullscreenchange', handleFullscreenExitCheck);
    document.addEventListener('mozfullscreenchange', handleFullscreenExitCheck);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenExitCheck);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenExitCheck);
      document.removeEventListener('mozfullscreenchange', handleFullscreenExitCheck);
      // Ao sair ou desmontar da tela watch, garante restauração total e segura
      isFullscreenRef.current = false;
      setFullscreenCutoutMode(false);
    };
  }, []);

  // Atalhos de teclado centralizados para reprodução e comandos
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignora atalho se o usuário estiver digitando em campos de texto/input
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName?.toUpperCase();
        const isEditable = target.getAttribute?.('contenteditable');
        if (tag === 'INPUT' || tag === 'TEXTAREA' || isEditable === 'true' || isEditable === '') {
          return;
        }
        // Se o elemento em foco for um botão ou link, desfoque para que a barra de espaço não acione o clique repetido
        if (tag === 'BUTTON' || tag === 'A') {
          target.blur();
        }
      }

      const art = artInstanceRef.current;
      if (!art || art.isDestroy) return;

      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        e.stopPropagation();
        toggleFullscreen(art);
      } else if (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar' || e.keyCode === 32) {
        e.preventDefault();
        e.stopPropagation();
        handleTogglePlay(e);
      } else if (e.key === 'k' || e.key === 'K') {
        // Padrão universal do YouTube
        e.preventDefault();
        e.stopPropagation();
        handleTogglePlay(e);
      } else if (e.key === 's' || e.key === 'S') {
        // Atalho 'S' para Pular Abertura ou Pular Encerramento
        if (showSkipIntroRef.current) {
          e.preventDefault();
          e.stopPropagation();
          handleSkipIntro();
        } else if (showSkipOutroRef.current) {
          e.preventDefault();
          e.stopPropagation();
          handleSkipOutro();
        }
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        e.stopPropagation();
        art.muted = !art.muted;
        art.notice.show = art.muted ? 'Mudo' : 'Som ativado';
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        art.forward = 10;
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        art.backward = 10;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        art.volume = Math.min(1, Number((art.volume + 0.1).toFixed(2)));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        art.volume = Math.max(0, Number((art.volume - 0.1).toFixed(2)));
      } else if (e.key === 'Escape') {
        if (isFullscreenRef.current) {
          e.preventDefault();
          e.stopPropagation();
          toggleFullscreen(art);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [toggleFullscreen, handleSkipIntro, handleSkipOutro]);

  const handleTriggerNextEpisode = useCallback((e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    if (hasNextEpisodeRef.current && onNextEpisodeRef.current && !hasAutoAdvancedRef.current) {
      hasAutoAdvancedRef.current = true;
      setNextEpisodeCountdown(null);
      onNextEpisodeRef.current();
    }
  }, []);

  // 1. Efeito de Ciclo de Vida do Player: Monta a instância do Artplayer (somente quando streamType ou retryKey mudam)
  useEffect(() => {
    if (!artContainerRef.current || !streamUrl) return;

    prevStreamUrlRef.current = streamUrl;
    prevStreamTypeRef.current = streamType;
    triedExtensionsRef.current.clear();
    retryCountRef.current = 0;
    hasRestoredRef.current = false;
    hasMarkedRef.current = false;
    hasAutoAdvancedRef.current = false;
    hasAutoSkippedIntroRef.current = false;
    hasAutoSkippedOutroRef.current = false;
    setShowSkipIntro(false);
    setShowSkipOutro(false);
    setNextEpisodeCountdown(null);
    setError(null);

    const isHls = streamUrl.toLowerCase().includes('.m3u8') || streamType === 'live';
    const currentDeviceCategory = deviceCategoryRef.current;
    const isTouchDevice = currentDeviceCategory !== 'desktop';

    // Configura flags nativas do Artplayer para sincronia e conforto por categoria de aparelho
    try {
      (Artplayer as any).DBCLICK_FULLSCREEN = false;
      (Artplayer as any).MOBILE_CLICK_PLAY = false;
      (Artplayer as any).MOBILE_DBCLICK_PLAY = false;
      (Artplayer as any).CONTROL_HIDE_TIME =
        currentDeviceCategory === 'mobile' ? 5000 : currentDeviceCategory === 'tablet' ? 4500 : 3500;
    } catch (e) {}

    // Criação da instância Artplayer.js
    const art = new Artplayer({
      container: artContainerRef.current,
      url: streamUrl,
      ...(isHls ? { type: 'm3u8' } : {}),
      poster: posterUrl || '',
      theme: '#8b5cf6',
      volume: 0.8,
      isLive: streamType === 'live',
      muted: false,
      autoplay: autoPlay,
      pip: true,
      autoSize: false,
      autoMini: false,
      screenshot: false, // Sem screenshot para manter controles limpos
      setting: true,
      settings: [
        {
          name: 'autoskip-intro',
          width: 260,
          html: 'Pular Abertura Automático',
          tooltip: autoSkipIntroRef.current ? 'Ativado' : 'Desativado',
          switch: autoSkipIntroRef.current,
          onSwitch: (item: any) => {
            const nextState = !item.switch;
            item.tooltip = nextState ? 'Ativado' : 'Desativado';
            setAutoSkipIntro(nextState);
            autoSkipIntroRef.current = nextState;
            try {
              localStorage.setItem('iptv_autoskip_intro', String(nextState));
            } catch (e) {}
            art.notice.show = nextState ? 'Pular Abertura: Automático' : 'Pular Abertura: Manual';
            return nextState;
          },
        },
        {
          name: 'autoskip-outro',
          width: 260,
          html: 'Pular Encerramento Automático',
          tooltip: autoSkipOutroRef.current ? 'Ativado' : 'Desativado',
          switch: autoSkipOutroRef.current,
          onSwitch: (item: any) => {
            const nextState = !item.switch;
            item.tooltip = nextState ? 'Ativado' : 'Desativado';
            setAutoSkipOutro(nextState);
            autoSkipOutroRef.current = nextState;
            try {
              localStorage.setItem('iptv_autoskip_outro', String(nextState));
            } catch (e) {}
            art.notice.show = nextState ? 'Pular Encerramento: Automático' : 'Pular Encerramento: Manual';
            return nextState;
          },
        },
      ],
      playbackRate: true,
      aspectRatio: true,
      fullscreen: !isTouchDevice, // No desktop usa o botão nativo do Artplayer; no mobile/tablet usa mobile-fullscreen
      fullscreenWeb: false,
      subtitleOffset: true,
      miniProgressBar: true,
      playsInline: true,
      autoOrientation: false, // Desabilitado para evitar corrida de rotação com Capacitor
      hotkey: false, // Centralizado no handleKeyDown do React para evitar double-toggle e conflito no Espaço
      airplay: true,
      lang: 'pt-BR',
      i18n: {
        'pt-BR': {
          Play: 'Reproduzir',
          Pause: 'Pausar',
          Volume: 'Volume',
          Mute: 'Mudo',
          Reconnect: 'Reconectar',
          'Play Speed': 'Velocidade',
          'Aspect Ratio': 'Proporção',
          Default: 'Padrão',
          Normal: 'Normal',
          Horizontal: 'Horizontal',
          Vertical: 'Vertical',
          'Video Flip': 'Inverter Vídeo',
          'Show Setting': 'Configurações',
          'Hide Setting': 'Ocultar Configurações',
          Fullscreen: 'Tela Cheia',
          'Exit Fullscreen': 'Sair da Tela Cheia',
          'Web Fullscreen': 'Tela Cheia na Janela',
          'Exit Web Fullscreen': 'Sair da Tela Cheia na Janela',
          'Mini Player': 'Mini Player',
          'PIP Mode': 'Picture-in-Picture',
          'Exit PIP Mode': 'Sair do Picture-in-Picture',
        },
      },
      controls: [
        {
          name: 'prev-chapter',
          position: 'left' as const,
          index: 10,
          html: '<span class="art-icon" style="display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0 3px;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5"></line></svg></span>',
          tooltip: prevEpisodeLabelRef.current || 'Capítulo Anterior',
          click: () => onPrevEpisodeRef.current?.(),
          mounted: (el: HTMLElement) => {
            el.style.display = hasPrevEpisodeRef.current && onPrevEpisodeRef.current ? '' : 'none';
          },
        },
        {
          name: 'next-chapter',
          position: 'left' as const,
          index: 11,
          html: '<span class="art-icon" style="display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0 3px;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg></span>',
          tooltip: nextEpisodeLabelRef.current || 'Próximo Capítulo',
          click: () => onNextEpisodeRef.current?.(),
          mounted: (el: HTMLElement) => {
            el.style.display = hasNextEpisodeRef.current && onNextEpisodeRef.current ? '' : 'none';
          },
        },
        // Botão para Alternar entre Ajustar (Original) e Preencher a Tela
        {
          name: 'fit-toggle',
          position: 'right' as const,
          index: 28,
          html: '<span class="art-icon" style="display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0 4px;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg></span>',
          tooltip: 'Ajustar / Preencher a Tela',
          click: function (this: Artplayer) {
            const v = this.video;
            const playerEl = this.template?.$player;
            const containerEl = this.template?.$container;
            if (!v || !playerEl) return;
            const isCover = playerEl.classList.contains('art-video-cover');
            const iconEl = this.template?.$controls?.querySelector('.art-control-fit-toggle .art-icon');
            if (isCover) {
              playerEl.classList.remove('art-video-cover');
              containerEl?.classList.remove('art-video-cover');
              v.style.objectFit = 'contain';
              this.notice.show = 'Proporção: Original (Ajustado)';
              if (iconEl) {
                iconEl.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
              }
            } else {
              playerEl.classList.add('art-video-cover');
              containerEl?.classList.add('art-video-cover');
              v.style.objectFit = 'cover';
              this.notice.show = 'Proporção: Preencher a Tela';
              if (iconEl) {
                iconEl.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></svg>';
              }
            }
          },
        },
        // Botão de Fullscreen exclusivo para Mobile e Tablet (no Desktop o Artplayer já insere o controle nativo na barra)
        ...(isTouchDevice
          ? [
              {
                name: 'mobile-fullscreen',
                position: 'right' as const,
                index: 30,
                html: '<span class="art-icon" style="display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0 4px;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg></span>',
                tooltip: 'Tela Cheia',
                click: function (this: Artplayer) {
                  toggleFullscreen(this);
                },
              },
            ]
          : []),
      ],
      customType: {
        m3u8: function (video: HTMLVideoElement, url: string, player: Artplayer) {
          if (Hls.isSupported()) {
            if ((player as any).hls) {
              (player as any).hls.destroy();
            }

            const hls = new Hls({
              enableWorker: true,
              lowLatencyMode: true,
              backBufferLength: 90,
            });

            hls.loadSource(url);
            hls.attachMedia(video);
            (player as any).hls = hls;

            player.on('destroy', () => {
              hls.destroy();
            });

            // Seletor de Qualidades HLS
            hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
              if (data.levels && data.levels.length > 1) {
                const autoItem = {
                  default: true,
                  html: 'Auto',
                  level: -1,
                };
                const levelItems = data.levels.map((level, index) => {
                  const label = level.height ? `${level.height}p` : `${Math.round(level.bitrate / 1000)}k`;
                  return {
                    html: label,
                    level: index,
                  };
                });

                const qualitySetting = {
                  name: 'quality',
                  width: 160,
                  html: 'Qualidade',
                  tooltip: 'Auto',
                  selector: [autoItem, ...levelItems],
                  onSelect: function (item: any) {
                    hls.currentLevel = item.level;
                    return item.html;
                  },
                };

                if (player.setting.find('quality')) {
                  player.setting.update(qualitySetting);
                } else {
                  player.setting.add(qualitySetting);
                }
              }

              // Seletor de Faixas de Áudio
              if (hls.audioTracks && hls.audioTracks.length > 1) {
                const audioItems = hls.audioTracks.map((track, index) => ({
                  default: index === hls.audioTrack,
                  html: track.name || track.lang || `Faixa ${index + 1}`,
                  trackId: index,
                }));

                const audioSetting = {
                  name: 'audio',
                  width: 180,
                  html: 'Áudio',
                  tooltip: audioItems.find((t) => t.default)?.html || 'Padrão',
                  selector: audioItems,
                  onSelect: function (item: any) {
                    hls.audioTrack = item.trackId;
                    return item.html;
                  },
                };

                if (player.setting.find('audio')) {
                  player.setting.update(audioSetting);
                } else {
                  player.setting.add(audioSetting);
                }
              }
            });

            // Faixas de Legenda
            hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (event, data) => {
              if (data.subtitleTracks && data.subtitleTracks.length > 0) {
                const subItems = [
                  { default: hls.subtitleTrack === -1, html: 'Desativado', trackId: -1 },
                  ...data.subtitleTracks.map((track, index) => ({
                    default: index === hls.subtitleTrack,
                    html: track.name || track.lang || `Legenda ${index + 1}`,
                    trackId: index,
                  })),
                ];

                const subSetting = {
                  name: 'subtitles',
                  width: 180,
                  html: 'Legendas',
                  tooltip: subItems.find((t) => t.default)?.html || 'Desativado',
                  selector: subItems,
                  onSelect: function (item: any) {
                    hls.subtitleTrack = item.trackId;
                    return item.html;
                  },
                };

                if (player.setting.find('subtitles')) {
                  player.setting.update(subSetting);
                } else {
                  player.setting.add(subSetting);
                }
              }
            });

            // Metadados de nível (codec e resolução)
            hls.on(Hls.Events.LEVEL_LOADED, () => {
              const currentLevel = hls.levels?.[hls.currentLevel];
              if (currentLevel && onVideoInfoRef.current) {
                let codec: string | undefined = undefined;
                if (currentLevel.videoCodec) {
                  const vc = currentLevel.videoCodec.toLowerCase();
                  if (vc.includes('avc') || vc.includes('h264')) codec = 'H.264 (AVC)';
                  else if (vc.includes('hvc') || vc.includes('hev') || vc.includes('h265')) codec = 'H.265 (HEVC)';
                  else if (vc.includes('av01')) codec = 'AV1';
                  else codec = currentLevel.videoCodec;
                }

                let dimensions: string | undefined = undefined;
                if (currentLevel.width && currentLevel.height) {
                  const w = currentLevel.width;
                  const h = currentLevel.height;
                  let label = '';
                  if (w >= 3840 || h >= 2160) label = ' (4K)';
                  else if (w >= 1920 || h >= 1080) label = ' (1080p)';
                  else if (w >= 1280 || h >= 720) label = ' (720p)';
                  dimensions = `${w}x${h}${label}`;
                }

                onVideoInfoRef.current({
                  codec,
                  width: currentLevel.width,
                  height: currentLevel.height,
                  dimensions,
                });
              }
            });

            // Tratamento de erros de rede ou decodificação
            hls.on(Hls.Events.ERROR, (_, errData) => {
              if (errData.fatal) {
                switch (errData.type) {
                  case Hls.ErrorTypes.NETWORK_ERROR:
                    console.warn('[HLS] Tentando recuperar erro de rede...', errData);
                    const httpCode = (errData.response as any)?.code || (errData.response as any)?.status;
                    if (httpCode >= 520 && httpCode <= 526) {
                      setError(`O servidor do provedor IPTV está temporariamente fora do ar (Erro Cloudflare ${httpCode} - Servidor de origem inacessível). Aguarde a recuperação pelo provedor.`);
                      hls.destroy();
                      break;
                    }
                    if (httpCode === 401 || httpCode === 403) {
                      setError(`Conexão recusada pelo provedor IPTV (HTTP ${httpCode}). Verifique se sua lista está ativa ou se outro aparelho já está conectado simultaneamente (limite de 1 tela atingido).`);
                      hls.destroy();
                      break;
                    }
                    hls.startLoad();
                    break;
                  case Hls.ErrorTypes.MEDIA_ERROR:
                    console.warn('[HLS] Tentando recuperar erro de mídia...');
                    hls.recoverMediaError();
                    break;
                  default:
                    console.error('[HLS] Erro fatal irrecuperável:', errData);
                    setError('Não foi possível carregar a transmissão. O servidor de origem pode estar temporariamente offline.');
                    hls.destroy();
                    break;
                }
              }
            });
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = url;
          } else {
            setError('Seu navegador não possui suporte nativo à reprodução de streams HLS (.m3u8).');
          }
        },
      },
    });

    artInstanceRef.current = art;

    // Registra atalho "KeyF" no Artplayer
    try {
      art.hotkey?.add?.('KeyF', () => {
        toggleFullscreen(art);
      });
    } catch (e) {}

    // Elementos do DOM do Artplayer
    const playerEl = art.template?.$player;
    const videoEl = art.template?.$video;

    if (playerEl) {
      setPlayerMountNode(playerEl as HTMLDivElement);
    }

    // Controle de inatividade do mouse e comandos (4.5s no mobile/touch, 3.5s no desktop)
    let inactivityTimer: NodeJS.Timeout | null = null;
    let lastDblClickTimestamp = 0;
    const wasPlayingBeforeClickRef = { current: false };

    const showControls = () => {
      try {
        if (!art.controls.show) {
          art.controls.show = true;
        }
      } catch (e) {}
      if (playerEl) {
        playerEl.classList.add('art-control-show');
        playerEl.classList.remove('art-hide-cursor');
      }
      setIsControlsVisible(true);
      isControlsVisibleRef.current = true;
    };

    const hideControls = () => {
      // Não oculta se menus de configuração ou clique direito estiverem abertos
      if (art.setting?.show || art.contextmenu?.show) {
        resetInactivityTimer();
        return;
      }
      lastHideControlsTimeRef.current = Date.now();
      try {
        if (art.controls.show) {
          art.controls.show = false;
        }
      } catch (e) {}
      if (playerEl) {
        playerEl.classList.remove('art-control-show');
        playerEl.classList.add('art-hide-cursor');
      }
      setIsControlsVisible(false);
      isControlsVisibleRef.current = false;
      if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
      }
    };

    const getInactivityDelay = () => {
      const currentCat = deviceCategoryRef.current;
      if (currentCat === 'mobile') return 5000;
      if (currentCat === 'tablet') return 4500;
      return 3500;
    };

    const resetInactivityTimer = (delay?: number) => {
      showControls();
      if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
      }
      // Se o vídeo estiver pausado, NUNCA auto-oculta os controles (padrão Netflix / YouTube)
      if (!art.playing) {
        return;
      }
      const effectiveDelay = delay ?? getInactivityDelay();
      inactivityTimer = setTimeout(() => {
        hideControls();
      }, effectiveDelay);
    };

    showControlsRef.current = showControls;
    resetInactivityTimerRef.current = resetInactivityTimer;

    const isTouchOrRecentTouch = () => {
      return (
        deviceCategoryRef.current !== 'desktop' ||
        Date.now() - lastTouchTimestampRef.current < 1500
      );
    };

    const handleUserInteraction = () => {
      if (isTouchOrRecentTouch()) return;
      resetInactivityTimer();
    };

    const handleMouseEnter = () => {
      if (isTouchOrRecentTouch()) return;
      resetInactivityTimer();
    };

    const handleMouseLeave = () => {
      // Em dispositivos mobile e touch, NUNCA executa mouseleave (evita esconder controles após toque)
      if (isTouchOrRecentTouch()) return;

      const isFs = Boolean(
        document.fullscreenElement ||
          (document as any).webkitFullscreenElement ||
          (document as any).mozFullScreenElement ||
          (document as any).msFullscreenElement ||
          art.fullscreen ||
          art.fullscreenWeb ||
          isFullscreenRef.current
      );
      if (!isFs && art.playing) {
        if (inactivityTimer) clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
          hideControls();
        }, 1500);
      }
    };

    const handleWindowMouseMove = () => {
      if (isFullscreenRef.current && !isTouchOrRecentTouch()) {
        resetInactivityTimer();
      }
    };

    // Duplo clique / duplo toque para avançar/retroceder ou alternar tela cheia (estilo YouTube)
    const handleDoubleAction = (e?: Event) => {
      const now = Date.now();
      if (now - lastDblClickTimestamp < 350) {
        return;
      }
      lastDblClickTimestamp = now;
      lastDoubleActionTimeRef.current = now;

      if (e) {
        const target = (e.target || (e as any).srcElement) as HTMLElement | null;
        if (
          target?.closest?.(
            '.art-controls, .art-progress, .art-settings, .art-layers-setting, .art-contextmenu, button, input'
          )
        ) {
          return;
        }

        const clientX = (e as MouseEvent).clientX ?? (e as TouchEvent)?.changedTouches?.[0]?.clientX;
        const rect = playerEl?.getBoundingClientRect();
        if (rect && clientX !== undefined) {
          const x = clientX - rect.left;
          const ratio = x / rect.width;
          if (ratio < 0.35) {
            art.backward = 10;
            art.notice.show = '⏪ -10s';
            resetInactivityTimer();
            return;
          } else if (ratio > 0.65) {
            art.forward = 10;
            art.notice.show = '⏩ +10s';
            resetInactivityTimer();
            return;
          }
        }
      }

      // Se estava tocando antes do duplo clique e o Artplayer pausou no 1º clique, restaura playback
      if (wasPlayingBeforeClickRef.current) {
        setTimeout(() => {
          try {
            if (!art.playing) {
              art.play();
            }
          } catch (err) {}
        }, 60);
      }

      toggleFullscreen(art);
    };

    const handleMouseDown = () => {
      wasPlayingBeforeClickRef.current = art.playing;
      if (!isTouchOrRecentTouch()) {
        resetInactivityTimer();
      }
    };

    const handlePlayerClick = (e: MouseEvent) => {
      const target = (e.target || (e as any).srcElement) as HTMLElement | null;
      if (
        target?.closest?.(
          '.art-controls, .art-progress, .art-settings, .art-layers-setting, .art-contextmenu, button, input'
        )
      ) {
        return;
      }

      // Intercepta e interrompe a propagação imediata na fase de captura
      // para evitar que listeners internos do Artplayer (no $video) ou do React dupliquem a ação
      e.stopPropagation();
      e.stopImmediatePropagation();

      const currentCategory = deviceCategoryRef.current;

      // Se acabou de ocorrer uma ação de duplo clique ou duplo toque, ignora o clique simples
      if (Date.now() - lastDoubleActionTimeRef.current < 450) {
        return;
      }

      if (currentCategory !== 'desktop') {
        // --- DINÂMICA MOBILE / TABLET / TOUCH / APK ---
        // Se acabamos de ocultar os controles há menos de 350ms (ex: por touch ou click), ignora para evitar reabertura
        if (Date.now() - lastHideControlsTimeRef.current < 350) {
          return;
        }

        // Se os controles estão visíveis, qualquer toque na área vazia oculta imediatamente (estilo Netflix / YouTube Mobile)
        if (isControlsVisibleRef.current) {
          hideControls();
          return;
        }

        // Se os controles estão ocultos, um toque exibe os controles confortavelmente sem pausar
        showControls();
        resetInactivityTimer();
      } else {
        // --- DINÂMICA DESKTOP (MOUSE) ---
        // No desktop onde temos o mouse: com um clique faz pause/play no perímetro todo de forma segura e sem duplicidade
        handleTogglePlay(e);
      }
    };

    const handleTouchStart = () => {
      lastTouchTimestampRef.current = Date.now();
    };

    let lastTouchTime = 0;
    let lastTouchX = 0;
    let lastTouchY = 0;
    const handleTouchEnd = (e: TouchEvent) => {
      lastTouchTimestampRef.current = Date.now();
      const touch = e.changedTouches[0];
      if (!touch) return;

      const target = (e.target || (e as any).srcElement) as HTMLElement | null;
      if (
        target?.closest?.(
          '.art-controls, .art-progress, .art-settings, .art-layers-setting, .art-contextmenu, button, input'
        )
      ) {
        return;
      }

      const now = Date.now();
      const dx = Math.abs(touch.clientX - lastTouchX);
      const dy = Math.abs(touch.clientY - lastTouchY);

      if (now - lastTouchTime < 320 && dx < 40 && dy < 40) {
        lastTouchTime = 0;
        lastDoubleActionTimeRef.current = now;
        const rect = playerEl?.getBoundingClientRect();
        if (rect) {
          const x = touch.clientX - rect.left;
          const ratio = x / rect.width;
          if (ratio < 0.35) {
            art.backward = 10;
            art.notice.show = '⏪ -10s';
            resetInactivityTimer();
            return;
          } else if (ratio > 0.65) {
            art.forward = 10;
            art.notice.show = '⏩ +10s';
            resetInactivityTimer();
            return;
          }
        }
        toggleFullscreen(art);
      } else {
        lastTouchTime = now;
        lastTouchX = touch.clientX;
        lastTouchY = touch.clientY;
      }
    };

    // Registra listeners de interação no container e janela
    if (playerEl) {
      playerEl.addEventListener('click', handlePlayerClick, true);
      playerEl.addEventListener('touchstart', handleTouchStart, { passive: true });
      playerEl.addEventListener('mousemove', handleUserInteraction, { passive: true });
      playerEl.addEventListener('mousedown', handleMouseDown, { passive: true });
      playerEl.addEventListener('touchend', handleTouchEnd, { passive: true });
      playerEl.addEventListener('mouseenter', handleMouseEnter, { passive: true });
      playerEl.addEventListener('mouseleave', handleMouseLeave, { passive: true });
      playerEl.addEventListener('dblclick', handleDoubleAction, true);
    }

    if (videoEl) {
      videoEl.addEventListener('dblclick', handleDoubleAction, true);
    }

    window.addEventListener('mousemove', handleWindowMouseMove, { passive: true });

    // Registra listener nativo de duplo clique do Artplayer também
    art.on('dblclick', () => {
      handleDoubleAction();
    });

    // Inicia temporizador de conforto
    resetInactivityTimer();

    art.on('video:play', () => {
      setIsPlaying(true);
      isPlayingRef.current = true;
      resetInactivityTimer();
    });

    art.on('video:pause', () => {
      setIsPlaying(false);
      isPlayingRef.current = false;
      showControls();
      if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
      }
    });

    // Sincroniza visibilidade de controles e barra de progresso
    art.on('control', (state) => {
      const isVisible = Boolean(state);
      setIsControlsVisible(isVisible);
      isControlsVisibleRef.current = isVisible;
      if (isVisible) {
        resetInactivityTimer();
      } else {
        if (inactivityTimer) {
          clearTimeout(inactivityTimer);
          inactivityTimer = null;
        }
      }
      const bottom = art.template?.$bottom;
      if (bottom) {
        bottom.style.pointerEvents = 'none';
        if (isFullscreenRef.current && !isVisible) {
          bottom.style.opacity = '0';
          bottom.style.visibility = 'hidden';
        } else if (isVisible) {
          bottom.style.opacity = '';
          bottom.style.visibility = '';
        }
      }
    });

    // Restauração de posição anterior de onde o usuário parou
    const restorePosition = () => {
      if (hasRestoredRef.current || streamType === 'live') return;
      try {
        if (initialTime !== undefined && initialTime > 5) {
          hasRestoredRef.current = true;
          art.currentTime = initialTime;
          art.notice.show = `Continuando de onde parou (${formatSeconds(initialTime)})`;
          return;
        }
        const raw = localStorage.getItem(`iptv_pos_${streamTypeRef.current}_${streamIdRef.current}`);
        if (raw) {
          const saved = parseFloat(raw);
          if (!isNaN(saved) && saved > 5) {
            hasRestoredRef.current = true;
            art.currentTime = saved;
            art.notice.show = `Continuando de onde parou (${formatSeconds(saved)})`;
          }
        }
      } catch (e) {
        console.error('Erro ao restaurar posição:', e);
      }
    };

    art.on('video:loadedmetadata', () => {
      restorePosition();
      const video = art.video;
      if (video && onVideoInfoRef.current) {
        const dur = video.duration || 0;
        const w = video.videoWidth || 0;
        const h = video.videoHeight || 0;
        let dim: string | undefined = undefined;
        if (w && h) {
          let label = '';
          if (w >= 3840 || h >= 2160) label = ' (4K)';
          else if (w >= 1920 || h >= 1080) label = ' (1080p)';
          else if (w >= 1280 || h >= 720) label = ' (720p)';
          dim = `${w}x${h}${label}`;
        }
        onVideoInfoRef.current({
          duration: dur,
          formattedDuration: dur > 0 ? formatSeconds(dur) : undefined,
          width: w,
          height: h,
          dimensions: dim,
        });
      }
    });

    // Monitoramento contínuo de tempo e progresso
    art.on('video:timeupdate', () => {
      const currentTime = art.currentTime || 0;
      const duration = art.duration || 0;

      // Persistência periódica do progresso
      if (streamType !== 'live' && currentTime > 5 && duration > 0) {
        if (currentTime < duration - 10) {
          try {
            localStorage.setItem(`iptv_pos_${streamTypeRef.current}_${streamIdRef.current}`, currentTime.toFixed(1));
          } catch (e) {}
        }
        lastReportedTimeRef.current = currentTime;
        lastDurationRef.current = duration;
        onProgressRef.current?.({ currentTime, duration, immediate: false });
        if (currentTime > 60 && !hasMarkedRef.current) {
          hasMarkedRef.current = true;
          markWatchedRef.current?.(streamIdRef.current, streamTypeRef.current, titleRef.current, false);
        }
      }

      // Verificação e exibição de Pular Abertura (Intro)
      const currentSkip = skipTimesRef.current;
      if (currentSkip?.intro && streamType === 'series') {
        const inIntro = currentTime >= currentSkip.intro.start && currentTime < currentSkip.intro.end;
        if (inIntro) {
          if (autoSkipIntroRef.current && !hasAutoSkippedIntroRef.current) {
            hasAutoSkippedIntroRef.current = true;
            art.currentTime = currentSkip.intro.end;
            art.notice.show = 'Abertura pulada automaticamente';
            setShowSkipIntro(false);
            showSkipIntroRef.current = false;
          } else if (!hasAutoSkippedIntroRef.current) {
            if (!showSkipIntroRef.current) {
              showSkipIntroRef.current = true;
              setShowSkipIntro(true);
            }
          }
        } else if (showSkipIntroRef.current) {
          showSkipIntroRef.current = false;
          setShowSkipIntro(false);
        }
      } else if (showSkipIntroRef.current) {
        showSkipIntroRef.current = false;
        setShowSkipIntro(false);
      }

      // Verificação e exibição de Pular Encerramento (Outro)
      if (currentSkip?.outro && streamType === 'series') {
        const outroStart = currentSkip.outro.start;
        const outroEnd = currentSkip.outro.end || (duration > 0 ? duration : outroStart + 90);
        const inOutro = currentTime >= outroStart && (outroEnd > outroStart ? currentTime < outroEnd - 1 : true);
        if (inOutro) {
          if (autoSkipOutroRef.current && !hasAutoSkippedOutroRef.current) {
            hasAutoSkippedOutroRef.current = true;
            if (hasNextEpisodeRef.current && onNextEpisodeRef.current) {
              onNextEpisodeRef.current();
            } else {
              art.currentTime = outroEnd;
              art.notice.show = 'Encerramento pulado';
            }
            setShowSkipOutro(false);
            showSkipOutroRef.current = false;
          } else if (!hasAutoSkippedOutroRef.current) {
            if (!showSkipOutroRef.current) {
              showSkipOutroRef.current = true;
              setShowSkipOutro(true);
            }
          }
        } else if (showSkipOutroRef.current) {
          showSkipOutroRef.current = false;
          setShowSkipOutro(false);
        }
      } else if (showSkipOutroRef.current) {
        showSkipOutroRef.current = false;
        setShowSkipOutro(false);
      }

      // Autoplay e botão do Próximo Episódio (30s antes do final para séries)
      if (hasNextEpisodeRef.current && onNextEpisodeRef.current && duration > 30 && streamType === 'series') {
        const remainingSeconds = Math.max(0, Math.ceil(duration - currentTime));
        if (remainingSeconds <= 30 && remainingSeconds > 0) {
          setNextEpisodeCountdown((prev) => (prev !== remainingSeconds ? remainingSeconds : prev));
        } else if (remainingSeconds > 30) {
          setNextEpisodeCountdown((prev) => (prev !== null ? null : prev));
          hasAutoAdvancedRef.current = false;
        } else if (remainingSeconds <= 0 || currentTime >= duration - 0.4) {
          if (!hasAutoAdvancedRef.current) {
            hasAutoAdvancedRef.current = true;
            setNextEpisodeCountdown(null);
            onNextEpisodeRef.current();
          }
        }
      } else {
        setNextEpisodeCountdown((prev) => (prev !== null ? null : prev));
      }
    });

    // Salvamento imediato de progresso ao pausar
    art.on('video:pause', () => {
      if (streamTypeRef.current !== 'live' && lastReportedTimeRef.current > 5 && lastDurationRef.current > 0) {
        onProgressRef.current?.({
          currentTime: lastReportedTimeRef.current,
          duration: lastDurationRef.current,
          immediate: true,
        });
      }
    });

    // Término do vídeo
    art.on('video:ended', () => {
      if (streamTypeRef.current !== 'live' && lastDurationRef.current > 0) {
        onProgressRef.current?.({
          currentTime: lastDurationRef.current,
          duration: lastDurationRef.current,
          immediate: true,
        });
      }
      hasMarkedRef.current = true;
      try {
        localStorage.removeItem(`iptv_pos_${streamTypeRef.current}_${streamIdRef.current}`);
      } catch (e) {}

      if (markWatchedRef.current) {
        markWatchedRef.current(streamIdRef.current, streamTypeRef.current, titleRef.current, true);
      }
      if (onEndedRef.current) onEndedRef.current();

      // Autoplay avançando para o próximo episódio
      if (!hasAutoAdvancedRef.current && hasNextEpisodeRef.current && onNextEpisodeRef.current) {
        hasAutoAdvancedRef.current = true;
        setNextEpisodeCountdown(null);
        onNextEpisodeRef.current();
      }
    });

    art.on('video:error', () => {
      const currentUrl = art.url || streamUrl;
      const mediaErr = art.video?.error;
      console.warn('[VideoPlayer] Erro no stream de vídeo:', {
        code: mediaErr?.code,
        message: mediaErr?.message,
        url: currentUrl,
        type: streamTypeRef.current,
      });

      const isLocalUrl =
        currentUrl.includes('_local_video_') ||
        currentUrl.includes('/videos/offline_') ||
        currentUrl.includes('_capacitor_file_') ||
        currentUrl.startsWith('file://');

      if (isLocalUrl) {
        if (retryCountRef.current < 2) {
          retryCountRef.current += 1;
          setTimeout(() => {
            try {
              if (!art.isDestroy && art.video) {
                art.video.load();
                art.video.play().catch(() => {});
              }
            } catch (e) {}
          }, 800);
          return;
        }
        setError('Não foi possível reproduzir o arquivo de vídeo baixado na memória. Verifique se o download foi concluído com sucesso.');
        return;
      }

      // Se não for transmissão ao vivo e for arquivo de mídia remoto, tenta alternar extensões candidatas (.mp4, .mkv, .ts)
      if (streamTypeRef.current !== 'live' && !currentUrl.includes('.m3u8')) {
        const extMatch = currentUrl.match(/\.([a-zA-Z0-9]+)(?:\?.*)?$/);
        const currentExt = extMatch ? extMatch[1].toLowerCase() : 'mp4';
        triedExtensionsRef.current.add(currentExt);

        const candidates = ['mp4', 'mkv', 'ts', 'avi'];
        const nextExt = candidates.find((ext) => !triedExtensionsRef.current.has(ext));

        if (nextExt) {
          triedExtensionsRef.current.add(nextExt);
          const nextUrl = currentUrl.replace(/\.[a-zA-Z0-9]+(?:\?.*)?$/, `.${nextExt}`);
          console.info(`[VideoPlayer] Tentando extensão alternativa de fallback: .${nextExt}`);
          try {
            art.switchUrl(nextUrl).catch(() => {});
            return;
          } catch (e) {
            console.warn('[VideoPlayer] Falha ao alternar URL de fallback:', e);
          }
        }
      }

      // Se falhar e ainda não tiver tentado 1 reconexão rápida
      if (retryCountRef.current < 1) {
        retryCountRef.current += 1;
        console.info('[VideoPlayer] Tentando reconexão rápida do stream...');
        setTimeout(() => {
          try {
            if (!art.isDestroy) {
              art.switchUrl(currentUrl).catch(() => {});
            }
          } catch (e) {}
        }, 1200);
        return;
      }

      // Diagnóstico inteligente do erro de rede do servidor IPTV
      fetch(currentUrl, { method: 'HEAD', signal: AbortSignal.timeout(2500) })
        .then((res) => {
          if (res.status >= 520 && res.status <= 526) {
            setError(
              `O servidor do seu provedor IPTV está temporariamente fora do ar (Erro Cloudflare ${res.status} - Servidor de origem inacessível). Aguarde a normalização pelo seu provedor.`
            );
          } else if (res.status === 401 || res.status === 403) {
            setError(
              `Conexão recusada pelo provedor IPTV (HTTP ${res.status}). Verifique se sua lista está ativa ou se outro aparelho já está conectado simultaneamente com o mesmo usuário (limite de 1 tela atingido).`
            );
          } else {
            setError('Falha na reprodução do stream de vídeo. O conteúdo pode estar indisponível no servidor IPTV.');
          }
        })
        .catch(() => {
          setError('Falha na reprodução do stream de vídeo. O servidor do provedor IPTV não respondeu ao fluxo.');
        });
    });

    art.on('fullscreenWeb', (state) => {
      isFullscreenRef.current = state;
      setFullscreenCutoutMode(state);
      if (art.video) {
        art.video.style.backgroundColor = 'transparent';
      }
      resetInactivityTimer();
      const bottom = art.template?.$bottom;
      if (bottom) {
        bottom.style.pointerEvents = 'none';
        if (!state) {
          bottom.style.opacity = '';
          bottom.style.visibility = '';
        }
      }
      try {
        const btn = art.template?.$controls?.querySelector('.art-control-mobile-fullscreen .art-icon');
        if (btn) {
          btn.innerHTML = state
            ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path></svg>'
            : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>';
        }
      } catch (e) {}
    });

    art.on('fullscreen', (state) => {
      isFullscreenRef.current = state;
      setFullscreenCutoutMode(state);
      if (art.video) {
        art.video.style.backgroundColor = 'transparent';
      }
      resetInactivityTimer();
      const bottom = art.template?.$bottom;
      if (bottom) {
        bottom.style.pointerEvents = 'none';
        if (!state) {
          bottom.style.opacity = '';
          bottom.style.visibility = '';
        }
      }
    });

    const flushProgress = () => {
      if (streamTypeRef.current !== 'live' && lastReportedTimeRef.current > 5 && lastDurationRef.current > 0) {
        onProgressRef.current?.({
          currentTime: lastReportedTimeRef.current,
          duration: lastDurationRef.current,
          immediate: true,
        });
      }
    };
    window.addEventListener('beforeunload', flushProgress);
    window.addEventListener('pagehide', flushProgress);

    return () => {
      flushProgress();
      window.removeEventListener('beforeunload', flushProgress);
      window.removeEventListener('pagehide', flushProgress);
      if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
      }
      if (playerEl) {
        playerEl.removeEventListener('click', handlePlayerClick, true);
        playerEl.removeEventListener('touchstart', handleTouchStart);
        playerEl.removeEventListener('mousemove', handleUserInteraction);
        playerEl.removeEventListener('mousedown', handleMouseDown);
        playerEl.removeEventListener('touchend', handleTouchEnd);
        playerEl.removeEventListener('mouseenter', handleMouseEnter);
        playerEl.removeEventListener('mouseleave', handleMouseLeave);
        playerEl.removeEventListener('dblclick', handleDoubleAction, true);
      }
      if (videoEl) {
        videoEl.removeEventListener('dblclick', handleDoubleAction, true);
      }
      window.removeEventListener('mousemove', handleWindowMouseMove);

      isFullscreenRef.current = false;
      setFullscreenCutoutMode(false);
      setPlayerMountNode(null);
      if (artInstanceRef.current) {
        try {
          artInstanceRef.current.destroy(false);
        } catch (e) {}
        artInstanceRef.current = null;
      }
    };
  }, [streamType, retryKey, toggleFullscreen]);

  // 2. Efeito de Atualização da URL: quando o capítulo muda (autoplay/manual) ou URL local é resolvida,
  // atualiza o Artplayer suavemente SEM destruir a instância, mantendo 100% o fullscreen e a orientação.
  useEffect(() => {
    const art = artInstanceRef.current;
    if (!art || art.isDestroy) return;
    if (!streamUrl || prevStreamUrlRef.current === streamUrl) return;

    prevStreamUrlRef.current = streamUrl;
    triedExtensionsRef.current.clear();
    retryCountRef.current = 0;
    hasRestoredRef.current = false;
    hasMarkedRef.current = false;
    hasAutoAdvancedRef.current = false;
    hasAutoSkippedIntroRef.current = false;
    hasAutoSkippedOutroRef.current = false;
    setShowSkipIntro(false);
    setShowSkipOutro(false);
    setNextEpisodeCountdown(null);
    setError(null);

    // Identifica e preserva se o player estava em tela cheia (APK / WebView / Navegador)
    const wasFullscreen = Boolean(
      isFullscreenRef.current ||
      art.fullscreen ||
      art.fullscreenWeb ||
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      document.documentElement.classList.contains('art-immersive-active') ||
      document.body.classList.contains('art-immersive-active')
    );

    if (wasFullscreen) {
      isFullscreenRef.current = true;
      setFullscreenCutoutMode(true);
    }

    try {
      art.loading.show = true;
    } catch (e) {}

    if (posterUrl) {
      try {
        art.poster = posterUrl;
      } catch (e) {}
    }

    // Se o stream anterior era HLS e o novo não é, limpa a instância anterior do Hls.js
    const isNewHls = streamUrl.toLowerCase().includes('.m3u8') || streamType === 'live';
    if (!isNewHls && (art as any).hls) {
      try {
        (art as any).hls.destroy();
        (art as any).hls = null;
      } catch (e) {}
    }

    try {
      art.switchUrl(streamUrl).then(() => {
        if (wasFullscreen) {
          if (isMobileDevice()) {
            art.fullscreenWeb = true;
          } else {
            try { art.fullscreen = true; } catch (e) { art.fullscreenWeb = true; }
          }
          isFullscreenRef.current = true;
          setFullscreenCutoutMode(true);
        }
        if (autoPlay) {
          art.play().catch(() => {});
        }
      }).catch((err) => {
        console.warn('[VideoPlayer] Falha no switchUrl do Artplayer, aplicando fallback suave:', err);
        try {
          if (art.video) {
            art.video.src = streamUrl;
            if (wasFullscreen) {
              if (isMobileDevice()) {
                art.fullscreenWeb = true;
              } else {
                try { art.fullscreen = true; } catch (e) { art.fullscreenWeb = true; }
              }
              isFullscreenRef.current = true;
              setFullscreenCutoutMode(true);
            }
            if (autoPlay) {
              art.video.play().catch(() => {});
            }
          } else {
            setRetryKey((k) => k + 1);
          }
        } catch {
          setRetryKey((k) => k + 1);
        }
      });
    } catch (err) {
      console.warn('[VideoPlayer] Erro síncrono no switchUrl, aplicando fallback suave:', err);
      try {
        if (art.video) {
          art.video.src = streamUrl;
          if (wasFullscreen) {
            if (isMobileDevice()) {
              art.fullscreenWeb = true;
            } else {
              try { art.fullscreen = true; } catch (e) { art.fullscreenWeb = true; }
            }
            isFullscreenRef.current = true;
            setFullscreenCutoutMode(true);
          }
          if (autoPlay) {
            art.video.play().catch(() => {});
          }
        } else {
          setRetryKey((k) => k + 1);
        }
      } catch {
        setRetryKey((k) => k + 1);
      }
    }
  }, [streamUrl, posterUrl, autoPlay, streamType]);

  return (
    <div className="relative w-full h-full bg-black select-none overflow-hidden">
      {/* Container onde o Artplayer.js é injetado */}
      <div ref={artContainerRef} className="artplayer-app w-full h-full" />

      {/* Controles e botões dinâmicos renderizados diretamente dentro de $player via Portal */}
      {playerMountNode && createPortal(
        <>
          {/* Overlay Central de Ação (Distinção por categoria: Mobile, Tablet, Desktop) */}
          <div
            className={`absolute inset-0 z-50 flex items-center justify-center transition-all duration-300 ${
              isControlsVisible
                ? deviceCategory === 'desktop'
                  ? isPlaying
                    ? 'opacity-0 pointer-events-none bg-transparent'
                    : 'opacity-100 pointer-events-auto bg-black/25 backdrop-blur-[1px]'
                  : 'opacity-100 pointer-events-auto bg-black/35 backdrop-blur-[1px]'
                : 'opacity-0 pointer-events-none bg-transparent'
            }`}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                if (deviceCategory !== 'desktop') {
                  // No mobile/touch: Tocar no fundo vazio fora do botão oculta os controles imediatamente (padrão Netflix / YouTube)
                  handleHideControls(e);
                } else {
                  // No desktop: Um clique simples em qualquer lugar do perímetro alterna Play/Pause
                  handleTogglePlay(e);
                }
              }
            }}
          >
            <div
              className="flex items-center justify-center pointer-events-auto select-none"
              onClick={(e) => {
                // No desktop, clicar na área ao redor do botão também segue o mesmo comando simples de play/pause
                if (deviceCategory === 'desktop' && e.target === e.currentTarget) {
                  handleTogglePlay(e);
                } else {
                  e.stopPropagation();
                }
              }}
            >
              {/* Botão Central Play / Pause - Cinza claro suave com ícone preto, dimensionado por categoria */}
              <button
                type="button"
                onClick={handleTogglePlay}
                title={isPlaying ? 'Pausar (Espaço)' : 'Reproduzir (Espaço)'}
                className={`group/play relative flex items-center justify-center rounded-full bg-neutral-200/90 hover:bg-white active:bg-neutral-300 active:scale-90 text-neutral-900 border border-white/60 shadow-xl shadow-black/40 backdrop-blur-md transition-all duration-200 cursor-pointer hover:scale-105 ${
                  deviceCategory === 'mobile'
                    ? 'w-16 h-16'
                    : 'w-20 h-20'
                }`}
              >
                {isPlaying ? (
                  <Pause className={`${deviceCategory === 'mobile' ? 'w-7 h-7' : 'w-8 h-8'} fill-current text-black`} />
                ) : (
                  <Play className={`${deviceCategory === 'mobile' ? 'w-7 h-7' : 'w-8 h-8'} fill-current text-black ml-1`} />
                )}
              </button>
            </div>
          </div>

          {/* Botão Flutuante de Pular Abertura (Intro) */}
          {showSkipIntro && (
            <div className="absolute left-4 sm:left-6 bottom-16 sm:bottom-20 z-[55] animate-in fade-in slide-in-from-bottom-4 duration-300 pointer-events-auto">
              <button
                type="button"
                onClick={handleSkipIntro}
                tabIndex={0}
                title="Pular abertura agora (Atalho: S)"
                className="group/skip flex items-center gap-2.5 sm:gap-3 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-2xl bg-neutral-900/95 hover:bg-violet-600 border border-violet-500/40 hover:border-violet-400 backdrop-blur-md text-white shadow-2xl shadow-violet-950/60 transition-all duration-200 cursor-pointer active:scale-95 hover:scale-105"
              >
                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-violet-600 group-hover/skip:bg-white text-white group-hover/skip:text-violet-700 flex items-center justify-center transition-colors shadow-sm shrink-0">
                  <FastForward className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current" />
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span className="font-bold text-xs sm:text-sm tracking-wide text-white">
                    Pular Abertura
                  </span>
                  <span className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-mono text-neutral-300 group-hover/skip:text-white">
                    S
                  </span>
                </div>
              </button>
            </div>
          )}

          {/* Botão Flutuante de Pular Encerramento (Outro) */}
          {showSkipOutro && nextEpisodeCountdown === null && (
            <div className="absolute right-4 sm:right-6 bottom-16 sm:bottom-20 z-[55] animate-in fade-in slide-in-from-bottom-4 duration-300 pointer-events-auto">
              <button
                type="button"
                onClick={handleSkipOutro}
                tabIndex={0}
                title={hasNextEpisode ? 'Pular encerramento e ir para o próximo episódio (Atalho: S)' : 'Pular encerramento'}
                className="group/skip flex items-center gap-2.5 sm:gap-3 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-2xl bg-neutral-900/95 hover:bg-violet-600 border border-violet-500/40 hover:border-violet-400 backdrop-blur-md text-white shadow-2xl shadow-violet-950/60 transition-all duration-200 cursor-pointer active:scale-95 hover:scale-105"
              >
                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-violet-600 group-hover/skip:bg-white text-white group-hover/skip:text-violet-700 flex items-center justify-center transition-colors shadow-sm shrink-0">
                  <SkipForward className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current" />
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span className="font-bold text-xs sm:text-sm tracking-wide text-white">
                    {hasNextEpisode ? 'Pular Encerramento' : 'Pular Créditos'}
                  </span>
                  <span className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-mono text-neutral-300 group-hover/skip:text-white">
                    S
                  </span>
                </div>
              </button>
            </div>
          )}

          {/* Botão Flutuante de Próximo Episódio com Contagem Regressiva de 30s */}
          {nextEpisodeCountdown !== null && hasNextEpisode && (
            <div className="absolute right-4 sm:right-6 bottom-16 sm:bottom-20 z-[55] animate-in fade-in slide-in-from-bottom-4 duration-300 pointer-events-auto">
              <button
                type="button"
                onClick={handleTriggerNextEpisode}
                tabIndex={0}
                title="Pular para o próximo episódio agora"
                className="group/btn flex items-center gap-2.5 sm:gap-3 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-2xl bg-neutral-900/95 hover:bg-violet-600 border border-violet-500/40 hover:border-violet-400 backdrop-blur-md text-white shadow-2xl shadow-violet-950/60 transition-all duration-200 cursor-pointer active:scale-95 hover:scale-105"
              >
                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-violet-600 group-hover/btn:bg-white text-white group-hover/btn:text-violet-700 flex items-center justify-center transition-colors shadow-sm shrink-0">
                  <SkipForward className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current" />
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span className="font-bold text-xs sm:text-sm tracking-wide text-white">
                    {nextEpisodeLabel || 'Próximo Episódio'}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-violet-500/25 group-hover/btn:bg-white/25 border border-violet-400/30 group-hover/btn:border-white/30 text-violet-200 group-hover/btn:text-white font-mono font-extrabold text-[11px] sm:text-xs min-w-[28px] text-center">
                    {nextEpisodeCountdown}s
                  </span>
                </div>
              </button>
            </div>
          )}
        </>,
        playerMountNode
      )}

      {/* Painel de Erro de Reprodução */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-neutral-950/95 p-6 text-center z-50">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <div className="space-y-1.5 max-w-md">
            <h4 className="text-sm font-bold text-white">Falha na Reprodução</h4>
            <p className="text-xs text-neutral-400 leading-relaxed">{error}</p>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => {
                setError(null);
                setRetryKey((k) => k + 1);
              }}
              className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-violet-600/30 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Tentar Novamente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
