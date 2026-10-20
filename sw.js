/* ==========================================================================
   sw.js — Service Worker do PWA "Venda de Bebidas"
   Versão de demonstração: cacheia o app inteiro (HTML/CSS/JS/ícones) para
   abrir offline depois da primeira visita. Os dados não passam por aqui —
   ficam no localStorage do navegador (ver js/demo-api.js).
   ========================================================================== */

const CACHE_VERSION = 'balcao-demo-v1';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/auth.js',
  './js/calculadora.js',
  './js/clientes.js',
  './js/combos.js',
  './js/contas.js',
  './js/dashboard.js',
  './js/db.js',
  './js/demo-api.js',
  './js/encomendas.js',
  './js/estoque.js',
  './js/fornecedores.js',
  './js/fiado.js',
  './js/perfil.js',
  './js/qr.js',
  './js/pix.js',
  './js/scanner.js',
  './js/turno.js',
  './js/equipe.js',
  './js/importar.js',
  './js/analise.js',
  './js/pdv.js',
  './js/produtos.js',
  './js/realtime.js',
  './js/relatorios.js',
  './js/seed.js',
  './js/utils.js',
  './js/vendas.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((chaves) =>
      Promise.all(chaves.filter((c) => c !== CACHE_VERSION).map((c) => caches.delete(c)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // API e WebSocket: sempre rede, nunca cache (dados precisam ser sempre atuais
  // e compartilhados em tempo real entre os aparelhos).
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // Casca do app: rede primeiro (sempre pega a versão mais nova do servidor);
  // o cache só é usado se o servidor estiver fora do ar (modo offline).
  // Antes era "cache primeiro", o que podia misturar arquivos da versão antiga
  // com os da nova depois de uma atualização do app.
  event.respondWith(
    fetch(req)
      .then((resposta) => {
        if (resposta && resposta.status === 200) {
          const copia = resposta.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copia));
        }
        return resposta;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
