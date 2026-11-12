// 离线缓存：页面和词典先用缓存打开，后台更新
const CACHE = 'shici-2.1.0';
const CORE = ['./', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icons/icon-192.png',
  'js/main.js', 'js/app.js', 'js/store.js', 'js/planner.js', 'js/fsrs.js', 'js/dict.js', 'js/words.js', 'js/study.js',
  'js/views_read.js', 'js/views_more.js', 'js/views_exam.js', 'js/views_progress.js', 'js/sync.js', 'js/native.js', 'js/util.js', 'data/dict.json', 'data/content.json', 'data/exams.json'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// 代码走网络优先（保证各文件版本一致），离线时用缓存；词典数据大，用缓存优先并在后台更新
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  const isData = /\/data\/[^/]+\.json$/.test(u.pathname);
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; });
    if (isData && hit) { net.catch(() => {}); return hit; }
    try { return await net; } catch (err) { if (hit) return hit; throw err; }
  }));
});
