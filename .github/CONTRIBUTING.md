# Как помочь проекту / Contributing

Спасибо, что хотите помочь! Route Drawer распространяется по лицензии [RDL 1.0](../LICENSE): **изменять код можно только с разрешения автора** (раздел 5 лицензии). Поэтому порядок такой: сначала договариваемся, потом пишем код.

## Самое полезное, что можно сделать

- **Сообщить об ошибке** — [заполните форму](https://github.com/T1desLuck/RouteDrawer/issues/new/choose). Нужны версия Photoshop, система, шаги и текст ошибки.
- **Предложить идею** — через ту же форму «Идея». Опишите задачу, которую хотите решить.
- **Показать результат** — карты, сделанные с помощью Route Drawer, скриншоты настроек, которые у вас хорошо легли на дорогу. Это помогает понять, чего не хватает.
- **Рассказать другим** — автошколам, дизайнерам, тем, кто делает схемы проезда. Ссылка: https://t1desluck.github.io/RouteDrawer/
- **Поставить звезду** репозиторию — так проект проще найти.
- **Поправить текст** — опечатка в README или на сайте. Напишите о ней в задаче или предложите правку.

## Хотите изменить код?

1. Откройте задачу или обсуждение и опишите, что именно хотите изменить и зачем.
2. Дождитесь ответа автора: **письменное разрешение** обязательно (раздел 5 лицензии RDL 1.0).
3. После согласия сделайте форк, внесите изменения в отдельной ветке и откройте Pull Request по [шаблону](PULL_REQUEST_TEMPLATE.md).
4. Присылая Pull Request, вы подтверждаете, что у вас есть право на этот код, и разрешаете автору включить его в Route Drawer на условиях RDL 1.0.

Что важно для принятия правки:

- `RouteDrawer.jsx` — это ExtendScript (старый JavaScript, ES3): без `let`/`const`, стрелочных функций, шаблонных строк и `JSON`.
- Файл сохранён в UTF-8 **с BOM** и с окончаниями строк `LF`. Не конвертируйте его.
- Если меняется `RouteDrawer.jsx` или установщик, обновляются SHA-256 в README и на сайте. Проверка [Integrity](workflows/integrity.yml) покажет, если что-то забыли: `python3 .github/scripts/verify_integrity.py`.
- Одна правка — одна тема. Опишите, как проверяли: версия Photoshop, какой контур.

---

# Contributing

Thanks for wanting to help! Route Drawer is under the [RDL 1.0](../LICENSE) license: **code may be modified only with the author's permission** (section 5). So: agree first, code second.

## The most helpful things

- **Report a bug** with the [issue form](https://github.com/T1desLuck/RouteDrawer/issues/new/choose): Photoshop version, OS, steps, error text.
- **Suggest an idea** with the same form. Describe the problem you want to solve.
- **Share your results** — maps made with Route Drawer and the settings that worked for you.
- **Spread the word** to driving schools, designers and anyone drawing route maps: https://t1desluck.github.io/RouteDrawer/?lang=en
- **Star the repository** so that others can find it.
- **Fix a typo** in the README or the website.

## Want to change the code?

1. Open an issue or a discussion describing what and why.
2. Wait for the author's **written permission** (RDL 1.0, section 5).
3. Fork, make your change on a separate branch and open a Pull Request using the [template](PULL_REQUEST_TEMPLATE.md).
4. By submitting a Pull Request you confirm that you have the right to the code and allow the author to include it in Route Drawer under RDL 1.0.

Requirements: `RouteDrawer.jsx` is ExtendScript (ES3: no `let`/`const`, arrow functions, template literals or `JSON`); keep UTF-8 **with BOM** and `LF` line endings; when the script or installer changes, update the SHA-256 values in the README and the website — the [Integrity](workflows/integrity.yml) check (`python3 .github/scripts/verify_integrity.py`) tells you what is out of sync.
