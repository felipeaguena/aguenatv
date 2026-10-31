'use client';
import { use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getInfoUrl } from '@/lib/routes';

export default function LegacyInfoRedirect({
  params,
}: {
  params: Promise<{ type: string; id: string }>;
}) {
  const { type, id } = use(params);
  const router = useRouter();

  useEffect(() => {
    router.replace(getInfoUrl(type, id));
  }, [type, id, router]);

  return null;
}
