/* 旅行攻略 · 壳层（多行程）
   ------------------------------------------------------------------
   职责：
     1) 读构建时生成的行程清单 trips/index.json；
     2) 按 URL 决定去首页还是进某一趟行程；
     3) 进行程时动态载入 trips/<id>/data.js，再调用 window.__MOUNT__(GUIDE, cfg)。
   地址格式：
     #                      → 空：今天正好在某一趟行程期内就自动进那一趟，否则列表
     #/                     → 行程列表（明确回首页）
     #<行程id>              → 进入这一趟（默认子视图）
     #<行程id>/d3 …/eat …   → 行程内的具体页（由 app.js 解析剩余部分）
   切行程 / 回列表一律整页 reload：App 的手势与事件都绑在 #main 上，重载最稳，
   而且离线时 SW 直接把整页从缓存里给回来，看不出差别。
*/
(function () {
  'use strict';

  var MANIFEST = 'trips/index.json';
  var DEFAULT_FEATURES = ['plan', 'route', 'eat', 'shops', 'prep'];

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var UPD = window.__UPD__ || {};
  function toast(m) { if (UPD.toast) { UPD.toast(m); } }

  /* ---------- 日期 ---------- */
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function iso(s) { var p = String(s || '').split('-'); return new Date(+p[0] || 1970, (+p[1] || 1) - 1, +p[2] || 1); }
  function midnight(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function dayDiff(a, b) { return Math.round((midnight(b) - midnight(a)) / 86400000); }

  function dateLabel(t) {
    if (t.dateLabel) { return t.dateLabel; }
    var a = iso(t.startDate), b = iso(t.endDate);
    if (!a || !b) { return ''; }
    return a.getFullYear() + '.' + p2(a.getMonth() + 1) + '.' + p2(a.getDate()) +
      '—' + p2(b.getMonth() + 1) + '.' + p2(b.getDate());
  }
  function daySpan(t) { return t.dayCount || (dayDiff(iso(t.startDate), iso(t.endDate)) + 1); }

  /* 今天相对这一趟行程的位置：live（进行中）/ next（没出发）/ past（已结束） */
  function status(t, now) {
    var a = iso(t.startDate), b = iso(t.endDate), n = midnight(now || new Date());
    if (a > b) { return { kind: 'next', left: 0 }; }
    if (n < a) { return { kind: 'next', left: dayDiff(n, a) }; }
    if (n > b) { return { kind: 'past', ago: dayDiff(b, n) }; }
    return { kind: 'live', idx: dayDiff(a, n) };
  }

  /* ---------- 首页 ---------- */
  function stateLabel(t) {
    var st = status(t);
    if (st.kind === 'live') { return { text: '今天 D' + (st.idx + 1), cls: 'live' }; }
    if (st.kind === 'next') { return { text: st.left <= 1 ? '马上出发' : '距出发 ' + st.left + ' 天', cls: 'next' }; }
    return { text: '已结束', cls: 'past' };
  }

  function card(t) {
    var st = stateLabel(t);
    var kv = [];
    kv.push(daySpan(t) + ' 天');
    if (t.counts && t.counts.food) { kv.push('🍜 ' + t.counts.food + ' 家吃'); }
    if (t.counts && t.counts.shops) { kv.push('🔍 ' + t.counts.shops + ' 家店'); }
    if (t.counts && t.counts.tickets) { kv.push('🧳 ' + t.counts.tickets + ' 项待办'); }
    // 封面图（trip.json 的 cover）：有图就当缩略图，没图退回 emoji 方块
    var head = t.cover
      ? '<span class="tc-thumb" aria-hidden="true" style="background-image:url(\'' + esc(t.cover) + '\')">' +
        '<span class="tc-badge">' + esc(t.emoji || '📍') + '</span></span>'
      : '<span class="tc-emoji" aria-hidden="true">' + esc(t.emoji || '📍') + '</span>';
    var tags = (t.tags && t.tags.length)
      ? '<span class="tc-tags">' + t.tags.map(function (x) {
          return '<span class="tc-tag">' + esc(x) + '</span>';
        }).join('') + '</span>'
      : '';
    var find = [t.title, t.city, t.summary, (t.tags || []).join(' '),
      (t.days || []).map(function (d) { return d.title; }).join(' ')].join(' ').toLowerCase();
    return '<a class="tcard" href="#' + esc(t.id) + '" data-trip="' + esc(t.id) + '"' +
      ' data-find="' + esc(find) + '" data-tags="|' + esc((t.tags || []).join('|')) + '|"' +
      ' style="--accent:' + esc(t.accent || '#1a73e8') + '">' +
      head +
      '<span class="tc-main">' +
        '<span class="tc-top"><b>' + esc(t.title || t.city) + '</b>' +
          '<i class="tc-state ' + st.cls + '">' + esc(st.text) + '</i></span>' +
        '<span class="tc-date">' + esc(dateLabel(t)) + '</span>' +
        (t.summary ? '<span class="tc-sum">' + esc(t.summary) + '</span>' : '') +
        tags +
        '<span class="tc-kv">' + kv.map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</span>' +
      '</span>' +
      '<span class="tc-go" aria-hidden="true">›</span>' +
      '</a>';
  }

  function group(title, list, extraCls) {
    if (!list.length) { return ''; }
    return '<section class="hgroup ' + (extraCls || '') + '">' +
      '<h3>' + esc(title) + '<span class="hcnt">' + list.length + '</span></h3>' +
      '<div class="hcards">' + list.map(card).join('') + '</div></section>';
  }

  function renderHome(trips) {
    document.body.classList.add('mode-home');
    document.body.classList.remove('mode-trip');
    document.title = '旅行攻略';
    $('#home').hidden = false;
    $('#trip').hidden = true;
    $('#tbTitle').textContent = '旅行攻略';
    $('#tbBack').hidden = true;
    $('#todayBtn').hidden = true;

    var live = [], next = [], past = [];
    trips.forEach(function (t) {
      var k = status(t).kind;
      (k === 'live' ? live : k === 'next' ? next : past).push(t);
    });
    next.sort(function (a, b) { return String(a.startDate).localeCompare(String(b.startDate)); });
    past.sort(function (a, b) { return String(b.endDate).localeCompare(String(a.endDate)); });

    $('#homeSub').textContent = live.length
      ? '正在' + live[0].city + ' · 共 ' + trips.length + ' 趟攻略存在手机里'
      : '共 ' + trips.length + ' 趟 · 全部存在手机里，断网也能看';

    var html = group('进行中', live, 'hlive') + group('即将出发', next, 'hnext');
    if (past.length) {
      html += '<details class="hgroup hpast"><summary><span>历史行程</span>' +
        '<span class="hcnt">' + past.length + '</span></summary><div class="hcards">' +
        past.map(card).join('') + '</div></details>';
    }
    if (!trips.length) {
      html = '<p class="hempty">还没有行程。加一趟：在项目里建 <code>trips/&lt;id&gt;/trip.json</code>，' +
        '再跑 <code>./tools/deploy.sh</code>。</p>';
    } else {
      // 趟数多起来才给搜索/标签筛选，一两趟时不碍眼
      var tagSet = [];
      trips.forEach(function (t) {
        (t.tags || []).forEach(function (x) { if (tagSet.indexOf(x) < 0) { tagSet.push(x); } });
      });
      var filtering = trips.length >= 4;
      if (filtering) {
        html = '<div class="hfilter">' +
            '<label class="hsearch"><span aria-hidden="true">🔍</span>' +
            '<input id="hq" type="search" inputmode="search" autocomplete="off" ' +
            'placeholder="搜城市 / 景点 / 关键词"></label></div>' +
          (tagSet.length ? '<div class="htags" id="htags">' +
            '<button class="htag" data-tag="" aria-pressed="true">全部</button>' +
            tagSet.map(function (x) {
              return '<button class="htag" data-tag="' + esc(x) + '" aria-pressed="false">' + esc(x) + '</button>';
            }).join('') + '</div>' : '') +
          html +
          '<p class="hnomatch" id="hnomatch" hidden>没有匹配的行程</p>';
      }
    }
    $('#homeBody').innerHTML = html;
    if ($('#hq')) { wireFilter(); }

    var foot = $('#homeFoot');
    foot.hidden = false;
    foot.innerHTML = '<button class="btn ghost" id="homeUpd">检查更新</button>' +
      '<span class="hint">' + (manifestTime ? '内容更新于 ' + esc(manifestTime) + ' · ' : '') +
      '点一下换成最新版 · 流量也行，不用代理</span>';
    var b = $('#homeUpd');
    if (b) {
      b.addEventListener('click', function () {
        if (UPD.hardRefresh) { UPD.hardRefresh(); } else { location.reload(); }
      });
    }
  }

  /* 首页搜索 / 标签筛选（只在行程较多时出现） */
  function wireFilter() {
    var q = $('#hq'), tags = $('#htags'), nm = $('#hnomatch');
    var curTag = '';
    function apply() {
      var s = (q && q.value || '').trim().toLowerCase();
      var shown = 0;
      $$('.tcard', $('#homeBody')).forEach(function (c) {
        var hit = (!s || (c.dataset.find || '').indexOf(s) >= 0) &&
                  (!curTag || (c.dataset.tags || '').indexOf('|' + curTag + '|') >= 0);
        c.hidden = !hit;
        if (hit) { shown++; }
      });
      $$('.hcards', $('#homeBody')).forEach(function (box) {
        var shown = 0;
        $$('.tcard', box).forEach(function (c) { if (!c.hidden) { shown++; } });
        var sec = box.closest ? box.closest('.hgroup') : null;
        if (sec) {
          sec.hidden = !shown;
          var cnt = $('.hcnt', sec);
          if (cnt) { cnt.textContent = shown; }
        }
      });
      var pastBox = $('.hpast', $('#homeBody'));
      if (pastBox && (s || curTag)) { pastBox.open = true; }
      if (nm) { nm.hidden = shown > 0; }
    }
    if (q) { q.addEventListener('input', apply); }
    if (tags) {
      tags.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('.htag') : null;
        if (!b) { return; }
        curTag = b.dataset.tag || '';
        $$('.htag', tags).forEach(function (x) {
          x.setAttribute('aria-pressed', String((x.dataset.tag || '') === curTag));
        });
        apply();
      });
    }
  }

  var manifestTime = '';

  /* ISO 时间 → 本地「MM.DD HH:mm」（清单里存的是 UTC，直接截字符串会差 8 小时） */
  function fmtTime(isoStr) {
    if (!isoStr) { return ''; }
    var d = new Date(isoStr);
    if (isNaN(d)) { return ''; }
    return p2(d.getMonth() + 1) + '.' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }

  /* ---------- 进/出 ---------- */
  var current = null;

  function go(id) {
    if (location.hash === '#' + id) { mountById(id); return; }
    location.hash = '#' + id;
    location.reload();
  }
  /* 「这次是特意回清单的」记一个标记：重载后别又把人家弹回行程里
     （主屏图标冷启动时没有这个标记 → 照常默认进最近的那趟） */
  function homeExplicit(v) {
    try {
      if (v === undefined) { return sessionStorage.getItem('homeExp') === '1'; }
      sessionStorage.setItem('homeExp', v ? '1' : '0');
    } catch (e) { }
    return false;
  }
  function goHome() {
    homeExplicit(true);
    if (location.hash === '#/') { location.reload(); return; }
    location.hash = '#/';
    location.reload();
  }

  var loaded = {};
  function loadScript(src) {
    if (loaded[src]) { return loaded[src]; }
    loaded[src] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('载入失败：' + src)); };
      document.head.appendChild(s);
    });
    return loaded[src];
  }

  function prefetch(t) {
    try {
      var sw = navigator.serviceWorker && navigator.serviceWorker.controller;
      if (!sw || !navigator.onLine || !t.media || !t.media.length) { return; }
      sw.postMessage({ type: 'PREFETCH', urls: t.media });
    } catch (e) { }
  }

  function mountTrip(t) {
    current = t;
    homeExplicit(false);           // 进了行程就把「特意回清单」的标记清掉
    document.body.classList.remove('mode-home');
    document.body.classList.add('mode-trip');
    document.title = t.homeTitle || t.title || '旅行攻略';
    $('#home').hidden = true;
    $('#trip').hidden = false;
    $('#tbTitle').textContent = t.title || t.city || '行程';
    $('#tbSub').textContent = dateLabel(t) + (daySpan(t) ? ' · ' + daySpan(t) + ' 天' : '');
    $('#tbBack').hidden = false;

    var feats = t.features || DEFAULT_FEATURES;
    $$('.tab').forEach(function (b) { b.hidden = feats.indexOf(b.dataset.page) < 0; });

    var cfg = {
      id: t.id,
      city: t.city,
      title: t.title,
      homeTitle: t.homeTitle,
      assetBase: t.assetBase || ('assets/' + t.id + '/'),
      mapCity: t.mapCity || t.city,
      features: feats,
      startDate: t.startDate,
      endDate: t.endDate,
      dateLabel: dateLabel(t),
      days: t.days || []
    };

    loadScript('app.js').then(function () { return loadScript(t.data); }).then(function () {
      if (typeof window.__MOUNT__ !== 'function' || !window.GUIDE) { throw new Error('行程数据没加载出来'); }
      window.__MOUNT__(window.GUIDE, cfg);
      prefetch(t);
    }).catch(function (e) {
      $('#main').innerHTML = '<div class="card" style="margin:16px"><h3>这趟行程没打开</h3>' +
        '<p class="muted">' + esc((e && e.message) || '数据载入失败') + '</p>' +
        '<p class="hint">联网后下拉刷新一次，让它把这一趟的内容存到手机里。</p></div>';
    });
  }

  function findTrip(trips, id) {
    for (var i = 0; i < trips.length; i++) { if (trips[i].id === id) { return trips[i]; } }
    return null;
  }
  var allTrips = [];
  function mountById(id) {
    var t = findTrip(allTrips, id);
    if (t) { mountTrip(t); } else { renderHome(allTrips); toast('找不到这趟行程'); }
  }

  /* ---------- 启动 ---------- */
  function boot(list) {
    allTrips = list;
    var raw = (location.hash || '').replace(/^#/, '');
    if (raw && raw !== '/') {
      var id = decodeURIComponent(raw.split('/')[0]);
      var t = findTrip(list, id);
      if (t) { mountTrip(t); return; }
      toast('这趟行程不在这台手机里');
      renderHome(list);
      return;
    }
    /* 没有指定某趟时（主屏图标冷启动就是这种）：优先进「正在进行」的那趟，
       没有就进「最近要出发」的那趟；都只剩历史行程时才停在清单。
       例外：用户刚点过「‹全部」回来（homeExp 标记），那就老实停在清单。 */
    if (!raw || (raw === '/' && !homeExplicit())) {
      var live = list.filter(function (t) { return status(t).kind === 'live'; })[0];
      var soon = null;
      if (!live) {
        var ups = list.filter(function (t) { return status(t).kind === 'next'; });
        ups.sort(function (a, b) { return String(a.startDate).localeCompare(String(b.startDate)); });
        soon = ups[0] || null;
      }
      var pick = live || soon;
      if (pick) {
        try { history.replaceState(null, '', '#' + pick.id); } catch (e) { }
        mountTrip(pick);
        return;
      }
    }
    renderHome(list);
  }

  function bootFail() {
    $('#homeSub').textContent = '行程清单没读到';
    $('#homeBody').innerHTML = '<p class="hempty">可能是第一次打开又没联网。' +
      '联网后下拉刷新，或点下面的「检查更新」。</p>';
    var foot = $('#homeFoot');
    foot.hidden = false;
    foot.innerHTML = '<button class="btn ghost" id="homeUpd">检查更新</button>';
    var b = $('#homeUpd');
    if (b) { b.addEventListener('click', function () { location.reload(); }); }
  }

  $('#tbBack').addEventListener('click', goHome);
  $('#homeBody').addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[data-trip]') : null;
    if (!a) { return; }
    e.preventDefault();
    go(a.dataset.trip);
  });

  /* 行程内的子视图 hash 由 app.js 处理；指到别处（回首页/别的行程）就整页换 */
  window.addEventListener('hashchange', function () {
    var raw = (location.hash || '').replace(/^#/, '');
    if (current && raw.indexOf(current.id) === 0) { return; }
    location.reload();
  });

  fetch(MANIFEST, { cache: 'no-store' })
    .then(function (r) { if (!r.ok) { throw new Error('HTTP ' + r.status); } return r.json(); })
    .then(function (m) {
      manifestTime = fmtTime(m.builtAt);
      boot(m.trips || []);
    })
    .catch(function () {
      // 离线且没缓存到清单时，退回浏览器/SW 缓存的一份
      fetch(MANIFEST).then(function (r) { return r.json(); })
        .then(function (m) { boot(m.trips || []); })
        .catch(function () { bootFail(); });
    });

  /* Service Worker 在壳层注册（首页也要有，不然首次只逛列表就永远装不上） */
  var secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (secure && !window.__OFFLINE__ && 'serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* 失败不影响使用 */ });
    });
  }
})();
