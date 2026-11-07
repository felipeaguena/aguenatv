'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Artplayer from 'artplayer';
import Hls from 'hls.js';
import { SkipForward, AlertTriangle, RotateCcw } from 'lucide-react';
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
  if (isNaN(sec) || sec < 0) return '0:00';
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
  const artContainerRef = useRef<HTMLDivElement>(null);
  const artInstanceRef = useRef<Artplayer | null>(null);
  const [artPlayerEl, setArtPlayerEl] = useState<HTMLElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // Estados de contagem regressiva e autoplay do Próximo Episódio
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

    const isHls = streamUrl.toLowerCase().includes('.m3u8') || streamType === 'live';

    // Criação do Artplayer com opções limpas e otimizadas para mobile e TV
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
      screenshot: false, // Removido botão de screenshot conforme solicitado
      setting: true,
      playbackRate: true,
      aspectRatio: true,
      fullscreen: true,
      fullscreenWeb: false, // Desabilitado botão webFullscreen redundante para economizar espaço
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
      // Controles customizados de Capítulo Anterior e Próximo na barra nativa com tamanho otimizado
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
      ],
      // Suporte personalizado a streams HLS via Hls.js
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

            // Resoluções / Qualidades do HLS
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

              // Faixas de Áudio
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

            // Tratamento de erros fatais do HLS
            hls.on(Hls.Events.ERROR, (_, errData) => {
              if (errData.fatal) {
                switch (errData.type) {
                  case Hls.ErrorTypes.NETWORK_ERROR:
                    console.warn('[HLS] Erro de rede fatal, tentando recarregar...');
                    hls.startLoad();
                    break;
                  case Hls.ErrorTypes.MEDIA_ERROR:
                    console.warn('[HLS] Erro de mídia fatal, tentando recuperar...');
                    hls.recoverMediaError();
                    break;
                  default:
                    console.error('[HLS] Erro irrecuperável:', errData);
                    setError('Não foi possível carregar a transmissão. O servidor de origem pode estar instável.');
                    hls.destroy();
                    break;
                }
              }
            });
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = url;
          } else {
            setError('Seu navegador não possui suporte à reprodução de streams HLS (.m3u8).');
          }
        },
      },
    });

    artInstanceRef.current = art;
    if (art.template?.$player) {
      setArtPlayerEl(art.template.$player);
    }

    // Restauração de posição ao carregar metadados
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

    // Monitoramento contínuo de tempo e contagem de 30s
    art.on('video:timeupdate', () => {
      const currentTime = art.currentTime || 0;
      const duration = art.duration || 0;

      // Persistência periódica de progresso
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

      // Autoplay e Botão de Ação do Próximo Episódio (30s antes do final)
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

    // Fim da reprodução do vídeo
    art.on('video:ended', () => {
      hasMarkedRef.current = true;
      try {
        localStorage.removeItem(`iptv_pos_${streamType}_${streamId}`);
      } catch (e) {}

      if (markWatchedRef.current) {
        markWatchedRef.current(streamId, streamType, title, true);
      }
      if (onEndedRef.current) onEndedRef.current();

      // Autoplay: avança automaticamente para o próximo capítulo
      if (!hasAutoAdvancedRef.current && hasNextEpisodeRef.current && onNextEpisodeRef.current) {
        hasAutoAdvancedRef.current = true;
        setNextEpisodeCountdown(null);
        onNextEpisodeRef.current();
      }
    });

    // Erros nativos do elemento de vídeo
    art.on('video:error', () => {
      setError('Falha na reprodução do stream de vídeo. Tente novamente mais tarde.');
    });

    // Fullscreen nativo, rotação e controle de StatusBar no Capacitor (Mobile / APK / Android TV)
    const handleFullscreenChange = async (state: boolean) => {
      // 1. Dinamicamente ajusta o viewport meta: viewport-fit=cover APENAS em fullscreen
      try {
        const metaViewport = document.querySelector('meta[name="viewport"]');
        if (metaViewport) {
          if (state) {
            metaViewport.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover');
          } else {
            metaViewport.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1');
          }
        }
      } catch (e) {}

      // 2. Ponte nativa Android para ativar suporte a recorte de tela (notch / cutout) APENAS em fullscreen
      try {
        if (typeof (window as any).AndroidBridge?.setCutoutFullscreen === 'function') {
          (window as any).AndroidBridge.setCutoutFullscreen(state);
        }
      } catch (e) {}

      // 3. Controle de StatusBar e orientação de tela no Capacitor (Mobile / APK / Android TV)
      if (Capacitor.isNativePlatform()) {
        try {
          if (state) {
            await StatusBar.hide().catch(() => {});
            await StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
            await ScreenOrientation.lock({ orientation: 'landscape' }).catch(() => {});
          } else {
            await StatusBar.show().catch(() => {});
            await StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
            await ScreenOrientation.unlock().catch(() => {});
          }
        } catch (e) {}
      }
    };

    art.on('fullscreen', handleFullscreenChange);
    art.on('fullscreenWeb', handleFullscreenChange);

    return () => {
      // Restaura viewport e configurações normais do sistema ao desmontar ou sair do player
      try {
        const metaViewport = document.querySelector('meta[name="viewport"]');
        if (metaViewport) {
          metaViewport.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1');
        }
      } catch (e) {}

      try {
        if (typeof (window as any).AndroidBridge?.setCutoutFullscreen === 'function') {
          (window as any).AndroidBridge.setCutoutFullscreen(false);
        }
      } catch (e) {}

      if (Capacitor.isNativePlatform()) {
        StatusBar.show().catch(() => {});
        StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
        ScreenOrientation.unlock().catch(() => {});
      }

      if (artInstanceRef.current) {
        artInstanceRef.current.destroy(true);
        artInstanceRef.current = null;
      }
      setArtPlayerEl(null);
    };
  }, [streamUrl, streamId, streamType, title, autoPlay, retryKey, posterUrl, initialTime, prevEpisodeLabel, nextEpisodeLabel]);

  // Overlay de Próximo Episódio (renderizado diretamente dentro do Artplayer para permanecer visível em tela cheia)
  const nextEpisodeOverlay =
    nextEpisodeCountdown !== null && hasNextEpisode ? (
      <div className="absolute right-4 sm:right-6 bottom-14 sm:bottom-20 z-40 animate-in fade-in slide-in-from-bottom-3 duration-300 pointer-events-auto">
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
          className="group/btn flex items-center gap-2 sm:gap-2.5 px-3 sm:px-4 py-1.5 sm:py-2.5 rounded-2xl bg-neutral-900/95 hover:bg-violet-600 border border-violet-500/40 hover:border-violet-400 backdrop-blur-md text-white shadow-2xl shadow-violet-950/60 transition-all duration-200 cursor-pointer active:scale-95 hover:scale-105"
        >
          <div className="w-5 h-5 sm:w-7 sm:h-7 rounded-full bg-violet-600 group-hover/btn:bg-white text-white group-hover/btn:text-violet-700 flex items-center justify-center transition-colors shadow-sm shrink-0">
            <SkipForward className="w-3 h-3 sm:w-4 sm:h-4 fill-current" />
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="font-bold text-xs sm:text-sm tracking-wide text-white">
              {nextEpisodeLabel || 'Próximo Episódio'}
            </span>
            <span className="px-1.5 sm:px-2 py-0.5 rounded-full bg-violet-500/25 group-hover/btn:bg-white/25 border border-violet-400/30 group-hover/btn:border-white/30 text-violet-200 group-hover/btn:text-white font-mono font-extrabold text-[10px] sm:text-xs min-w-[24px] sm:min-w-[28px] text-center">
              {nextEpisodeCountdown}s
            </span>
          </div>
        </button>
      </div>
    ) : null;

  return (
    <div
      className="absolute inset-0 w-full h-full bg-black overflow-hidden select-none"
      data-tv-focusable="true"
    >
      {/* Contêiner onde o Artplayer.js é montado */}
      <div ref={artContainerRef} className="w-full h-full" />

      {/* Renderização do Botão de Próximo Episódio via Portal para suportar Fullscreen nativo */}
      {artPlayerEl ? createPortal(nextEpisodeOverlay, artPlayerEl) : nextEpisodeOverlay}

      {/* Overlay elegante de Erro com Ação de Retry */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-50 p-6 text-center">
          <AlertTriangle className="w-12 h-12 text-amber-500 mb-3 animate-pulse" />
          <h3 className="text-lg font-bold text-white mb-1">Falha na Reprodução</h3>
          <p className="text-sm text-neutral-400 max-w-md mb-6">{error}</p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setRetryKey((k) => k + 1);
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold transition shadow-lg cursor-pointer active:scale-95"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Tentar Novamente</span>
          </button>
        </div>
      )}
    </div>
  );
}
