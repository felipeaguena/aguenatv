import { SignJWT, jwtVerify } from 'jose';
import { cookies, headers } from 'next/headers';
import { SessionUser, UserRole } from './types';

export function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim().length === 0) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[Security] A variável de ambiente JWT_SECRET é obrigatória em produção!');
    }
    // Fallback restrito apenas a ambiente local de desenvolvimento (localhost)
    return new TextEncoder().encode('iptv-dev-only-secret-do-not-use-in-production-32chars');
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(user: {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
}) {
  const secretKey = getSecretKey();
  const token = await new SignJWT({
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secretKey);

  const cookieStore = await cookies();
  let isHttps = false;
  try {
    const headersList = await headers();
    const proto = headersList.get('x-forwarded-proto');
    const referer = headersList.get('referer') || '';
    const origin = headersList.get('origin') || '';
    isHttps = proto === 'https' || referer.startsWith('https://') || origin.startsWith('https://');
  } catch {
    isHttps = false;
  }

  // Em conexões HTTP por IP (como http://163.176.207.140), navegadores e WebViews
  // rejeitam e descartam cookies com a flag 'Secure', bloqueando o login.
  const isSecure = isHttps && process.env.ALLOW_INSECURE_HTTP !== 'true';

  cookieStore.set('session_token', token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 dias
    path: '/',
  });

  return token;
}

export async function getSession(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('session_token')?.value;
    if (!token) return null;

    const secretKey = getSecretKey();
    const { payload } = await jwtVerify(token, secretKey);
    return {
      userId: payload.userId as string,
      username: payload.username as string,
      displayName: payload.displayName as string,
      role: payload.role as UserRole,
    };
  } catch {
    return null;
  }
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete('session_token');
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const secretKey = getSecretKey();
    const { payload } = await jwtVerify(token, secretKey);
    return {
      userId: payload.userId as string,
      username: payload.username as string,
      displayName: payload.displayName as string,
      role: payload.role as UserRole,
    };
  } catch {
    return null;
  }
}
