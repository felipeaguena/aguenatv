'use client';
import { use, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SeriesInfoRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  useEffect(() => {
    router.replace(`/series/${id}/info`);
  }, [id, router]);
  return null;
}
