import { NextResponse } from 'next/server';
import { clearSession } from '@/lib/auth';

export async function POST() {
  await clearSession();
  return NextResponse.json({ success: true, message: 'Sessão encerrada com sucesso' });
}
