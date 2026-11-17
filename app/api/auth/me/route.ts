import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { NO_STORE_HEADERS } from '@/lib/json-store';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401, headers: NO_STORE_HEADERS });
  }

  return NextResponse.json({ user: session }, { headers: NO_STORE_HEADERS });
}
