'use client';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { getWatchUrl } from '@/lib/routes';

function SeriesWatchQueryHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = searchParams.get('id');

  useEffect(() => {
    if (!id) {
      router.replace('/series');
    } else {
      const ep = searchParams.get('ep') || undefined;
      router.replace(getWatchUrl('series', id, ep));
    }
  }, [id, router, searchParams]);

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center gap-3">
      <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-xs text-neutral-400 font-medium">Redirecionando para reprodução...</p>
    </div>
  );
}

export default function SeriesWatchQueryPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[80vh] flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-neutral-400 font-medium">Carregando player...</p>
        </div>
      }
    >
      <SeriesWatchQueryHandler />
    </Suspense>
  );
}
