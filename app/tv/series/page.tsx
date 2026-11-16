import { Suspense } from 'react';
import TvCategoryCatalog from '@/components/tv/TvCategoryCatalog';

export default function TvSeriesPage() {
  return (
    <Suspense
      fallback={
        <div className="py-24 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <TvCategoryCatalog
        streamType="series"
        title="Séries & Animes"
        subtitle="Temporadas organizadas por gênero e novidades"
      />
    </Suspense>
  );
}
