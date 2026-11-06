import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getBlockedIps, unblockIp, unblockAllIps } from '@/lib/rate-limit';

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado: apenas administradores' }, { status: 403 });
  }

  try {
    const ips = await getBlockedIps();
    return NextResponse.json({ success: true, ips });
  } catch (error) {
    console.error('Erro ao listar IPs bloqueados:', error);
    return NextResponse.json({ error: 'Erro ao listar IPs bloqueados' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado: apenas administradores' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { ip, action } = body;

    if (action === 'unblock_all') {
      await unblockAllIps();
      return NextResponse.json({
        success: true,
        message: 'Todas as punições e bloqueios de IP foram removidos com sucesso.',
      });
    }

    if (!ip || typeof ip !== 'string' || ip.trim().length === 0) {
      return NextResponse.json({ error: 'Endereço IP inválido ou não informado' }, { status: 400 });
    }

    const cleanIp = ip.trim();
    await unblockIp(cleanIp);

    return NextResponse.json({
      success: true,
      message: `Punição do IP ${cleanIp} removida com sucesso. O login foi liberado.`,
    });
  } catch (error) {
    console.error('Erro ao desbloquear IP:', error);
    return NextResponse.json({ error: 'Falha ao processar desbloqueio de IP' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado: apenas administradores' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const ip = searchParams.get('ip');
    const all = searchParams.get('all') === 'true';

    if (all) {
      await unblockAllIps();
      return NextResponse.json({
        success: true,
        message: 'Todas as punições e bloqueios de IP foram removidos com sucesso.',
      });
    }

    if (!ip) {
      return NextResponse.json({ error: 'IP não informado' }, { status: 400 });
    }

    await unblockIp(ip.trim());
    return NextResponse.json({
      success: true,
      message: `Punição do IP ${ip.trim()} removida com sucesso.`,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Falha ao remover punição' }, { status: 500 });
  }
}
