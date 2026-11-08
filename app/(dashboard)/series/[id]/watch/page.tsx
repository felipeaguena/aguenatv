'use client';
import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import WatchView from '@/components/watch/WatchView';

export default function SeriesWatchPage() {
  const params = useParams();
  const id = (params?.id as string) || '';

  return (
    <Suspense
      fallback={
        <div className="min-h-[80vh] flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-neutral-400 font-medium">Carregando player da série...</p>
        </div>
      }
    >
      <WatchView type="series" id={id} />
    </Suspense>
  );
}
