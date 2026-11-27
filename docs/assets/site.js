/* Route Drawer — сайт. Язык, демо в окне Photoshop, схемы алгоритма, копирование суммы.
   Геометрия (сглаживание, линия, стрелки) — настоящий код из RouteDrawer.jsx, см. geometry.js. */
(function () {
  'use strict';

  var RD = window.RD;
  var doc = document, root = doc.documentElement;
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ================= язык ================= */
  var STR = {
    ru: {
      title: 'Route Drawer — маршрут по контуру для Photoshop: скрипт и установщик',
      desc: 'Бесплатный скрипт для Photoshop: точки Пером по дорогам — и готова красная линия маршрута со стрелками. Установщик для Windows, русский и английский языки.',
      points: 'Точек', copy: 'Копировать', copied: 'Скопировано', canvas: 'Карта. Кликайте по дорогам, чтобы поставить точки контура.',
      status: ['Точек: ', ''], drawnMsg: 'Маршрут нарисован', clearedMsg: 'Контур очищен'
    },
    en: {
      title: 'Route Drawer — route lines with arrows for Photoshop: script and installer',
      desc: 'Free Photoshop script: click points along the roads with the Pen tool and get a smooth red route line with direction arrows. Windows installer, Russian and English.',
      points: 'Points', copy: 'Copy', copied: 'Copied', canvas: 'Map. Click along the roads to place path points.',
      status: ['Points: ', ''], drawnMsg: 'Route drawn', clearedMsg: 'Path cleared'
    }
  };
  function lang() { return root.getAttribute('lang') === 'en' ? 'en' : 'ru'; }

  function setMeta(sel, attr, val) { var m = doc.querySelector(sel); if (m) m.setAttribute(attr, val); }
  function applyLang(l, save) {
    root.setAttribute('lang', l);
    var s = STR[l];
    doc.title = s.title;
    setMeta('meta[name="description"]', 'content', s.desc);
    setMeta('meta[property="og:title"]', 'content', s.title);
    setMeta('meta[property="og:description"]', 'content', s.desc);
    setMeta('meta[name="twitter:title"]', 'content', s.title);
    setMeta('meta[name="twitter:description"]', 'content', s.desc);
    setMeta('meta[property="og:locale"]', 'content', l === 'en' ? 'en_US' : 'ru_RU');
    var btns = doc.querySelectorAll('.lang button');
    for (var i = 0; i < btns.length; i++) btns[i].setAttribute('aria-pressed', btns[i].getAttribute('data-l') === l ? 'true' : 'false');
    // атрибуты с переводом (aria-label, alt, title): data-ru-<имя> / data-en-<имя>, список имён в data-i18n
    var els = doc.querySelectorAll('[data-i18n]');
    for (var j = 0; j < els.length; j++) {
      var names = els[j].getAttribute('data-i18n').split(' ');
      for (var q = 0; q < names.length; q++) {
        var v = els[j].getAttribute('data-' + l + '-' + names[q]);
        if (v !== null) els[j].setAttribute(names[q], v);
      }
    }
    if (save) {
      try { localStorage.setItem('rd-lang', l); } catch (e) {}
      try {
        var u = new URL(location.href);
        if (l === 'en') u.searchParams.set('lang', 'en'); else u.searchParams.delete('lang');
        history.replaceState(null, '', u.toString());
      } catch (e2) {}
    }
    doc.dispatchEvent(new CustomEvent('rd-lang'));
  }
  (function initLang() {
    var btns = doc.querySelectorAll('.lang button');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () { applyLang(this.getAttribute('data-l'), true); });
    }
    applyLang(lang(), false);
  })();

  /* ================= копирование суммы ================= */
  (function initCopy() {
    var b = doc.querySelector('[data-copy]');
    if (!b) return;
    var target = doc.querySelector(b.getAttribute('data-copy'));
    b.addEventListener('click', function () {
      var text = target.textContent.trim();
      function done() {
        b.classList.add('done');
        var lab = b.querySelector('.copy-t');
        if (lab) lab.textContent = STR[lang()].copied;
        setTimeout(function () { b.classList.remove('done'); if (lab) lab.textContent = STR[lang()].copy; }, 1800);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, fallback);
      } else fallback();
      function fallback() {
        try {
          var r = doc.createRange(); r.selectNodeContents(target);
          var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
          doc.execCommand('copy'); sel.removeAllRanges(); done();
        } catch (e) {}
      }
    });
    doc.addEventListener('rd-lang', function () {
      var lab = b.querySelector('.copy-t'); if (lab && !b.classList.contains('done')) lab.textContent = STR[lang()].copy;
    });
  })();

  if (!RD) return;   // без геометрии демо и схемы не рисуем — остальная страница работает

  /* ================= общие помощники ================= */
  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  function corner(p) { var q = { x: p[0], y: p[1] }; return { a: q, l: q, r: q, lz: true, rz: true }; }
  function polyPath(c, poly) {
    c.beginPath();
    c.moveTo(poly[0][0], poly[0][1]);
    for (var i = 1; i < poly.length; i++) c.lineTo(poly[i][0], poly[i][1]);
    c.closePath();
  }
  function fillPolys(c, polys, color) {
    c.fillStyle = color;
    for (var i = 0; i < polys.length; i++) { polyPath(c, polys[i]); c.fill(); }   // каждый многоугольник отдельно: пересечения не «вычитаются»
  }
  function strokePolys(c, polys) { for (var i = 0; i < polys.length; i++) { polyPath(c, polys[i]); c.stroke(); } }
  function route(pts, cfg) {
    if (pts.length < 2) return null;
    var r = RD.flattenAnchors(pts.map(corner), false);
    if (r.poly.length < 2) return null;
    var sm = RD.smoothPoly(r.poly, r.flags, cfg);
    var g = RD.buildGeometry([r], cfg);
    var len = 0, i;
    for (i = 1; i < sm.pts.length; i++) len += Math.hypot(sm.pts[i].x - sm.pts[i - 1].x, sm.pts[i].y - sm.pts[i - 1].y);
    return { g: g, sm: sm.pts, len: len, raw: r.poly };
  }
  function paintLayers(lc, ac, R, cfg) {
    lc.clearRect(-50, -50, 1200, 800); ac.clearRect(-50, -50, 1200, 800);
    if (!R) return;
    fillPolys(lc, R.g.line, cfg.color);
    if (cfg.arrows) {
      if (cfg.outline) fillPolys(ac, R.g.halos, '#ffffff');
      fillPolys(ac, R.g.arrows, cfg.color);
    }
  }
  function bez(p0, p1, p2, p3, t) {
    var m = 1 - t;
    return [m * m * m * p0[0] + 3 * m * m * t * p1[0] + 3 * m * t * t * p2[0] + t * t * t * p3[0],
            m * m * m * p0[1] + 3 * m * m * t * p1[1] + 3 * m * t * t * p2[1] + t * t * t * p3[1]];
  }
  function sleep(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }
  function ease(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function canvasSize(cv, W, H) {
    var r = cv.getBoundingClientRect();
    var cssW = Math.max(1, r.width), cssH = cssW * H / W;
    cv.width = Math.round(cssW * DPR); cv.height = Math.round(cssH * DPR);
    return { cssW: cssW, cssH: cssH, k: cssW / W };
  }

  /* ================= карта для демо ================= */
  var MAP_W = 1000, MAP_H = 620;
  var V = [110, 290, 480, 680, 880], H = [100, 250, 400, 540];
  var CURVE1 = [[480, 250], [580, 250], [680, 190], [680, 100]];
  var CURVE2 = [[680, 540], [780, 540], [880, 500], [880, 400]];
  function drawMap(c) {
    c.fillStyle = '#1f2329'; c.fillRect(0, 0, MAP_W, MAP_H);
    var xs = [0].concat(V, [MAP_W]), ys = [0].concat(H, [MAP_H]), i, j;
    for (i = 0; i < xs.length - 1; i++) for (j = 0; j < ys.length - 1; j++) {
      var x0 = xs[i] + 9, y0 = ys[j] + 9, w = xs[i + 1] - xs[i] - 18, h = ys[j + 1] - ys[j] - 18;
      var park = (i === 2 && j === 3) || (i === 4 && j === 1), water = (i === 5 && j === 4);
      c.fillStyle = water ? '#1b2b3a' : park ? '#22302a' : ((i + j) % 2 ? '#262b32' : '#242930');
      c.beginPath();
      if (c.roundRect) c.roundRect(x0, y0, w, h, 7); else c.rect(x0, y0, w, h);
      c.fill();
    }
    // пруд в парке
    c.fillStyle = '#1d3040'; c.beginPath(); c.ellipse(580, 470, 62, 34, -0.2, 0, Math.PI * 2); c.fill();
    // здания: мелкие тёмные прямоугольники в нескольких кварталах
    c.fillStyle = 'rgba(0,0,0,.16)';
    [[130, 120, 70, 40], [210, 160, 56, 70], [310, 120, 90, 50], [330, 270, 80, 56], [140, 270, 90, 90], [500, 120, 60, 60], [500, 280, 90, 70], [700, 120, 70, 90], [720, 270, 110, 90],
     [900, 120, 60, 80], [130, 420, 100, 80], [310, 420, 120, 90], [500, 420, 40, 90], [700, 420, 60, 90]].forEach(function (b) { c.fillRect(b[0], b[1], b[2], b[3]); });
    // дороги
    c.lineCap = 'butt'; c.lineJoin = 'round';
    function roads(w, col) {
      c.strokeStyle = col; c.lineWidth = w;
      c.beginPath();
      V.forEach(function (x) { c.moveTo(x, -2); c.lineTo(x, MAP_H + 2); });
      H.forEach(function (y) { c.moveTo(-2, y); c.lineTo(MAP_W + 2, y); });
      [CURVE1, CURVE2].forEach(function (q) { c.moveTo(q[0][0], q[0][1]); c.bezierCurveTo(q[1][0], q[1][1], q[2][0], q[2][1], q[3][0], q[3][1]); });
      c.stroke();
    }
    roads(20, '#39404a');
    c.setLineDash([9, 11]); roads(1.4, '#4c5461'); c.setLineDash([]);
  }
  var SAMPLE = (function () {
    var pts = [[110, 540], [110, 400], [290, 400], [290, 250], [480, 250]];
    [0.2, 0.42, 0.65, 0.86].forEach(function (t) { var p = bez(CURVE1[0], CURVE1[1], CURVE1[2], CURVE1[3], t); pts.push([Math.round(p[0]), Math.round(p[1])]); });
    pts.push([680, 100], [880, 100], [880, 400]);
    return pts;
  })();

  /* ================= демо в окне Photoshop ================= */
  function Demo(box) {
    var cv = box.querySelector('canvas'), ctx = cv.getContext('2d');
    var hint = box.querySelector('#demo-hint'), count = box.querySelector('#demo-count');
    var btnDraw = box.querySelector('[data-a="draw"]'), btnUndo = box.querySelector('[data-a="undo"]'),
        btnClear = box.querySelector('[data-a="clear"]'), btnEx = box.querySelector('[data-a="example"]');
    var rows = { arrows: box.querySelector('[data-layer="arrows"]'), line: box.querySelector('[data-layer="line"]'), bg: box.querySelector('[data-layer="bg"]') };
    var mapC = doc.createElement('canvas'), lineC = doc.createElement('canvas'), arrC = doc.createElement('canvas'), tmpC = doc.createElement('canvas');
    var mapX = mapC.getContext('2d'), lineX = lineC.getContext('2d'), arrX = arrC.getContext('2d'), tmpX = tmpC.getContext('2d');
    var S = { k: 1, cssW: 700 }, boost = 1;
    var cfg = { color: '#E5191C', lineW: 5, smooth: 6, corner: 2.5, sharp: 45, arrows: true, startArrow: true, outline: true,
                arrowLen: 18, minTurn: 30, afterTurn: 36, maxGap: 260, minGap: 70 };
    var pts = [], drawn = false, R = null, reveal = 1, vis = { bg: true, line: true, arrows: true }, token = 0, raf = 0, pending = false;
    var live = box.querySelector('#demo-live');

    function setup() {
      S = canvasSize(cv, MAP_W, MAP_H);
      boost = Math.min(2.2, Math.max(1, 700 / S.cssW));   // на узком экране линия и стрелки крупнее, чтобы их было видно
      [mapC, lineC, arrC, tmpC].forEach(function (c) { c.width = cv.width; c.height = cv.height; });
      [mapX, lineX, arrX, tmpX].forEach(function (x) { x.setTransform(DPR * S.k, 0, 0, DPR * S.k, 0, 0); });
      drawMap(mapX);
      repaint();
    }
    function eff() {
      var e = {}, k;
      for (k in cfg) e[k] = cfg[k];
      ['lineW', 'smooth', 'corner', 'arrowLen', 'afterTurn', 'maxGap', 'minGap'].forEach(function (q) { e[q] = cfg[q] * boost; });
      return e;
    }
    function repaint() {
      R = drawn ? route(pts, eff()) : null;
      paintLayers(lineX, arrX, R, cfg);
      render();
    }
    function render() {
      var w = cv.width, h = cv.height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (vis.bg) ctx.drawImage(mapC, 0, 0);
      if (R && drawn) {
        var src = tmpC;
        tmpX.save(); tmpX.setTransform(1, 0, 0, 1, 0, 0); tmpX.clearRect(0, 0, w, h);
        tmpX.shadowColor = 'rgba(0,0,0,.5)'; tmpX.shadowBlur = 5 * DPR; tmpX.shadowOffsetY = 2 * DPR;
        if (vis.line) tmpX.drawImage(lineC, 0, 0);
        tmpX.shadowColor = 'transparent';
        if (vis.arrows) tmpX.drawImage(arrC, 0, 0);
        if (reveal < 1) {
          tmpX.globalCompositeOperation = 'destination-in';
          tmpX.setTransform(DPR * S.k, 0, 0, DPR * S.k, 0, 0);
          tmpX.strokeStyle = '#000'; tmpX.lineWidth = 120; tmpX.lineCap = 'butt'; tmpX.lineJoin = 'round';
          var a = R.sm[0], b = R.sm[1], dx = a.x - b.x, dy = a.y - b.y, dl = Math.hypot(dx, dy) || 1, ext = 14;
          tmpX.setLineDash([(R.len + ext) * reveal, R.len * 4 + 1000]);
          tmpX.beginPath(); tmpX.moveTo(a.x + dx / dl * ext, a.y + dy / dl * ext);
          for (var i = 0; i < R.sm.length; i++) tmpX.lineTo(R.sm[i].x, R.sm[i].y);
          tmpX.stroke();
        }
        tmpX.restore();
        ctx.drawImage(src, 0, 0);
      }
      overlay();
    }
    function overlay() {
      if (!pts.length) return;
      var k = S.k * DPR, i;
      ctx.save(); ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.globalAlpha = drawn ? 0.55 : 1;
      if (pts.length > 1) {
        ctx.strokeStyle = '#69b0ff'; ctx.lineWidth = 1.25; ctx.beginPath();
        for (i = 0; i < pts.length; i++) { var x = pts[i][0] * S.k, y = pts[i][1] * S.k; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
        ctx.stroke();
      }
      for (i = 0; i < pts.length; i++) {
        var cx = pts[i][0] * S.k, cy = pts[i][1] * S.k, last = i === pts.length - 1, s = 4;
        ctx.fillStyle = last ? '#2680eb' : '#ffffff'; ctx.strokeStyle = '#1a5fb4'; ctx.lineWidth = 1;
        ctx.fillRect(cx - s, cy - s, s * 2, s * 2); ctx.strokeRect(cx - s + .5, cy - s + .5, s * 2 - 1, s * 2 - 1);
      }
      ctx.restore();
    }
    function sched() { if (pending) return; pending = true; requestAnimationFrame(function () { pending = false; repaint(); }); }

    function ui() {
      var n = pts.length, s = STR[lang()].status;
      count.textContent = s[0] + n + s[1];
      hint.classList.toggle('off', n > 0);
      btnDraw.disabled = drawn || n < 2;
      btnUndo.disabled = !drawn;
      btnClear.disabled = n === 0 && !drawn;
      var hasArr = drawn && cfg.arrows && R && R.g.arrows.length > 0;
      showLayer(rows.line, drawn && !!R);
      showLayer(rows.arrows, hasArr);
      rows.line.classList.remove('sel'); rows.arrows.classList.remove('sel'); rows.bg.classList.remove('sel');
      (hasArr ? rows.arrows : (drawn && R ? rows.line : rows.bg)).classList.add('sel');
    }
    function showLayer(li, on) {
      if (on && li.hidden) { li.hidden = false; li.classList.remove('fresh'); void li.offsetWidth; li.classList.add('fresh'); }
      else if (!on) li.hidden = true;
    }
    function say(msg) { if (live) live.textContent = msg; }

    function stopAnim() { token++; if (raf) cancelAnimationFrame(raf); raf = 0; reveal = 1; }
    function run(animate) {
      if (pts.length < 2) return;
      stopAnim();
      drawn = true;
      var my = token;
      R = route(pts, eff()); paintLayers(lineX, arrX, R, cfg);
      if (animate && !reduce) {
        reveal = 0; render(); ui();
        var t0 = performance.now(), dur = Math.min(2000, 700 + R.len * 0.9);
        (function step(t) {
          if (my !== token) return;
          var p = Math.min(1, (t - t0) / dur); reveal = ease(p); render();
          if (p < 1) raf = requestAnimationFrame(step); else { reveal = 1; raf = 0; render(); }
        })(t0);
      } else { reveal = 1; render(); ui(); }
      say(STR[lang()].drawnMsg);
    }
    function undo() { stopAnim(); drawn = false; R = null; paintLayers(lineX, arrX, null, cfg); render(); ui(); }
    function clear() { stopAnim(); pts = []; drawn = false; R = null; paintLayers(lineX, arrX, null, cfg); render(); ui(); say(STR[lang()].clearedMsg); }
    function addPoint(x, y) {
      if (pts.length >= 80) return;
      pts.push([Math.max(0, Math.min(MAP_W, x)), Math.max(0, Math.min(MAP_H, y))]);
      if (drawn) { stopAnim(); R = route(pts, eff()); paintLayers(lineX, arrX, R, cfg); }
      render(); ui();
    }
    function removeLast() {
      if (!pts.length) return; stopAnim(); pts.pop();
      if (pts.length < 2) { drawn = false; R = null; paintLayers(lineX, arrX, null, cfg); }
      else if (drawn) { R = route(pts, eff()); paintLayers(lineX, arrX, R, cfg); }
      render(); ui();
    }
    async function play(fast) {
      stopAnim(); var my = ++token;
      pts = []; drawn = false; R = null; paintLayers(lineX, arrX, null, cfg); render(); ui();
      if (reduce) { pts = SAMPLE.map(function (p) { return p.slice(); }); run(false); return; }
      await sleep(fast ? 120 : 500); if (my !== token) return;
      for (var i = 0; i < SAMPLE.length; i++) {
        pts.push(SAMPLE[i].slice()); render(); ui();
        await sleep(fast ? 70 : 150); if (my !== token) return;
      }
      await sleep(fast ? 250 : 650); if (my !== token) return;
      run(true);
    }

    /* события */
    cv.addEventListener('click', function (e) {
      token++;                                   // пользователь взял управление — демо-прогон останавливается
      var r = cv.getBoundingClientRect();
      addPoint((e.clientX - r.left) / S.k, (e.clientY - r.top) / S.k);
    });
    cv.addEventListener('keydown', function (e) {
      if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); token++; removeLast(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (!drawn && pts.length > 1) run(true); }
      else if ((e.key === 'z' || e.key === 'Z' || e.key === 'я' || e.key === 'Я') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); undo(); }
    });
    btnDraw.addEventListener('click', function () { run(true); });
    btnUndo.addEventListener('click', undo);
    btnClear.addEventListener('click', clear);
    btnEx.addEventListener('click', function () { play(true); });

    var eyes = box.querySelectorAll('.eye');
    for (var e0 = 0; e0 < eyes.length; e0++) eyes[e0].addEventListener('click', function () {
      var key = this.closest('.layer').getAttribute('data-layer');
      vis[key] = !vis[key]; this.setAttribute('aria-pressed', vis[key] ? 'true' : 'false'); render();
    });
    function bindRange(id, key) {
      var el = box.querySelector('#' + id), out = box.querySelector('#' + id + '-v');
      function fill() { el.style.setProperty('--p', ((el.value - el.min) / (el.max - el.min) * 100) + '%'); out.textContent = el.value; }
      el.addEventListener('input', function () { cfg[key] = parseFloat(el.value); fill(); if (drawn) sched(); });
      el.value = cfg[key]; fill();
    }
    bindRange('f-w', 'lineW'); bindRange('f-s', 'smooth'); bindRange('f-c', 'corner'); bindRange('f-a', 'arrowLen');
    // стрелки: afterTurn / minGap растут вместе с размером стрелки, как «на глаз» удобно
    var arr = box.querySelector('#f-a');
    arr.addEventListener('input', function () { cfg.afterTurn = cfg.arrowLen * 2; cfg.minGap = cfg.arrowLen * 3.9; });
    box.querySelector('#f-arrows').addEventListener('change', function () { cfg.arrows = this.checked; if (drawn) { repaint(); ui(); } });
    box.querySelector('#f-outline').addEventListener('change', function () { cfg.outline = this.checked; if (drawn) repaint(); });
    var sws = box.querySelectorAll('.sw');
    for (var s0 = 0; s0 < sws.length; s0++) sws[s0].addEventListener('click', function () {
      for (var q = 0; q < sws.length; q++) sws[q].setAttribute('aria-pressed', 'false');
      this.setAttribute('aria-pressed', 'true'); cfg.color = this.getAttribute('data-c'); if (drawn) repaint();
    });
    doc.addEventListener('rd-lang', ui);
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () { sched2(); }), tm = 0;
      ro.observe(cv);
      function sched2() { clearTimeout(tm); tm = setTimeout(function () { var r = cv.getBoundingClientRect(); if (Math.abs(r.width * DPR - cv.width) > 2) setup(); }, 80); }
    } else window.addEventListener('resize', setup);

    setup(); ui();
    // авто-показ запускаем, когда окно заметно на экране
    var started = false;
    function start() { if (started) return; started = true; play(false); }
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { io.disconnect(); start(); } }, { threshold: 0.35 });
      io.observe(box);
    } else start();
  }

  /* ================= мини-схемы ================= */
  var MW = 360, MH = 270;
  var MINI = [[36, 208], [36, 152], [112, 152], [112, 96], [172, 70], [232, 62], [290, 84], [322, 132], [322, 204]];
  var MCFG = { color: '#E5191C', lineW: 7, smooth: 10, corner: 4, sharp: 45, arrows: true, startArrow: true, outline: true, arrowLen: 19, minTurn: 30, afterTurn: 30, maxGap: 120, minGap: 56 };
  function miniMap(c) {
    c.fillStyle = '#1f2329'; c.fillRect(0, 0, MW, MH);
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.strokeStyle = '#2a3037'; c.lineWidth = 12; c.beginPath();
    [[0, 152, 360, 152], [112, 0, 112, 270], [232, 0, 232, 120], [0, 96, 112, 96], [322, 0, 322, 270], [172, 152, 172, 270], [36, 0, 36, 270], [0, 236, 360, 236]].forEach(function (l) { c.moveTo(l[0], l[1]); c.lineTo(l[2], l[3]); });
    c.stroke();
    c.strokeStyle = '#343b44'; c.lineWidth = 17; c.beginPath();
    MINI.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); });
    c.stroke();
  }
  function anchors(c, pts, col) {
    c.fillStyle = col || '#fff'; c.strokeStyle = '#1a5fb4'; c.lineWidth = 1;
    pts.forEach(function (p) { c.fillRect(p[0] - 3.5, p[1] - 3.5, 7, 7); c.strokeRect(p[0] - 3, p[1] - 3, 6, 6); });
  }
  function scene(cv) {
    var kind = cv.getAttribute('data-scene');
    var S = canvasSize(cv, MW, MH), c = cv.getContext('2d');
    c.setTransform(DPR * S.k, 0, 0, DPR * S.k, 0, 0);
    miniMap(c);
    var R = route(MINI, MCFG), i;
    if (kind === 'points') {
      c.strokeStyle = '#69b0ff'; c.lineWidth = 1.2; c.beginPath();
      MINI.forEach(function (p, j) { if (j) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.stroke();
      anchors(c, MINI);
    } else if (kind === 'smooth') {
      c.setLineDash([4, 4]); c.strokeStyle = '#8c8c92'; c.lineWidth = 1.4; c.beginPath();
      MINI.forEach(function (p, j) { if (j) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.stroke(); c.setLineDash([]);
      c.strokeStyle = '#69b0ff'; c.lineWidth = 2.6; c.lineJoin = 'round'; c.beginPath();
      R.sm.forEach(function (p, j) { if (j) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); }); c.stroke();
      anchors(c, MINI, '#c9c9ce');
    } else if (kind === 'shapes') {
      c.fillStyle = 'rgba(229,25,28,.16)'; c.strokeStyle = 'rgba(255,120,120,.95)'; c.lineWidth = 0.8;
      fillPolys(c, R.g.line, 'rgba(229,25,28,.16)'); strokePolys(c, R.g.line);
    } else {       // final
      fillPolys(c, R.g.line, MCFG.color);
      fillPolys(c, R.g.halos, '#fff'); fillPolys(c, R.g.arrows, MCFG.color);
    }
  }
  function initScenes() {
    var list = doc.querySelectorAll('canvas[data-scene]');
    function all() { for (var i = 0; i < list.length; i++) scene(list[i]); }
    all();
    var tm = 0;
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () { clearTimeout(tm); tm = setTimeout(function () {
        for (var i = 0; i < list.length; i++) { var r = list[i].getBoundingClientRect(); if (Math.abs(r.width * DPR - list[i].width) > 2) scene(list[i]); }
      }, 100); });
      for (var i = 0; i < list.length; i++) ro.observe(list[i]);
    } else window.addEventListener('resize', all);
  }

  function init() {
    var box = doc.getElementById('demo');
    if (box) Demo(box);
    initScenes();
  }
  if (doc.fonts && doc.fonts.ready) { doc.fonts.ready.then(init, init); } else init();
})();
