/* 武汉攻略 · Service Worker
 * 目标：第一次联网打开时把整套内容（含 6 段路线视频）缓存到手机，
 *      之后断网/飞行模式也能一键打开、切天、播动图。
 * 改了站内文件 → 把下面的 VERSION 加一，用户下次打开自动换新。
 */
const VERSION = 'wh-20261104-9afa3cf2';

const CORE = [
  './',
  './index.html',
  './styles.css',
  './data.js',
  './app.js',
  './manifest.webmanifest',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png'
];

const MEDIA = [
  './assets/img/overview.jpg',
  './assets/mp4/d1.mp4',
  './assets/mp4/d2.mp4',
  './assets/mp4/d3.mp4',
  './assets/mp4/d4.mp4',
  './assets/mp4/rain.mp4',
  './assets/mp4/all.mp4',
  './assets/poster/d1.jpg',
  './assets/poster/d2.jpg',
  './assets/poster/d3.jpg',
  './assets/poster/d4.jpg',
  './assets/poster/rain.jpg',
  './assets/poster/all.jpg'
];

const CACHE = VERSION;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // 逐个 put：任何一个失败都不会让整个安装失败（addAll 是原子的）
    await Promise.all(
      [...CORE, ...MEDIA].map(async (url) => {
        try {
          const res = await fetch(new Request(url, { cache: 'reload' }));
          if (res && (res.ok || res.type === 'opaque')) await cache.put(url, res);
        } catch (err) { /* 网络差就先跳过，运行时再补 */ }
      })
    );
    self.skipWaiting();
  })());
});

// 页面点「强制刷新」/ 下拉刷新时，让排队的 SW 立刻接管
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* 视频要支持 Range（iOS 拖动进度条会发 Range 请求），
   命中缓存时手工切出 206，断网也能播、也能拖。 */
async function ranged(req, cached) {
  const buf = await cached.arrayBuffer();
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') || '');
  const type = cached.headers.get('Content-Type') || 'application/octet-stream';
  if (!m) {
    return new Response(buf, { status: 200, headers: { 'Content-Type': type, 'Accept-Ranges': 'bytes' } });
  }
  const total = buf.byteLength;
  let start = m[1] ? parseInt(m[1], 10) : 0;
  let end = m[2] ? parseInt(m[2], 10) : total - 1;
  if (start >= total) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } });
  }
  end = Math.min(end, total - 1);
  const chunk = buf.slice(start, end + 1);
  return new Response(chunk, {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': type,
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Content-Length': String(chunk.byteLength),
      'Accept-Ranges': 'bytes'
    }
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // 外链（高德/苹果地图）交给浏览器

  e.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });

    if (cached) {
      if (req.headers.has('range')) {
        try { return await ranged(req, cached); } catch (err) { return cached; }
      }
      return cached;
    }

    // 页面导航：断网时兜底到缓存里的首页
    if (req.mode === 'navigate') {
      const shell = await caches.match('./index.html', { ignoreSearch: true });
      if (shell) return shell;
    }

    try {
      return await fetch(req);
    } catch (err) {
      if (url.pathname.endsWith('/') || url.pathname.endsWith('.html')) {
        const shell = await caches.match('./index.html', { ignoreSearch: true });
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
