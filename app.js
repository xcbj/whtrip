/* 武汉四天三晚 · 手机版攻略 app
   纯原生 JS，无依赖；一次性把四天渲染进 DOM，切天只切 hidden。 */
(function () {
  'use strict';

  var G = window.GUIDE;
  if (!G) { document.body.innerHTML = '<p style="padding:20px">数据未加载</p>'; return; }

  var RES = window.__RES__ || {};
  var B64 = window.__B64__ || {};
  var blobCache = {};

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- 资源地址 ---------- */
  function asset(key) { return RES[key] || ('assets/' + key); }

  function videoSrc(key) {
    if (!B64[key]) return asset(key);
    if (blobCache[key]) return blobCache[key];
    var bin = atob(B64[key]);
    var u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    blobCache[key] = URL.createObjectURL(new Blob([u8], { type: 'video/mp4' }));
    return blobCache[key];
  }

  function amap(q) { return 'https://uri.amap.com/search?keyword=' + encodeURIComponent(q) + '&city=' + encodeURIComponent('武汉'); }
  function apple(q) { return 'https://maps.apple.com/?q=' + encodeURIComponent(q); }

  /* ---------- toast / 复制 ---------- */
  var toastEl = $('#toast'), toastTimer = 0;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 1600);
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

  /* ---------- 时间工具 ---------- */
  function mins(s) {
    var m = /^\s*(\d{1,2})[:：](\d{2})/.exec(s || '');
    return m ? (+m[1]) * 60 + (+m[2]) : null;
  }
  function rowSpan(time) {
    var parts = String(time).split(/[—–-]/);
    var a = mins(parts[0]);
    var b = parts[1] ? mins(parts[1]) : (a == null ? null : a + 15);
    return [a, b];
  }

  /* ---------- 行程数据索引 ---------- */
  var KINDS = G.kinds || {};
  var SCENES = {};
  (G.mealSlots || []).forEach(function (s) { SCENES[s.key] = s; });
  (function () { /* 兼容 scene 写成场景文字的情况 */ })();
  var sceneByLabel = {};
  (G.mealSlots || []).forEach(function (s) { sceneByLabel[s.scene] = s; });

  /* =========================================================
     渲染 · 行程
     ========================================================= */
  var DAY_CHIPS = G.days.map(function (d) {
    return { id: d.id, label: d.id, sub: d.date.replace('/', '/') + '日' };
  }).concat([{ id: 'RAIN', label: '雨天', sub: '备选' }]);

  function chipHtml(c, attr) {
    return '<button class="dchip" ' + attr + '="' + c.id + '" aria-selected="false">' +
      '<b>' + esc(c.label) + '</b><i>' + esc(c.sub) + '</i></button>';
  }

  function buildDaybar() {
    var html = DAY_CHIPS.map(function (c) { return chipHtml(c, 'data-day'); }).join('');
    $('#daybarPlan').innerHTML = html;
  }

  function rowHtml(row, idx) {
    var kind = KINDS[row.kind] || { icon: '•', label: '' };
    var scene = row.scene ? (SCENES[row.scene] || sceneByLabel[row.scene]) : null;
    var hasDetail = !!(scene || row.nav);
    var sp = rowSpan(row.time);
    var tm = String(row.time);
    var tmM = /^(.{1,7}?)\s*[—–]\s*(.{1,7})$/.exec(tm);
    var timeCell = tmM
      ? '<span class="time"><b>' + esc(tmM[1]) + '</b><i>' + esc(tmM[2]) + '</i></span>'
      : '<span class="time"><b>' + esc(tm) + '</b></span>';
    var nav = row.nav || '';
    var copyWhat = nav || row.title;
    var note = row.note && !/^[—–\-－]+$/.test(String(row.note).trim()) ? row.note : '';

    var h = '<li class="row" data-i="' + idx + '" data-kind="' + esc(row.kind) + '"' +
      (sp[0] != null ? ' data-t="' + sp[0] + '" data-te="' + sp[1] + '"' : '') + '>' +
      '<div class="row-line"' + (hasDetail ? ' data-toggle="1"' : '') + '>' +
      timeCell +
      '<span class="ico" aria-hidden="true">' + kind.icon + '</span>' +
      '<div class="txt"><div class="tt">' + esc(row.title) + '</div>' +
      (note ? '<div class="nt">' + esc(note) + '</div>' : '') + '</div>';

    if (nav) {
      h += '<a class="go" href="' + esc(amap(nav)) + '" target="_blank" rel="noopener" ' +
        'aria-label="高德导航到' + esc(nav) + '">↗</a>';
    }
    if (hasDetail) h += '<span class="caret" aria-hidden="true">▾</span>';
    h += '</div>';

    if (hasDetail) {
      h += '<div class="row-detail" hidden>';
      if (scene) {
        h += '<div class="dr"><div class="dr-h">首选</div><div class="sc-first">' + esc(scene.first) + '</div></div>';
        if (scene.alternatives && scene.alternatives.length) {
          h += '<div class="dr"><div class="dr-h">备选门店（都能搜到全名）</div><div class="chips">' +
            scene.alternatives.map(function (a) { return '<span class="chip">' + esc(a) + '</span>'; }).join('') +
            '</div></div>';
        }
        if (scene.tip) h += '<div class="dr"><div class="sc-tip">' + esc(scene.tip) + '</div></div>';
      }
      h += '<div class="dr acts">';
      if (nav) {
        h += '<a class="btn" href="' + esc(amap(nav)) + '" target="_blank" rel="noopener">高德地图</a>';
        h += '<a class="btn" href="' + esc(apple(nav)) + '" target="_blank" rel="noopener">苹果地图</a>';
      }
      h += '<button class="btn" data-copy="' + esc(copyWhat) + '">复制' + (nav ? '地名' : '行程') + '</button>';
      h += '</div></div>';
    }
    return h + '</li>';
  }

  function buildDays() {
    var html = G.days.map(function (d) {
      var rows = d.rows.map(rowHtml).join('');
      var notices = (d.notices || []).map(function (n) {
        return '<div class="notice">' + esc(n) + '</div>';
      }).join('');
      var transit = (d.transit && d.transit.length)
        ? '<details class="acc"><summary>段间交通<span class="hint" style="margin-left:auto;margin-right:8px">' +
          d.transit.length + ' 段</span></summary><div class="acc-body"><ol class="olist">' +
          d.transit.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ol></div></details>'
        : '';

      return '<article class="day-panel" data-day="' + d.id + '" hidden>' +
        '<div class="dayhead"><div class="dh-top"><span class="dh-id">' + esc(d.id) + '</span>' +
        '<h2>' + esc(d.title) + '</h2></div>' +
        '<p class="dh-date">' + esc(d.date) + ' ' + esc(d.weekday) + ' · ' + d.rows.length + ' 个节点</p></div>' +
        '<ul class="timeline">' + rows + '</ul>' + notices + transit + '</article>';
    }).join('');

    // 雨天备选
    html += '<article class="day-panel" data-day="RAIN" hidden>' +
      '<div class="dayhead"><div class="dh-top"><span class="dh-id" style="background:var(--warn)">雨天</span>' +
      '<h2>下雨 / 累了 / 想加点的切换方案</h2></div>' +
      '<p class="dh-date">看「动图」页的雨天动图，按这条路走</p></div>' +
      '<div class="notice">下雨优先室内：省博 → 湖北美术馆（省博旁免费）→ 楚河汉街（商场有儿童餐）。黄鹤楼顺延到 D3 傍晚或放弃登楼。</div>' +
      ((G.alternatives || []).length ? '<ul class="timeline">' + G.alternatives.map(function (a, i) {
        return '<li class="row"><div class="row-line"><span class="time">方案 ' + (i + 1) + '</span>' +
          '<span class="ico">' + (i === 0 ? '🌧' : i === 1 ? '😮‍💨' : '➕') + '</span>' +
          '<div class="txt"><div class="tt">' + esc(a.case) + '</div><div class="nt">' + esc(a.plan) + '</div></div></div></li>';
      }).join('') + '</ul>' : '') +
      ((G.rainTransit || []).length ? '<details class="acc"><summary>雨天段间交通<span class="hint" style="margin-left:auto;margin-right:8px">' +
        G.rainTransit.length + ' 段</span></summary><div class="acc-body"><ol class="olist">' +
        G.rainTransit.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ol></div></details>' : '') +
      '</article>';

    $('#dayPanels').innerHTML = html;
  }

  function buildIntro() {
    var body = $('#introBody');
    var list = G.itineraryIntro || [];
    body.innerHTML = list.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') ||
      '<p>每天按时间顺序列节点，点一行展开备选门店 / 复制地名 / 苹果地图；右侧 ↗ 直接开高德。</p>';
  }

  /* =========================================================
     渲染 · 动图
     ========================================================= */
  var ROUTES = [
    { id: 'd1', label: 'D1', sub: '11/12' },
    { id: 'd2', label: 'D2', sub: '11/13' },
    { id: 'd3', label: 'D3', sub: '11/14' },
    { id: 'd4', label: 'D4', sub: '11/15' },
    { id: 'all', label: '全览', sub: '四天' },
    { id: 'rain', label: '雨天', sub: '备选' }
  ];

  function routeMeta(id) {
    if (id === 'all') return { title: '四天总览', desc: '四天路线叠在一张图上，先看整体再看每天' };
    if (id === 'rain') return { title: '雨天备选路线', desc: '下雨天改走室内线：省博 → 湖北美术馆 → 楚河汉街' };
    var d = G.days.filter(function (x) { return x.id.toLowerCase() === id; })[0];
    if (!d) return { title: id, desc: '' };
    return { title: d.id + ' · ' + d.date + ' ' + d.weekday, desc: d.title };
  }

  function buildRoute() {
    $('#daybarRoute').innerHTML = ROUTES.map(function (r) {
      return '<button class="dchip" data-rday="' + r.id + '" aria-selected="false">' +
        '<b>' + esc(r.label) + '</b><i>' + esc(r.sub) + '</i></button>';
    }).join('');
    renderRouteCard();
  }

  function renderRouteCard() {
    var id = state.route;
    var meta = routeMeta(id);
    var posterKey = 'poster/' + id + '.jpg';
    var isAll = id === 'all';
    var extra = isAll
      ? '<div class="vcard overview"><img src="' + esc(asset('img/overview.jpg')) + '" alt="四天路线总览" loading="lazy"></div>'
      : '';

    $('#routeBody').innerHTML =
      '<div class="vcard">' +
        '<div class="vwrap">' +
          '<video poster="' + esc(asset(posterKey)) + '" preload="none" playsinline webkit-playsinline muted controlslist="nodownload" disablepictureinpicture></video>' +
          '<button class="vplay" data-play="' + id + '"><span class="pico">▶</span><span>播放路线动图 · 约 10 秒</span></button>' +
        '</div>' +
        '<div class="vmeta"><b>' + esc(meta.title) + '</b><br>' + esc(meta.desc) + '</div>' +
        '<div class="vacts">' +
          // 离线单文件里视频是内嵌的，下载链接指向不存在的文件，索性不显示
          (window.__OFFLINE__
            ? ''
            : '<a class="btn" href="' + esc(asset('mp4/' + id + '.mp4')) + '" download="武汉路线-' + id + '.mp4">保存视频</a>' +
              '<a class="btn" href="' + esc(asset('gif/' + id + '.gif')) + '" download="武汉路线-' + id + '.gif">保存原动图 GIF</a>') +
        '</div>' +
      '</div>' + extra +
      '<p class="hint" style="margin:12px 16px 20px">动图里每段都标了「地铁 2 号线 / 步行 / 轮渡」和耗时；看不清就横屏或双指放大（视频已在本地，不耗流量）。</p>';
  }

  /* =========================================================
     渲染 · 吃
     ========================================================= */
  function scoreBadge(it) {
    var s = it.score || 0;
    var extraTxt = String(it.note || '').replace(/^\s*\d\s*\/\s*5\s*/, '').trim();
    return '<span class="score' + (s >= 5 ? ' s5' : '') + '">' + s + '/5</span>' +
      (extraTxt ? '<span class="hint">' + esc(extraTxt) + '</span>' : '');
  }

  function buildEat() {
    var h = '';

    // 到店场景
    if ((G.mealSlots || []).length) {
      h += '<div class="sec-title">到了这一天，去哪家店吃</div>';
      h += G.mealSlots.map(function (s) {
        return '<div class="card scene">' +
          '<div class="sc-h">' + esc(s.scene) + '</div>' +
          '<div class="sc-first">' + esc(s.first) + '</div>' +
          (s.alternatives && s.alternatives.length
            ? '<div class="sc-sub">备选（点一下复制）</div><div class="chips" style="margin-top:5px">' +
              s.alternatives.map(function (a) {
                return '<button class="chip" data-copy="' + esc(a) + '">' + esc(a) + '</button>';
              }).join('') + '</div>'
            : '') +
          (s.tip ? '<div class="sc-tip">' + esc(s.tip) + '</div>' : '') +
          '<div class="acts" style="margin-top:10px">' +
            '<a class="mini pri" href="' + esc(amap(s.first)) + '" target="_blank" rel="noopener">↗ 高德搜首选</a>' +
            '<button class="mini" data-copy="' + esc(s.first) + '">复制店名</button>' +
          '</div></div>';
      }).join('');
    }

    // 必吃榜
    if ((G.food || []).length) {
      h += '<div class="sec-title">必吃榜 · ' + G.food.length + ' 样（按共识分排序）</div><div class="card">';
      h += G.food.slice().sort(function (a, b) { return (b.score || 0) - (a.score || 0); }).map(function (f) {
        return '<div class="item"><div class="item-h"><span class="nm">' + esc(f.name) + '</span>' + scoreBadge(f) + '</div>' +
          (f.where ? '<div class="item-b"><span class="lbl">哪家：</span>' + esc(f.where) + '</div>' : '') +
          (f.tip ? '<div class="item-b"><span class="lbl">怎么吃：</span>' + esc(f.tip) + '</div>' : '') +
          '</div>';
      }).join('');
      h += '</div>';
    }
    if ((G.foodFooter || []).length) {
      h += '<div class="card">' + G.foodFooter.map(function (t) {
        return '<p class="muted" style="margin:6px 0;line-height:1.65">' + esc(t) + '</p>';
      }).join('') + '</div>';
    }

    // 垫一口（机场）
    if ((G.airportSnack || []).length) {
      h += '<div class="sec-title">落地先垫一口（天河机场 T3）</div><div class="card">';
      h += G.airportSnack.map(function (s) {
        return '<div class="item"><div class="item-h"><span class="nm">' + esc(s.tier) + '</span></div>' +
          (s.where ? '<div class="item-b"><span class="lbl">在哪：</span>' + esc(s.where) + '</div>' : '') +
          (s.shops ? '<div class="item-b"><span class="lbl">店：</span>' + esc(s.shops) + '</div>' : '') +
          (s.time || s.cost ? '<div class="item-b"><span class="lbl">' +
            [s.time, s.cost].filter(Boolean).map(esc).join(' · ') + '</span></div>' : '') +
          '</div>';
      }).join('');
      if ((G.snackNotes || []).length) {
        h += G.snackNotes.map(function (t) {
          return '<p class="muted" style="margin:8px 0;line-height:1.6">' + esc(t) + '</p>';
        }).join('');
      }
      h += '</div>';
    }
    $('#eatBody').innerHTML = h + '<div style="height:14px"></div>';
  }

  /* =========================================================
     渲染 · 速查
     ========================================================= */
  function shopHtml(s) {
    return '<div class="shop"><div class="su">' + esc(s.use) + '</div><div class="sn">' +
      '<div class="snm">' + esc(s.name) + '</div>' +
      (s.area || s.hint ? '<div class="sar">' + [s.area, s.hint].filter(Boolean).map(esc).join(' · ') + '</div>' : '') +
      '<div class="sacts">' +
        '<a class="mini pri" href="' + esc(amap(s.name)) + '" target="_blank" rel="noopener">↗ 高德</a>' +
        '<a class="mini" href="' + esc(apple(s.name)) + '" target="_blank" rel="noopener">苹果地图</a>' +
        '<button class="mini" data-copy="' + esc(s.name) + '">复制店名</button>' +
      '</div></div></div>';
  }

  function renderShops() {
    var q = state.q.trim().toLowerCase();
    var list = (G.shops || []).filter(function (s) {
      if (!q) return true;
      return (s.name + ' ' + s.use + ' ' + (s.area || '') + ' ' + (s.hint || '')).toLowerCase().indexOf(q) >= 0;
    });
    $('#shopsBody').innerHTML = list.length
      ? '<div class="card">' + list.map(shopHtml).join('') + '</div><div style="height:14px"></div>'
      : '<div class="empty">没找到「' + esc(state.q) + '」<br><span class="hint">试试「湖锦」「过早」「江汉路」</span></div>';
  }

  /* =========================================================
     渲染 · 准备
     ========================================================= */
  function acc(title, count, inner, open) {
    return '<details class="acc"' + (open ? ' open' : '') + '><summary>' + esc(title) +
      (count != null ? '<span class="hint" style="margin-left:auto;margin-right:8px">' + count + '</span>' : '') +
      '</summary><div class="acc-body">' + inner + '</div></details>';
  }

  function buildPrep() {
    var h = '';

    // 一页看懂
    if ((G.onePage || []).length) {
      h += acc('一页看懂', G.onePage.length, G.onePage.map(function (t) {
        return '<p>' + esc(t) + '</p>';
      }).join(''), true);
    }

    // 预约 + 闹钟
    if ((G.bookings || []).length || (G.alarms || []).length) {
      var inner = '';
      if ((G.bookings || []).length) {
        inner += '<div class="sec-title" style="margin:0 0 6px">要提前预约 / 买票（' + G.bookings.length + ' 项）</div>';
        inner += G.bookings.map(function (b) {
          return '<div class="item"><div class="item-h"><span class="nm">' + esc(b.what) + '</span></div>' +
            '<div class="item-b"><span class="lbl">参观：</span>' + esc(b.visitDay) + '　<span class="lbl">最早可约：</span>' + esc(b.earliest) + '</div>' +
            (b.time ? '<div class="item-b"><span class="lbl">放票：</span>' + esc(b.time) + '</div>' : '') +
            (b.channel ? '<div class="item-b"><span class="lbl">渠道：</span>' + esc(b.channel) + '</div>' : '') +
            '</div>';
        }).join('');
      }
      if ((G.alarms || []).length) {
        inner += '<div class="sec-title" style="margin:14px 0 6px">闹钟（' + G.alarms.length + ' 条）</div>';
        inner += '<ul class="olist">' + G.alarms.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>';
      }
      h += acc('预约 · 买票 · 闹钟', (G.bookings || []).length + (G.alarms || []).length, inner, true);
    }

    // 必去榜
    if ((G.mustSee || []).length) {
      var seen = G.mustSee.slice().sort(function (a, b) { return (b.score || 0) - (a.score || 0); });
      h += acc('必去榜', seen.length, seen.map(function (m) {
        return '<div class="item"><div class="item-h"><span class="nm">' + esc(m.name) + '</span>' + scoreBadge(m) + '</div>' +
          (m.detail ? '<div class="item-b">' + esc(m.detail) + '</div>' : '') +
          '<div class="acts" style="margin-top:8px">' +
            '<a class="mini pri" href="' + esc(amap(m.name)) + '" target="_blank" rel="noopener">↗ 高德</a>' +
          '</div></div>';
      }).join(''));
    }

    // 避坑
    if ((G.pitfalls || []).length) {
      h += acc('避坑清单', G.pitfalls.length, G.pitfalls.map(function (p) {
        return '<div class="pit"><div class="n">' + esc(p.n) + '</div><div class="pb">' +
          '<div class="pw">✗ ' + esc(p.wrong) + '</div>' +
          '<div class="pr">✓ ' + esc(p.right) + '</div></div></div>';
      }).join(''));
    }

    // 穿什么 + 带什么药
    if ((G.clothing || []).length || (G.meds || []).length) {
      var inner2 = '';
      if ((G.clothing || []).length) {
        inner2 += '<div class="sec-title" style="margin:0 0 6px">穿什么</div><ul class="olist">' +
          G.clothing.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
      }
      if ((G.meds || []).length) {
        inner2 += '<div class="sec-title" style="margin:14px 0 6px">带什么药</div><ul class="olist">' +
          G.meds.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
      }
      h += acc('穿衣 · 药品', (G.clothing || []).length + (G.meds || []).length, inner2);
    }

    // 住宿
    if ((G.hotels || []).length) {
      var inner3 = G.hotels.map(function (x) {
        return '<div class="item"><div class="item-h"><span class="nm">' + esc(x.name) + '</span>' +
          '<span class="hint">' + esc(x.tier) + '</span></div>' +
          '<div class="item-b"><span class="lbl">地址：</span>' + esc(x.address) +
          '　<span class="lbl">离地铁：</span>' + esc(x.metro) +
          (x.score ? '　<span class="lbl">评分：</span>' + esc(x.score) : '') + '</div>' +
          (x.tip ? '<div class="item-b">' + esc(x.tip) + '</div>' : '') +
          '<div class="acts" style="margin-top:8px"><a class="mini pri" href="' + esc(amap(x.name)) + '" target="_blank" rel="noopener">↗ 高德</a>' +
          '<button class="mini" data-copy="' + esc(x.name) + '">复制店名</button></div></div>';
      }).join('');
      if ((G.hotelNotes || []).length) {
        inner3 += G.hotelNotes.map(function (t) { return '<p class="muted" style="margin:9px 0;line-height:1.65">' + esc(t) + '</p>'; }).join('');
      }
      h += acc('住哪三家 · 订房要点', G.hotels.length, inner3);
    }

    // 预算
    if ((G.budget || []).length) {
      var inner4 = G.budget.map(function (b, i) {
        var last = i === G.budget.length - 1;
        return '<div class="item" style="display:flex;justify-content:space-between;gap:12px' + (last ? ';' : '') + '">' +
          '<span style="' + (last ? 'font-weight:700' : 'font-size:14px') + '">' + esc(b.item) + '</span>' +
          '<span style="flex:none;font-weight:' + (last ? '700' : '400') + ';font-variant-numeric:tabular-nums">' + esc(b.amount) + '</span></div>';
      }).join('');
      h += acc('预算', G.budget.length, inner4);
    }

    // 突发情况
    if ((G.alternatives || []).length) {
      var inner5 = '<ul class="olist">' + G.alternatives.map(function (a) {
        return '<li><b>' + esc(a.case) + '</b>：' + esc(a.plan) + '</li>';
      }).join('') + '</ul>';
      if ((G.rainTransit || []).length) {
        inner5 += '<div class="sec-title" style="margin:12px 0 6px">雨天怎么走</div><ul class="olist">' +
          G.rainTransit.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
      }
      h += acc('下雨 / 累了 / 想加点 · 换方案', G.alternatives.length, inner5);
    }

    h += '<p class="hint" style="margin:16px 16px 24px;line-height:1.6">资料来源：' +
      esc(G.meta.source) + '<br>生成于 ' + esc((G.meta.builtAt || '').slice(0, 10)) +
      ' · 价格/营业时间以当日为准</p>';

    $('#prepBody').innerHTML = h;
  }

  /* =========================================================
     状态与切换
     ========================================================= */
  var state = { page: 'plan', day: 'D1', route: 'd1', q: '' };
  var inited = { route: false, eat: false, shops: false, prep: false };

  function setPage(p, opts) {
    if (!p) p = 'plan';
    state.page = p;
    $$('.page').forEach(function (s) { s.hidden = s.id !== 'page-' + p; });
    $$('.tab').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.page === p)); });
    $('#daybar').hidden = p !== 'plan';

    if (p === 'route' && !inited.route) { buildRoute(); inited.route = true; }
    if (p === 'eat' && !inited.eat) { buildEat(); inited.eat = true; }
    if (p === 'shops' && !inited.shops) { renderShops(); inited.shops = true; }
    if (p === 'prep' && !inited.prep) { buildPrep(); inited.prep = true; }

    if (!opts || !opts.noScroll) window.scrollTo(0, 0);
    if (!opts || !opts.noHash) writeHash();
  }

  function setDay(id, opts) {
    if (id === 'rain') id = 'RAIN';
    if (!G.days.some(function (d) { return d.id === id; }) && id !== 'RAIN') id = 'D1';
    state.day = id;
    $$('#daybarPlan .dchip').forEach(function (b) {
      b.setAttribute('aria-selected', String(b.dataset.day === id));
      if (b.dataset.day === id) {
        var bar = $('#daybarPlan');
        var left = b.offsetLeft - (bar.clientWidth - b.offsetWidth) / 2;
        if (left > 0) bar.scrollTo({ left: left, behavior: 'smooth' });
      }
    });
    $$('.day-panel').forEach(function (p) { p.hidden = p.dataset.day !== id; });
    if (!opts || !opts.noScroll) window.scrollTo(0, 0);
    if (!opts || !opts.noHash) writeHash();
  }

  function setRoute(id, opts) {
    if (!ROUTES.some(function (r) { return r.id === id; })) id = 'd1';
    state.route = id;
    if (!inited.route) { buildRoute(); inited.route = true; }
    else renderRouteCard();
    $$('#daybarRoute .dchip').forEach(function (b) {
      b.setAttribute('aria-selected', String(b.dataset.rday === id));
    });
    if (!opts || !opts.noScroll) window.scrollTo(0, 0);
    if (!opts || !opts.noHash) writeHash();
  }

  function writeHash() {
    var h;
    if (state.page === 'plan') h = state.day === 'RAIN' ? 'rain' : state.day.toLowerCase();
    else if (state.page === 'route') h = 'route-' + state.route;
    else h = state.page;
    try { history.replaceState(null, '', '#' + h); } catch (e) { }
  }

  function applyHash() {
    var h = (location.hash || '').replace(/^#/, '').toLowerCase();
    if (!h) { setPage('plan', { noHash: true }); setDay(todayDay() || 'D1', { noHash: true }); return; }
    if (h === 'rain') { setPage('plan', { noHash: true }); setDay('RAIN', { noHash: true }); return; }
    if (/^d[1-4]$/.test(h)) { setPage('plan', { noHash: true }); setDay(h.toUpperCase(), { noHash: true }); return; }
    if (h.indexOf('route') === 0) {
      setPage('route', { noHash: true });
      var r = h.split('-')[1];
      setRoute(r || 'd1', { noHash: true });
      return;
    }
    if (['eat', 'shops', 'prep'].indexOf(h) >= 0) { setPage(h, { noHash: true }); return; }
    setPage('plan', { noHash: true });
    setDay(todayDay() || 'D1', { noHash: true });
  }

  /* =========================================================
     日期：今天 / 距出发
     ========================================================= */
  var TRIP = { y: 2026, m: 11, d: 12, days: 4 };

  function tripDayIndex(now) {
    if (now.getFullYear() !== TRIP.y) return -1;
    if (now.getMonth() + 1 !== TRIP.m) return -1;
    var dd = now.getDate();
    return (dd >= TRIP.d && dd < TRIP.d + TRIP.days) ? dd - TRIP.d : -1;
  }
  function todayDay() {
    var i = tripDayIndex(new Date());
    return i >= 0 ? 'D' + (i + 1) : null;
  }

  function initToday() {
    var now = new Date();
    var idx = tripDayIndex(now);
    var sub = $('#tbSub');
    var base = '2026.11.12—11.15';

    if (idx >= 0) {
      sub.textContent = base + ' · 今天 D' + (idx + 1);
      $('#todayBtn').hidden = false;
      // 高亮当前时间所在行
      var panel = $('.day-panel[data-day="D' + (idx + 1) + '"]');
      if (panel) {
        var nowMin = now.getHours() * 60 + now.getMinutes();
        var best = null;
        $$('.row', panel).forEach(function (li) {
          var a = +li.dataset.t, b = +li.dataset.te;
          if (isNaN(a)) return;
          if (nowMin >= a && nowMin < b) best = li;
          else if (best === null && nowMin >= a) best = li;
        });
        if (best) best.classList.add('now');
      }
    } else {
      var start = new Date(TRIP.y, TRIP.m - 1, TRIP.d);
      var diff = Math.ceil((start - now) / 86400000);
      sub.textContent = base + (diff > 0 ? ' · 距出发 ' + diff + ' 天' : ' · 行程已结束');
      $('#todayBtn').hidden = true;
    }
  }

  /* =========================================================
     交互
     ========================================================= */
  function toggleRow(line) {
    var li = line.parentNode;
    var d = $('.row-detail', li);
    if (!d) return;
    var open = d.hidden;
    d.hidden = !open;
    li.classList.toggle('open', open);
  }

  function playVideo(btn) {
    var wrap = btn.parentNode;
    var v = $('video', wrap);
    if (!v) return;
    var id = btn.dataset.play;
    if (!v.getAttribute('src')) v.setAttribute('src', videoSrc('mp4/' + id + '.mp4'));
    v.muted = true;
    v.setAttribute('playsinline', '');
    var p = v.play();
    if (p && p.catch) p.catch(function () { toast('这个视频播放不了，可以点下面「保存视频」'); });
    btn.hidden = true;
    v.addEventListener('pause', function () {
      if (v.ended) btn.hidden = false;
    });
    v.addEventListener('ended', function () { btn.hidden = false; });
  }

  document.addEventListener('click', function (e) {
    var t = e.target;

    var go = t.closest && t.closest('a.go');
    if (go) return; // 让链接自己跳

    var tab = t.closest && t.closest('.tab');
    if (tab) { setPage(tab.dataset.page); return; }

    var dc = t.closest && t.closest('[data-day]');
    if (dc && dc.classList.contains('dchip')) { setDay(dc.dataset.day); return; }

    var rc = t.closest && t.closest('[data-rday]');
    if (rc) { setRoute(rc.dataset.rday); return; }

    if (t.id === 'todayBtn' || (t.closest && t.closest('#todayBtn'))) {
      var d = todayDay() || 'D1';
      setPage('plan');
      setDay(d);
      return;
    }

    var cp = t.closest && t.closest('[data-copy]');
    if (cp) { e.preventDefault(); copyText(cp.dataset.copy); return; }

    var pl = t.closest && t.closest('[data-play]');
    if (pl) { playVideo(pl); return; }

    var line = t.closest && t.closest('.row-line[data-toggle]');
    if (line) { toggleRow(line); return; }
  });

  // 搜索
  document.addEventListener('input', function (e) {
    if (e.target.id !== 'shopSearch') return;
    state.q = e.target.value;
    renderShops();
  });

  // 左右滑动切天
  (function () {
    var sx = 0, sy = 0, on = false, moved = false;
    var main = $('#main');
    var IGNORE = '.daybar, .searchwrap, video, #shopSearch';

    main.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) { on = false; return; }
      if (e.target.closest(IGNORE)) { on = false; return; }
      sx = e.touches[0].clientX; sy = e.touches[0].clientY;
      on = true; moved = false;
    }, { passive: true });

    main.addEventListener('touchmove', function (e) {
      if (!on || e.touches.length !== 1) return;
      if (Math.abs(e.touches[0].clientX - sx) > 12) moved = true;
    }, { passive: true });

    main.addEventListener('touchend', function (e) {
      if (!on) return;
      on = false;
      if (state.page !== 'plan') return;
      var t = e.changedTouches[0];
      var dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) < 62 || Math.abs(dx) < Math.abs(dy) * 1.7) return;
      var order = G.days.map(function (d) { return d.id; }).concat(['RAIN']);
      var i = order.indexOf(state.day);
      if (i < 0) i = 0;
      var ni = dx < 0 ? i + 1 : i - 1;
      if (ni < 0 || ni >= order.length) return;
      setDay(order[ni]);
    }, { passive: true });
  })();

  window.addEventListener('hashchange', function () {
    var h = (location.hash || '').replace(/^#/, '').toLowerCase();
    if (h === 'rain' || /^d[1-4]$/.test(h) || ['eat', 'shops', 'prep'].indexOf(h) >= 0 || h.indexOf('route') === 0) applyHash();
  });

  /* =========================================================
     启动
     ========================================================= */
  buildDaybar();
  buildDays();
  buildIntro();
  initToday();
  applyHash();

  window.__APP__ = { setPage: setPage, setDay: setDay, setRoute: setRoute, state: state };

  /* =========================================================
     Service Worker（GitHub Pages 上才生效）
     局域网 http://192.168.x.x 属非安全上下文，注册会直接报错，先判断再注册。
     ========================================================= */
  var secure = location.protocol === 'https:' ||
               location.hostname === 'localhost' ||
               location.hostname === '127.0.0.1';
  if (secure && !window.__OFFLINE__ && 'serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* 失败不影响使用 */ });
    });
  }
})();
