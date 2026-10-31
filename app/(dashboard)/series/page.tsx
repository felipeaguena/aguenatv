'use client';
import { useState, useEffect, useMemo, Suspense } from 'react';
import { Video } from 'lucide-react';
import { localDB } from '@/lib/db-local';
import { BaseStreamItem } from '@/lib/types';
import MediaCard from '@/components/media/MediaCard';
import Pagination from '@/components/ui/Pagination';
import CategorySelector from '@/components/ui/CategorySelector';
import { useUrlPagination } from '@/hooks/useUrlPagination';

const PAGE_SIZE = 50;

function SeriesContent() {
  const [series, setSeries] = useState<BaseStreamItem[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

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
        setSeries(streams as unknown as BaseStreamItem[]);
        setCategories(cats.map((c) => ({ id: c.category_id, name: c.category_name })));
      } catch (e) {
        console.error('Erro ao carregar Séries:', e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const filteredSeries = useMemo(() => {
    return series.filter((s) => {
      const matchCat = selectedCat === 'all' || s.category_id === selectedCat;
      const matchSearch = (s.title || s.name || '').toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
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
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <Video className="w-6 h-6 text-violet-400" />
            Séries
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Temporadas organizadas por categoria com paginação de 50 séries.
          </p>
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
        <div className="p-16 rounded-3xl bg-[#13141b] border border-white/10 text-center text-xs text-neutral-400">
          Nenhum série encontrada nesta categoria.
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
