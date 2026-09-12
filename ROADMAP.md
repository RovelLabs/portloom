# Portloom Roadmap

План развития продукта разделен на три горизонта: **Now (V1.0)**, **Next (V1.1 - V1.3)** и **Later (V2.0+)**.

---

## 🟢 Now: Release V1.0.0 (Текущий релиз)
- [x] **Live Port Matrix:** Интерактивное сканирование слушающих сокетов Windows, определение PID, имени процесса, памяти и 1-клик освобождение порта (`taskkill`).
- [x] **Instant Hosts Profiles:** Управление `C:\Windows\System32\drivers\etc\hosts` с поддержкой профилей, атомарной записи, автоматического резервного копирования и `ipconfig /flushdns`.
- [x] **Self-Sovereign Local CA & SSL:** Генерация локального корневого CA и валидных X.509 сертификатов с SAN для любых доменов (`*.local`, `localhost`).
- [x] **Dynamic Reverse Proxy & HTTPS Gateway:** Маршрутизация трафика по домену и префиксу пути с прозрачной поддержкой WebSocket / HMR.
- [x] **Live Webhook & Request Inspector:** Перехват и инспекция HTTP-запросов в реальном времени, просмотр заголовков, форматирование JSON, оффлайн-мокирование ответов.
- [x] **RU-first & Global-ready:** Полная двуязычная локализация (русский и английский), корректная работа с кириллическими путями Windows.
- [x] **Zero Telemetry & 100% Offline:** Полная автономность без внешних облачных зависимостей.

---

## 🟡 Next: V1.1 — V1.3
- [ ] **WSL2 Automatic Port Bridge:** Прозрачное зеркалирование портов между подсистемой WSL2 (Ubuntu/Debian) и Windows хостом.
- [ ] **Docker Containers Auto-Discovery:** Автоматическое обнаружение запущенных контейнеров с открытыми портами и предложение 1-клик создания локального SSL-домена.
- [ ] **CLI Standalone Tooling:** Расширенный набор команд терминала (`portloom kill :3000`, `portloom link app.local:5173`).
- [ ] **Config Export & Team Share:** Экспорт файла `.portloom.json` в корень репозитория проекта для автоматической синхронизации маршрутов и доменов между членами команды.

---

## 🔵 Later: V2.0+
- [ ] **DNS-over-HTTPS (DoH) Local Resolver:** Встроенный локальный DNS-сервер на `127.0.0.1:53` для полной поддержки wildcard доменов `*.local` без необходимости редактировать файл `hosts`.
- [ ] **Network Throttling & Latency Simulation:** Эмуляция медленного 3G/LTE соединения и процента потери пакетов для стресс-тестирования фронтенда.
- [ ] **Cross-Platform Parity:** Полноценные сборки ядра под macOS и Linux (Ubuntu/Fedora/Arch).
