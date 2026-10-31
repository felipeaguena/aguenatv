'use client';
import { use, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function MovieInfoRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  useEffect(() => {
    router.replace(`/movies/${id}/info`);
  }, [id, router]);
  return null;
}
