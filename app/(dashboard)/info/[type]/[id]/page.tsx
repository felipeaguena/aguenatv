'use client';
import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getInfoUrl } from '@/lib/routes';

export default function LegacyInfoRedirect() {
  const params = useParams();
  const type = (params?.type as string) || '';
  const id = (params?.id as string) || '';
  const router = useRouter();

  useEffect(() => {
    if (type && id) {
      router.replace(getInfoUrl(type, id));
    }
  }, [type, id, router]);

  return null;
}
