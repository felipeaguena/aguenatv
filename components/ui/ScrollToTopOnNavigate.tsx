'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Componente global de navegação:
 * Garante que sempre que a rota (pathname) mudar, a tela seja
 * posicionada imediatamente no topo (top: 0), evitando que o Next.js
 * retenha posições de rolagem da página anterior.
 */
export default function ScrollToTopOnNavigate() {
  const pathname = usePathname();
  const prevPathnameRef = useRef(pathname);

  useEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname;
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        if (document.documentElement) {
          document.documentElement.scrollTop = 0;
        }
        if (document.body) {
          document.body.scrollTop = 0;
        }
      }
    }
  }, [pathname]);

  return null;
}
