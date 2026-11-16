'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import TvWatchView from '@/components/tv/TvWatchView';

export default function TvWatchPage() {
  const params = useParams();
  const type = (params?.type as string) || 'movie';
  const id = (params?.id as string) || '';

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black flex items-center justify-center">
          <div className="w-10 h-10 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <TvWatchView type={type} id={id} />
    </Suspense>
  );
}
