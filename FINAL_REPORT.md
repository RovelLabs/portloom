# Portloom — Final Product & Engineering Report

## 1. PROJECT
**Portloom** (`v1.0.0`)  
*Репозиторий проекта:* `C:\Users\paranoia\Desktop\agy progeckt`

---

## 2. WHAT IT DOES
**Portloom** — высокопроизводительный локальный шлюз разработчика под Windows, объединяющий управление конфликтами портов (`EADDRINUSE`), профили файла `hosts`, выпуск доверенных локальных SSL-сертификатов (Root CA) и высокоскоростной reverse proxy с перехватом вебхуков в едином автономном рабочем пространстве. Утилита позволяет за 1 клик поднять доверенный HTTPS-домен (например, `https://my-app.local` → `:5173`) без ручных манипуляций с OpenSSL, консолью или файлом `hosts`.

---

## 3. WHY THIS PROJECT
Проект выбран на основе строгого исследования 15 направлений (оценка **9.33 / 10** в `docs/research/idea-scorecard.md`):
- **Острая ежедневная боль на Windows:** Зомби-процессы, блокирующие порты 3000/5173/8080, и сложность выпуска локальных доверенных SSL-сертификатов для Secure Context (Web Crypto, Service Workers, Telegram Mini Apps).
- **Специфика РФ/СНГ:** Взрывной рост разработки Telegram Mini Apps и ботов, требующих строго HTTPS при отладке, а также необходимость локального тестирования отечественных платежных шлюзов (ЮKassa, Т-Банк, Сбер, Robokassa) без медленных и блокируемых зарубежных облачных туннелей (ngrok).
- **Global-Ready потенциал:** Проблема универсальна для всех разработчиков на Windows в мире. На рынке до сих пор не существовало единого опенсорсного инструмента, связывающего порты, hosts, SSL и прокси воедино.

---

## 4. TARGET USERS
- **Fullstack & Frontend инженеры:** Запускающие Vite/Next.js/React и бэкенды на FastAPI/Node/Go/.NET.
- **Разработчики Telegram Mini Apps (TMA) и ботов:** Нуждающиеся в строгом валидном HTTPS на локальных доменах.
- **Backend & API инженеры:** Отлаживающие локальные вебхуки и микросервисы.

---

## 5. DIFFERENTIATOR
В отличие от разрозненных утилит (`mkcert` — только CLI, `PowerToys Hosts` — только редактор текста, `TCPView` — системный дамп сокетов, `ngrok` — облако и зарубежная оплата), **Portloom связывает весь цикл локальной сети воедино**:
Ввод домена и порта → Portloom сам прописывает `hosts`, генерирует доверенный SSL X.509 с SAN, сбрасывает DNS-кэш Windows и запускает обратный прокси с инспектором входящих вебхуков и оффлайн-моками.

---

## 6. TECH STACK
- **Core Gateway & Server:** Node.js (v22), TypeScript 5.7, Express 4.21, `http-proxy`, `ws` (WebSocket live streaming).
- **Cryptography & SSL:** `node-forge` (автономный выпуск X.509 Root CA и leaf-сертификатов с SAN), Windows `certutil` integration.
- **System Integration:** Windows `netstat`, `taskkill`, `tasklist`, `ipconfig /flushdns` с защитой системных процессов (`System`, `svchost.exe`, `explorer.exe`).
- **Frontend Workspace:** React 18, Vite 6, Lucide Icons, кастомная модульная дизайн-система в индустриальном стиле (Dark Slate & Graphite, Electric Cyan `#00F0FF`, Emerald `#10B981`).
- **Test Framework:** Vitest 2.1 (13 unit/integration тестов).

---

## 7. ARCHITECTURE
Трехуровневая архитектура:
1. **Core Gateway Engine:** Диспетчер портов, менеджер hosts с атомарной записью и бэкапами, криптографический хаб сертификатов, SNI reverse proxy с замером задержки.
2. **Local Management API & WebSockets:** REST API на `127.0.0.1:24224` + WebSocket шина событий инспектора.
3. **Reactive Desktop Workspace:** Одностраничное приложение с нулевой сетевой зависимостью от внешних CDN.

---

## 8. IMPLEMENTED FEATURES
- [x] **Live Port Matrix:** Интерактивное сканирование всех слушающих TCP-портов Windows с PID, именами процессов, объемом оперативной памяти и 1-клик завершением процессов.
- [x] **Защита ядра Windows:** Встроенный черный список системных процессов, предотвращающий их случайное завершение.
- [x] **Менеджер Hosts & Профили:** Редактирование `hosts` через управляемые блоки с сохранением комментариев, бэкапами и авто-сбросом DNS-кэша.
- [x] **Локальный Root CA & SSL Hub:** Генерация локального центра сертификации и выпуск доверенных сертификатов X.509 с SAN для любых доменов (`*.local`, `localhost`).
- [x] **Dynamic Reverse Proxy:** Высокоскоростной прокси с TLS-терминацией, поддержкой WebSocket (Vite HMR) и авто-CORS.
- [x] **Live Webhook Inspector:** Перехват входящих запросов в памяти, просмотр заголовков, форматированный JSON полезной нагрузки, генерация cURL-команд.
- [x] **Оффлайн-моки (Mock Engine):** Создание правил ответа (Status 200/500, задержка отклика, JSON payload) без запуска бэкенда.
- [x] **Bilingual RU/EN:** Полная двуязычная локализация и поддержка кириллических путей Windows.
- [x] **CLI интерфейс:** Консольные команды `portloom list`, `portloom kill <port>`, `portloom flushdns`, `portloom certs`, `portloom start`.

---

## 9. PRIVACY
- **0% телеметрии:** Никаких аналитических SDK (PostHog, Google Analytics, Sentry).
- **100% Offline / Air-Gapped:** Все ресурсы (шрифты, иконки, стили) скомпилированы локально. Приложение работает без доступа к интернету.
- **Localhost Binding:** API слушает только `127.0.0.1`.

---

## 10. SECURITY
- Разделение привилегий: работа в контексте обычного пользователя Windows.
- Атомарная запись системных файлов через временные файлы с предварительным резервным копированием.
- Защита от Command Injection и Path Traversal.
- Подробности в `docs/SECURITY_MODEL.md`.

---

## 11. TESTS
Запуск тестового набора Vitest:
```bash
npm test
```
**Результат:**
- `tests/inspector.test.ts` (3 теста) — PASSED
- `tests/hosts.test.ts` (3 теста) — PASSED
- `tests/proxy.test.ts` (4 теста) — PASSED
- `tests/certs.test.ts` (3 теста) — PASSED
- **ИТОГО:** 13 тестов из 13 успешно пройдены (100% pass rate).

---

## 12. BUILD
```bash
npm run build
```
**Результаты сборки:**
- Client: `dist/client/index.html` (0.49 КБ), `index.css` (9.0 КБ), `index.js` (201 КБ / gzip: 59.6 КБ).
- Server: `dist/server.js`, `dist/cli.js`, `dist/core/*`, `dist/types/*`.
- Время сборки: ~2.1 сек.

---

## 13. INSTALL
Для конечного пользователя:
1. **Zero-Install (NPX):** `npx portloom`
2. **Global NPM:** `npm install -g portloom && portloom`
3. **Portable ZIP:** Распаковать `portloom-v1.0.0-win-x64.zip` и запустить `portloom.cmd`.

---

## 14. WEBSITE
Официальный сайт проекта находится в директории `site/`:
- `site/index.html`: адаптивный промо- и документационный лендинг с переключателем RU/EN, скриншотами, сравнением «До/После» и инструкциями по установке.
- `site/styles.css`: индустриальная темная тема без внешних CDN.

---

## 15. GITHUB
Репозиторий полностью подготовлен к публикации:
- `.github/workflows/ci.yml`: матричное CI тестирование (Windows + Ubuntu, Node 18, 20, 22).
- `.github/workflows/release.yml`: автосборка релизного архива при создании Git-тега `v*`.
- Шаблоны issues (`bug_report.yml`, `feature_request.yml`) и PR (`PULL_REQUEST_TEMPLATE.md`).
- Двуязычные `README.md` и `README.ru.md` с реальными скриншотами продукта.
- `LICENSE` (MIT), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CHANGELOG.md`.

---

## 16. RELEASE
- Готовый релизный архив: `portloom-v1.0.0-win-x64.zip` (739 КБ).
- Контрольная сумма SHA-256: `766D5984BAD062DF8A7726D14D608B218BA9EA6E58997E53BD1F9C05299F61BF` (записана в `SHA256SUMS.txt`).

---

## 17. KNOWN LIMITATIONS
1. Привязка к порту 443 и редактирование `hosts` в Windows требуют прав администратора (UAC elevation) либо настройки портов пользователя (например, 8443).
2. Браузер Mozilla Firefox использует собственное хранилище NSS (`cert9.db`) отдельно от Windows CryptoAPI, поэтому для Firefox требуется однократный ручной импорт корневого сертификата.

---

## 18. FUTURE
1. **WSL2 Automatic Port Bridge:** Прозрачное зеркалирование сетевых сокетов между Linux WSL2 и хостом Windows.
2. **Встроенный Local DNS Resolver (UDP 53):** Поддержка wildcard доменов `*.local` без необходимости редактировать файл `hosts`.
3. **Авто-обнаружение контейнеров Docker:** Автоматическое предложение создания локального HTTPS-домена для поднятых контейнеров.
4. **HAR Export:** Экспорт перехваченного трафика в стандартный формат HTTP Archive для Chrome DevTools.
