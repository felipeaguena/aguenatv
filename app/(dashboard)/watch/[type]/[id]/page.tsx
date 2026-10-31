'use client';
import { use, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getWatchUrl } from '@/lib/routes';

export default function LegacyWatchRedirect({
  params,
}: {
  params: Promise<{ type: string; id: string }>;
}) {
  const { type, id } = use(params);
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const ep = searchParams.get('ep') || undefined;
    router.replace(getWatchUrl(type, id, ep));
  }, [type, id, router, searchParams]);

  return null;
}
