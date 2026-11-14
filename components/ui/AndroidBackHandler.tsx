'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Capacitor } from '@capacitor/core';

/**
 * Gerenciador global do botão/gesto Voltar nativo do Android no APK Capacitor.
 * Permite que componentes (ex: player em fullscreen ou catálogo offline) interceptem
 * o evento via `aguenatv:android-back` (com `e.preventDefault()`), e caso contrário
 * executa a navegação padrão de retorno ou fecha o app na tela inicial.
 */
export default function AndroidBackHandler() {
  const pathname = usePathname();
  const router = useRouter();
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let removeListener: (() => void) | null = null;
    let isDisposed = false;

    import('@capacitor/app')
      .then(({ App }) => {
        if (isDisposed) return;
        App.addListener('backButton', ({ canGoBack }) => {
          const backEvent = new CustomEvent('aguenatv:android-back', { cancelable: true });
          window.dispatchEvent(backEvent);

          if (backEvent.defaultPrevented) {
            return;
          }

          const currentPath = pathnameRef.current || window.location.pathname;
          if (currentPath !== '/' && canGoBack && window.history.length > 1) {
            window.history.back();
            return;
          }

          if (currentPath !== '/') {
            router.replace('/');
            return;
          }

          App.exitApp().catch(() => {});
        })
          .then((handler) => {
            if (isDisposed) {
              handler.remove();
            } else {
              removeListener = () => handler.remove();
            }
          })
          .catch(() => {});
      })
      .catch(() => {});

    return () => {
      isDisposed = true;
      if (removeListener) removeListener();
    };
  }, [router]);

  return null;
}
