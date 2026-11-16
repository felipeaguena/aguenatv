// AGUENATV Service Worker para Suporte Completo Offline e Modo Avião
const CACHE_NAME = 'aguenatv-v4';

// Recursos estáticos essenciais pré-cacheados (páginas HTML dinâmicas do Next.js são cacheadas em Network-First sob demanda)
const PRECACHE_URLS = [
  '/offline',
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

  // Não intercepta chamadas de API, origens externas, stream de vídeo, requisições com Range,
  // requisições internas RSC/Prefetch do Next.js App Router, ou vídeos locais do APK
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    url.searchParams.has('_rsc') ||
    request.headers.get('rsc') === '1' ||
    request.headers.has('next-router-prefetch') ||
    request.headers.has('next-router-state-tree') ||
    request.headers.has('next-url') ||
    request.headers.has('range') ||
    request.headers.has('Range') ||
    request.destination === 'video' ||
    request.destination === 'audio' ||
    url.protocol === 'chrome-extension:' ||
    url.pathname.includes('/_local_video_') ||
    url.pathname.includes('/_capacitor_file_') ||
    url.pathname.includes('/videos/offline_') ||
    url.pathname.endsWith('.mp4') ||
    url.pathname.endsWith('.mkv') ||
    url.pathname.endsWith('.webm') ||
    url.pathname.endsWith('.m3u8') ||
    url.pathname.endsWith('.ts') ||
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
          // Se estiver offline, retorna a página solicitada se ela estiver no cache
          const cachedResponse = await caches.match(request);
          if (cachedResponse) {
            return cachedResponse;
          }
          // NUNCA redireciona automaticamente para /offline durante a navegação
          return new Response('Sem conexão', { status: 503, statusText: 'Offline' });
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

  // 3. Demais requisições: tenta a rede, se falhar tenta o cache (nunca retorna undefined)
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
        const cached = await caches.match(request);
        return cached || Response.error();
      })
  );
});
