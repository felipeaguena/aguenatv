'use client';
import { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { Video, RotateCw, ArrowLeft } from 'lucide-react';
import { localDB } from '@/lib/db-local';
import { BaseStreamItem } from '@/lib/types';
import { getSortScore, isRecentlyAdded, parseAddedTimestamp } from '@/lib/stream-utils';
import MediaCard from '@/components/media/MediaCard';
import Pagination from '@/components/ui/Pagination';
import CategorySelector from '@/components/ui/CategorySelector';
import SyncModal from '@/components/ui/SyncModal';
import { useUrlPagination } from '@/hooks/useUrlPagination';

const PAGE_SIZE = 50;

function SeriesContent() {
  const [series, setSeries] = useState<BaseStreamItem[]>([]);
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
          localDB.streams.where('stream_type').equals('series').toArray(),
          localDB.categories.where('type').equals('series').toArray(),
        ]);
        const seriesItems = streams as unknown as BaseStreamItem[];
        const catScores = new Map<string, number>();
        seriesItems.forEach((s) => {
          const cId = String(s.category_id || 'all');
          const score = getSortScore(s);
          const currentMax = catScores.get(cId) || 0;
          if (score > currentMax) {
            catScores.set(cId, score);
          }
        });

        const sortedCats = cats
          .map((c) => ({ id: c.category_id, name: c.category_name }))
          .sort((a, b) => {
            const scoreA = catScores.get(a.id) || 0;
            const scoreB = catScores.get(b.id) || 0;
            if (scoreB !== scoreA) return scoreB - scoreA;
            return a.name.localeCompare(b.name, 'pt-BR');
          });

        setSeries(seriesItems);
        setCategories(sortedCats);
      } catch (e) {
        console.error('Erro ao carregar Séries:', e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const filteredSeries = useMemo(() => {
    const sorted = series
      .filter((s) => {
        const matchCat = selectedCat === 'all' || s.category_id === selectedCat;
        const matchSearch = (s.title || s.name || '').toLowerCase().includes(search.toLowerCase());
        return matchCat && matchSearch;
      })
      .sort((a, b) => getSortScore(b) - getSortScore(a));

    const newestTs = sorted.length > 0 ? parseAddedTimestamp(sorted[0].added) : null;

    return sorted.map((s, idx) => {
      let isNew = isRecentlyAdded(s);

      if (!isNew && newestTs) {
        const itemTs = parseAddedTimestamp(s.added);
        if (itemTs) {
          const diffFromNewestDays = (newestTs - itemTs) / (1000 * 60 * 60 * 24);
          const nowDiffDays = (Date.now() - newestTs) / (1000 * 60 * 60 * 24);
          if (nowDiffDays <= 45 && diffFromNewestDays <= 14 && idx < 12) {
            isNew = true;
          }
        }
      }

      return isNew ? { ...s, isNew: true } : s;
    });
  }, [series, selectedCat, search]);

  const paginatedSeries = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredSeries.slice(start, start + PAGE_SIZE);
  }, [filteredSeries, currentPage]);

  const currentCategoryTitle =
    selectedCat === 'all'
      ? 'Todas as Séries'
      : categories.find((c) => c.id === selectedCat)?.name || 'Categoria';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
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
              <Video className="w-6 h-6 text-violet-400" />
              Séries
            </h1>
            <p className="text-xs text-neutral-400 mt-1">
              Temporadas organizadas por categoria com paginação de 50 séries.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-xl bg-violet-600/20 text-violet-300 border border-violet-500/30 text-xs font-bold shadow-md shadow-violet-600/20">
            {series.length} séries no catálogo
          </span>
        </div>
      </div>

      {/* Seletor com Duas Buscas: Título (ao digitar) e Categoria (dropdown com digitação) */}
      <div className="relative z-30">
        <CategorySelector
          categories={categories}
          selectedCat={selectedCat}
          onSelectCat={setSelectedCat}
          totalCount={series.length}
          titleSearch={search}
          onTitleSearchChange={setSearch}
          titlePlaceholder="Buscar série por título..."
        />
      </div>

      {/* Título da Categoria em Destaque */}
      <div className="flex items-center justify-between pt-2">
        <h2 className="text-base font-extrabold text-white flex items-center gap-2">
          <span>{currentCategoryTitle}</span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-600/20 text-violet-300 border border-violet-500/30">
            {filteredSeries.length} títulos
          </span>
        </h2>
      </div>

      {/* Grid de Séries */}
      {loading ? (
        <div className="p-20 text-center text-xs text-neutral-400 space-y-2">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p>Carregando séries...</p>
        </div>
      ) : paginatedSeries.length === 0 ? (
        <div className="p-16 rounded-3xl bg-[#13141b] border border-white/10 text-center text-xs text-neutral-400 space-y-4 shadow-xl">
          <p>{series.length === 0 ? 'Nenhuma série sincronizada no dispositivo.' : 'Nenhuma série encontrada nesta categoria ou busca.'}</p>
          {series.length === 0 && (
            <div>
              <button
                onClick={() => setIsSyncModalOpen(true)}
                className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold transition shadow-lg shadow-violet-600/30 cursor-pointer inline-flex items-center gap-2"
              >
                <RotateCw className="w-4 h-4" />
                Sincronizar Séries Agora
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-5">
            {paginatedSeries.map((s) => (
              <MediaCard key={`series_${s.id}`} item={s} />
            ))}
          </div>

          <Pagination
            currentPage={currentPage}
            totalItems={filteredSeries.length}
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

export default function SeriesPage() {
  return (
    <Suspense
      fallback={
        <div className="p-20 text-center text-xs text-neutral-400">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      }
    >
      <SeriesContent />
    </Suspense>
  );
}
