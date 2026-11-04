'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Download, Trash2, Play, HardDrive, Film, Tv, Clock, AlertCircle } from 'lucide-react';
import {
  getOfflineDownloadsList,
  deleteOfflineDownload,
  getPlayableOfflineUrl,
  OfflineDownload,
  isNativeApp,
} from '@/lib/download-manager';
import ImageWithFallback from '@/components/ui/ImageWithFallback';
import { usePlayer } from '@/context/PlayerContext';

export default function OfflineDownloadsPage() {
  const router = useRouter();
  const { play } = usePlayer();
  const [downloads, setDownloads] = useState<OfflineDownload[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDownloads = async () => {
    setLoading(true);
    try {
      const items = await getOfflineDownloadsList();
      setDownloads(items);
    } catch (err) {
      console.warn('Erro ao carregar vídeos baixados:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDownloads();
  }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Deseja excluir este vídeo da memória do dispositivo?')) return;
    await deleteOfflineDownload(id);
    await loadDownloads();
  };

  const handlePlay = async (item: OfflineDownload) => {
    try {
      const playableUrl = await getPlayableOfflineUrl(item);
      play({
        streamUrl: playableUrl,
        title: item.title,
        posterUrl: item.poster_url,
        streamType: item.stream_type,
        streamId: String(item.stream_id),
      });
    } catch {
      alert('Não foi possível reproduzir este vídeo offline.');
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return 'Tamanho desconhecido';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(2)} GB`;
    }
    return `${Math.round(mb)} MB`;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-3">
            <span className="p-2 rounded-2xl bg-violet-600/20 text-violet-400 border border-violet-500/30">
              <Download className="w-6 h-6" />
            </span>
            Vídeos Baixados (Offline)
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            {isNativeApp()
              ? 'Vídeos salvos diretamente na memória do seu celular para assistir sem gastar internet.'
              : 'Gerencie e reproduza conteúdos baixados para reprodução local.'}
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs text-neutral-300">
          <HardDrive className="w-4 h-4 text-violet-400" />
          <span>
            {downloads.length} {downloads.length === 1 ? 'vídeo baixado' : 'vídeos baixados'}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="min-h-[40vh] flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : downloads.length === 0 ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center text-center p-8 rounded-3xl bg-[#13141b]/50 border border-white/5">
          <div className="w-16 h-16 rounded-full bg-violet-600/10 flex items-center justify-center text-violet-400 mb-4 border border-violet-500/20">
            <Download className="w-8 h-8 opacity-70" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Nenhum vídeo baixado ainda</h3>
          <p className="text-sm text-neutral-400 max-w-md mb-6">
            Você pode clicar no botão <strong>"Baixar Offline"</strong> dentro de qualquer filme ou episódio de série para assistir no celular sem conexão.
          </p>
          <div className="flex items-center gap-3">
            <Link
              href="/movies"
              className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-xs transition"
            >
              Explorar Filmes
            </Link>
            <Link
              href="/series"
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 font-semibold text-xs border border-white/10 transition"
            >
              Explorar Séries
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {downloads.map((item) => (
            <div
              key={item.id}
              onClick={() => handlePlay(item)}
              className="group relative rounded-2xl bg-[#13141b] border border-white/10 hover:border-violet-500/40 p-3 transition-all duration-300 hover:shadow-xl hover:shadow-violet-600/10 flex flex-col cursor-pointer"
            >
              {/* Poster com Badge de Tipo */}
              <div className="relative aspect-video rounded-xl overflow-hidden bg-neutral-900 mb-3">
                <ImageWithFallback
                  src={item.poster_url || '/placeholder.jpg'}
                  alt={item.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-violet-600 text-white flex items-center justify-center shadow-lg shadow-violet-600/40 group-hover:scale-110 transition-transform">
                    <Play className="w-5 h-5 ml-0.5 fill-white" />
                  </div>
                </div>

                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-bold text-violet-300 flex items-center gap-1">
                  {item.stream_type === 'series' ? <Tv className="w-3 h-3" /> : <Film className="w-3 h-3" />}
                  <span>{item.stream_type === 'series' ? 'Série' : 'Filme'}</span>
                </div>
              </div>

              {/* Informações */}
              <div className="flex-1 flex flex-col justify-between">
                <div>
                  <h4 className="font-bold text-sm text-white line-clamp-1 group-hover:text-violet-300 transition-colors">
                    {item.title}
                  </h4>
                  {item.season_num !== undefined && item.episode_num !== undefined && (
                    <p className="text-xs text-neutral-400 mt-0.5">
                      Temporada {item.season_num} • Episódio {item.episode_num}
                    </p>
                  )}
                </div>

                {/* Rodapé com tamanho e botão de exclusão */}
                <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between text-xs text-neutral-400">
                  <span className="font-mono text-[11px] text-neutral-300">{formatSize(item.file_size)}</span>
                  <button
                    onClick={(e) => handleDelete(item.id, e)}
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-red-400 hover:bg-red-500/10 transition"
                    title="Excluir vídeo da memória"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
