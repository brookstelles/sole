// Sole's service worker: keeps a copy of the app on the phone so it opens with no signal (the book itself is kept
// by the page, in IndexedDB). The page: the newest when online, the last copy when not. Libraries and fonts: the
// copy, fetched once. Everything else (the database, Square) goes straight to the network.
// It also shows notifications (a message from the website, sent by supabase/functions/push) and opens Sole on that
// message when one is tapped.
const V = 'sole-1';
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(V).then(c => c.addAll(['/', '/apple-touch-icon.png'])).catch(() => {})); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET') return;
  if (u.origin === location.origin && r.mode === 'navigate') {
    e.respondWith(fetch(r).then(res => { if (res.ok) { const cp = res.clone(); caches.open(V).then(c => c.put('/', cp)); } return res; }).catch(() => caches.match('/')));
    return;
  }
  if (u.origin === location.origin || /^(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(u.hostname)) {
    e.respondWith(caches.match(r).then(hit => hit || fetch(r).then(res => { if (res.ok || res.type === 'opaque') { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); } return res; })));
  }
});
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (_) { d = {body:e.data ? e.data.text() : ''}; }
  e.waitUntil(self.registration.showNotification(d.title || 'Sole', {body:d.body || '', tag:d.tag || undefined, data:{url:d.url || '/'}, icon:'/apple-touch-icon.png', badge:'/apple-touch-icon.png'}));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({type:'window', includeUncontrolled:true}).then(ws => {
    const w = ws.find(x => new URL(x.url).origin === self.location.origin);
    if (w) return w.navigate(url).then(x => (x || w).focus()).catch(() => w.focus());
    return self.clients.openWindow(url);
  }));
});
