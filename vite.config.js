import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Writes sw.js with the list of every built file so the whole app works offline after the first visit.
function offlineWorker() {
  return {
    name: 'offline-worker',
    apply: 'build',
    generateBundle(options, bundle) {
      const files = ['./', 'manifest.webmanifest', 'bg.jpg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'].concat(Object.keys(bundle));
      const version = 'ranking-' + Date.now();
      const code = `const CACHE = ${JSON.stringify(version)};
const FILES = ${JSON.stringify(files)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // Gemini calls go straight to the network
  e.respondWith(caches.match(e.request, { ignoreSearch: true, ignoreVary: true }).then((hit) => hit || fetch(e.request).catch(() => (e.request.mode === 'navigate' ? caches.match('./') : Response.error()))));
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: code });
    }
  };
}

export default defineConfig({
  plugins: [react(), offlineWorker()],
  base: './',
  build: { commonjsOptions: { include: [/electron\/ai\.cjs/, /node_modules/], transformMixedEsModules: true } }
});
