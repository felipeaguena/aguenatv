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
} from 'lucide-react';
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
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [buffering, setBuffering] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

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

  // Alternância de Tela Cheia (Fullscreen) - IDÊNTICA ao botão nativo do player de vídeo (alvo direto no elemento <video>)
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
      if (video.requestFullscreen) {
        video.requestFullscreen().catch(() => {});
      } else if ((video as any).webkitRequestFullscreen) {
        (video as any).webkitRequestFullscreen();
      } else if ((video as any).webkitEnterFullscreen) {
        (video as any).webkitEnterFullscreen();
      } else if ((video as any).mozRequestFullScreen) {
        (video as any).mozRequestFullScreen();
      }
    } else {
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
  }, []);

  // Atalhos de teclado globais no player: Espaço (play/pause), Setas (seek 10s), M (mute), F (fullscreen)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) {
        return;
      }

      const video = videoRef.current;
      if (!video) return;

      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        if (video.paused) {
          video.play().catch(() => {});
          showFeedback('play', 'Reproduzir');
        } else {
          video.pause();
          showFeedback('pause', 'Pausado');
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        video.currentTime = Math.max(0, video.currentTime - 10);
        showFeedback('rewind', '-10s');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const maxDur = video.duration || video.currentTime + 10;
        video.currentTime = Math.min(maxDur, video.currentTime + 10);
        showFeedback('forward', '+10s');
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        video.muted = !video.muted;
        if (video.muted) {
          showFeedback('mute', 'Mudo');
        } else {
          showFeedback('unmute', 'Som Ativo');
        }
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        handleToggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, [handleToggleFullscreen, showFeedback]);

  // Estados de retomada de reprodução (Resume)
  const [resumedTime, setResumedTime] = useState<number | null>(null);
  const [showResumeNotice, setShowResumeNotice] = useState(false);
  const hasRestoredRef = useRef(false);
  const lastSavedTimeRef = useRef(0);

  const { markWatched } = useWatched();
  const hasMarkedRef = useRef(false);
  const markWatchedRef = useRef(markWatched);
  const onEndedRef = useRef(onEnded);
  const onVideoInfoRef = useRef(onVideoInfo);
  const onProgressRef = useRef(onProgress);

  useEffect(() => {
    markWatchedRef.current = markWatched;
    onEndedRef.current = onEnded;
    onVideoInfoRef.current = onVideoInfo;
    onProgressRef.current = onProgress;
  });

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
    setIsPaused(false);
    hasMarkedRef.current = false;
    hasRestoredRef.current = false;
    lastSavedTimeRef.current = 0;
    setShowResumeNotice(false);
    setResumedTime(null);

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

      // 1. Salva a cada 4 segundos no localStorage para retomar se sair da tela
      if (streamType !== 'live' && Math.abs(video.currentTime - lastSavedTimeRef.current) >= 4) {
        lastSavedTimeRef.current = video.currentTime;
        savePlaybackPosition();
        reportProgress();
      }

      // 2. Marca como assistido ao alcançar 85% do filme/série
      if (!hasMarkedRef.current) {
        const progressPercent = (video.currentTime / video.duration) * 100;
        if (progressPercent >= 85) {
          hasMarkedRef.current = true;
          if (markWatchedRef.current) {
            markWatchedRef.current(streamId, streamType, title, true);
          }
        }
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
      onDoubleClick={handleToggleFullscreen}
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

      {/* 4. Spinner Sutil de Buffering durante a reprodução */}
      {buffering && !loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div className="p-3.5 rounded-2xl bg-black/70 backdrop-blur-md border border-white/10 flex items-center gap-2.5 shadow-2xl">
            <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
            <span className="text-xs font-semibold text-neutral-300">Carregando dados...</span>
          </div>
        </div>
      )}

      {/* 5. Overlay de Botão Play Gigante quando pausado (SEM BLUR: apenas camada escura com botão no centro) */}
      {isPaused && !loading && !error && (
        <div
          onClick={handleManualPlay}
          onDoubleClick={handleToggleFullscreen}
          className="absolute inset-0 flex items-center justify-center bg-black/40 z-10 cursor-pointer transition-all hover:bg-black/30"
          title="Clique para reproduzir (ou duplo clique para tela cheia)"
        >
          <div className="w-20 h-20 rounded-full bg-violet-600/90 hover:bg-violet-600 text-white flex items-center justify-center shadow-[0_0_30px_rgba(139,92,246,0.6)] hover:scale-110 active:scale-95 transition-transform duration-200 border-2 border-white/20">
            <Play className="w-9 h-9 fill-white ml-1 text-white" />
          </div>
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

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              onClick={handleRetry}
              className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-violet-600/30 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Tentar Novamente
            </button>

            {streamUrl && (
              <a
                href={streamUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 text-xs font-semibold border border-white/10 transition flex items-center gap-2"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Link Direto
              </a>
            )}
          </div>
        </div>
      )}

      {/* 7. Tag de Vídeo HTML5 com Suporte a Controles e Poster */}
      <video
        ref={videoRef}
        controls
        playsInline
        poster={posterUrl}
        preload="auto"
        onDoubleClick={handleToggleFullscreen}
        className="w-full h-full object-contain z-1"
      />
    </div>
  );
}
