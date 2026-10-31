import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET || 'iptv-miruro-secure-jwt-secret-key-32chars!';
const SECRET_KEY = new TextEncoder().encode(JWT_SECRET);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Rotas públicas permitidas
  const isPublicAuth = pathname === '/login' || pathname === '/api/auth/login';
  const isStaticAsset =
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.includes('.');

  if (isStaticAsset) {
    return NextResponse.next();
  }

  // 2. Extrai cookie de sessão
  const sessionToken = req.cookies.get('session_token')?.value;
  let userPayload: any = null;

  if (sessionToken) {
    try {
      const { payload } = await jwtVerify(sessionToken, SECRET_KEY);
      userPayload = payload;
    } catch {
      userPayload = null;
    }
  }

  // 3. Usuário NÃO autenticado
  if (!userPayload) {
    // Se estiver acessando a página de login pública, permite
    if (isPublicAuth) {
      return NextResponse.next();
    }

    // Se for rota de API interna, oculta respondendo 401
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Recurso restrito' }, { status: 401 });
    }

    // Para todas as outras páginas, esconde tudo e joga para /login
    const loginUrl = new URL('/login', req.url);
    return NextResponse.redirect(loginUrl);
  }

  // 4. Usuário JÁ autenticado tentando acessar /login
  if (isPublicAuth && pathname === '/login') {
    return NextResponse.redirect(new URL('/', req.url));
  }

  // 5. Proteção de rotas administrativas (/admin/*)
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    if (userPayload.role !== 'admin') {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Acesso restrito ao administrador' }, { status: 403 });
      }
      return NextResponse.redirect(new URL('/', req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
