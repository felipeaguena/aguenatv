'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Copy,
  Check,
  Sun,
  SkipForward,
  SkipBack,
  Maximize2,
  Minimize2,
  Scaling,
  Loader2,
  ArrowLeft,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { StatusBar } from '@capacitor/status-bar';
import { useWatched } from '@/hooks/useWatched';
import { StreamType } from '@/lib/types';

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
  onEnded?: () => void;
  onVideoInfo?: (info: PlayerVideoInfo) => void;
  onProgress?: (progress: { currentTime: number; duration: number }) => void;
  hasPrevEpisode?: boolean;
  onPrevEpisode?: () => void;
  prevEpisodeLabel?: string;
  hasNextEpisode?: boolean;
  onNextEpisode?: () => void;
  nextEpisodeLabel?: string;
}

function formatSeconds(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function VideoPlayer({
  streamUrl,
  title,
  streamId,
  streamType,
  posterUrl,
  autoPlay = true,
  initialTime,
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [buffering, setBuffering] = useState(false);
  const [isPaused, setIsPaused] = useState(!autoPlay);
  const [retryKey, setRetryKey] = useState(0);

  // Estados de tempo e reprodução
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedTime, setBufferedTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  // Estados de Tela Cheia e Ajuste de Proporção (Cover vs Contain)
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [aspectFill, setAspectFill] = useState(true); // true = Preencher 100% da tela (sem barras laterais), false = Proporção original

  // Visibilidade dos controles no player (auto-hide após 3.5s)
  const [showControls, setShowControls] = useState(true);
  const controlsTimerRef = useRef<NodeJS.Timeout | null>(null);

  const resetControlsTimeout = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) {
      clearTimeout(controlsTimerRef.current);
    }
    controlsTimerRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3500);
  }, []);

  // Gestos Touch de Brilho (lado esquerdo) e Volume (lado direito)
  const [brightness, setBrightness] = useState<number>(100);
  const [touchFeedback, setTouchFeedback] = useState<{
    type: 'brightness' | 'volume';
    value: number;
  } | null>(null);
  const touchFeedbackTimer = useRef<NodeJS.Timeout | null>(null);

  const touchStateRef = useRef<{
    startX: number;
    startY: number;
    mode: 'brightness' | 'volume' | null;
    startVal: number;
    isMoving: boolean;
  }>({
    startX: 0,
    startY: 0,
    mode: null,
    startVal: 0,
    isMoving: false,
  });

  // Estados de retomada de reprodução e contagem de 30s
  const [resumedTime, setResumedTime] = useState<number | null>(null);
  const [showResumeNotice, setShowResumeNotice] = useState(false);
  const hasRestoredRef = useRef(false);
  const lastSavedTimeRef = useRef(0);
  const [nextEpisodeCountdown, setNextEpisodeCountdown] = useState<number | null>(null);
  const hasAutoAdvancedRef = useRef(false);

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

  useEffect(() => {
    markWatchedRef.current = markWatched;
    onEndedRef.current = onEnded;
    onVideoInfoRef.current = onVideoInfo;
    onProgressRef.current = onProgress;
    onNextEpisodeRef.current = onNextEpisode;
    hasNextEpisodeRef.current = hasNextEpisode;
    onPrevEpisodeRef.current = onPrevEpisode;
    hasPrevEpisodeRef.current = hasPrevEpisode;
  });

  // Travamento em paisagem (Landscape)
  const lockLandscape = useCallback(async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        await ScreenOrientation.lock({ orientation: 'landscape' });
        return;
      }
    } catch (e) {}

    try {
      if (
        typeof window !== 'undefined' &&
        window.screen?.orientation &&
        typeof (window.screen.orientation as any).lock === 'function'
      ) {
        await (window.screen.orientation as any).lock('landscape');
      }
    } catch (e) {}
  }, []);

  const unlockOrientation = useCallback(async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        await ScreenOrientation.unlock();
        return;
      }
    } catch (e) {}

    try {
      if (
        typeof window !== 'undefined' &&
        window.screen?.orientation &&
        typeof (window.screen.orientation as any).unlock === 'function'
      ) {
        (window.screen.orientation as any).unlock();
      }
    } catch (e) {}
  }, []);

  // 1. Alternância de Tela Cheia 100% Imersiva (Sobrepondo Notch, Sistema e Barras Laterais)
  const toggleFullscreen = useCallback(
    async (targetState?: boolean) => {
      const container = containerRef.current;
      const video = videoRef.current;
      if (!container || !video) return;

      const isCurrentlyFs = Boolean(
        document.fullscreenElement ||
          (document as any).webkitFullscreenElement ||
          (document as any).mozFullScreenElement ||
          (video as any).webkitDisplayingFullscreen ||
          isFullscreen
      );

      const nextState = typeof targetState === 'boolean' ? targetState : !isCurrentlyFs;

      if (nextState) {
        setIsFullscreen(true);
        resetControlsTimeout();

        // A. Viewport dinâmico com viewport-fit=cover
        try {
          const metaViewport = document.querySelector('meta[name="viewport"]');
          if (metaViewport) {
            metaViewport.setAttribute(
              'content',
              'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'
            );
          }
          document.documentElement.style.overflow = 'hidden';
          document.body.style.overflow = 'hidden';
        } catch (e) {}

        // B. Ponte nativa Android (APK) para ocultar barras do sistema e expandir pelo notch
        try {
          if (typeof (window as any).AndroidBridge?.setCutoutFullscreen === 'function') {
            (window as any).AndroidBridge.setCutoutFullscreen(true);
          }
        } catch (e) {}

        // C. Plugins Capacitor nativos
        if (Capacitor.isNativePlatform()) {
          try {
            await StatusBar.hide().catch(() => {});
            await StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
          } catch (e) {}
        }

        // D. Trava orientação horizontal
        lockLandscape();

        // E. HTML5 Fullscreen API com navegação ocultada (navigationUI: 'hide')
        try {
          const reqOptions = { navigationUI: 'hide' };
          if (container.requestFullscreen) {
            await container.requestFullscreen(reqOptions as any).catch(async () => {
              if (video.requestFullscreen) {
                await video.requestFullscreen(reqOptions as any).catch(() => {});
              }
            });
          } else if ((container as any).webkitRequestFullscreen) {
            (container as any).webkitRequestFullscreen();
          } else if ((video as any).webkitEnterFullscreen) {
            (video as any).webkitEnterFullscreen();
          }
        } catch (e) {}
      } else {
        setIsFullscreen(false);
        resetControlsTimeout();

        // A. Restaura Viewport normal
        try {
          const metaViewport = document.querySelector('meta[name="viewport"]');
          if (metaViewport) {
            metaViewport.setAttribute(
              'content',
              'width=device-width, initial-scale=1, maximum-scale=1'
            );
          }
          document.documentElement.style.overflow = '';
          document.body.style.overflow = '';
        } catch (e) {}

        // B. Restaura modo normal no APK
        try {
          if (typeof (window as any).AndroidBridge?.setCutoutFullscreen === 'function') {
            (window as any).AndroidBridge.setCutoutFullscreen(false);
          }
        } catch (e) {}

        // C. Restaura barra de status no Capacitor
        if (Capacitor.isNativePlatform()) {
          try {
            await StatusBar.show().catch(() => {});
            await StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
          } catch (e) {}
        }

        // D. Destrava orientação
        unlockOrientation();

        // E. Sai do modo fullscreen HTML5
        try {
          if (document.exitFullscreen) {
            await document.exitFullscreen().catch(() => {});
          } else if ((document as any).webkitExitFullscreen) {
            (document as any).webkitExitFullscreen();
          } else if ((document as any).mozCancelFullScreen) {
            (document as any).mozCancelFullScreen();
          }
        } catch (e) {}
      }
    },
    [isFullscreen, lockLandscape, unlockOrientation, resetControlsTimeout]
  );

  // Monitora alterações nativas de tela cheia no documento e vídeo
  useEffect(() => {
    const video = videoRef.current;

    const handleNativeFullscreenChange = () => {
      const isFs = Boolean(
        document.fullscreenElement ||
          (document as any).webkitFullscreenElement ||
          (document as any).mozFullScreenElement ||
          (video as any)?.webkitDisplayingFullscreen
      );

      setIsFullscreen(isFs);
      if (isFs) {
        lockLandscape();
        try {
          if (typeof (window as any).AndroidBridge?.setCutoutFullscreen === 'function') {
            (window as any).AndroidBridge.setCutoutFullscreen(true);
          }
        } catch (e) {}
      } else {
        unlockOrientation();
        try {
          if (typeof (window as any).AndroidBridge?.setCutoutFullscreen === 'function') {
            (window as any).AndroidBridge.setCutoutFullscreen(false);
          }
        } catch (e) {}
      }
    };

    document.addEventListener('fullscreenchange', handleNativeFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleNativeFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleNativeFullscreenChange);

    if (video) {
      video.addEventListener('webkitbeginfullscreen', () => toggleFullscreen(true));
      video.addEventListener('webkitendfullscreen', () => toggleFullscreen(false));
    }

    return () => {
      document.removeEventListener('fullscreenchange', handleNativeFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleNativeFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleNativeFullscreenChange);
    };
  }, [lockLandscape, unlockOrientation, toggleFullscreen]);

  // Detecção de Rotação Física do Celular (Auto-Landscape Fullscreen)
  useEffect(() => {
    const handleOrientationOrResize = () => {
      const isMobile =
        Capacitor.isNativePlatform() ||
        ('ontouchstart' in window && window.innerWidth <= 1024) ||
        window.innerWidth <= 900;

      if (!isMobile) return;

      const isLandscape =
        (window.screen?.orientation && window.screen.orientation.type.includes('landscape')) ||
        Math.abs(Number(window.orientation) || 0) === 90 ||
        window.innerWidth > window.innerHeight;

      if (isLandscape && !isFullscreen) {
        toggleFullscreen(true);
      } else if (!isLandscape && isFullscreen) {
        toggleFullscreen(false);
      }
    };

    window.addEventListener('resize', handleOrientationOrResize);
    window.addEventListener('orientationchange', handleOrientationOrResize);
    if (window.screen?.orientation) {
      window.screen.orientation.addEventListener('change', handleOrientationOrResize);
    }

    return () => {
      window.removeEventListener('resize', handleOrientationOrResize);
      window.removeEventListener('orientationchange', handleOrientationOrResize);
      if (window.screen?.orientation) {
        window.screen.orientation.removeEventListener('change', handleOrientationOrResize);
      }
    };
  }, [isFullscreen, toggleFullscreen]);

  // Gestos Touch no Player
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    resetControlsTimeout();
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const relativeX = touch.clientX - rect.left;
    const isLeft = relativeX < rect.width / 2;

    const video = videoRef.current;
    const currentVol = video ? Math.round(video.volume * 100) : 100;

    touchStateRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      mode: isLeft ? 'brightness' : 'volume',
      startVal: isLeft ? brightness : currentVol,
      isMoving: false,
    };
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStateRef.current.mode || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const deltaY = touchStateRef.current.startY - touch.clientY;
    const deltaX = Math.abs(touch.clientX - touchStateRef.current.startX);

    if (Math.abs(deltaY) < 8 && deltaX < 8) return;
    if (Math.abs(deltaY) < deltaX && !touchStateRef.current.isMoving) return;

    touchStateRef.current.isMoving = true;
    const sensitivity = (deltaY / (rect.height * 0.65)) * 100;

    if (touchFeedbackTimer.current) clearTimeout(touchFeedbackTimer.current);

    if (touchStateRef.current.mode === 'brightness') {
      const nextBrightness = Math.min(
        100,
        Math.max(15, Math.round(touchStateRef.current.startVal + sensitivity))
      );
      setBrightness(nextBrightness);
      setTouchFeedback({ type: 'brightness', value: nextBrightness });
    } else {
      const nextVol = Math.min(
        100,
        Math.max(0, Math.round(touchStateRef.current.startVal + sensitivity))
      );
      const video = videoRef.current;
      if (video) {
        video.volume = nextVol / 100;
        setVolume(nextVol / 100);
        if (nextVol > 0 && video.muted) {
          video.muted = false;
          setIsMuted(false);
        }
      }
      setTouchFeedback({ type: 'volume', value: nextVol });
    }
  };

  const handleTouchEnd = () => {
    touchStateRef.current.mode = null;
    touchStateRef.current.isMoving = false;
    if (touchFeedbackTimer.current) clearTimeout(touchFeedbackTimer.current);
    touchFeedbackTimer.current = setTimeout(() => {
      setTouchFeedback(null);
    }, 750);
  };

  // Contagem regressiva e avanço de episódio
  const handleTriggerNextEpisode = useCallback((e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    if (hasAutoAdvancedRef.current) return;
    hasAutoAdvancedRef.current = true;
    setNextEpisodeCountdown(null);
    if (onNextEpisodeRef.current) {
      onNextEpisodeRef.current();
    }
  }, []);

  // Atalhos de teclado globais
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) {
        return;
      }

      const video = videoRef.current;
      if (!video) return;

      if (e.code === 'Space' || e.key === ' ' || e.key === 'MediaPlayPause') {
        e.preventDefault();
        e.stopPropagation();
        if (video.paused) {
          video.play().catch(() => {});
          setIsPaused(false);
        } else {
          video.pause();
          setIsPaused(true);
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'MediaRewind') {
        e.preventDefault();
        e.stopPropagation();
        video.currentTime = Math.max(0, video.currentTime - 10);
      } else if (e.key === 'ArrowRight' || e.key === 'MediaFastForward') {
        e.preventDefault();
        e.stopPropagation();
        const maxDur = video.duration || video.currentTime + 10;
        video.currentTime = Math.min(maxDur, video.currentTime + 10);
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        e.stopPropagation();
        toggleFullscreen();
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        e.stopPropagation();
        video.muted = !video.muted;
        setIsMuted(video.muted);
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [toggleFullscreen]);

  // Cópia de link
  const [copiedLink, setCopiedLink] = useState(false);
  const handleCopyLink = useCallback(() => {
    if (!streamUrl) return;
    navigator.clipboard.writeText(streamUrl).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  }, [streamUrl]);

  // Carregamento do vídeo via HTML5 / Hls.js
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) {
      setLoading(false);
      return;
    }

    setError(null);
    setLoading(true);
    setBuffering(false);
    setIsPaused(!autoPlay);
    hasMarkedRef.current = false;
    hasRestoredRef.current = false;
    lastSavedTimeRef.current = 0;
    setShowResumeNotice(false);
    setResumedTime(null);
    hasAutoAdvancedRef.current = false;
    setNextEpisodeCountdown(null);

    if (hlsRef.current) {
      try {
        hlsRef.current.stopLoad();
        hlsRef.current.detachMedia();
        hlsRef.current.destroy();
      } catch (e) {}
      hlsRef.current = null;
    }

    const isHlsStream = streamUrl.toLowerCase().includes('.m3u8');

    // Restaura posição
    const tryRestorePlaybackPosition = () => {
      if (hasRestoredRef.current || streamType === 'live') return;
      try {
        if (initialTime !== undefined && initialTime > 5) {
          hasRestoredRef.current = true;
          video.currentTime = initialTime;
          setResumedTime(initialTime);
          setShowResumeNotice(true);
          setTimeout(() => setShowResumeNotice(false), 6000);
          return;
        }

        const saved = localStorage.getItem(`iptv_pos_${streamType}_${streamId}`);
        if (saved) {
          let pos = 0;
          try {
            const parsed = JSON.parse(saved);
            pos = Number(parsed?.time || 0);
          } catch {
            pos = Number(saved);
          }
          if (pos > 5) {
            hasRestoredRef.current = true;
            video.currentTime = pos;
            setResumedTime(pos);
            setShowResumeNotice(true);
            setTimeout(() => setShowResumeNotice(false), 6000);
          }
        }
      } catch (e) {}
    };

    if (isHlsStream && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
      });
      hlsRef.current = hls;

      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLoading(false);
        tryRestorePlaybackPosition();
        if (autoPlay) {
          video.play().catch(() => {
            video.muted = true;
            setIsMuted(true);
            video.play().catch(() => {});
          });
        }
      });

      hls.on(Hls.Events.LEVEL_LOADED, () => {
        const currentLevel = hls.levels?.[hls.currentLevel];
        if (currentLevel && onVideoInfoRef.current) {
          let codec: string | undefined = undefined;
          if (currentLevel.videoCodec) {
            const vc = currentLevel.videoCodec.toLowerCase();
            if (vc.includes('avc') || vc.includes('h264')) codec = 'H.264 (AVC)';
            else if (vc.includes('hvc') || vc.includes('hev') || vc.includes('h265'))
              codec = 'H.265 (HEVC)';
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

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              setError('Falha de conexão com a transmissão de vídeo.');
              setLoading(false);
              hls.destroy();
              break;
          }
        }
      });
    } else {
      // Vídeo MP4 nativo ou Safari iOS HLS
      video.src = streamUrl;
      video.load();
      if (autoPlay) {
        video.play().catch(() => {
          video.muted = true;
          setIsMuted(true);
          video.play().catch(() => {});
        });
      }
    }

    const onLoadedMetadata = () => {
      setLoading(false);
      setDuration(video.duration || 0);
      tryRestorePlaybackPosition();

      if (onVideoInfoRef.current) {
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
    };

    let lastProgressReportTime = 0;
    const onTimeUpdate = () => {
      const cur = video.currentTime || 0;
      const dur = video.duration || 0;
      setCurrentTime(cur);
      setDuration(dur);

      if (video.buffered.length > 0) {
        setBufferedTime(video.buffered.end(video.buffered.length - 1));
      }

      // Persistência com throttle
      if (streamType !== 'live' && cur > 5 && dur > 0) {
        if (cur < dur - 10) {
          try {
            localStorage.setItem(`iptv_pos_${streamType}_${streamId}`, cur.toFixed(1));
          } catch (e) {}
        }
        const now = Date.now();
        if (now - lastProgressReportTime >= 3000) {
          lastProgressReportTime = now;
          onProgressRef.current?.({ currentTime: cur, duration: dur });
        }
        if (cur > 60 && !hasMarkedRef.current) {
          hasMarkedRef.current = true;
          markWatchedRef.current?.(streamId, streamType, title, false);
        }
      }

      // Contagem de 30s para próximo episódio
      if (hasNextEpisodeRef.current && onNextEpisodeRef.current && dur > 30 && streamType === 'series') {
        const remaining = Math.max(0, Math.ceil(dur - cur));
        if (remaining <= 30 && remaining > 0) {
          setNextEpisodeCountdown((prev) => (prev !== remaining ? remaining : prev));
        } else if (remaining > 30) {
          setNextEpisodeCountdown(null);
          hasAutoAdvancedRef.current = false;
        } else if (remaining <= 0 || cur >= dur - 0.4) {
          if (!hasAutoAdvancedRef.current) {
            hasAutoAdvancedRef.current = true;
            setNextEpisodeCountdown(null);
            onNextEpisodeRef.current();
          }
        }
      } else {
        setNextEpisodeCountdown(null);
      }
    };

    const onPlay = () => setIsPaused(false);
    const onPause = () => setIsPaused(true);
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => {
      setBuffering(false);
      setLoading(false);
      setIsPaused(false);
    };

    const onEndedInternal = () => {
      hasMarkedRef.current = true;
      try {
        localStorage.removeItem(`iptv_pos_${streamType}_${streamId}`);
      } catch (e) {}

      markWatchedRef.current?.(streamId, streamType, title, true);
      onEndedRef.current?.();

      if (!hasAutoAdvancedRef.current && hasNextEpisodeRef.current && onNextEpisodeRef.current) {
        hasAutoAdvancedRef.current = true;
        setNextEpisodeCountdown(null);
        onNextEpisodeRef.current();
      }
    };

    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('ended', onEndedInternal);

    return () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('ended', onEndedInternal);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [streamUrl, streamType, streamId, autoPlay, retryKey, initialTime, title]);

  const handleManualPlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setError(null);
    video.play().catch(() => {
      video.muted = true;
      setIsMuted(true);
      video.play().catch(() => {});
    });
  }, []);

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    video.currentTime = percent * duration;
    resetControlsTimeout();
  };

  const handleToggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
    resetControlsTimeout();
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={resetControlsTimeout}
      onMouseLeave={() => {
        if (!isPaused) setShowControls(false);
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={`html5-video-player-container relative w-full h-full bg-black select-none overflow-hidden ${
        isFullscreen ? 'is-fullscreen' : 'aspect-video rounded-3xl'
      }`}
    >
      {/* 1. Camada de Dimmer de Brilho Dinâmico */}
      {brightness < 100 && (
        <div
          className="absolute inset-0 bg-black pointer-events-none z-10 transition-opacity"
          style={{ opacity: ((100 - brightness) / 100) * 0.85 }}
        />
      )}

      {/* 2. HUD de Feedback de Gestos Touch (Brilho / Volume) */}
      {touchFeedback && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="flex flex-col items-center gap-2.5 px-6 py-4 rounded-3xl bg-black/85 border border-white/20 backdrop-blur-xl shadow-2xl min-w-[140px]">
            {touchFeedback.type === 'brightness' ? (
              <Sun className="w-8 h-8 text-amber-400 animate-pulse" />
            ) : touchFeedback.value === 0 ? (
              <VolumeX className="w-8 h-8 text-rose-400" />
            ) : (
              <Volume2 className="w-8 h-8 text-violet-400" />
            )}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                {touchFeedback.type === 'brightness' ? 'Brilho' : 'Volume'}
              </span>
              <span className="text-sm font-extrabold text-white">{touchFeedback.value}%</span>
            </div>
            <div className="w-24 h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-75 rounded-full ${
                  touchFeedback.type === 'brightness' ? 'bg-amber-400' : 'bg-violet-500'
                }`}
                style={{ width: `${touchFeedback.value}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 3. Spinner de Loading Inicial */}
      {loading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/90 z-40">
          <Loader2 className="w-10 h-10 text-violet-500 animate-spin" />
          <p className="text-xs font-medium text-neutral-400">Iniciando transmissão de vídeo...</p>
        </div>
      )}

      {/* 4. Spinner de Buffering Sutil durante a reprodução */}
      {buffering && !loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
          <div className="p-3.5 rounded-2xl bg-black/75 backdrop-blur-md border border-white/10 flex items-center gap-2.5 shadow-2xl">
            <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
            <span className="text-xs font-semibold text-neutral-300">Carregando dados...</span>
          </div>
        </div>
      )}

      {/* 5. Alerta de Posição Retomada (Resume Notice) */}
      {showResumeNotice && resumedTime !== null && (
        <div className="absolute left-4 sm:left-6 top-4 sm:top-6 z-40 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-neutral-900/90 border border-violet-500/30 backdrop-blur-md text-white shadow-xl">
            <div className="w-2 h-2 rounded-full bg-violet-400 animate-ping" />
            <span className="text-xs font-medium">
              Continuando de{' '}
              <strong className="text-violet-300 font-bold">{formatSeconds(resumedTime)}</strong>
            </span>
          </div>
        </div>
      )}

      {/* 6. Botão Flutuante: Próximo Episódio com Contagem Regressiva de 30s (Canto Inferior Direito) */}
      {nextEpisodeCountdown !== null && hasNextEpisode && (
        <div className="absolute right-4 sm:right-6 bottom-16 sm:bottom-20 z-40 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <button
            type="button"
            onClick={handleTriggerNextEpisode}
            onDoubleClick={(e) => e.stopPropagation()}
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

      {/* 7. Tela de Erro de Reprodução */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-neutral-950/95 p-6 text-center z-50">
          <div className="w-14 h-14 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center">
            <RotateCcw className="w-7 h-7" />
          </div>
          <div className="space-y-1.5 max-w-md">
            <h4 className="text-sm font-bold text-white">Falha na Reprodução</h4>
            <p className="text-xs text-neutral-400 leading-relaxed">{error}</p>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => {
                setError(null);
                setLoading(true);
                setRetryKey((k) => k + 1);
              }}
              className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-violet-600/30 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Tentar Novamente
            </button>
            {streamUrl && (
              <button
                onClick={handleCopyLink}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-neutral-200 text-xs font-semibold border border-white/10 transition flex items-center gap-2 cursor-pointer"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-neutral-400" />
                    Copiar Link
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* 8. Controles Centrais: [Capítulo Anterior] [Play/Pause] [Próximo Capítulo] */}
      {!loading && !error && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              if (isPaused) {
                handleManualPlay();
              } else if (videoRef.current) {
                videoRef.current.pause();
              }
            }
          }}
          onDoubleClick={() => toggleFullscreen()}
          className={`absolute inset-0 flex items-center justify-center gap-6 sm:gap-10 z-20 transition-all duration-300 select-none ${
            isPaused || showControls
              ? 'opacity-100 pointer-events-auto bg-black/40'
              : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* Botão: Capítulo Anterior */}
          {(onPrevEpisode !== undefined || hasPrevEpisode) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (hasPrevEpisode && onPrevEpisode) {
                  onPrevEpisode();
                }
              }}
              disabled={!hasPrevEpisode}
              title={hasPrevEpisode ? prevEpisodeLabel : 'Não há capítulo anterior'}
              className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center backdrop-blur-md border transition-all duration-200 ${
                hasPrevEpisode
                  ? 'bg-neutral-900/85 hover:bg-violet-600 text-white border-white/20 hover:border-violet-400 hover:scale-110 active:scale-95 shadow-xl shadow-black/50 cursor-pointer'
                  : 'bg-black/30 text-neutral-600 border-white/5 opacity-30 cursor-not-allowed'
              }`}
            >
              <SkipBack className="w-5 h-5 sm:w-6 sm:h-6 fill-current" />
            </button>
          )}

          {/* Botão Central: Play / Pause */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (isPaused) {
                handleManualPlay();
              } else if (videoRef.current) {
                videoRef.current.pause();
              }
            }}
            title={isPaused ? 'Reproduzir' : 'Pausar'}
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-violet-600/90 hover:bg-violet-600 text-white flex items-center justify-center backdrop-blur-md border-2 border-white/20 hover:border-violet-300 shadow-2xl shadow-violet-950/80 transition-all duration-200 hover:scale-110 active:scale-95 cursor-pointer"
          >
            {isPaused ? (
              <Play className="w-7 h-7 sm:w-9 sm:h-9 fill-current ml-1" />
            ) : (
              <Pause className="w-7 h-7 sm:w-9 sm:h-9 fill-current" />
            )}
          </button>

          {/* Botão: Próximo Capítulo */}
          {(onNextEpisode !== undefined || hasNextEpisode) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (hasNextEpisode && onNextEpisode) {
                  onNextEpisode();
                }
              }}
              disabled={!hasNextEpisode}
              title={hasNextEpisode ? nextEpisodeLabel : 'Não há próximo capítulo'}
              className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center backdrop-blur-md border transition-all duration-200 ${
                hasNextEpisode
                  ? 'bg-neutral-900/85 hover:bg-violet-600 text-white border-white/20 hover:border-violet-400 hover:scale-110 active:scale-95 shadow-xl shadow-black/50 cursor-pointer'
                  : 'bg-black/30 text-neutral-600 border-white/5 opacity-30 cursor-not-allowed'
              }`}
            >
              <SkipForward className="w-5 h-5 sm:w-6 sm:h-6 fill-current" />
            </button>
          )}
        </div>
      )}

      {/* 9. Barra Superior (Apenas em Fullscreen) com Título e Botão de Voltar */}
      {isFullscreen && (
        <div
          className={`html5-fullscreen-controls-top absolute top-0 inset-x-0 z-30 transition-all duration-300 bg-gradient-to-b from-black/80 to-transparent p-4 flex items-center justify-between ${
            isPaused || showControls
              ? 'opacity-100 pointer-events-auto'
              : 'opacity-0 pointer-events-none'
          }`}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => toggleFullscreen(false)}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition backdrop-blur-md cursor-pointer"
              title="Sair da tela cheia"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h3 className="text-sm sm:text-base font-bold text-white truncate max-w-[280px] sm:max-w-xl">
              {title}
            </h3>
          </div>
        </div>
      )}

      {/* 10. Barra Inferior de Controles Completa (Timeline, Tempo, Ajuste de Proporção, Fullscreen) */}
      {!loading && !error && (
        <div
          className={`html5-fullscreen-controls-bottom absolute bottom-0 inset-x-0 z-30 transition-all duration-300 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4 sm:p-5 space-y-2.5 ${
            isPaused || showControls
              ? 'opacity-100 pointer-events-auto'
              : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* Barra de Progresso Interativa (Scrubber) */}
          {streamType !== 'live' && duration > 0 && (
            <div
              onClick={handleSeek}
              className="relative w-full h-3 flex items-center cursor-pointer group/bar"
            >
              <div className="w-full h-1 group-hover/bar:h-2 bg-white/20 rounded-full overflow-hidden transition-all duration-150">
                {/* Buffer */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 left-0 h-1 group-hover/bar:h-2 bg-white/30 rounded-full transition-all"
                  style={{ width: `${(bufferedTime / duration) * 100}%` }}
                />
                {/* Progresso Atual */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 left-0 h-1 group-hover/bar:h-2 bg-violet-500 rounded-full transition-all"
                  style={{ width: `${(currentTime / duration) * 100}%` }}
                />
              </div>
              {/* Ponto indicador no hover */}
              <div
                className="absolute w-3.5 h-3.5 rounded-full bg-violet-400 shadow-lg -translate-x-1/2 opacity-0 group-hover/bar:opacity-100 transition-opacity pointer-events-none"
                style={{ left: `${(currentTime / duration) * 100}%` }}
              />
            </div>
          )}

          {/* Linha de Controles Inferiores */}
          <div className="flex items-center justify-between text-white">
            <div className="flex items-center gap-3">
              {/* Play / Pause pequeno */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (isPaused) handleManualPlay();
                  else videoRef.current?.pause();
                }}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white transition cursor-pointer"
                title={isPaused ? 'Reproduzir' : 'Pausar'}
              >
                {isPaused ? <Play className="w-5 h-5 fill-current" /> : <Pause className="w-5 h-5 fill-current" />}
              </button>

              {/* Botão Mudo / Volume */}
              <button
                onClick={handleToggleMute}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white transition cursor-pointer"
                title={isMuted ? 'Ativar som' : 'Silenciar'}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-5 h-5 text-rose-400" />
                ) : (
                  <Volume2 className="w-5 h-5 text-neutral-200" />
                )}
              </button>

              {/* Exibição de Tempo */}
              {streamType !== 'live' ? (
                <div className="text-xs font-semibold text-neutral-300 font-mono">
                  <span>{formatSeconds(currentTime)}</span>
                  <span className="text-neutral-500 mx-1">/</span>
                  <span className="text-neutral-400">{formatSeconds(duration)}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs font-bold text-rose-500 uppercase">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                  AO VIVO
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Botão de Ajuste de Proporção (Preencher Tela sem Barras vs Proporção Original) */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setAspectFill(!aspectFill);
                  resetControlsTimeout();
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                  aspectFill
                    ? 'bg-violet-600/40 text-violet-300 border border-violet-500/40'
                    : 'bg-white/5 hover:bg-white/10 text-neutral-300 border border-white/10'
                }`}
                title={
                  aspectFill
                    ? 'Preenchimento Total: O vídeo preenche toda a tela sem barras laterais'
                    : 'Ajustar: Proporção original sem zoom'
                }
              >
                <Scaling className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                  {aspectFill ? 'Preencher Tela' : 'Original'}
                </span>
              </button>

              {/* Botão Alternar Tela Cheia */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFullscreen();
                }}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white transition cursor-pointer"
                title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
              >
                {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 11. Tag de Vídeo HTML5 NATIVA */}
      <video
        ref={videoRef}
        playsInline
        poster={posterUrl}
        preload="auto"
        onDoubleClick={() => toggleFullscreen()}
        className={`w-full h-full ${
          aspectFill ? 'fit-cover' : 'fit-contain'
        }`}
        style={{
          filter: brightness < 100 ? `brightness(${brightness}%)` : undefined,
          objectFit: aspectFill ? 'cover' : 'contain',
        }}
      />
    </div>
  );
}
