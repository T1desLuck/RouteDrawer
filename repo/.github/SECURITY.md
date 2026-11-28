# Безопасность / Security policy

## Как сообщить об уязвимости

**Пожалуйста, не публикуйте подробности уязвимости в открытых задачах (Issues).**

1. Откройте [приватное сообщение об уязвимости](https://github.com/T1desLuck/RouteDrawer/security/advisories/new) — его видит только автор.
2. Или напишите на почту **tidesluck@icloud.com** с темой «Route Drawer: security».

Что указать: версия Route Drawer, версия Photoshop и Windows, что именно происходит и как это повторить. Автор ответит в течение нескольких дней и сообщит, когда будет исправление.

## Что входит в проект и как это устроено

- **RouteDrawer.jsx** — скрипт ExtendScript. Он читает контур текущего документа Photoshop и рисует на нём слои. По исходному коду он не обращается к сети, не запускает внешние программы и не читает и не пишет файлы.
- **RouteDrawer-Setup.exe** — установщик для Windows. Он ищет папки Photoshop и копирует туда один файл `RouteDrawer.jsx`. По исходному коду он не обращается к сети, не собирает данные и не пишет в реестр.
- Установщик пока **не подписан** цифровым сертификатом, поэтому Windows может показать «Неизвестный издатель». Чтобы убедиться, что файл не подменён, сверьте SHA-256 с таблицей в [README](https://github.com/T1desLuck/RouteDrawer#скачать) и в описании релиза.

## Поддерживаемые версии

Исправления выпускаются только для **последнего релиза** (см. [Releases](https://github.com/T1desLuck/RouteDrawer/releases/latest)).

---

## How to report a vulnerability

**Please do not post vulnerability details in public issues.**

1. Use [private vulnerability reporting](https://github.com/T1desLuck/RouteDrawer/security/advisories/new) (visible to the author only), or
2. email **tidesluck@icloud.com** with the subject "Route Drawer: security".

Include the Route Drawer, Photoshop and Windows versions, what happens, and how to reproduce it. The author will reply within a few days.

## Scope

- `RouteDrawer.jsx` is an ExtendScript file. According to its source it makes no network calls, starts no external programs and does not read or write files.
- `RouteDrawer-Setup.exe` is a Windows installer that copies one file (`RouteDrawer.jsx`) into Photoshop's Scripts folders. According to its source it makes no network calls, collects no data and writes nothing to the registry.
- The installer is **not code-signed yet**, so Windows may show "Unknown publisher". Verify the SHA-256 checksum from the [README](https://github.com/T1desLuck/RouteDrawer#скачать) or the release notes.

## Supported versions

Fixes are released for the **latest release** only.
