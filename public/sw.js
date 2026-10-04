// Service worker: thông báo đẩy + lưu sẵn giao diện để mở nhanh / mở được khi mất mạng.
// Số liệu (cần đăng nhập) do trang tự lưu trong bộ nhớ 'kv-data-v1' và bị xóa khi đăng xuất; ở đây không lưu /api/*.
const SHELL = 'kv-shell-v1';
const FONTS = 'kv-fonts-v1';
const KEEP = [SHELL, FONTS, 'kv-data-v1'];
const PRECACHE = ['/', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png', '/icons/favicon-32.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (!KEEP.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function notifyUpdated(id) {
  const msg = { type: 'shell-updated' };
  let c = id ? await self.clients.get(id) : null;
  for (let i = 0; !c && id && i < 20; i++) { await new Promise((r) => setTimeout(r, 250)); c = await self.clients.get(id); }
  if (c) { c.postMessage(msg); return; }
  for (const w of await self.clients.matchAll({ type: 'window' })) w.postMessage(msg);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Phông chữ Google: lấy bản đã lưu, chưa có thì tải và lưu.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Trang chính: mở ngay bản đã lưu, đồng thời tải bản mới ở nền (lần mở sau dùng bản mới).
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const c = await caches.open(SHELL);
      const hit = await c.match('/');
      const oldText = hit ? hit.clone().text() : null; // đọc trước, vì bản 'hit' sẽ được trả cho trang
      const net = fetch(req.url, { cache: 'no-store', credentials: 'same-origin' }).then(async (res) => {
        if (res.ok && res.type === 'basic') {
          const fresh = res.clone();
          if (hit) {
            const [a, b] = await Promise.all([oldText, fresh.clone().text()]);
            await c.put('/', fresh);
            if (a !== b) await notifyUpdated(e.resultingClientId);
          } else await c.put('/', fresh);
        }
        return res;
      });
      if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
      try { return await net; } catch (err) { return new Response('Chưa kết nối mạng.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }); }
    })());
    return;
  }

  // Biểu tượng, manifest…: dùng bản đã lưu nếu có.
  if (url.pathname.startsWith('/icons/') || url.pathname === '/manifest.json') {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
  }
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'DT KV Luân', {
    body: d.body || 'Có số liệu mới.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: d.tag || 'kv-update',
    renotify: true,
    data: { url: d.url || '/' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if (c.url.startsWith(self.location.origin)) { await c.focus(); try { await c.navigate(url); } catch (_) {} return; } }
    await self.clients.openWindow(url);
  })());
});
