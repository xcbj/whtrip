/* 通用能力：toast / 复制 / 下拉刷新 / 版本检查与更新
   —— 与具体行程无关，首页与行程页共用；挂在 window.__UPD__ 上。
   镜像通道的原因：github.io 在国内常被污染，独立 App 模式下拿不到新 sw.js，
   于是永远停在旧缓存。这里直接走 jsDelivr 的 GitHub 通道取版本清单。 */
window.__UPD__ = (function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };

/* ---------- toast / 复制 ---------- */
var toastEl = $('#toast'), toastTimer = 0;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { toastEl.hidden = true; }, 1600);
}
/* 下拉刷新 / 手动刷新：先让 SW 拿新版本，再重载 */
var pullEl = document.getElementById('pull');
var pullTxt = pullEl ? pullEl.querySelector('.pt') : null;
var refreshing = false;

function setPull(y) {
  if (!pullEl) { return; }
  var h = pullEl.offsetHeight || 60;
  var reveal = y > 0 ? Math.min(h, Math.round(y * (h / 68))) : 0;
  pullEl.style.setProperty('--pull-y', reveal + 'px');
  pullEl.classList.toggle('on', y >= 68);
  if (pullTxt) { pullTxt.textContent = y >= 68 ? '松手刷新' : '下拉刷新'; }
}

function pullBusy(on) {
  if (!pullEl) { return; }
  pullEl.classList.toggle('busy', on);
  pullEl.classList.remove('on');
  if (on) {
    pullEl.style.setProperty('--pull-y', (pullEl.offsetHeight || 60) + 'px');
    if (pullTxt) { pullTxt.textContent = '正在刷新…'; }
  } else {
    pullEl.style.setProperty('--pull-y', '0px');
    if (pullTxt) { pullTxt.textContent = '下拉刷新'; }
  }
}

/* ---------- 国内镜像更新通道 ----------
   github.io 在国内经常被污染/重置：独立 App 模式下点「强制刷新」，其实是去
   github.io 重新取 sw.js，取不到就静默失败，于是永远停在旧缓存——这就是
   「不开代理拉不到最新改动」的原因。这里改走 jsDelivr 的 GitHub 通道
   （国内多数网络可直连、带 CORS），把 version.json 与变更文件直接写进本机
   缓存再重载，全程不碰 github.io。 */
var MIRRORS = [
  'https://raw.githack.com/xcbj/whtrip/main/',              // 缓存只 60 秒 → 永远最新
  'https://cdn.jsdelivr.net/gh/xcbj/whtrip@main/',          // 稳、快，但 @main 会缓存 12 小时
  'https://fastly.jsdelivr.net/gh/xcbj/whtrip@main/',
  'https://gcore.jsdelivr.net/gh/xcbj/whtrip@main/',
  'https://testingcf.jsdelivr.net/gh/xcbj/whtrip@main/',
  'https://raw.githubusercontent.com/xcbj/whtrip/main/'     // 有代理时最原始的口子
];
var VER_FILE = 'version.json';

function fetchT(url, ms, opt) {
  opt = opt || {};
  opt.cache = 'no-store';
  if (typeof AbortController === 'undefined') { return fetch(url, opt); }
  var ac = new AbortController();
  var timer = setTimeout(function () { try { ac.abort(); } catch (e) { } }, ms);
  opt.signal = ac.signal;
  return fetch(url, opt).then(function (r) { clearTimeout(timer); return r; },
    function (e) { clearTimeout(timer); throw e; });
}

function badVer(o) { return !o || typeof o.v !== 'string' || !o.v || !Array.isArray(o.files); }
function absUrl(p) { return new URL(p, location.href).href; }

/* 纯函数：远端清单 vs 本地清单 → 需要重下的路径（已最新给 []，坏数据给 null） */
function planChanges(remote, local) {
  if (badVer(remote)) { return null; }
  var have = {};
  if (local && Array.isArray(local.files)) {
    local.files.forEach(function (f) { if (f && f.p) { have[f.p] = f.h; } });
  }
  var all = remote.files.filter(function (f) { return f && f.p; }).map(function (f) { return f.p; });
  if (badVer(local)) { return all; }               // 老版本安装还没有清单 → 全量对齐一次
  if (local.v === remote.v) { return []; }
  return remote.files.filter(function (f) { return f && f.p && have[f.p] !== f.h; })
    .map(function (f) { return f.p; });
}

/* 本地已知版本：优先读缓存里的 version.json，读不到再看 localStorage
   （清缓存/首次装的过渡期用得上，免得一上来就要重下 2.5MB 媒体） */
function cachedVer() {
  var fromLs = function () {
    try { var t = localStorage.getItem('wh-verj'); return t ? JSON.parse(t) : null; } catch (e) { return null; }
  };
  if (!window.caches) { return Promise.resolve(fromLs()); }
  return caches.match(absUrl(VER_FILE), { ignoreSearch: true }).then(function (r) {
    return r ? r.json() : fromLs();
  }).catch(fromLs);
}

function saveVerLocal(obj) {
  try { localStorage.setItem('wh-verj', JSON.stringify(obj)); } catch (e) { }
}

/* 新内容写进所有已存在的缓存（SW 缓存优先，写完立刻生效）
   注意 index.html 还要覆盖 './' 这个键：直接访问站点根目录时命中的是它。 */
function putAll(p, res) {
  var keys = [absUrl(p)];
  if (p === 'index.html') { keys.push(absUrl('./')); }
  if (!window.caches) { return Promise.resolve(); }
  return caches.keys().then(function (list) {
    return Promise.all(list.map(function (name) {
      return caches.open(name).then(function (c) {
        return Promise.all(keys.map(function (k) { return c.put(k, res.clone()); }));
      });
    }));
  });
}

/* 逐个探镜像：拿到各自的 version.json（并带回 t 时间戳） */
function probeMirror(base, ms) {
  return fetchT(base + VER_FILE + '?t=' + Date.now(), ms).then(function (r) {
    if (!r.ok) { throw new Error('HTTP ' + r.status); }
    return r.json();
  }).then(function (j) {
    if (badVer(j)) { throw new Error('清单损坏'); }
    return { base: base, ver: j };
  });
}

/* 并行问所有镜像，取「构建时间最新」的那份清单再下载。
   之所以并行比较：jsDelivr 的 @main 有 12 小时边缘缓存，刚推完可能还是旧的；
   raw.githack 只有 60 秒缓存。取最新的一份，就不会被慢的那个骗到。 */
function mirrorUpdate(o) {
  o = o || {};
  var out = { ok: false, mirror: '', local: '', remote: '', changed: [], probed: [], err: '' };
  return cachedVer().then(function (local) {
    out.local = (local && local.v) || '';
    return Promise.all(MIRRORS.map(function (base) {
      return probeMirror(base, o.timeout || 4500).catch(function (e) {
        out.probed.push(base + ' ✗ ' + String((e && e.message) || e));
        return null;
      });
    })).then(function (list) {
      var good = list.filter(function (x) { return !!x; });
      good.forEach(function (g) { out.probed.push(g.base + ' → ' + g.ver.v); });
      if (!good.length) { out.err = '所有镜像都不通'; return out; }
      good.sort(function (a, b) {
        return String(b.ver.t || '').localeCompare(String(a.ver.t || ''));
      });
      var pick = good[0];
      out.mirror = pick.base;
      out.remote = pick.ver.v;
      var todo = planChanges(pick.ver, local);
      if (todo === null) { out.err = '清单损坏'; return out; }
      out.changed = todo;
      if (!todo.length || o.planOnly) { out.ok = true; return out; }
      return todo.reduce(function (chain, p) {
        return chain.then(function () {
          return fetchT(pick.base + p + '?t=' + Date.now(), o.fileTimeout || 25000).then(function (r) {
            if (!r.ok) { throw new Error(p + ' HTTP ' + r.status); }
            return putAll(p, r);
          });
        });
      }, Promise.resolve()).then(function () {
        var body = new Blob([JSON.stringify(pick.ver)], { type: 'application/json' });
        return putAll(VER_FILE, new Response(body, { headers: { 'Content-Type': 'application/json' } }));
      }).then(function () {
        saveVerLocal(pick.ver);
        out.ok = true;
        return out;
      });
    });
  });
}

/* 兜底老路：镜像都不通时再找 GitHub（有代理或网络好时有效） */
function ghUpdate(cb) {
  var finished = false;
  function done(ok) {
    if (finished) { return; }
    finished = true;
    clearTimeout(guard);
    cb(ok);
  }
  var guard = setTimeout(function () { done(false); }, 2500);
  try {
    if (!navigator.serviceWorker || !navigator.serviceWorker.getRegistration) { done(false); return; }
    navigator.serviceWorker.getRegistration().then(function (reg) {
      if (!reg) { done(false); return; }
      if (reg.waiting) {           // 已有新版本在等 → 直接接管
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        navigator.serviceWorker.addEventListener('controllerchange', function () { done(true); });
        setTimeout(function () { done(true); }, 1400);
        return;
      }
      var p = reg.update();
      if (p && p.then) { p.then(function () { done(true); }, function () { done(false); }); }
      else { done(true); }
    }, function () { done(false); });
  } catch (e) { done(false); }
}

/* 下拉刷新 / 强制刷新：镜像优先，失败退回 GitHub */
function hardRefresh() {
  if (refreshing) { return; }
  refreshing = true;
  pullBusy(true);
  var over = false;
  function stop(msg) {
    if (over) { return; }
    over = true;
    refreshing = false;
    pullBusy(false);
    setPull(0);
    if (msg) { toast(msg); }
  }
  function reloadWith(msg) {
    if (over) { return; }
    over = true;
    try { sessionStorage.setItem('wh-refreshed', msg); } catch (e) { }
    location.reload();
  }
  function fallbackGh() {
    ghUpdate(function (ok) {
      if (ok) { reloadWith('已刷新到最新内容'); } else { stop('网络不通，仍在使用本地缓存'); }
    });
  }
  mirrorUpdate({}).then(function (r) {
    if (r && r.ok && (r.changed || []).length) {
      reloadWith('已从镜像更新（' + r.changed.length + ' 个文件）');
      return;
    }
    if (r && r.ok) {
      var down = (r.probed || []).filter(function (x) { return x.indexOf('✗') > 0; }).length;
      stop(down ? '已是最新（' + down + ' 个镜像不通，可能还没同步）' : '已是最新版本');
      return;
    }
    fallbackGh();
  }, fallbackGh);
}

function copyText(t) {
  var done = function () { toast('已复制：' + t); };
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(t).then(done, function () { legacyCopy(t, done); });
  } else {
    legacyCopy(t, done);
  }
}
function legacyCopy(t, done) {
  var ta = document.createElement('textarea');
  ta.value = t;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:-1000px;left:0;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, t.length);
  try { document.execCommand('copy'); done(); }
  catch (e) { toast('复制失败，请长按文字手工复制'); }
  document.body.removeChild(ta);
}


  return {
    toast: toast, copyText: copyText, setPull: setPull, pullBusy: pullBusy,
    hardRefresh: hardRefresh, mirrorUpdate: mirrorUpdate, cachedVer: cachedVer,
    planChanges: planChanges, MIRRORS: MIRRORS
  };
})();
