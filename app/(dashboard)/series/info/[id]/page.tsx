'use client';
import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function SeriesInfoRedirect() {
  const params = useParams();
  const id = (params?.id as string) || '';
  const router = useRouter();

  useEffect(() => {
    if (id) {
      router.replace(`/series/${id}/info`);
    }
  }, [id, router]);

  return null;
}
