import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { SessionUser, UserRole } from './types';

const JWT_SECRET = process.env.JWT_SECRET || 'iptv-miruro-secure-jwt-secret-key-32chars!';
const SECRET_KEY = new TextEncoder().encode(JWT_SECRET);

export async function createSession(user: {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
}) {
  const token = await new SignJWT({
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(SECRET_KEY);

  const cookieStore = await cookies();
  cookieStore.set('session_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
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

    const { payload } = await jwtVerify(token, SECRET_KEY);
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
    const { payload } = await jwtVerify(token, SECRET_KEY);
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
