/* DayFlow v2 — service worker。
   1) オンラインなら常に最新を取りに行く（更新は開き直すだけで反映）。オフラインならキャッシュで動く。
   2) 通知のボタンを受けて、画面を開かずに記録する。 */
importScripts('js/db.js');

const CACHE = 'dayflow-2.4.2';
const SHELL = ['./', 'index.html', 'styles.css', 'js/db.js', 'js/theme.js', 'js/sea.js', 'js/app.js', 'test.html', 'manifest.webmanifest', 'icons/icon-192.png', 'data/index.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 4000);
      const res = await fetch(req, { signal: ctl.signal, cache: 'no-cache' });
      clearTimeout(timer);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch (_) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
      return Response.error();
    }
  })());
});

/* ---- 通知 ---- */
async function tellClients() {
  const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  cs.forEach(c => c.postMessage({ type: 'df-changed' }));
}
async function focusOrOpen(path) {
  const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const hit = cs.find(c => c.url.includes(path === './' ? '/index.html' : path)) || cs[0];
  if (hit && hit.focus) return hit.focus();
  return self.clients.openWindow(path);
}
function showTest() {
  return self.registration.showNotification('20:00 行政法規 第8回 前半', {
    body: 'DayFlow 通知テスト。Watchでボタンを押してください。',
    tag: 'df-test', renotify: true, requireInteraction: true,
    icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', vibrate: [200, 100, 200],
    data: { test: true },
    actions: [{ action: 'start', title: '開始' }, { action: 'snooze', title: '10分後' }]
  }).then(() => DFDB.addLog({ kind: 'shown' })).then(tellClients);
}

self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type === 'test-notify') {
    e.waitUntil(new Promise(r => setTimeout(r, Math.min(25000, d.delay || 0))).then(showTest));
  }
});

self.addEventListener('notificationclick', e => {
  const n = e.notification, d = n.data || {}, action = e.action || '';
  n.close();
  e.waitUntil((async () => {
    if (d.test) {
      await DFDB.addLog({ kind: 'click', action: action || 'body' });
      await tellClients();
      if (!action) await focusOrOpen('test.html');      // ボタン以外（通知本体）を押したときだけ画面を開く
      return;
    }
    // 本番の通知（段階3で送る）。ボタンは画面を開かずに記録する。
    if (d.kind === 'start') {
      if (action === 'start') await DFDB.startPlan(d.planId, 'watch');
      else if (action === 'snooze') await DFDB.snoozePlan(d.planId, 10);
      else await focusOrOpen('./');
    } else if (d.kind === 'end') {
      if (action === 'finish') await DFDB.finishRunning('watch');
      else if (action === 'extend') await DFDB.extendRunning(15);
      else await focusOrOpen('./');
    }
    await tellClients();
  })());
});

self.addEventListener('notificationclose', e => {
  const d = e.notification.data || {};
  if (d.test) e.waitUntil(DFDB.addLog({ kind: 'close' }).then(tellClients));
});
