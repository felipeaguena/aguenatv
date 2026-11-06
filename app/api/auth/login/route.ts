import { NextRequest, NextResponse } from 'next/server';
import { turso, isTursoConfigured, ensureTursoSchema } from '@/lib/turso';
import { verifyPassword } from '@/lib/password';
import { createSession } from '@/lib/auth';
import { checkIpBlock, registerFailedAttempt, clearIpAttempts, MAX_ATTEMPTS } from '@/lib/rate-limit';
import { UserRole } from '@/lib/types';
import {
  findLocalUserByUsername,
  getLocalUsers,
} from '@/lib/users-local';

// Hash bcrypt fictício para garantir tempo de execução constante contra timing attacks (evita enumeração de usuários)
const DUMMY_BCRYPT_HASH = '$2b$10$e8O0WjL9p2fL3aE0z5K9OuHnU0s2k7qV7k4Q9s9w8e7r6t5y4u3i2';

function sanitizeIp(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  // Remove eventual encapsulamento de porta [ip]:port ou ip:port
  const clean = trimmed.replace(/^\[?([a-fA-F0-9:.]+)\]?(:\d+)?$/, '$1');
  const isIpv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(clean);
  const isIpv6 = /^[a-fA-F0-9:]+$/.test(clean);
  if (isIpv4 || isIpv6) {
    return clean;
  }
  return null;
}

function getClientIp(req: NextRequest): string {
  // 1. Tenta cabeçalho confiável de proxy reverso (Nginx, Caddy, Vercel)
  const realIp = sanitizeIp(req.headers.get('x-real-ip'));
  if (realIp) return realIp;

  const vercelIp = sanitizeIp(req.headers.get('x-vercel-forwarded-for')?.split(',')[0] || null);
  if (vercelIp) return vercelIp;

  const forwardedFor = sanitizeIp(req.headers.get('x-forwarded-for')?.split(',')[0] || null);
  if (forwardedFor) return forwardedFor;

  return '127.0.0.1';
}

export async function POST(req: NextRequest) {
  try {
    // 1. Extração segura e sanitizada do IP do cliente
    const clientIp = getClientIp(req);

    // 2. Proteção Anti-Brute-Force & Bloqueio Progressivo de IP
    const ipStatus = await checkIpBlock(clientIp);
    if (ipStatus.blocked) {
      return NextResponse.json(
        {
          error: `Acesso bloqueado por segurança devido a tentativas incorretas consecutivas. Tente novamente em ${ipStatus.remainingMinutes} minutos.`,
          isBlocked: true,
          remainingMinutes: ipStatus.remainingMinutes,
          attempts: ipStatus.attempts,
        },
        { status: 429 }
      );
    }

    // 3. Validação dos dados do formulário
    const body = await req.json();
    const { username, password, extra_security_token, bot_check } = body;

    // 4. Proteção Anti-Bot (Honeypot): se o campo invisível foi preenchido por um bot
    if (extra_security_token || bot_check) {
      // Registra punição instantânea para o IP bot
      await registerFailedAttempt(clientIp);
      return NextResponse.json(
        { error: 'Acesso rejeitado pelo mecanismo de segurança anti-bot.' },
        { status: 400 }
      );
    }

    if (!username || !password) {
      return NextResponse.json({ error: 'Preencha usuário e senha' }, { status: 400 });
    }

    const cleanUsername = String(username).toLowerCase().trim();
    let userRecord: any = null;

    // 5. Busca no Turso se configurado
    if (isTursoConfigured()) {
      try {
        await ensureTursoSchema();
        const res = await turso.execute({
          sql: 'SELECT * FROM app_users WHERE username = ? LIMIT 1',
          args: [cleanUsername],
        });

        if (res.rows.length > 0) {
          const row: any = res.rows[0];
          userRecord = {
            id: String(row.id),
            username: String(row.username),
            password_hash: String(row.password_hash),
            display_name: String(row.display_name),
            role: row.role as UserRole,
            is_active: Boolean(row.is_active),
            created_at: row.created_at,
            updated_at: row.updated_at,
          };
        }
      } catch (err) {
        console.warn('Erro ao consultar Turso, utilizando persistência local:', err);
      }
    }

    // 6. Fallback para persistência local em disco (data/local-users.json)
    if (!userRecord) {
      const localUser = await findLocalUserByUsername(cleanUsername);
      if (localUser) {
        userRecord = localUser;
      } else {
        const localList = await getLocalUsers();
        const found = localList.find((u) => u.username.toLowerCase().trim() === cleanUsername);
        if (found) {
          userRecord = found;
        }
      }
    }

    // 7. Verificação estrita e segura da senha com proteção contra Timing Attacks
    let isValidPassword = false;
    if (userRecord && userRecord.is_active && userRecord.password_hash) {
      isValidPassword = await verifyPassword(String(password), userRecord.password_hash);
    } else {
      // Usuário inexistente: executa verificação de hash simulada para manter tempo de resposta uniforme
      await verifyPassword(String(password), DUMMY_BCRYPT_HASH);
    }

    // Se credenciais incorretas -> registra tentativa falha com escalonamento progressivo
    if (!isValidPassword) {
      const { blockedNow, remainingMinutes, attempts, durationMinutes } = await registerFailedAttempt(clientIp);

      if (blockedNow) {
        return NextResponse.json(
          {
            error: `Você atingiu ${attempts} tentativas incorretas. Por segurança, seu IP foi bloqueado por ${durationMinutes} minutos.`,
            isBlocked: true,
            remainingMinutes: remainingMinutes || durationMinutes,
            attempts,
          },
          { status: 429 }
        );
      }

      const remainingBeforeLockout = Math.max(1, MAX_ATTEMPTS - attempts);
      return NextResponse.json(
        {
          error: `Usuário ou senha incorretos. Você possui mais ${remainingBeforeLockout} tentativa(s) antes do bloqueio de segurança.`,
          attempts,
          remainingAttempts: remainingBeforeLockout,
        },
        { status: 401 }
      );
    }

    // 8. Login bem-sucedido -> limpa tentativas do IP
    await clearIpAttempts(clientIp);

    // 9. Criação da sessão em Cookie Seguro HTTP-Only
    await createSession({
      id: userRecord.id,
      username: userRecord.username,
      displayName: userRecord.display_name || userRecord.username,
      role: userRecord.role as UserRole,
    });

    return NextResponse.json({
      success: true,
      user: {
        id: userRecord.id,
        username: userRecord.username,
        displayName: userRecord.display_name,
        role: userRecord.role,
      },
    });
  } catch (error) {
    console.error('Erro na API de Login:', error);
    return NextResponse.json({ error: 'Erro interno ao processar login' }, { status: 500 });
  }
}
