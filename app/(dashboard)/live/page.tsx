'use client';
import { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { Tv, RotateCw, ArrowLeft } from 'lucide-react';
import { localDB } from '@/lib/db-local';
import { BaseStreamItem } from '@/lib/types';
import MediaCard from '@/components/media/MediaCard';
import Pagination from '@/components/ui/Pagination';
import CategorySelector from '@/components/ui/CategorySelector';
import SyncModal from '@/components/ui/SyncModal';
import { useUrlPagination } from '@/hooks/useUrlPagination';

const PAGE_SIZE = 50;

function LiveTVContent() {
  const [channels, setChannels] = useState<BaseStreamItem[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);

  const {
    selectedCat,
    currentPage,
    search,
    setCategory: setSelectedCat,
    setPage: setCurrentPage,
    setSearch,
  } = useUrlPagination();

  useEffect(() => {
    async function loadData() {
      if (!localDB) return;
      try {
        const [streams, cats] = await Promise.all([
          localDB.streams.where('stream_type').equals('live').toArray(),
          localDB.categories.where('type').equals('live').toArray(),
        ]);
        setChannels(streams as unknown as BaseStreamItem[]);
        setCategories(cats.map((c) => ({ id: c.category_id, name: c.category_name })));
      } catch (e) {
        console.error('Erro ao carregar TV ao Vivo:', e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const filteredChannels = useMemo(() => {
    return channels.filter((ch) => {
      const matchCat = selectedCat === 'all' || ch.category_id === selectedCat;
      const matchSearch = (ch.title || ch.name || '').toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [channels, selectedCat, search]);

  // Paginação de 50 itens
  const paginatedChannels = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredChannels.slice(start, start + PAGE_SIZE);
  }, [filteredChannels, currentPage]);

  const currentCategoryTitle =
    selectedCat === 'all'
      ? 'Todos os Canais'
      : categories.find((c) => c.id === selectedCat)?.name || 'Categoria';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 sm:p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white border border-white/10 transition cursor-pointer flex items-center gap-1.5 text-xs font-semibold shrink-0"
            title="Voltar ao início"
          >
            <ArrowLeft className="w-4 h-4 text-violet-400" />
          </Link>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
              <Tv className="w-6 h-6 text-violet-400" />
              Canais de TV ao Vivo
            </h1>
            <p className="text-xs text-neutral-400 mt-1">
              Transmissões organizadas por categoria com paginação de 50 canais por vez.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-xl bg-violet-600/20 text-violet-300 border border-violet-500/30 text-xs font-bold shadow-md shadow-violet-600/20">
            {channels.length} canais no catálogo
          </span>
        </div>
      </div>

      {/* Seletor com Duas Buscas: Título/Canal (ao digitar) e Categoria (dropdown com digitação) */}
      <div className="relative z-30">
        <CategorySelector
          categories={categories}
          selectedCat={selectedCat}
          onSelectCat={setSelectedCat}
          totalCount={channels.length}
          titleSearch={search}
          onTitleSearchChange={setSearch}
          titlePlaceholder="Buscar canal por nome/título..."
        />
      </div>

      {/* Título da Categoria Atual em Destaque */}
      <div className="flex items-center justify-between pt-2">
        <h2 className="text-base font-extrabold text-white flex items-center gap-2">
          <span>{currentCategoryTitle}</span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-600/20 text-violet-300 border border-violet-500/30">
            {filteredChannels.length} canais
          </span>
        </h2>
      </div>

      {/* Grid de Canais Widescreen 16:9 com Luz Ambiente */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5 sm:gap-4 lg:gap-5">
          {Array.from({ length: 15 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col rounded-2xl overflow-hidden bg-[#13141b] border border-white/5 animate-pulse"
            >
              <div className="aspect-video w-full bg-white/5" />
              <div className="p-3 space-y-2">
                <div className="h-3 bg-white/10 rounded w-3/4" />
                <div className="h-2.5 bg-white/5 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : paginatedChannels.length === 0 ? (
        <div className="p-16 rounded-3xl bg-[#13141b] border border-white/10 text-center text-xs text-neutral-400 space-y-4 shadow-xl">
          <p>{channels.length === 0 ? 'Nenhum canal sincronizado no dispositivo.' : 'Nenhum canal encontrado nesta categoria ou filtro.'}</p>
          {channels.length === 0 && (
            <div>
              <button
                onClick={() => setIsSyncModalOpen(true)}
                className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold transition shadow-lg shadow-violet-600/30 cursor-pointer inline-flex items-center gap-2"
              >
                <RotateCw className="w-4 h-4" />
                Sincronizar Canais Agora
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5 sm:gap-4 lg:gap-5">
            {paginatedChannels.map((ch) => (
              <MediaCard key={`ch_${ch.id}`} item={ch} />
            ))}
          </div>

          <Pagination
            currentPage={currentPage}
            totalItems={filteredChannels.length}
            pageSize={PAGE_SIZE}
            onPageChange={setCurrentPage}
          />
        </>
      )}

      <SyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        onSyncComplete={() => {
          setIsSyncModalOpen(false);
          window.location.reload();
        }}
      />
    </div>
  );
}

export default function LiveTVPage() {
  return (
    <Suspense
      fallback={
        <div className="p-20 text-center text-xs text-neutral-400">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      }
    >
      <LiveTVContent />
    </Suspense>
  );
}
