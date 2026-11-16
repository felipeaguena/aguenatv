import { Suspense } from 'react';
import TvCategoryCatalog from '@/components/tv/TvCategoryCatalog';

export default function TvLivePage() {
  return (
    <Suspense
      fallback={
        <div className="py-24 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <TvCategoryCatalog
        streamType="live"
        title="TV Ao Vivo"
        subtitle="Guia rápido por categorias com preview instantâneo"
      />
    </Suspense>
  );
}
