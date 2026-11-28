#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Route Drawer — проверка целостности репозитория (только стандартная библиотека Python 3.8+).

Что проверяется:
  1. Файлы на месте: RouteDrawer.jsx, RouteDrawer-Setup.exe, LICENSE, README.md, docs/index.html.
  2. SHA-256 скрипта и установщика совпадает с тем, что написано в README.md и на сайте (docs/index.html).
  3. Скрипт внутри установщика — это тот же самый RouteDrawer.jsx (байт в байт).
  4. Геометрия, которую показывает демо на сайте (docs/assets/geometry.js), совпадает с геометрией из RouteDrawer.jsx.
  5. Локальные ссылки и картинки в README.md и на сайте не битые.
  6. (с флагом --online) Публичная ссылка на скачивание отдаёт именно этот установщик, а сайт открывается.

Запуск:   python .github/scripts/verify_integrity.py [--online] [--root .]
Код выхода: 0 — всё хорошо, 1 — найдены проблемы.
"""
import argparse
import hashlib
import os
import re
import sys
import time
import urllib.error
import urllib.request

JSX = "RouteDrawer.jsx"
EXE = "RouteDrawer-Setup.exe"
GEO_BEGIN = "// ===== ГЕОМЕТРИЯ: начало ====="
GEO_END = "// ===== ГЕОМЕТРИЯ: конец ====="
HEX64 = re.compile(r"(?<![0-9a-fA-F])[0-9a-fA-F]{64}(?![0-9a-fA-F])")

results = []  # (ok, title, detail)


def check(ok, title, detail="", file=None):
    results.append((bool(ok), title, detail))
    mark = "OK  " if ok else "FAIL"
    print(f"[{mark}] {title}" + (f" — {detail}" if detail and not ok else ""))
    if not ok:
        loc = f" file={file}" if file else ""
        print(f"::error{loc}::{title}. {detail}".strip())
    return bool(ok)


def read_bytes(path):
    with open(path, "rb") as f:
        return f.read()


def read_text(path):
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        return f.read()


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def short(h):
    return h[:12] + "…" + h[-6:]


# ---------------------------------------------------------------- проверки


def check_files(root):
    ok = True
    for rel in (JSX, EXE, "LICENSE", "README.md", "docs/index.html", "docs/assets/geometry.js"):
        exists = os.path.isfile(os.path.join(root, rel))
        ok &= check(exists, f"Файл {rel} на месте", "файла нет в репозитории", rel)
    return ok


def check_exe_sanity(exe):
    check(len(exe) > 100_000, "Установщик не пустой и не «заглушка»", f"размер {len(exe)} байт — подозрительно мало", EXE)
    is_pe = False
    if exe[:2] == b"MZ" and len(exe) > 64:
        off = int.from_bytes(exe[0x3C:0x40], "little")
        is_pe = exe[off:off + 4] == b"PE\x00\x00"
    check(is_pe, "Установщик — настоящий exe-файл Windows (PE)",
          "нет заголовка MZ/PE. Возможно, файл заменён Git LFS-указателем или повреждён при загрузке", EXE)


def check_hashes_in_docs(root, h_jsx, h_exe):
    ok = True
    for rel in ("README.md", "docs/index.html"):
        path = os.path.join(root, rel)
        if not os.path.isfile(path):
            continue
        text = read_text(path).lower()
        found = set(HEX64.findall(text))
        ok &= check(h_exe in found, f"{rel}: указан актуальный SHA-256 установщика",
                    f"в файле нет суммы {h_exe}. Обновите её в {rel}", rel)
        ok &= check(h_jsx in found, f"{rel}: указан актуальный SHA-256 скрипта",
                    f"в файле нет суммы {h_jsx}. Обновите её в {rel}", rel)
        stale = sorted(found - {h_exe, h_jsx})
        ok &= check(not stale, f"{rel}: нет устаревших контрольных сумм",
                    "найдены суммы, не совпадающие ни с одним файлом: " + ", ".join(short(s) for s in stale), rel)
    return ok


def check_exe_contains_jsx(exe, jsx_bytes):
    check(jsx_bytes in exe, "Скрипт внутри установщика совпадает с RouteDrawer.jsx",
          "установщик содержит другую версию скрипта: пересоберите установщик или обновите RouteDrawer.jsx", EXE)


def geometry_block(jsx_text):
    a, b = jsx_text.find(GEO_BEGIN), jsx_text.find(GEO_END)
    if a < 0 or b < 0 or b < a:
        return None
    body = jsx_text[a + len(GEO_BEGIN):b]
    return [ln.strip() for ln in body.splitlines() if ln.strip()]


def check_geometry(root, jsx_text, h_jsx):
    block = geometry_block(jsx_text)
    if block is None:
        check(False, "В RouteDrawer.jsx найден блок геометрии", f"нет пометок «{GEO_BEGIN}» / «{GEO_END}»", JSX)
        return
    geo_path = os.path.join(root, "docs/assets/geometry.js")
    if not os.path.isfile(geo_path):
        return
    geo_text = read_text(geo_path)
    geo_lines = [ln.strip() for ln in geo_text.splitlines() if ln.strip()]
    # каждая строка блока должна встретиться в geometry.js, в том же порядке
    pos, missing = 0, None
    for ln in block:
        try:
            pos = geo_lines.index(ln, pos) + 1
        except ValueError:
            missing = ln
            break
    check(missing is None, "Демо на сайте использует ту же геометрию, что и скрипт",
          "расхождение в строке: «%s». Пересоберите docs/assets/geometry.js из RouteDrawer.jsx" % (missing or "")[:90],
          "docs/assets/geometry.js")
    check(h_jsx in geo_text.lower(), "docs/assets/geometry.js ссылается на актуальную версию скрипта",
          "в шапке geometry.js указан SHA-256 другой версии RouteDrawer.jsx", "docs/assets/geometry.js")


LINK_RE = re.compile(r"""(?:src|href|data-[a-z-]*src)\s*=\s*["']([^"'#?][^"']*)["']|!?\[[^\]]*\]\(([^)\s]+)\)""", re.I)


def local_links(text, base_dir):
    out = []
    for m in LINK_RE.finditer(text):
        url = (m.group(1) or m.group(2) or "").strip()
        if not url or re.match(r"^(?:[a-z][a-z0-9+.-]*:|//|#|mailto:|data:|tel:)", url, re.I):
            continue
        url = url.split("#")[0].split("?")[0]
        if url:
            out.append(url)
    return out


def check_local_links(root):
    for rel, base in (("README.md", ""), ("docs/index.html", "docs"), ("docs/404.html", "docs")):
        path = os.path.join(root, rel)
        if not os.path.isfile(path):
            continue
        broken = []
        for url in local_links(read_text(path), base):
            from urllib.parse import unquote
            url = unquote(url)
            target = os.path.normpath(os.path.join(root, base, url.lstrip("/")) if not url.startswith("/")
                                      else os.path.join(root, "docs", url.lstrip("/")))
            if url.endswith("/"):
                target = os.path.join(target, "index.html")
            if not os.path.exists(target):
                broken.append(url)
        check(not broken, f"{rel}: локальные ссылки и картинки не битые",
              "не найдено: " + ", ".join(sorted(set(broken))[:8]), rel)


# ---------------------------------------------------------------- онлайн


def fetch(url, want_body=True, tries=3, timeout=60):
    """Возвращает (статус, байты|хэш). Повторяет попытку при сетевых ошибках."""
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "RouteDrawer-integrity-check/1.0"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                data = r.read()
                return r.status, data
        except urllib.error.HTTPError as e:
            if e.code < 500:
                return e.code, b""
            last = e
        except Exception as e:  # сеть, DNS, таймаут
            last = e
        time.sleep(3 * (i + 1))
    raise RuntimeError(str(last))


def check_online(repo, h_exe, h_jsx):
    owner, name = repo.split("/", 1)
    raw = f"https://github.com/{repo}/raw/main/"
    site = f"https://{owner.lower()}.github.io/{name}/"
    try:
        st, data = fetch(raw + EXE)
        check(st == 200 and sha256(data) == h_exe, "Публичная ссылка скачивания отдаёт актуальный установщик",
              f"HTTP {st}, SHA-256 {short(sha256(data)) if data else '—'} вместо {short(h_exe)}", EXE)
        st, data = fetch(raw + JSX)
        check(st == 200 and sha256(data) == h_jsx, "Публичная ссылка на скрипт отдаёт актуальный RouteDrawer.jsx",
              f"HTTP {st}, SHA-256 {short(sha256(data)) if data else '—'} вместо {short(h_jsx)}", JSX)
        st, data = fetch(site)
        body = data.decode("utf-8", "replace").lower()
        check(st == 200, "Сайт открывается (GitHub Pages)", f"{site} → HTTP {st}")
        if st == 200:
            check(h_exe in body, "Опубликованный сайт показывает актуальный SHA-256 установщика",
                  "на опубликованной странице другая сумма: дождитесь деплоя Pages или обновите docs/index.html")
        for path in ("sitemap.xml", "assets/og.png", "assets/site.css", "assets/geometry.js"):
            st, _ = fetch(site + path)
            check(st == 200, f"Сайт: {path} доступен", f"{site}{path} → HTTP {st}")
    except RuntimeError as e:
        check(False, "Онлайн-проверка выполнена", f"нет связи: {e}")


# ---------------------------------------------------------------- отчёт


def write_summary(h_jsx, h_exe):
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if not path:
        return
    bad = [r for r in results if not r[0]]
    lines = ["## Проверка целостности Route Drawer / Integrity check\n",
             f"**{'Всё в порядке' if not bad else 'Найдены проблемы: %d' % len(bad)}** — проверок: {len(results)}\n",
             f"- `{EXE}` — `{h_exe}`" if h_exe else "", f"- `{JSX}` — `{h_jsx}`" if h_jsx else "", "",
             "| | Проверка | Подробности |", "|---|---|---|"]
    for ok, title, detail in results:
        lines.append(f"| {'✅' if ok else '❌'} | {title} | {'' if ok else detail} |")
    with open(path, "a", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", default=".", help="корень репозитория (по умолчанию текущая папка)")
    ap.add_argument("--online", action="store_true", help="дополнительно проверить публичные ссылки и сайт")
    ap.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY", "T1desLuck/RouteDrawer"),
                    help="владелец/репозиторий для онлайн-проверки")
    args = ap.parse_args()
    root = os.path.abspath(args.root)

    if not check_files(root):
        write_summary("", "")
        return 1

    jsx_bytes, exe_bytes = read_bytes(os.path.join(root, JSX)), read_bytes(os.path.join(root, EXE))
    h_jsx, h_exe = sha256(jsx_bytes), sha256(exe_bytes)
    print(f"SHA-256 {JSX}: {h_jsx}\nSHA-256 {EXE}: {h_exe}\n")

    check_exe_sanity(exe_bytes)
    check_exe_contains_jsx(exe_bytes, jsx_bytes)
    check_hashes_in_docs(root, h_jsx, h_exe)
    check_geometry(root, read_text(os.path.join(root, JSX)), h_jsx)
    check_local_links(root)
    lic = read_text(os.path.join(root, "LICENSE"))
    check("RDL" in lic or "Route Drawer" in lic, "LICENSE — лицензия Route Drawer", "в LICENSE нет упоминания RDL / Route Drawer", "LICENSE")
    if args.online:
        check_online(args.repo, h_exe, h_jsx)

    write_summary(h_jsx, h_exe)
    bad = [r for r in results if not r[0]]
    print(f"\nИтог: {len(results) - len(bad)} из {len(results)} проверок пройдено.")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
