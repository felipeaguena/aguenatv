'use client';
import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function MovieInfoRedirect() {
  const params = useParams();
  const id = (params?.id as string) || '';
  const router = useRouter();

  useEffect(() => {
    if (id) {
      router.replace(`/movies/${id}/info`);
    }
  }, [id, router]);

  return null;
}
