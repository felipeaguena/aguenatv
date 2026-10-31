'use client';
import { useState, useEffect, useMemo, Suspense } from 'react';
import { Film } from 'lucide-react';
import { localDB } from '@/lib/db-local';
import { BaseStreamItem } from '@/lib/types';
import MediaCard from '@/components/media/MediaCard';
import Pagination from '@/components/ui/Pagination';
import CategorySelector from '@/components/ui/CategorySelector';
import { useUrlPagination } from '@/hooks/useUrlPagination';

const PAGE_SIZE = 50;

function MoviesContent() {
  const [movies, setMovies] = useState<BaseStreamItem[]>([]);
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
          localDB.streams.where('stream_type').equals('movie').toArray(),
          localDB.categories.where('type').equals('movie').toArray(),
        ]);
        setMovies(streams as unknown as BaseStreamItem[]);
        setCategories(cats.map((c) => ({ id: c.category_id, name: c.category_name })));
      } catch (e) {
        console.error('Erro ao carregar Filmes:', e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const filteredMovies = useMemo(() => {
    return movies.filter((m) => {
      const matchCat = selectedCat === 'all' || m.category_id === selectedCat;
      const matchSearch = (m.title || m.name || '').toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [movies, selectedCat, search]);

  const paginatedMovies = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredMovies.slice(start, start + PAGE_SIZE);
  }, [filteredMovies, currentPage]);

  const currentCategoryTitle =
    selectedCat === 'all'
      ? 'Todos os Gêneros'
      : categories.find((c) => c.id === selectedCat)?.name || 'Categoria';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-6">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <Film className="w-6 h-6 text-violet-400" />
            Filmes (VOD)
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Catálogo completo organizado por gênero com paginação de 50 títulos.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-xl bg-violet-600/20 text-violet-300 border border-violet-500/30 text-xs font-bold shadow-md shadow-violet-600/20">
            {movies.length} filmes no catálogo
          </span>
        </div>
      </div>

      {/* Seletor com Duas Buscas: Título (ao digitar) e Categoria (dropdown com digitação) */}
      <div className="relative z-30">
        <CategorySelector
          categories={categories}
          selectedCat={selectedCat}
          onSelectCat={setSelectedCat}
          totalCount={movies.length}
          titleSearch={search}
          onTitleSearchChange={setSearch}
          titlePlaceholder="Buscar filme por título..."
        />
      </div>

      {/* Título da Categoria em Destaque */}
      <div className="flex items-center justify-between pt-2">
        <h2 className="text-base font-extrabold text-white flex items-center gap-2">
          <span>{currentCategoryTitle}</span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-600/20 text-violet-300 border border-violet-500/30">
            {filteredMovies.length} títulos
          </span>
        </h2>
      </div>

      {/* Grid de Filmes */}
      {loading ? (
        <div className="p-20 text-center text-xs text-neutral-400 space-y-2">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p>Carregando filmes...</p>
        </div>
      ) : paginatedMovies.length === 0 ? (
        <div className="p-16 rounded-3xl bg-[#13141b] border border-white/10 text-center text-xs text-neutral-400">
          Nenhum filme encontrado nesta categoria.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-5">
            {paginatedMovies.map((movie) => (
              <MediaCard key={`movie_${movie.id}`} item={movie} />
            ))}
          </div>

          <Pagination
            currentPage={currentPage}
            totalItems={filteredMovies.length}
            pageSize={PAGE_SIZE}
            onPageChange={setCurrentPage}
          />
        </>
      )}
    </div>
  );
}

export default function MoviesPage() {
  return (
    <Suspense
      fallback={
        <div className="p-20 text-center text-xs text-neutral-400">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      }
    >
      <MoviesContent />
    </Suspense>
  );
}
