'use client';
import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function LiveWatchRedirect() {
  const params = useParams();
  const id = (params?.id as string) || '';
  const router = useRouter();

  useEffect(() => {
    if (id) {
      router.replace(`/live/${id}/watch`);
    }
  }, [id, router]);

  return null;
}
