'use client';
import { use, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function MoviesWatchRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    const q = searchParams.toString();
    router.replace(`/movies/${id}/watch${q ? `?${q}` : ''}`);
  }, [id, router, searchParams]);
  return null;
}
