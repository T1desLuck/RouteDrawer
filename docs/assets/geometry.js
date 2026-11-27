/* Геометрия Route Drawer: фрагмент RouteDrawer.jsx между пометками «ГЕОМЕТРИЯ: начало/конец», без изменений.
   Источник: https://github.com/T1desLuck/RouteDrawer/blob/main/RouteDrawer.jsx   SHA-256 файла: 206a2d154a569248057e397a4633988a8a1c39fe1cb08ece3d1ecc88b7c0b4d7
   © 2026 ИП Барков Никита Сергеевич, tidesluck@icloud.com. Лицензия Route Drawer (RDL) 1.0. Используется на сайте для демонстрации. */
window.RD = (function () {
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

    
    return { P: P, dist: dist, turnDeg: turnDeg, flattenAnchors: flattenAnchors, smoothPoly: smoothPoly, simplify: simplify, planArrows: planArrows, buildGeometry: buildGeometry };
})();
