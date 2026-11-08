'use client';
import { useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { getWatchUrl } from '@/lib/routes';

export default function LegacyWatchRedirect() {
  const params = useParams();
  const type = (params?.type as string) || '';
  const id = (params?.id as string) || '';
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (type && id) {
      const ep = searchParams.get('ep') || undefined;
      router.replace(getWatchUrl(type, id, ep));
    }
  }, [type, id, router, searchParams]);

  return null;
}
