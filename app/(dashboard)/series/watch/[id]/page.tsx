'use client';
import { useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';

export default function SeriesWatchRedirect() {
  const params = useParams();
  const id = (params?.id as string) || '';
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (id) {
      const q = searchParams.toString();
      router.replace(`/series/${id}/watch${q ? `?${q}` : ''}`);
    }
  }, [id, router, searchParams]);

  return null;
}
