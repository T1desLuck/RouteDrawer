#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Route Drawer — генератор двуязычного описания релиза (только стандартная библиотека).

  python make_release_notes.py --tag v1.0.0 --repo T1desLuck/RouteDrawer --dist dist \
         [--vt "RouteDrawer-Setup.exe=https://www.virustotal.com/gui/file-analysis/…,…"] --out notes.md

Если есть файл .github/release-notes/<тег>.md — его текст попадёт в раздел «Что нового» как есть.
Иначе список берётся из заголовков коммитов с предыдущего тега.
"""
import argparse
import hashlib
import os
import subprocess
import sys

EXE, JSX, SUMS = "RouteDrawer-Setup.exe", "RouteDrawer.jsx", "SHA256SUMS.txt"


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def human_size(n):
    return f"{n / 1024:.0f} KB" if n < 1 << 20 else f"{n / (1 << 20):.1f} MB"


def git(*args):
    try:
        return subprocess.run(["git", *args], capture_output=True, text=True, check=True).stdout.strip()
    except Exception:
        return ""


def changes_since_previous_tag(tag):
    """Заголовки коммитов между предыдущим тегом и текущим. (None, []) — если это первый релиз."""
    if git("rev-parse", "-q", "--verify", f"refs/tags/{tag}"):  # тег уже есть (релиз по тегу или повторный запуск)
        ref = tag
        prev = git("describe", "--tags", "--abbrev=0", f"--exclude={tag}", f"{tag}^") if git("rev-parse", "-q", "--verify", f"{tag}^") else ""
    else:  # тега ещё нет (ручной запуск): релиз создаётся на текущем коммите
        ref = "HEAD"
        prev = git("describe", "--tags", "--abbrev=0", "HEAD")
    if not prev:
        return None, []
    log = git("log", f"{prev}..{ref}", "--no-merges", "--pretty=format:%s")
    items = [ln.strip() for ln in log.splitlines() if ln.strip()]
    return prev, items[:30]


def parse_vt(value):
    """'файл=ссылка,файл=ссылка' (или через перенос строки) -> {файл: ссылка}"""
    out = {}
    for part in (value or "").replace("\n", ",").split(","):
        if "=" in part:
            name, url = part.split("=", 1)
            out[os.path.basename(name.strip())] = url.strip()
    return out


def build(tag, repo, dist, vt, notes_dir):
    exe, jsx = os.path.join(dist, EXE), os.path.join(dist, JSX)
    h_exe, h_jsx = sha256_file(exe), sha256_file(jsx)
    s_exe, s_jsx = os.path.getsize(exe), os.path.getsize(jsx)
    base = f"https://github.com/{repo}"
    owner, name = repo.split("/", 1)
    site = f"https://{owner.lower()}.github.io/{name}/"
    vt_exe = f"https://www.virustotal.com/gui/file/{h_exe}"
    vt_jsx = f"https://www.virustotal.com/gui/file/{h_jsx}"

    custom = os.path.join(notes_dir, f"{tag}.md")
    if os.path.isfile(custom):
        with open(custom, encoding="utf-8") as f:
            changes = f.read().strip()
    else:
        prev, items = changes_since_previous_tag(tag)
        if prev is None:
            changes = "- Первый публичный релиз / First public release"
        elif items:
            changes = "\n".join(f"- {i}" for i in items) + f"\n\n[Все изменения / Full changelog]({base}/compare/{prev}...{tag})"
        else:
            changes = f"- Без изменений в коде / No code changes since {prev}"

    scan_ru = scan_en = ""
    if vt:
        scan_ru = (f"- Проверено в VirusTotal (десятки антивирусных движков): [установщик]({vt_exe}) · [скрипт]({vt_jsx}). "
                   "Отчёт появляется в течение нескольких минут после публикации.\n")
        scan_en = (f"- Scanned with VirusTotal (dozens of antivirus engines): [installer]({vt_exe}) · [script]({vt_jsx}). "
                   "The report appears a few minutes after publishing.\n")
    else:
        scan_ru = f"- Отчёт VirusTotal по хэшам: [установщик]({vt_exe}) · [скрипт]({vt_jsx}) (откроется, если файл уже проверяли).\n"
        scan_en = f"- VirusTotal lookup by hash: [installer]({vt_exe}) · [script]({vt_jsx}) (opens if the file was scanned before).\n"

    return f"""## Route Drawer {tag}

Скрипт для Photoshop: ставите точки Пером по дорогам — получаете красную линию маршрута со стрелками направления. \
Установщик для Windows — одним файлом, скрипт подходит для Photoshop 2019 и новее.

### Что нового
{changes}

### Скачать
| Файл | Назначение | Размер | SHA-256 |
|:--|:--|--:|:--|
| [**{EXE}**]({base}/releases/download/{tag}/{EXE}) | установщик для Windows (рекомендуется) | {human_size(s_exe)} | `{h_exe}` |
| [{JSX}]({base}/releases/download/{tag}/{JSX}) | только скрипт: ручная установка, macOS | {human_size(s_jsx)} | `{h_jsx}` |
| [{SUMS}]({base}/releases/download/{tag}/{SUMS}) | контрольные суммы обоих файлов | — | — |

### Проверка безопасности
{scan_ru}- Установщик пока без цифровой подписи, поэтому Windows может показать «Неизвестный издатель» или SmartScreen. Это ожидаемо: сверьте сумму в PowerShell — `Get-FileHash .\\{EXE} -Algorithm SHA256`.
- Исходный код скрипта открыт для чтения: [{JSX}]({base}/blob/{tag}/{JSX}). Лицензия — [RDL 1.0]({base}/blob/{tag}/LICENSE). Сайт и инструкция: {site}

---

## Route Drawer {tag} (English)

A Photoshop script: place points along the roads with the Pen tool and get a red route line with direction arrows. \
The Windows installer is a single file; the script works with Photoshop 2019 and newer.

### Download
Files and SHA-256 checksums are in the table above. The installer is for Windows (recommended); `{JSX}` is the script alone, for manual installation and macOS.

### Security check
{scan_en}- The installer is not code-signed yet, so Windows may show "Unknown publisher" or SmartScreen. That is expected: verify the checksum in PowerShell — `Get-FileHash .\\{EXE} -Algorithm SHA256`.
- The script is plain readable source: [{JSX}]({base}/blob/{tag}/{JSX}). License: [RDL 1.0]({base}/blob/{tag}/LICENSE). Website and guide: {site}?lang=en
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--tag", required=True)
    ap.add_argument("--repo", required=True, help="владелец/репозиторий")
    ap.add_argument("--dist", default="dist", help="папка с готовыми файлами релиза")
    ap.add_argument("--vt", default="", help="вывод шага VirusTotal: файл=ссылка,файл=ссылка (пусто — проверка не выполнялась)")
    ap.add_argument("--notes-dir", default=".github/release-notes")
    ap.add_argument("--out", default="-")
    a = ap.parse_args()
    text = build(a.tag, a.repo, a.dist, parse_vt(a.vt), a.notes_dir)
    if a.out == "-":
        sys.stdout.write(text)
    else:
        with open(a.out, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
