#target photoshop
/*
===============================================================================
 RouteDrawer.jsx — «Маршрут по контуру» для Photoshop (CS6 … 2025)
===============================================================================
 ЧТО ДЕЛАЕТ
   Берёт контур, который ты поставил Пером, и рисует по нему красную
   сплошную линию маршрута от первой точки до последней + стрелки направления
   (после поворотов и редко на прямых). Плавные изгибы сглаживаются, резкие
   повороты на перекрёстках остаются чёткими (чуть скруглёнными).

 КАК ПОЛЬЗОВАТЬСЯ
   1. Вставь скриншот карты в Photoshop.
   2. Перо (P) → вверху режим «Контур». Кликами расставь точки по дорогам
      от начала маршрута до конца (замыкать контур не нужно).
      Можно несколько отдельных кусков — каждый нарисуется со своими стрелками.
   3. Файл → Сценарии → Обзор… → выбери этот файл.
      (Чтобы скрипт был прямо в меню «Сценарии»: положи файл в папку
       …\Adobe Photoshop ХХХХ\Presets\Scripts и перезапусти Photoshop.)
   4. В окошке поправь настройки (они запоминаются) и нажми «Нарисовать».

 РЕЗУЛЬТАТ
   Два обычных слоя: «Маршрут — линия» и «Маршрут — стрелки».
   Твой контур не трогается. Ctrl+Z откатывает всё одним шагом.

 ПОЧЕМУ НЕ ТОРМОЗИТ
   Без кисти и без цикла «мазков»: вся линия и все стрелки готовятся
   как геометрия в памяти и заливаются за одну операцию на слой.
===============================================================================
*/

(function () {

    var SCRIPT_TITLE = "Маршрут по контуру";
    var SETTINGS_KEY = "RouteDrawer_PS_settings_v1";

    // Поля окна настроек. type: "str" | "size" | "num" | "bool".
    // size — размер в пикселях; значение по умолчанию задано как «пикселей на
    // 1000 px длинной стороны картинки», поэтому на любом скриншоте масштабируется само.
    var GROUPS = [
        { title: "Линия", fields: [
            { id: "color",  type: "str",  def: "E5191C",           label: "Цвет линии (HEX)" },
            { id: "lineW",  type: "size", def: 4,   min: 0.5,      label: "Толщина линии, px" },
            { id: "smooth", type: "size", def: 2.5, min: 0,        label: "Сглаживание плавных поворотов, px  (0 — выкл.)" },
            { id: "corner", type: "size", def: 1.5, min: 0,        label: "Скругление резких поворотов, px  (0 — острый угол)" },
            { id: "sharp",  type: "num",  def: 45,  min: 1,        label: "Поворот считается резким от, °" },
            { id: "ignoreHandles", type: "bool", def: true,            label: "Игнорировать «усы» у точек (считать по самим точкам)" }
        ] },
        { title: "Стрелки", fields: [
            { id: "arrows",     type: "bool", def: true,            label: "Рисовать стрелки направления" },
            { id: "startArrow", type: "bool", def: true,            label: "Стрелка в начале маршрута" },
            { id: "outline",    type: "bool", def: true,            label: "Белая обводка у стрелок" },
            { id: "arrowLen",   type: "size", def: 14,  min: 4,     label: "Размер стрелки, px" },
            { id: "minTurn",    type: "num",  def: 30,  min: 1,     label: "Ставить стрелку после поворота от, °" },
            { id: "afterTurn",  type: "size", def: 30,  min: 0,     label: "…на расстоянии после поворота, px" },
            { id: "maxGap",     type: "size", def: 260, min: 5,     label: "Макс. расстояние между стрелками, px" },
            { id: "minGap",     type: "size", def: 60,  min: 0,     label: "Мин. расстояние между стрелками, px" }
        ] }
    ];

    // ===== ГЕОМЕТРИЯ: начало =====

    var FLAT_STEP = 3;        // px — шаг разбиения кривых, если контур нарисован «усами»
    var SIMPLIFY_TOL = 0.25;  // px — допуск упрощения линии (меньше точек = быстрее)
    var JOIN_ANGLE = 6;       // ° — на изломах больше этого ставим круглые стыки
    var SEG_OVERLAP = 0.75;   // px — нахлёст отрезков друг на друга (без швов)

    function P(x, y) { return { x: x, y: y }; }
    function dist(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
    function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

    function turnDeg(a, b, c) {
        var v1x = b.x - a.x, v1y = b.y - a.y, v2x = c.x - b.x, v2y = c.y - b.y;
        var l1 = Math.sqrt(v1x * v1x + v1y * v1y), l2 = Math.sqrt(v2x * v2x + v2y * v2y);
        if (l1 < 1e-9 || l2 < 1e-9) return 0;
        var cs = (v1x * v2x + v1y * v2y) / (l1 * l2);
        return Math.acos(clamp(cs, -1, 1)) * 180 / Math.PI;
    }

    function addPt(poly, flags, pt, flag) {
        var n = poly.length;
        if (n > 0 && dist(poly[n - 1], pt) < 0.01) {
            if (flag) flags[n - 1] = true;
            return;
        }
        poly.push(pt);
        flags.push(flag);
    }

    // Точки контура -> плотная ломаная. flags[i] = true, если точка — «уголок»
    // (поставлена кликом без «усов»), и её можно сглаживать/скруглять.
    function flattenAnchors(A, closed) {
        var n = A.length, i, k;
        var poly = [], flags = [];
        if (n === 0) return { poly: poly, flags: flags };
        addPt(poly, flags, A[0].a, A[0].lz && A[0].rz);
        var segs = closed ? n : n - 1;
        for (i = 0; i < segs; i++) {
            var p0 = A[i], p1 = A[(i + 1) % n];
            var corner1 = p1.lz && p1.rz;
            if (p0.rz && p1.lz) {
                addPt(poly, flags, p1.a, corner1);
            } else {
                var len = dist(p0.a, p0.r) + dist(p0.r, p1.l) + dist(p1.l, p1.a);
                var steps = clamp(Math.ceil(len / FLAT_STEP), 6, 80);
                for (k = 1; k <= steps; k++) {
                    var t = k / steps, m = 1 - t;
                    var x = m * m * m * p0.a.x + 3 * m * m * t * p0.r.x + 3 * m * t * t * p1.l.x + t * t * t * p1.a.x;
                    var y = m * m * m * p0.a.y + 3 * m * m * t * p0.r.y + 3 * m * t * t * p1.l.y + t * t * t * p1.a.y;
                    addPt(poly, flags, P(x, y), k === steps ? corner1 : false);
                }
            }
        }
        return { poly: poly, flags: flags };
    }

    // Скругляем углы. Чем плавнее поворот, тем сильнее сглаживание (линия может
    // отойти от твоей точки не больше чем на cfg.smooth px); на резких поворотах
    // отход не больше cfg.corner px. Возвращает точки + индексы «вершин» поворотов.
    function smoothPoly(poly, flags, cfg) {
        var out = [], ev = [], n = poly.length, i, k;
        out.push(poly[0]);
        for (i = 1; i < n - 1; i++) {
            var Pt = poly[i];
            if (!flags[i]) { out.push(Pt); continue; }
            var A = poly[i - 1], B = poly[i + 1];
            var v1x = Pt.x - A.x, v1y = Pt.y - A.y, v2x = B.x - Pt.x, v2y = B.y - Pt.y;
            var l1 = Math.sqrt(v1x * v1x + v1y * v1y), l2 = Math.sqrt(v2x * v2x + v2y * v2y);
            if (l1 < 1e-6 || l2 < 1e-6) { out.push(Pt); continue; }
            var u1x = v1x / l1, u1y = v1y / l1, u2x = v2x / l2, u2y = v2y / l2;
            var turn = Math.acos(clamp(u1x * u2x + u1y * u2y, -1, 1)) * 180 / Math.PI;
            if (turn < 0.5) { out.push(Pt); continue; }

            var dev = (turn <= cfg.sharp) ? cfg.smooth : cfg.corner;
            var d = 0;
            if (dev > 0) {
                var sh = Math.sin(turn * Math.PI / 360);          // sin(угол/2)
                d = dev / (0.5 * sh);                              // длина среза угла
                d = Math.min(d, 0.5 * l1, 0.5 * l2);
            }
            if (d < 0.6) {
                if (turn >= cfg.minTurn) ev.push(out.length);
                out.push(Pt);
                continue;
            }
            var a = P(Pt.x - u1x * d, Pt.y - u1y * d);
            var b = P(Pt.x + u2x * d, Pt.y + u2y * d);
            var steps = Math.max(2, Math.min(40, Math.ceil(turn / 3), Math.ceil(d / 1.5)));
            var startIdx = out.length;
            out.push(a);
            for (k = 1; k < steps; k++) {
                var t = k / steps, m = 1 - t;
                out.push(P(m * m * a.x + 2 * m * t * Pt.x + t * t * b.x,
                           m * m * a.y + 2 * m * t * Pt.y + t * t * b.y));
            }
            if (turn >= cfg.minTurn) ev.push(startIdx + Math.round(steps / 2));
            out.push(b);
        }
        if (n > 1) out.push(poly[n - 1]);
        return { pts: out, ev: ev };
    }

    function ptSegDist(p, a, b) {
        var dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
        if (l2 < 1e-12) return dist(p, a);
        var t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1);
        var ex = p.x - (a.x + t * dx), ey = p.y - (a.y + t * dy);
        return Math.sqrt(ex * ex + ey * ey);
    }

    // Упрощение ломаной (Дуглас–Пекер, без рекурсии): меньше точек — быстрее заливка.
    function simplify(pts, tol) {
        var n = pts.length, i;
        if (n < 3) return pts.slice(0);
        var keep = [];
        for (i = 0; i < n; i++) keep.push(false);
        keep[0] = true; keep[n - 1] = true;
        var stack = [[0, n - 1]];
        while (stack.length) {
            var seg = stack.pop(), s = seg[0], e = seg[1], maxD = -1, idx = -1;
            for (i = s + 1; i < e; i++) {
                var dd = ptSegDist(pts[i], pts[s], pts[e]);
                if (dd > maxD) { maxD = dd; idx = i; }
            }
            if (idx >= 0 && maxD > tol) {
                keep[idx] = true;
                stack.push([s, idx]);
                stack.push([idx, e]);
            }
        }
        var res = [];
        for (i = 0; i < n; i++) if (keep[i]) res.push(pts[i]);
        return res;
    }

    function cumLen(pts) {
        var c = [0], i;
        for (i = 1; i < pts.length; i++) c.push(c[i - 1] + dist(pts[i - 1], pts[i]));
        return c;
    }

    function pointAt(pts, cum, s) {
        var last = pts.length - 1;
        if (s <= 0) return pts[0];
        if (s >= cum[last]) return pts[last];
        var lo = 0, hi = last;
        while (hi - lo > 1) {
            var mid = (lo + hi) >> 1;
            if (cum[mid] <= s) lo = mid; else hi = mid;
        }
        var seg = cum[hi] - cum[lo];
        var t = seg > 0 ? (s - cum[lo]) / seg : 0;
        return P(pts[lo].x + (pts[hi].x - pts[lo].x) * t, pts[lo].y + (pts[hi].y - pts[lo].y) * t);
    }

    // Где ставить стрелки: у начала, после каждого заметного поворота,
    // и на длинных прямых — не реже, чем раз в maxGap. Слишком близкие отбрасываются.
    function planArrows(pts, evIdx, cfg) {
        var res = [], i, j;
        var cum = cumLen(pts), total = cum[cum.length - 1], L = cfg.arrowLen;
        var margin = L * 0.6;
        if (total < margin * 2) return res;

        var ev = [];
        for (i = 0; i < evIdx.length; i++) ev.push(cum[evIdx[i]]);

        function nearEvent(s) {
            for (var q = 0; q < ev.length; q++) if (Math.abs(s - ev[q]) < L * 0.6) return true;
            return false;
        }

        var cand = [];
        if (cfg.startArrow) {
            var firstEnd = ev.length ? ev[0] : total;
            cand.push(Math.min(cfg.afterTurn, firstEnd * 0.5));
        }
        for (i = 0; i < ev.length; i++) {
            var nextS = (i + 1 < ev.length) ? ev[i + 1] : total;
            cand.push(ev[i] + Math.min(cfg.afterTurn, (nextS - ev[i]) * 0.5));
        }

        var kept = [];
        for (i = 0; i < cand.length; i++) {
            var s = cand[i];
            if (s < margin || s > total - margin || nearEvent(s)) continue;
            if (kept.length && s - kept[kept.length - 1] < cfg.minGap) kept[kept.length - 1] = s;
            else kept.push(s);
        }

        var all = [], prev = 0;
        var bounds = kept.concat([total]);
        for (i = 0; i < bounds.length; i++) {
            var gap = bounds[i] - prev;
            if (gap > cfg.maxGap) {
                var cnt = Math.ceil(gap / cfg.maxGap) - 1;
                for (j = 1; j <= cnt; j++) {
                    var s2 = prev + gap * j / (cnt + 1);
                    if (s2 >= margin && s2 <= total - margin && !nearEvent(s2)) all.push(s2);
                }
            }
            if (i < kept.length) all.push(bounds[i]);
            prev = bounds[i];
        }

        var half = L * 0.4;
        for (i = 0; i < all.length; i++) {
            var c = pointAt(pts, cum, all[i]);
            var p1 = pointAt(pts, cum, Math.max(0, all[i] - half));
            var p2 = pointAt(pts, cum, Math.min(total, all[i] + half));
            var dx = p2.x - p1.x, dy = p2.y - p1.y, l = Math.sqrt(dx * dx + dy * dy);
            if (l < 1e-6) continue;
            res.push({ x: c.x, y: c.y, dx: dx / l, dy: dy / l });
        }
        return res;
    }

    // ---- фигуры: всё — обычные многоугольники [[x, y], ...] ----
    function circlePoly(cx, cy, r) {
        var n = clamp(Math.ceil(r * 2), 12, 32), res = [], i;
        for (i = 0; i < n; i++) {
            var ang = 2 * Math.PI * i / n;
            res.push([cx + r * Math.cos(ang), cy + r * Math.sin(ang)]);
        }
        return res;
    }

    function quadPoly(a, b, half, ext) {
        var dx = b.x - a.x, dy = b.y - a.y, l = Math.sqrt(dx * dx + dy * dy);
        if (l < 1e-6) return null;
        var ux = dx / l, uy = dy / l, nx = -uy * half, ny = ux * half;
        var ax = a.x - ux * ext, ay = a.y - uy * ext, bx = b.x + ux * ext, by = b.y + uy * ext;
        return [[ax + nx, ay + ny], [bx + nx, by + ny], [bx - nx, by - ny], [ax - nx, ay - ny]];
    }

    // добавляем фигуру, только если в ней нет «битых» чисел
    function pushShape(dst, poly) {
        if (!poly) return;
        for (var i = 0; i < poly.length; i++) {
            if (!isFinite(poly[i][0]) || !isFinite(poly[i][1])) return;
        }
        dst.push(poly);
    }

    // Линия = объединение прямоугольников по отрезкам + круги на концах и изломах
    function strokeShapes(pts, half) {
        var out = [], n = pts.length, i;
        if (n === 0) return out;
        if (n === 1) { pushShape(out, circlePoly(pts[0].x, pts[0].y, half)); return out; }
        for (i = 0; i < n - 1; i++) pushShape(out, quadPoly(pts[i], pts[i + 1], half, SEG_OVERLAP));
        pushShape(out, circlePoly(pts[0].x, pts[0].y, half));
        pushShape(out, circlePoly(pts[n - 1].x, pts[n - 1].y, half));
        for (i = 1; i < n - 1; i++) {
            if (turnDeg(pts[i - 1], pts[i], pts[i + 1]) > JOIN_ANGLE) pushShape(out, circlePoly(pts[i].x, pts[i].y, half));
        }
        return out;
    }

    // Стрелка «навигационная»: остриё + две спинки + выемка. grow — для белой обводки.
    function arrowPoly(a, L, grow) {
        var len = L + 2 * grow, wid = L * 0.95 + 2 * grow;
        var ux = a.dx, uy = a.dy, nx = -uy, ny = ux;
        function pt(f, w) { return [a.x + ux * f * len + nx * w * wid, a.y + uy * f * len + ny * w * wid]; }
        return [pt(0.55, 0), pt(-0.45, 0.5), pt(-0.15, 0), pt(-0.45, -0.5)];
    }

    function appendAll(dst, src) { for (var i = 0; i < src.length; i++) dst.push(src[i]); }

    function buildGeometry(routes, cfg) {
        var line = [], arrows = [], halos = [], r, k;
        var half = cfg.lineW / 2;
        var grow = Math.max(1.5, cfg.arrowLen * 0.1);
        for (r = 0; r < routes.length; r++) {
            var sm = smoothPoly(routes[r].poly, routes[r].flags, cfg);
            appendAll(line, strokeShapes(simplify(sm.pts, SIMPLIFY_TOL), half));
            if (cfg.arrows) {
                var list = planArrows(sm.pts, sm.ev, cfg);
                for (k = 0; k < list.length; k++) {
                    pushShape(arrows, arrowPoly(list[k], cfg.arrowLen, 0));
                    pushShape(halos, arrowPoly(list[k], cfg.arrowLen, grow));
                }
            }
        }
        return { line: line, arrows: arrows, halos: halos };
    }

    // ===== ГЕОМЕТРИЯ: конец =====


    // ---------- работа с Photoshop ----------

    var stage = "";     // где мы сейчас — покажем в сообщении, если что-то сломается
    var CHUNK = 80;     // сколько фигур заливать за один раз

    function near(a, b) { return Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01; }

    var HANDLE_MIN = 3;     // px — «ус» короче этого считаем случайным
    var HANDLE_REL = 0.12;  // …или короче 12% расстояния до соседней точки

    function readSubPath(sub, ignoreHandles) {
        var pts = sub.pathPoints, n = pts.length, raw = [], A = [], i;
        for (i = 0; i < n; i++) {
            var pp = pts[i];
            raw.push({ an: pp.anchor, l: pp.leftDirection, r: pp.rightDirection });
        }
        for (i = 0; i < n; i++) {
            var c = raw[i], pr = raw[(i + n - 1) % n], nx = raw[(i + 1) % n];
            var aP = P(c.an[0], c.an[1]);
            var dPrev = dist(aP, P(pr.an[0], pr.an[1])), dNext = dist(aP, P(nx.an[0], nx.an[1]));
            var hl = dist(aP, P(c.l[0], c.l[1])), hr = dist(aP, P(c.r[0], c.r[1]));
            var lz = ignoreHandles || hl <= Math.max(HANDLE_MIN, HANDLE_REL * dPrev);
            var rz = ignoreHandles || hr <= Math.max(HANDLE_MIN, HANDLE_REL * dNext);
            A.push({ a: aP, l: lz ? aP : P(c.l[0], c.l[1]), r: rz ? aP : P(c.r[0], c.r[1]), lz: lz, rz: rz });
        }
        return flattenAnchors(A, sub.closed);
    }

    function removeTmpPaths(doc, name) {
        for (var i = doc.pathItems.length - 1; i >= 0; i--) {
            try { if (doc.pathItems[i].name === name) doc.pathItems[i].remove(); } catch (e) {}
        }
    }

    // многоугольник -> подконтур Photoshop (только угловые точки, ничего хитрого)
    function toSubPath(coords) {
        var s = new SubPathInfo(), arr = [], i;
        s.operation = ShapeOperation.SHAPEADD;
        s.closed = true;
        for (i = 0; i < coords.length; i++) {
            var p = new PathPointInfo();
            p.kind = PointKind.CORNERPOINT;
            p.anchor = [coords[i][0], coords[i][1]];
            p.leftDirection = [coords[i][0], coords[i][1]];
            p.rightDirection = [coords[i][0], coords[i][1]];
            arr.push(p);
        }
        s.entireSubPath = arr;
        return s;
    }

    // Способ 1: временный контур + заливка контура (порциями)
    function fillByPath(doc, shapes, color) {
        var name = "__route_tmp__", s0, k;
        for (s0 = 0; s0 < shapes.length; s0 += CHUNK) {
            var part = [];
            for (k = s0; k < shapes.length && k < s0 + CHUNK; k++) part.push(toSubPath(shapes[k]));
            removeTmpPaths(doc, name);
            stage = "создание временного контура";
            var pi = doc.pathItems.add(name, part);
            try {
                stage = "заливка контура";
                try {
                    pi.fillPath(color, ColorBlendMode.NORMAL, 100, false, 0, true, true);
                } catch (e1) {
                    pi.fillPath(color);
                }
            } finally {
                try { pi.remove(); } catch (e2) {}
            }
        }
    }

    // Способ 2 (запасной): склеиваем фигуры в выделение и заливаем его
    function fillBySelection(doc, shapes, color) {
        var i;
        stage = "сборка выделения";
        for (i = 0; i < shapes.length; i++) {
            doc.selection.select(shapes[i], i === 0 ? SelectionType.REPLACE : SelectionType.EXTEND, 0, true);
        }
        stage = "заливка выделения";
        doc.selection.fill(color, ColorBlendMode.NORMAL, 100, false);
        doc.selection.deselect();
    }

    function newLayer(doc, name) {
        var lyr = doc.artLayers.add();
        lyr.name = name;
        try { lyr.visible = true; } catch (e) {}
        doc.activeLayer = lyr;
        return lyr;
    }

    function makeWhite() {
        var w = new SolidColor();
        w.rgb.red = 255; w.rgb.green = 255; w.rgb.blue = 255;
        return w;
    }

    function paintAll(doc, g, cfg, fillFn, made) {
        try { doc.selection.deselect(); } catch (e) {}
        stage = "создание слоя линии";
        made.push(newLayer(doc, "Маршрут — линия"));
        fillFn(doc, g.line, cfg.color);
        if (cfg.arrows && g.arrows.length) {
            stage = "создание слоя стрелок";
            made.push(newLayer(doc, "Маршрут — стрелки"));
            if (cfg.outline) fillFn(doc, g.halos, makeWhite());
            fillFn(doc, g.arrows, cfg.color);
        }
    }

    function describeError(e) {
        var msg = (e && e.message) ? e.message : String(e);
        return msg + (e && e.number ? " [код " + e.number + "]" : "") + " — этап: " + stage;
    }

    function drawRoute(doc, pathItem, cfg) {
        var routes = [], i, made = [], err1;
        stage = "чтение контура";
        var subs = pathItem.subPathItems;
        for (i = 0; i < subs.length; i++) {
            var r = readSubPath(subs[i], cfg.ignoreHandles);
            if (r.poly.length >= 2) routes.push(r);
        }
        if (routes.length === 0) throw new Error("В выбранном контуре нет ни одного отрезка — поставь минимум две точки.");

        stage = "расчёт линии";
        var g = buildGeometry(routes, cfg);

        try {
            paintAll(doc, g, cfg, fillByPath, made);
        } catch (e1) {
            err1 = describeError(e1);
            for (i = made.length - 1; i >= 0; i--) { try { made[i].remove(); } catch (e2) {} }
            made = [];
            try {
                paintAll(doc, g, cfg, fillBySelection, made);
            } catch (e3) {
                throw new Error("Способ 1: " + err1 + "\nСпособ 2: " + describeError(e3));
            }
        }
    }

    // ---------- настройки и окно ----------

    function allFields() {
        var res = [], i, j;
        for (i = 0; i < GROUPS.length; i++)
            for (j = 0; j < GROUPS[i].fields.length; j++) res.push(GROUPS[i].fields[j]);
        return res;
    }

    function loadSettings(fields) {
        var res = {};
        try {
            var d = app.getCustomOptions(SETTINGS_KEY);
            for (var i = 0; i < fields.length; i++) {
                var f = fields[i], key = stringIDToTypeID("rdps_" + f.id);
                if (!d.hasKey(key)) continue;
                if (f.type === "bool") res[f.id] = d.getBoolean(key);
                else if (f.type === "str") res[f.id] = d.getString(key);
                else res[f.id] = d.getDouble(key);
            }
        } catch (e) {}
        return res;
    }

    function saveSettings(fields, store) {
        try {
            var d = new ActionDescriptor();
            for (var i = 0; i < fields.length; i++) {
                var f = fields[i], key = stringIDToTypeID("rdps_" + f.id);
                if (f.type === "bool") d.putBoolean(key, store[f.id]);
                else if (f.type === "str") d.putString(key, store[f.id]);
                else d.putDouble(key, store[f.id]);
            }
            app.putCustomOptions(SETTINGS_KEY, d, true);
        } catch (e) {}
    }

    function fmt(v) { return String(Math.round(v * 10) / 10); }

    function toNum(s) {
        var v = parseFloat(String(s).replace(",", "."));
        return isNaN(v) ? null : v;
    }

    function parseHex(s) {
        s = String(s).replace(/^\s*#?/, "").replace(/\s+$/, "");
        if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
        var c = new SolidColor();
        c.rgb.hexValue = s.toUpperCase();
        return c;
    }

    function showDialog(pathNames, defIdx, longSide, saved) {
        var fields = allFields(), ctl = {}, result = null, gi, fi;

        var dlg = new Window("dialog", SCRIPT_TITLE);
        dlg.orientation = "column";
        dlg.alignChildren = "fill";
        dlg.spacing = 8;
        dlg.margins = 14;

        var gp = dlg.add("group");
        gp.add("statictext", undefined, "Контур:");
        var ddPath = gp.add("dropdownlist", undefined, pathNames);
        ddPath.selection = defIdx;
        ddPath.preferredSize.width = 300;

        function startValue(f) { return saved[f.id] !== undefined ? saved[f.id] : f.def; }

        function setControl(f, v) {
            if (f.type === "bool") ctl[f.id].value = v;
            else if (f.type === "str") ctl[f.id].text = v;
            else if (f.type === "size") ctl[f.id].text = fmt(v / 1000 * longSide);
            else ctl[f.id].text = fmt(v);
        }

        for (gi = 0; gi < GROUPS.length; gi++) {
            var panel = dlg.add("panel", undefined, GROUPS[gi].title);
            panel.orientation = "column";
            panel.alignChildren = "left";
            panel.margins = [12, 16, 12, 10];
            for (fi = 0; fi < GROUPS[gi].fields.length; fi++) {
                var f = GROUPS[gi].fields[fi];
                var row = panel.add("group");
                if (f.type === "bool") {
                    ctl[f.id] = row.add("checkbox", undefined, f.label);
                } else {
                    var st = row.add("statictext", undefined, f.label);
                    st.preferredSize.width = 340;
                    ctl[f.id] = row.add("edittext", undefined, "");
                    ctl[f.id].preferredSize.width = 70;
                }
                setControl(f, startValue(f));
            }
        }

        var gb = dlg.add("group");
        gb.alignment = "right";
        var btnReset = gb.add("button", undefined, "Сбросить");
        var btnOk = gb.add("button", undefined, "Нарисовать", { name: "ok" });
        var btnCancel = gb.add("button", undefined, "Отмена", { name: "cancel" });

        btnReset.onClick = function () {
            for (var i = 0; i < fields.length; i++) setControl(fields[i], fields[i].def);
        };

        btnOk.onClick = function () {
            var cfg = {}, store = {}, i;
            for (i = 0; i < fields.length; i++) {
                var f = fields[i], c = ctl[f.id];
                if (f.type === "bool") {
                    cfg[f.id] = c.value; store[f.id] = c.value;
                } else if (f.type === "str") {
                    var col = parseHex(c.text);
                    if (!col) { alert("Цвет: нужен HEX из 6 символов, например E5191C", SCRIPT_TITLE); return; }
                    cfg[f.id] = col; store[f.id] = c.text.replace(/^\s*#?/, "").replace(/\s+$/, "");
                } else {
                    var v = toNum(c.text);
                    var lo = (f.min !== undefined) ? f.min : 0;
                    if (v === null || v < lo) {
                        alert("Поле «" + f.label.replace(/\s+\(.*$/, "") + "»: нужно число не меньше " + lo + ".", SCRIPT_TITLE);
                        return;
                    }
                    cfg[f.id] = v;
                    store[f.id] = (f.type === "size") ? v / longSide * 1000 : v;
                }
            }
            result = { pathIndex: ddPath.selection.index, cfg: cfg, store: store };
            dlg.close(1);
        };

        if (dlg.show() !== 1) return null;
        return result;
    }

    // ---------- запуск ----------

    if (app.documents.length === 0) {
        alert("Сначала открой документ со скриншотом карты.", SCRIPT_TITLE);
        return;
    }

    app.bringToFront();
    var doc = app.activeDocument;
    var oldUnits = app.preferences.rulerUnits;
    var oldDialogs = app.displayDialogs;
    app.preferences.rulerUnits = Units.PIXELS;

    try {
        var cands = [], names = [], defIdx = 0, i;
        for (i = 0; i < doc.pathItems.length; i++) {
            var pi = doc.pathItems[i], kind = null;
            try { kind = pi.kind; } catch (e0) {}
            if (kind === PathKind.VECTORMASK || kind === PathKind.TEXTMASK) continue;
            if (kind === PathKind.WORKPATH) defIdx = cands.length;
            names.push(pi.name + (kind === PathKind.WORKPATH ? "   (рабочий контур)" : ""));
            cands.push(pi);
        }
        if (cands.length === 0) {
            alert("В документе нет контура.\n\nВозьми Перо (P), сверху выбери режим «Контур» и кликами расставь точки по дорогам, потом запусти скрипт снова.", SCRIPT_TITLE);
            return;
        }

        var longSide = Math.max(doc.width.as("px"), doc.height.as("px"));
        if (longSide < 1) longSide = 1000;

        var fields = allFields();
        var dlgRes = showDialog(names, defIdx, longSide, loadSettings(fields));
        if (!dlgRes) return;
        saveSettings(fields, dlgRes.store);

        var cfg = dlgRes.cfg;
        var chosen = cands[dlgRes.pathIndex];

        // Родные окна ошибок Photoshop выключаем: вместо них скрипт сам покажет, на каком этапе сбой
        app.displayDialogs = DialogModes.NO;

        $.global.__routeDrawerRun = function () { drawRoute(doc, chosen, cfg); };
        try {
            doc.suspendHistory("Маршрут по контуру", "__routeDrawerRun()");
        } finally {
            try { delete $.global.__routeDrawerRun; } catch (e3) {}
        }
    } catch (err) {
        alert("Не получилось:\n" + describeError(err) + (err.line ? "\n(строка " + err.line + ")" : ""), SCRIPT_TITLE);
    } finally {
        app.preferences.rulerUnits = oldUnits;
        try { app.displayDialogs = oldDialogs; } catch (e4) {}
    }

})();
