'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Artplayer from 'artplayer';
import Hls from 'hls.js';
import { SkipForward, AlertTriangle, RotateCcw } from 'lucide-react';
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
  if (isNaN(sec) || sec < 0) return '0:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  if (Capacitor.isNativePlatform()) return true;
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (window.matchMedia && window.matchMedia('(max-width: 1024px) and (hover: none) and (pointer: coarse)').matches)
  );
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
  const artContainerRef = useRef<HTMLDivElement>(null);
  const artInstanceRef = useRef<Artplayer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // Estados de contagem regressiva e autoplay do Próximo Episódio (30s antes do final)
  const [nextEpisodeCountdown, setNextEpisodeCountdown] = useState<number | null>(null);
  const hasAutoAdvancedRef = useRef(false);
  const hasRestoredRef = useRef(false);

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

  // Função para acionar Tela Cheia NATIVA diretamente no elemento <video>
  const triggerNativeFullscreen = useCallback((art: Artplayer) => {
    const video = art.video;
    if (!video) return;

    // 1. Trava orientação horizontal (Landscape)
    if (Capacitor.isNativePlatform()) {
      ScreenOrientation.lock({ orientation: 'landscape' }).catch(() => {});
    } else if (
      typeof window !== 'undefined' &&
      window.screen?.orientation &&
      typeof (window.screen.orientation as any).lock === 'function'
    ) {
      (window.screen.orientation as any).lock('landscape').catch(() => {});
    }

    // 2. Dispara o fullscreen nativo direto no hardware de vídeo do dispositivo
    try {
      if (video.requestFullscreen) {
        video.requestFullscreen().catch(() => {});
      } else if ((video as any).webkitRequestFullscreen) {
        (video as any).webkitRequestFullscreen();
      } else if ((video as any).webkitEnterFullscreen) {
        (video as any).webkitEnterFullscreen(); // iOS Safari
      } else if ((video as any).mozRequestFullScreen) {
        (video as any).mozRequestFullScreen();
      }
    } catch (e) {
      console.warn('[VideoPlayer] Falha ao acionar fullscreen nativo:', e);
    }
  }, []);

  // Monitora saída de tela cheia nativa para destravar a orientação
  useEffect(() => {
    const handleExitFullscreen = () => {
      const isFs = Boolean(
        document.fullscreenElement ||
          (document as any).webkitFullscreenElement ||
          (document as any).mozFullScreenElement ||
          (artInstanceRef.current?.video as any)?.webkitDisplayingFullscreen
      );

      if (!isFs) {
        if (Capacitor.isNativePlatform()) {
          ScreenOrientation.unlock().catch(() => {});
        } else if (
          typeof window !== 'undefined' &&
          window.screen?.orientation &&
          typeof (window.screen.orientation as any).unlock === 'function'
        ) {
          (window.screen.orientation as any).unlock();
        }
      }
    };

    document.addEventListener('fullscreenchange', handleExitFullscreen);
    document.addEventListener('webkitfullscreenchange', handleExitFullscreen);
    document.addEventListener('mozfullscreenchange', handleExitFullscreen);

    const video = artInstanceRef.current?.video;
    if (video) {
      video.addEventListener('webkitendfullscreen', handleExitFullscreen);
    }

    return () => {
      document.removeEventListener('fullscreenchange', handleExitFullscreen);
      document.removeEventListener('webkitfullscreenchange', handleExitFullscreen);
      document.removeEventListener('mozfullscreenchange', handleExitFullscreen);
      if (video) {
        video.removeEventListener('webkitendfullscreen', handleExitFullscreen);
      }
    };
  }, []);

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

  useEffect(() => {
    if (!artContainerRef.current || !streamUrl) return;

    hasRestoredRef.current = false;
    hasMarkedRef.current = false;
    hasAutoAdvancedRef.current = false;
    setNextEpisodeCountdown(null);
    setError(null);

    const isMobile = isMobileDevice();
    const isHls = streamUrl.toLowerCase().includes('.m3u8') || streamType === 'live';

    // Criação da instância Artplayer.js configurada para Tela Cheia Nativa no Mobile (Opção 1)
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
      playbackRate: true,
      aspectRatio: true,
      // No desktop usa o fullscreen embutido do Artplayer; no mobile o botão de Fullscreen Nativo assume
      fullscreen: !isMobile,
      fullscreenWeb: false,
      subtitleOffset: true,
      miniProgressBar: true,
      playsInline: true,
      autoOrientation: true,
      hotkey: true,
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
        ...(hasPrevEpisodeRef.current && onPrevEpisodeRef.current
          ? [
              {
                name: 'prev-chapter',
                position: 'left' as const,
                index: 10,
                html: '<span class="art-icon" style="display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0 3px;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5"></line></svg></span>',
                tooltip: prevEpisodeLabel,
                click: () => onPrevEpisodeRef.current?.(),
              },
            ]
          : []),
        ...(hasNextEpisodeRef.current && onNextEpisodeRef.current
          ? [
              {
                name: 'next-chapter',
                position: 'left' as const,
                index: 11,
                html: '<span class="art-icon" style="display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0 3px;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg></span>',
                tooltip: nextEpisodeLabel,
                click: () => onNextEpisodeRef.current?.(),
              },
            ]
          : []),
        // Botão de Tela Cheia NATIVA para Mobile (Opção 1)
        ...(isMobile
          ? [
              {
                name: 'native-fullscreen',
                position: 'right' as const,
                index: 30,
                html: '<span class="art-icon" style="display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0 4px;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg></span>',
                tooltip: 'Tela Cheia Nativa',
                click: function (this: Artplayer) {
                  triggerNativeFullscreen(this);
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
                    console.warn('[HLS] Tentando recuperar erro de rede...');
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

    // No mobile, duplo toque também ativa tela cheia nativa
    if (isMobile) {
      art.on('dblclick', () => {
        triggerNativeFullscreen(art);
      });

      // Se qualquer evento interno acionar fullscreen no mobile, delega para a tela cheia nativa
      art.on('fullscreen', (state) => {
        if (state) {
          art.fullscreen = false;
          triggerNativeFullscreen(art);
        }
      });
    }

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
        const raw = localStorage.getItem(`iptv_pos_${streamType}_${streamId}`);
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
            localStorage.setItem(`iptv_pos_${streamType}_${streamId}`, currentTime.toFixed(1));
          } catch (e) {}
        }
        onProgressRef.current?.({ currentTime, duration });
        if (currentTime > 60 && !hasMarkedRef.current) {
          hasMarkedRef.current = true;
          markWatchedRef.current?.(streamId, streamType, title, false);
        }
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

    // Término do vídeo
    art.on('video:ended', () => {
      hasMarkedRef.current = true;
      try {
        localStorage.removeItem(`iptv_pos_${streamType}_${streamId}`);
      } catch (e) {}

      if (markWatchedRef.current) {
        markWatchedRef.current(streamId, streamType, title, true);
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
      setError('Falha na reprodução do stream de vídeo. Tente novamente mais tarde.');
    });

    return () => {
      if (artInstanceRef.current) {
        try {
          artInstanceRef.current.destroy(false);
        } catch (e) {}
        artInstanceRef.current = null;
      }
    };
  }, [streamUrl, streamType, streamId, title, posterUrl, autoPlay, initialTime, retryKey, prevEpisodeLabel, nextEpisodeLabel, triggerNativeFullscreen]);

  return (
    <div className="relative w-full h-full bg-black select-none overflow-hidden">
      {/* Container onde o Artplayer.js é injetado */}
      <div ref={artContainerRef} className="w-full h-full" />

      {/* Botão Flutuante de Próximo Episódio com Contagem Regressiva de 30s */}
      {nextEpisodeCountdown !== null && hasNextEpisode && (
        <div className="absolute right-4 sm:right-6 bottom-16 sm:bottom-20 z-40 animate-in fade-in slide-in-from-bottom-4 duration-300">
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
