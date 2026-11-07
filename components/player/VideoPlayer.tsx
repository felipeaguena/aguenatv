'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  AlertTriangle,
  ExternalLink,
  Loader2,
  Clock,
  Volume2,
  VolumeX,
  Copy,
  Check,
  Sun,
  SkipForward,
  SkipBack,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { ScreenOrientation } from '@capacitor/screen-orientation';
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

  // Controle de visibilidade dos botões integrados ao centro do player
  const [showControlsOverlay, setShowControlsOverlay] = useState(false);
  const controlsTimerRef = useRef<NodeJS.Timeout | null>(null);

  const resetControlsTimeout = useCallback(() => {
    setShowControlsOverlay(true);
    if (controlsTimerRef.current) {
      clearTimeout(controlsTimerRef.current);
    }
    controlsTimerRef.current = setTimeout(() => {
      setShowControlsOverlay(false);
    }, 3000);
  }, []);

  const handleContainerMouseMove = useCallback(() => {
    resetControlsTimeout();
  }, [resetControlsTimeout]);

  const handleContainerMouseLeave = useCallback(() => {
    if (!isPaused) {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
      setShowControlsOverlay(false);
    }
  }, [isPaused]);

  // Estados de controle de tela cheia com rotação automática para paisagem (Landscape)
  const lockLandscape = useCallback(async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        await ScreenOrientation.lock({ orientation: 'landscape' });
        return;
      }
    } catch (e) {
      console.warn('[ScreenOrientation] Erro ao travar em paisagem:', e);
    }

    try {
      if (typeof window !== 'undefined' && window.screen?.orientation && typeof (window.screen.orientation as any).lock === 'function') {
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
    } catch (e) {
      console.warn('[ScreenOrientation] Erro ao destravar orientação:', e);
    }

    try {
      if (typeof window !== 'undefined' && window.screen?.orientation && typeof (window.screen.orientation as any).unlock === 'function') {
        (window.screen.orientation as any).unlock();
      }
    } catch (e) {}
  }, []);

  // Monitora alterações de tela cheia no documento e no elemento de vídeo
  useEffect(() => {
    const video = videoRef.current;

    const handleFullscreenChange = () => {
      const isFs = Boolean(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (video as any)?.webkitDisplayingFullscreen
      );

      if (isFs) {
        lockLandscape();
      } else {
        unlockOrientation();
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);

    if (video) {
      video.addEventListener('webkitbeginfullscreen', lockLandscape);
      video.addEventListener('webkitendfullscreen', unlockOrientation);
    }

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      if (video) {
        video.removeEventListener('webkitbeginfullscreen', lockLandscape);
        video.removeEventListener('webkitendfullscreen', unlockOrientation);
      }
      unlockOrientation();
    };
  }, [lockLandscape, unlockOrientation]);

  // Controles de Brilho e Volume por Gestos Touch no Player
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
    const deltaY = touchStateRef.current.startY - touch.clientY; // Positivo ao arrastar para cima
    const deltaX = Math.abs(touch.clientX - touchStateRef.current.startX);

    if (Math.abs(deltaY) < 8 && deltaX < 8) return;
    if (Math.abs(deltaY) < deltaX && !touchStateRef.current.isMoving) return;

    touchStateRef.current.isMoving = true;

    // Sensibilidade: 65% da altura da tela equivale a 100% de variação
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
        if (nextVol > 0 && video.muted) {
          video.muted = false;
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

  // Estados de feedback visual temporário (HUD para atalhos)
  const [feedbackBadge, setFeedbackBadge] = useState<{
    icon: 'rewind' | 'forward' | 'mute' | 'unmute' | 'play' | 'pause';
    text: string;
  } | null>(null);
  const feedbackTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showFeedback = useCallback(
    (icon: 'rewind' | 'forward' | 'mute' | 'unmute' | 'play' | 'pause', text: string) => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      setFeedbackBadge({ icon, text });
      feedbackTimerRef.current = setTimeout(() => {
        setFeedbackBadge(null);
      }, 700);
    },
    []
  );

  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyLink = useCallback(() => {
    if (!streamUrl) return;
    navigator.clipboard.writeText(streamUrl).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  }, [streamUrl]);

  // Alternância de Tela Cheia (Fullscreen) - IDÊNTICA ao botão nativo do player de vídeo
  const handleToggleFullscreen = useCallback((e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }

    const video = videoRef.current;
    if (!video) return;

    const isFullscreen =
      Boolean(document.fullscreenElement) ||
      Boolean((document as any).webkitFullscreenElement) ||
      Boolean((document as any).mozFullScreenElement) ||
      Boolean((video as any).webkitDisplayingFullscreen);

    if (!isFullscreen) {
      lockLandscape();
      const container = containerRef.current;
      if (container && container.requestFullscreen) {
        container.requestFullscreen().catch(() => {
          if (video.requestFullscreen) video.requestFullscreen().catch(() => {});
        });
      } else if (container && (container as any).webkitRequestFullscreen) {
        (container as any).webkitRequestFullscreen();
      } else if ((video as any).webkitEnterFullscreen) {
        (video as any).webkitEnterFullscreen();
      } else if (video.requestFullscreen) {
        video.requestFullscreen().catch(() => {});
      }
    } else {
      unlockOrientation();
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      } else if ((document as any).mozCancelFullScreen) {
        (document as any).mozCancelFullScreen();
      } else if ((video as any).webkitExitFullscreen) {
        (video as any).webkitExitFullscreen();
      }
    }
  }, [lockLandscape, unlockOrientation]);

  // Atalhos de teclado globais no player com CAPTURE e DEBOUNCE para evitar duplo disparo nativo do Space
  useEffect(() => {
    const lastSpacePressRef = { current: 0 };

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) {
        return;
      }

      const video = videoRef.current;
      if (!video) return;

      if (
        e.code === 'Space' ||
        e.key === ' ' ||
        e.keyCode === 32 ||
        e.key === 'MediaPlayPause' ||
        e.key === 'MediaPlay' ||
        e.key === 'MediaPause'
      ) {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) {
          e.stopImmediatePropagation();
        }

        const now = Date.now();
        if (now - lastSpacePressRef.current < 250) {
          return;
        }
        lastSpacePressRef.current = now;

        if (video.paused) {
          video.play()
            .then(() => {
              setIsPaused(false);
              showFeedback('play', 'Reproduzir');
            })
            .catch(() => {
              setIsPaused(true);
            });
        } else {
          video.pause();
          setIsPaused(true);
          showFeedback('pause', 'Pausado');
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'MediaRewind') {
        e.preventDefault();
        e.stopPropagation();
        video.currentTime = Math.max(0, video.currentTime - 10);
        showFeedback('rewind', '-10s');
      } else if (e.key === 'ArrowRight' || e.key === 'MediaFastForward') {
        e.preventDefault();
        e.stopPropagation();
        const maxDur = video.duration || video.currentTime + 10;
        video.currentTime = Math.min(maxDur, video.currentTime + 10);
        showFeedback('forward', '+10s');
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        const nextVol = Math.min(1, (video.volume || 0) + 0.1);
        video.volume = nextVol;
        if (video.muted) video.muted = false;
        showFeedback('unmute', `Volume ${Math.round(nextVol * 100)}%`);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        const nextVol = Math.max(0, (video.volume || 0) - 0.1);
        video.volume = nextVol;
        showFeedback(nextVol === 0 ? 'mute' : 'unmute', `Volume ${Math.round(nextVol * 100)}%`);
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        e.stopPropagation();
        video.muted = !video.muted;
        if (video.muted) {
          showFeedback('mute', 'Mudo');
        } else {
          showFeedback('unmute', 'Som Ativo');
        }
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        e.stopPropagation();
        handleToggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, [handleToggleFullscreen, showFeedback]);

  // Estados de retomada de reprodução (Resume)
  const [resumedTime, setResumedTime] = useState<number | null>(null);
  const [showResumeNotice, setShowResumeNotice] = useState(false);
  const hasRestoredRef = useRef(false);
  const lastSavedTimeRef = useRef(0);

  // Estados de contagem regressiva e autoplay do Próximo Episódio
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

  const reportProgress = useCallback(() => {
    const video = videoRef.current;
    if (!video || streamType === 'live' || !video.duration) return;
    if (onProgressRef.current) {
      onProgressRef.current({
        currentTime: video.currentTime,
        duration: video.duration,
      });
    }
  }, [streamType]);

  // Salva o progresso no localStorage
  const savePlaybackPosition = useCallback(() => {
    const video = videoRef.current;
    if (!video || streamType === 'live' || !video.duration) return;
    const cur = Math.floor(video.currentTime);
    const dur = Math.floor(video.duration);

    if (cur > 5) {
      if (dur - cur < 20) {
        try {
          localStorage.removeItem(`iptv_pos_${streamType}_${streamId}`);
        } catch (e) {}
      } else {
        try {
          localStorage.setItem(
            `iptv_pos_${streamType}_${streamId}`,
            JSON.stringify({ time: cur, duration: dur, updatedAt: Date.now() })
          );
        } catch (e) {}
      }
    }
  }, [streamType, streamId]);

  // Iniciar reprodução manual
  const handleManualPlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setError(null);
    video.play().catch((err) => {
      console.warn('Erro ao iniciar reprodução:', err);
      // Se falhar com som por política do navegador, tenta mudo
      video.muted = true;
      video.play().catch(() => {});
    });
  }, []);

  const handleRetry = useCallback(() => {
    setError(null);
    setLoading(true);
    setRetryKey((prev) => prev + 1);
  }, []);

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

    // Destruir instância anterior do Hls
    if (hlsRef.current) {
      try {
        hlsRef.current.stopLoad();
        hlsRef.current.detachMedia();
        hlsRef.current.destroy();
      } catch (e) {}
      hlsRef.current = null;
    }

    // Identificar tipo de stream: HLS m3u8 vs Direct MP4/VOD
    const isHlsStream = streamUrl.toLowerCase().includes('.m3u8');

    // Função de restauração de progresso para Filmes e Séries
    const tryRestorePlaybackPosition = () => {
      if (hasRestoredRef.current || streamType === 'live') return;
      try {
        if (initialTime !== undefined && initialTime > 5) {
          hasRestoredRef.current = true;
          video.currentTime = initialTime;
          setResumedTime(initialTime);
          setShowResumeNotice(true);
          setTimeout(() => {
            setShowResumeNotice(false);
          }, 6000);
          return;
        }

        const raw = localStorage.getItem(`iptv_pos_${streamType}_${streamId}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          const savedTime = Number(parsed.time);
          const savedDur = Number(parsed.duration) || video.duration;

          if (savedTime && savedTime > 10 && (!savedDur || savedTime < savedDur - 25)) {
            hasRestoredRef.current = true;
            video.currentTime = savedTime;
            setResumedTime(savedTime);
            setShowResumeNotice(true);
            setTimeout(() => {
              setShowResumeNotice(false);
            }, 6000);
          }
        }
      } catch (e) {
        console.warn('Erro ao restaurar progresso:', e);
      }
    };

    // Notifica metadados técnicos do vídeo nativo (dimensões e duração)
    const emitVideoInfo = () => {
      if (!onVideoInfoRef.current) return;
      const w = video.videoWidth;
      const h = video.videoHeight;
      const d = video.duration;

      let dimensions: string | undefined = undefined;
      if (w > 0 && h > 0) {
        let label = '';
        if (w >= 3840 || h >= 2160) label = ' (4K)';
        else if (w >= 1920 || h >= 1080) label = ' (1080p)';
        else if (w >= 1280 || h >= 720) label = ' (720p)';
        dimensions = `${w}x${h}${label}`;
      }

      let formattedDuration: string | undefined = undefined;
      if (d && !isNaN(d) && isFinite(d) && d > 0) {
        const hrs = Math.floor(d / 3600);
        const mins = Math.floor((d % 3600) / 60);
        const secs = Math.floor(d % 60);
        if (hrs > 0) {
          formattedDuration = `${hrs}h ${mins}m`;
        } else {
          formattedDuration = `${mins}m ${secs}s`;
        }
      }

      onVideoInfoRef.current({
        duration: d,
        formattedDuration,
        width: w,
        height: h,
        dimensions,
      });
    };

    // Manipuladores de eventos nativos do elemento <video>
    const handleLoadedMetadata = () => {
      setLoading(false);
      tryRestorePlaybackPosition();
      emitVideoInfo();
    };

    const handleLoadedData = () => {
      setLoading(false);
      tryRestorePlaybackPosition();
      emitVideoInfo();
    };

    const handleCanPlay = () => {
      setLoading(false);
      setBuffering(false);
      tryRestorePlaybackPosition();
      emitVideoInfo();

      if (autoPlay && video.paused) {
        video.play().catch(() => {
          setIsPaused(true);
        });
      } else if (!autoPlay) {
        setIsPaused(true);
      }
    };

    const handlePlay = () => {
      setIsPaused(false);
      setLoading(false);
      setBuffering(false);
    };

    const handlePause = () => {
      setIsPaused(true);
      savePlaybackPosition();
      reportProgress();
    };

    const handleWaiting = () => {
      setBuffering(true);
    };

    const handlePlaying = () => {
      setBuffering(false);
      setLoading(false);
      setIsPaused(false);
    };

    const handleVideoError = () => {
      console.error('Erro no elemento de vídeo:', video.error);
      setLoading(false);
      setBuffering(false);
      setError('Não foi possível reproduzir este vídeo. Verifique se o link está ativo ou tente novamente.');
    };

    // Monitoramento do progresso contínuo
    const handleTimeUpdate = () => {
      if (!video.duration) return;

      const duration = video.duration;
      const currentTime = video.currentTime;

      // 1. Salva a cada 4 segundos no localStorage para retomar se sair da tela
      if (streamType !== 'live' && Math.abs(currentTime - lastSavedTimeRef.current) >= 4) {
        lastSavedTimeRef.current = currentTime;
        savePlaybackPosition();
        reportProgress();
      }

      // 2. Marca como assistido ao alcançar 85% do filme/série
      if (!hasMarkedRef.current) {
        const progressPercent = (currentTime / duration) * 100;
        if (progressPercent >= 85) {
          hasMarkedRef.current = true;
          if (markWatchedRef.current) {
            markWatchedRef.current(streamId, streamType, title, true);
          }
        }
      }

      // 3. Autoplay e Botão de Ação do Próximo Episódio (30s antes do final do capítulo)
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
    };

    const handleVideoEnded = () => {
      hasMarkedRef.current = true;
      try {
        localStorage.removeItem(`iptv_pos_${streamType}_${streamId}`);
      } catch (e) {}
      if (markWatchedRef.current) {
        markWatchedRef.current(streamId, streamType, title, true);
      }
      if (onEndedRef.current) onEndedRef.current();

      // Autoplay: avança automaticamente para o próximo capítulo se ainda não avançou
      if (!hasAutoAdvancedRef.current && hasNextEpisodeRef.current && onNextEpisodeRef.current) {
        hasAutoAdvancedRef.current = true;
        setNextEpisodeCountdown(null);
        onNextEpisodeRef.current();
      }
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('error', handleVideoError);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleVideoEnded);

    if (isHlsStream && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
        maxBufferLength: 30,
        startLevel: -1,
      });

      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLoading(false);
        tryRestorePlaybackPosition();
        if (autoPlay) {
          video.play().catch(() => {
            setIsPaused(true);
          });
        } else {
          setIsPaused(true);
        }
      });

      hls.on(Hls.Events.LEVEL_LOADED, () => {
        const currentLevel = hlsRef.current?.levels?.[hlsRef.current.currentLevel];
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

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.warn('[HLS] Erro fatal de rede, tentando recuperar...');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn('[HLS] Erro fatal de mídia, tentando recuperar...');
              hls.recoverMediaError();
              break;
            default:
              console.error('[HLS] Erro irrecuperável:', data);
              hls.destroy();
              setLoading(false);
              setError('Transmissão ao vivo indisponível ou codec não suportado');
              break;
          }
        }
      });
    } else if (isHlsStream && video.canPlayType('application/vnd.apple.mpegurl')) {
      // Suporte nativo HLS em Safari / iOS
      video.src = streamUrl;
      video.load();
    } else {
      // Reprodução direta para VOD (MP4, MKV, etc.)
      video.src = streamUrl;
      video.load();
      if (autoPlay) {
        video.play().catch(() => {
          setIsPaused(true);
        });
      } else {
        setIsPaused(true);
      }
    }

    return () => {
      // 1. Salva a posição final imediatamente antes de sair
      savePlaybackPosition();
      reportProgress();

      // 2. Remove listeners
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('error', handleVideoError);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ended', handleVideoEnded);

      // 3. Interrompe IMEDIATAMENTE a reprodução de vídeo e áudio
      try {
        video.pause();
      } catch (e) {}

      // 4. Destrói e desanexa o HLS para cessar qualquer tráfego de rede
      if (hlsRef.current) {
        try {
          hlsRef.current.stopLoad();
          hlsRef.current.detachMedia();
          hlsRef.current.destroy();
        } catch (e) {}
        hlsRef.current = null;
      }

      // 5. Descarrega o elemento de vídeo para liberar recursos do navegador
      try {
        video.removeAttribute('src');
        video.load();
      } catch (e) {}
    };
  }, [streamUrl, streamId, streamType, title, autoPlay, retryKey, savePlaybackPosition]);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleContainerMouseMove}
      onMouseLeave={handleContainerMouseLeave}
      onDoubleClick={handleToggleFullscreen}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className="relative w-full h-full bg-black rounded-2xl overflow-hidden flex items-center justify-center group select-none"
    >
      {/* 1. Backdrop / Poster se o vídeo ainda não começou */}
      {posterUrl && loading && (
        <div className="absolute inset-0 z-0">
          <img
            src={posterUrl}
            alt={title}
            className="w-full h-full object-cover filter blur-sm opacity-40 scale-105"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <div className="absolute inset-0 bg-black/60" />
        </div>
      )}

      {/* 2. Overlay de Carregamento Inicial */}
      {loading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-20 gap-3">
          <div className="w-12 h-12 rounded-full border-4 border-violet-500 border-t-transparent animate-spin" />
          <p className="text-xs text-neutral-200 font-semibold tracking-wide animate-pulse">
            Iniciando transmissão de vídeo...
          </p>
        </div>
      )}

      {/* 3. Notificação Toast de Retomada (Resume Playback) */}
      {showResumeNotice && resumedTime !== null && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-black/85 border border-violet-500/40 backdrop-blur-md shadow-2xl text-xs text-white animate-in fade-in slide-in-from-top-2 duration-300">
          <Clock className="w-4 h-4 text-violet-400 shrink-0" />
          <span>
            Continuando de <span className="font-bold text-violet-300">{formatSeconds(resumedTime)}</span>
          </span>
          <button
            onClick={() => {
              if (videoRef.current) {
                videoRef.current.currentTime = 0;
                setShowResumeNotice(false);
                try {
                  localStorage.removeItem(`iptv_pos_${streamType}_${streamId}`);
                } catch (e) {}
              }
            }}
            className="ml-2 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-neutral-200 hover:text-white text-[11px] font-bold transition cursor-pointer"
          >
            Recomeçar do início
          </button>
        </div>
      )}

      {/* 4. Botão Flutuante de Ação: Próximo Episódio com Contagem Regressiva de 30s (Canto Inferior Direito) */}
      {nextEpisodeCountdown !== null && hasNextEpisode && (
        <div className="absolute right-4 sm:right-6 bottom-16 sm:bottom-20 z-30 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <button
            type="button"
            onClick={handleTriggerNextEpisode}
            onDoubleClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            tabIndex={0}
            data-tv-focusable="true"
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

      {/* 4. Spinner Sutil de Buffering durante a reprodução */}
      {buffering && !loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div className="p-3.5 rounded-2xl bg-black/70 backdrop-blur-md border border-white/10 flex items-center gap-2.5 shadow-2xl">
            <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
            <span className="text-xs font-semibold text-neutral-300">Carregando dados...</span>
          </div>
        </div>
      )}

      {/* 5. Controles Centrais Integrados ao Player: [Capítulo Anterior] [Play/Pausa] [Próximo Capítulo] */}
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
          onDoubleClick={handleToggleFullscreen}
          className={`absolute inset-0 flex items-center justify-center gap-5 sm:gap-8 z-10 transition-all duration-300 select-none ${
            isPaused || showControlsOverlay
              ? 'opacity-100 pointer-events-auto bg-black/40 hover:bg-black/35'
              : 'opacity-0 pointer-events-none'
          }`}
          title={isPaused ? 'Clique para reproduzir (ou duplo clique para tela cheia)' : 'Clique para pausar'}
        >
          {/* Botão Ícone: Capítulo Anterior (ao lado esquerdo do Play) */}
          {(onPrevEpisode !== undefined || hasPrevEpisode) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (hasPrevEpisode && onPrevEpisode) {
                  onPrevEpisode();
                }
              }}
              onDoubleClick={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
              disabled={!hasPrevEpisode}
              tabIndex={0}
              data-tv-focusable="true"
              title={hasPrevEpisode ? (prevEpisodeLabel || 'Capítulo Anterior') : 'Não há capítulo anterior'}
              className={`w-11 h-11 sm:w-13 sm:h-13 rounded-full flex items-center justify-center backdrop-blur-md border transition-all duration-200 ${
                hasPrevEpisode
                  ? 'bg-neutral-900/85 hover:bg-violet-600 text-white border-white/20 hover:border-violet-400 hover:scale-110 active:scale-95 shadow-xl shadow-black/50 cursor-pointer'
                  : 'bg-black/30 text-neutral-600 border-white/5 opacity-30 cursor-not-allowed'
              }`}
            >
              <SkipBack className="w-5 h-5 sm:w-6 sm:h-6 fill-current" />
            </button>
          )}

          {/* Botão Ícone Central: Play / Pause */}
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
            onDoubleClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            tabIndex={0}
            data-tv-focusable="true"
            title={isPaused ? 'Reproduzir' : 'Pausar'}
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-violet-600/90 hover:bg-violet-600 text-white flex items-center justify-center shadow-[0_0_30px_rgba(139,92,246,0.6)] hover:scale-110 active:scale-95 transition-transform duration-200 border-2 border-white/20 cursor-pointer"
          >
            {isPaused ? (
              <Play className="w-8 h-8 sm:w-9 sm:h-9 fill-white ml-1 text-white" />
            ) : (
              <Pause className="w-8 h-8 sm:w-9 sm:h-9 fill-white text-white" />
            )}
          </button>

          {/* Botão Ícone: Próximo Capítulo (ao lado direito do Play) */}
          {(onNextEpisode !== undefined || hasNextEpisode) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (hasNextEpisode && onNextEpisode) {
                  onNextEpisode();
                }
              }}
              onDoubleClick={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
              disabled={!hasNextEpisode}
              tabIndex={0}
              data-tv-focusable="true"
              title={hasNextEpisode ? (nextEpisodeLabel || 'Próximo Capítulo') : 'Não há próximo capítulo'}
              className={`w-11 h-11 sm:w-13 sm:h-13 rounded-full flex items-center justify-center backdrop-blur-md border transition-all duration-200 ${
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

      {/* 6. Feedback Toast Central de Atalhos (Play, Pause, -10s, +10s, Mudo) */}
      {feedbackBadge && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30 animate-in fade-in zoom-in-95 duration-150">
          <div className="px-5 py-3 rounded-2xl bg-black/85 border border-white/15 backdrop-blur-md shadow-2xl flex items-center gap-2.5 text-white font-bold text-sm tracking-wide">
            {feedbackBadge.icon === 'rewind' && <RotateCcw className="w-5 h-5 text-violet-400" />}
            {feedbackBadge.icon === 'forward' && <RotateCw className="w-5 h-5 text-violet-400" />}
            {feedbackBadge.icon === 'mute' && <VolumeX className="w-5 h-5 text-rose-400" />}
            {feedbackBadge.icon === 'unmute' && <Volume2 className="w-5 h-5 text-emerald-400" />}
            {feedbackBadge.icon === 'play' && <Play className="w-5 h-5 text-violet-400 fill-violet-400" />}
            {feedbackBadge.icon === 'pause' && <Pause className="w-5 h-5 text-amber-400 fill-amber-400" />}
            <span>{feedbackBadge.text}</span>
          </div>
        </div>
      )}

      {/* 7. Painel de Erro Elegante com Botão de Recarregar */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-950/95 p-6 text-center z-30 gap-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <div className="space-y-1.5 max-w-md">
            <h4 className="text-sm font-bold text-white">Falha na Reprodução</h4>
            <p className="text-xs text-neutral-400 leading-relaxed">{error}</p>
          </div>

          {typeof window !== 'undefined' && window.location.protocol === 'https:' && streamUrl?.startsWith('http:') && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 max-w-md text-left space-y-1">
              <p className="font-semibold text-amber-200 flex items-center gap-1.5">
                <span>🔒</span> Reprodução em HTTPS (Conteúdo Misto)
              </p>
              <p className="text-amber-300/80 leading-relaxed">
                Navegadores modernos podem pausar streams HTTP quando abertos em páginas HTTPS. Para assistir direto no navegador, clique no ícone ao lado do endereço do site (cadeado ou configurações do site) e marque <strong>&quot;Conteúdo não seguro&quot;</strong> como <strong>&quot;Permitir&quot;</strong>, ou use o botão <strong>&quot;Link Direto&quot;</strong> abaixo para abrir no VLC ou reprodutor externo.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
            <button
              onClick={handleRetry}
              className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-violet-600/30 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Tentar Novamente
            </button>

            {streamUrl && (
              <button
                onClick={handleCopyLink}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-neutral-200 text-xs font-semibold border border-white/10 transition flex items-center gap-2 cursor-pointer"
                title="Copiar link do stream para colar em reprodutor externo"
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

      {/* 7. Camada de Ajuste de Brilho Dinâmico (Dimmer) */}
      {brightness < 100 && (
        <div
          className="absolute inset-0 bg-black pointer-events-none z-5 transition-opacity"
          style={{ opacity: ((100 - brightness) / 100) * 0.85 }}
        />
      )}

      {/* 8. HUD de Gestos Touch (Brilho no lado esquerdo, Volume no lado direito) */}
      {touchFeedback && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-40 animate-in fade-in zoom-in-95 duration-100">
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
              <span className="text-sm font-extrabold text-white">
                {touchFeedback.value}%
              </span>
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

      {/* 9. Tag de Vídeo HTML5 com Suporte a Controles, Teclado e Filtro de Brilho */}
      <video
        ref={videoRef}
        controls
        playsInline
        poster={posterUrl}
        preload="auto"
        onKeyDown={(e) => {
          if (e.code === 'Space' || e.key === ' ' || e.keyCode === 32) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        onDoubleClick={handleToggleFullscreen}
        className="w-full h-full object-contain z-1"
        style={{
          filter: brightness < 100 ? `brightness(${brightness}%)` : undefined,
        }}
      />
    </div>
  );
}
