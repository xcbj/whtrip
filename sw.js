/* 旅行攻略 · Service Worker（多行程）
 * 目标：第一次联网打开时就把「壳 + 每趟行程的文字内容」存到手机，
 *      之后断网/飞行模式也能一键打开、切天、看历史攻略。
 * 视频/封面这类大文件：只预缓存「现在要用到的那几趟」（构建时算好），
 * 其余行程在你打开它的时候按需缓存（打开后 shell 还会发 PREFETCH 补全）。
 * 改了站内文件 → tools/release.mjs 会自动改下面的 VERSION 和两张清单。
 */
const VERSION = 'trips-20261107-b090f8d6';

const CORE = [
  './',
  './index.html',
  './styles.css',
  './shell.js',
  './update.js',
  './app.js',
  './manifest.webmanifest',
  './version.json',
  './trips/index.json',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png'
];

// ===== 构建时生成（tools/release.mjs），勿手改：开始 =====
const TRIP_DATA = ['./trips/wuhan-2026-11/data.js', './trips/wuhan-2026-11/spots.js', './trips/wuhan-2026-11/data-planb.js'];
const MEDIA = ['./assets/mp4/all.mp4', './assets/mp4/d1.mp4', './assets/mp4/d2.mp4', './assets/mp4/d3.mp4', './assets/mp4/d4.mp4', './assets/mp4/rain.mp4', './assets/poster/all.jpg', './assets/poster/d1.jpg', './assets/poster/d2.jpg', './assets/poster/d3.jpg', './assets/poster/d4.jpg', './assets/poster/rain.jpg', './assets/img/overview.jpg'];
// ===== 构建时生成，勿手改：结束 =====

const CACHE = VERSION;
const ASSET_RE = /\/assets\/|\/trips\/|\/media\//;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // 逐个 put：任何一个失败都不会让整个安装失败（addAll 是原子的）
    await Promise.all(
      [...CORE, ...TRIP_DATA, ...MEDIA].map(async (url) => {
        try {
          const res = await fetch(new Request(url, { cache: 'reload' }));
          if (res && (res.ok || res.type === 'opaque')) await cache.put(url, res);
        } catch (err) { /* 网络差就先跳过，运行时再补 */ }
      })
    );
    self.skipWaiting();
  })());
});

self.addEventListener('message', (e) => {
  const d = e.data || {};
  // 页面点「检查更新」/下拉刷新时，让排队的新 SW 立刻接管
  if (d.type === 'SKIP_WAITING') { self.skipWaiting(); return; }

  // 打开某一趟行程后，把这趟的媒体（视频/封面）补进缓存，之后离线也能看
  if (d.type === 'PREFETCH' && Array.isArray(d.urls) && d.urls.length) {
    e.waitUntil((async () => {
      const cache = await caches.open(CACHE);
      for (const u of d.urls) {
        let url;
        try { url = new URL(u, self.registration.scope).href; } catch (err) { continue; }
        const hit = await cache.match(url, { ignoreSearch: true });
        if (hit) { continue; }
        try {
          const res = await fetch(url, { cache: 'reload' });
          if (res && res.ok) { await cache.put(url, res); }
        } catch (err) { /* 网络不行就算了，下次打开再补 */ }
      }
    })());
  }
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

/* 缓存里的首页必须真的是 HTML，否则宁可给一张自救页（别让 Safari 显示源码） */
function isNavigate(req) {
  if (req.mode === 'navigate') { return true; }
  try { if (/\.html?$/i.test(new URL(req.url).pathname)) { return true; } } catch (e) { }
  return (req.headers.get('accept') || '').indexOf('text/html') >= 0;
}
function isHtmlRes(r) {
  const ct = (r.headers.get('Content-Type') || '').toLowerCase();
  return !ct || ct.indexOf('text/html') === 0;
}
function rescuePage() {
  const html = '<!doctype html><html lang="zh-CN"><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>旅行攻略</title><body style="font:16px/1.7 -apple-system,sans-serif;padding:24px">'
    + '<h1 style="font-size:20px">缓存出了点问题</h1>'
    + '<p>联网后重新打开本页即可自动修复；如果还是这样，设置 → Safari → 高级 → 网站数据，'
    + '删掉本站数据再打开一次。</p></body></html>';
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
async function shellHtml() {
  const shell = await caches.match('./index.html', { ignoreSearch: true });
  return shell && isHtmlRes(shell) ? shell : rescuePage();
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // 外链（高德/苹果地图）交给浏览器

  // 应急通道：网址后面加 ?fresh=1 就跳过缓存直取网络（缓存脏了用它自救）
  const bypass = url.searchParams.has('fresh');

  e.respondWith((async () => {
    const hit = bypass ? null : await caches.match(req, { ignoreSearch: true });

    /* 缓存里的首页被污染过（镜像把 .html 当 text/plain 发过，见 update.js），
       Safari 会把网页当源码显示 —— 这种命中当没命中，直接回源。 */
    const cached = (hit && (!isNavigate(req) || isHtmlRes(hit))) ? hit : null;

    if (cached) {
      if (req.headers.has('range')) {
        try { return await ranged(req, cached); } catch (err) { return cached; }
      }
      return cached;
    }

    // 页面导航：断网时兜底到缓存里的首页
    if (isNavigate(req) && !bypass) {
      const shell = await shellHtml();
      if (shell) return shell;
    }

    try {
      const res = await fetch(req);
      // 顺手把没预缓存到的行程内容/媒体存下来，下次离线就有
      if (res && res.ok && (bypass || ASSET_RE.test(url.pathname))) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => { });
      }
      return res;
    } catch (err) {
      if (url.pathname.endsWith('/') || url.pathname.endsWith('.html')) {
        const shell = await shellHtml();
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
