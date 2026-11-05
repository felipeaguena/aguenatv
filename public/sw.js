// AGUENATV Service Worker para Suporte Completo Offline e Modo Avião
const CACHE_NAME = 'aguenatv-v1';

// Recursos críticos pré-cacheados para navegação sem internet
const PRECACHE_URLS = [
  '/',
  '/offline',
  '/favorites',
  '/movies',
  '/series',
  '/icon.svg',
  '/placeholder.svg'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn('[SW] Pré-cache parcial:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Remove caches antigos se a versão mudar
      caches.keys().then((keys) => {
        return Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        );
      })
    ])
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Não intercepta chamadas de stream de vídeo de terceiros ou localhost Capacitor
  if (
    request.method !== 'GET' ||
    url.protocol === 'chrome-extension:' ||
    url.pathname.includes('/_capacitor_file_') ||
    url.pathname.startsWith('/movie/') ||
    url.pathname.startsWith('/series/') ||
    url.pathname.startsWith('/live/')
  ) {
    return;
  }

  // 1. Requisições de navegação (páginas HTML)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          // Se estiver offline ou em Modo Avião, busca a página correspondente no cache
          const cachedResponse = await caches.match(request);
          if (cachedResponse) {
            return cachedResponse;
          }
          // Fallback para a página de offline ou home cacheada
          const offlineFallback = await caches.match('/offline');
          if (offlineFallback) return offlineFallback;
          const homeFallback = await caches.match('/');
          if (homeFallback) return homeFallback;

          return new Response(
            '<html><body><h2>Modo Offline Ativo</h2><p>Conecte-se para atualizar ou acesse seus conteúdos baixados.</p></body></html>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        })
    );
    return;
  }

  // 2. Chunks estáticos do Next.js (_next/static/...) e assets públicos
  if (url.pathname.startsWith('/_next/static/') || url.pathname.endsWith('.svg') || url.pathname.endsWith('.png') || url.pathname.endsWith('.ico')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          // Atualiza em background (Stale-While-Revalidate)
          fetch(request)
            .then((fresh) => {
              if (fresh && fresh.status === 200) {
                caches.open(CACHE_NAME).then((cache) => cache.put(request, fresh));
              }
            })
            .catch(() => {});
          return cached;
        }

        return fetch(request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // 3. Demais requisições: tenta a rede, se falhar tenta o cache
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
