SOLARFLOW PWA — УСТАНОВКА НА IPHONE БЕЗ ВИДА САЙТА

1. В репозитории GitHub solarflow-app удалять ничего не нужно.
2. Загрузите/замените в корне репозитория эти файлы:
   - index.html
   - manifest.webmanifest
   - service-worker.js
   - папку icons с тремя PNG
3. Commit changes. GitHub Pages обновится автоматически.
4. На iPhone откройте https://spinup-play.github.io/solarflow-app/ именно в Safari.
5. Нажмите Поделиться -> На экран «Домой» -> Добавить.
6. Запускайте SolarFlow только с иконки на домашнем экране. Он откроется в standalone-режиме без адресной строки Safari.

ВАЖНО: если раньше SolarFlow уже был добавлен на экран Домой, удалите старую иконку и добавьте заново после обновления GitHub Pages.
