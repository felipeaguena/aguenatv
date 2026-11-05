'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((registration) => {
            console.log('[AGUENATV] Service Worker registrado para suporte offline:', registration.scope);
          })
          .catch((error) => {
            console.warn('[AGUENATV] Erro ao registrar Service Worker:', error);
          });
      });
    }
  }, []);

  return null;
}
