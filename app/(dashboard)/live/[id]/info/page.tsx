'use client';
import { use, Suspense } from 'react';
import InfoView from '@/components/info/InfoView';

export default function LiveInfoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <Suspense
      fallback={
        <div className="min-h-[70vh] flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-neutral-400 font-medium">Carregando detalhes do canal...</p>
        </div>
      }
    >
      <InfoView type="live" id={id} />
    </Suspense>
  );
}
