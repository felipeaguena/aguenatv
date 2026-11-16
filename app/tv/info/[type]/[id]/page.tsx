'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import TvInfoView from '@/components/tv/TvInfoView';

export default function TvInfoPage() {
  const params = useParams();
  const type = (params?.type as string) || 'movie';
  const id = (params?.id as string) || '';

  return (
    <Suspense
      fallback={
        <div className="min-h-[70vh] flex items-center justify-center">
          <div className="w-9 h-9 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <TvInfoView type={type} id={id} />
    </Suspense>
  );
}
