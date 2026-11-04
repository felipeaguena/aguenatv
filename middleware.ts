import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim().length === 0) {
    if (process.env.NODE_ENV === 'production') {
      return new Uint8Array();
    }
    return new TextEncoder().encode('iptv-dev-only-secret-do-not-use-in-production-32chars');
  }
  return new TextEncoder().encode(secret);
}

// Extensões reais de arquivos estáticos públicos
const STATIC_EXTENSIONS = /\.(ico|png|jpg|jpeg|svg|css|js|webp|woff2?|map|webmanifest|txt)$/i;

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Arquivos estáticos (não se aplica a rotas de API)
  const isApiRoute = pathname.startsWith('/api/');
  const isStaticAsset =
    !isApiRoute &&
    (pathname.startsWith('/_next') ||
      pathname === '/favicon.ico' ||
      pathname.startsWith('/icon.') ||
      STATIC_EXTENSIONS.test(pathname));

  if (isStaticAsset) {
    return NextResponse.next();
  }

  // 2. Rotas públicas permitidas
  const isPublicAuth =
    pathname === '/login' ||
    pathname === '/api/auth/login' ||
    pathname === '/api/health';

  // 3. Extrai e valida o cookie de sessão com a chave JWT
  const sessionToken = req.cookies.get('session_token')?.value;
  let userPayload: any = null;

  if (sessionToken) {
    try {
      const secretKey = getSecretKey();
      if (secretKey.length > 0) {
        const { payload } = await jwtVerify(sessionToken, secretKey);
        userPayload = payload;
      }
    } catch {
      userPayload = null;
    }
  }

  // 4. Usuário NÃO autenticado
  if (!userPayload) {
    // Se estiver acessando a página de login pública, permite
    if (isPublicAuth) {
      return NextResponse.next();
    }

    // Se for rota de API interna, responde 401 não autorizado
    if (isApiRoute) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Para qualquer outra página privada, redireciona para /login
    const loginUrl = new URL('/login', req.url);
    return NextResponse.redirect(loginUrl);
  }

  // 5. Usuário JÁ autenticado tentando acessar /login
  if (isPublicAuth && pathname === '/login') {
    return NextResponse.redirect(new URL('/', req.url));
  }

  // 6. Proteção estrita de rotas administrativas (/admin/* e /api/admin/*)
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    if (userPayload.role !== 'admin') {
      if (isApiRoute) {
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
