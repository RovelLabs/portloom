# Portloom Architecture Specification

## 1. System Overview

Portloom спроектирован как **высокопроизводительный, локально-первичный (local-first) шлюз разработчика**. 
Архитектура разделена на три четких уровня:
1. **Core Gateway & System Engine (Node.js/TypeScript Engine)**: системный контроллер портов, генератор X.509 сертификатов, менеджер файлов hosts, динамический HTTP/HTTPS обратный прокси-сервер и перехватчик сетевого трафика.
2. **Local Management API & IPC Layer**: легковесный REST + WebSocket/SSE сервер на порту управления (по умолчанию `127.0.0.1:24224`), защищенный локальным токеном сессии или localhost-binding.
3. **Modern Reactive Workspace (Web/Desktop Client)**: одностраничное приложение на React + TypeScript + Vite, сфокусированное на мгновенном отклике, нулевой сетевой зависимости во внешние CDN и промышленном UX.

```
┌─────────────────────────────────────────────────────────────┐
│                 Portloom Desktop Workspace                  │
│       (React 18 + TypeScript + Vite + Custom Design)        │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP / WebSocket (localhost:24224)
┌──────────────────────────────▼──────────────────────────────┐
│                    Portloom Gateway Core                    │
│                                                             │
│  ┌─────────────────┐ ┌────────────────┐ ┌────────────────┐  │
│  │   Port Matrix   │ │ Hosts Manager  │ │  Cert & CA Hub │  │
│  │ (netstat/pskill)│ │ (backup/parse) │ │ (node-forge/CA)│  │
│  └─────────────────┘ └────────────────┘ └────────────────┘  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │   Local Reverse Proxy & Traffic Inspector Engine      │  │
│  │   (SNI Router / Dynamic SSL / Webhook Tap / Mocks)    │  │
│  └───────────────────────────┬───────────────────────────┘  │
└──────────────────────────────┼──────────────────────────────┘
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
       Local Dev Apps                 External Requests
   (:3000, :5173, :8000, ...)        (Browser / Webhooks)
```

---

## 2. Components & Modules

### 2.1. Port Management Engine (`core/ports`)
- **Scanner:** Опрашивает сетевые интерфейсы (`netstat -ano -p tcp` / PowerShell `Get-NetTCPConnection`).
- **Process Resolver:** Маппит PID на имя исполняемого файла, полный путь и объем потребляемой оперативной памяти.
- **Port Terminator:** Безопасное завершение процессов (`taskkill /PID <pid> /F`). Поддерживает валидацию системных процессов (защита от случайного завершения `System`, `svchost.exe`, `explorer.exe`).

### 2.2. Hosts File Manager (`core/hosts`)
- **Parser & Serializer:** Корректный парсинг `C:\Windows\System32\drivers\etc\hosts` с сохранением комментариев, пустых строк и структуры.
- **Profile Orchestration:** Поддержка именованных профилей (`Default`, `Project-Alpha`, `Isolated`). Каждая запись может быть включена или выключена индивидуально.
- **Atomic Writer & Backup:** Перед каждой модификацией создается резервная копия в `%APPDATA%\Portloom\hosts_backups\` с меткой времени. Запись производится во временный файл с последующим атомарным переименованием.
- **DNS Cache Flusher:** Автоматический вызов `ipconfig /flushdns` после применения изменений.

### 2.3. Certificate & Local Root CA Hub (`core/certs`)
- **Self-Sovereign Local CA:** Автономный центр сертификации (RSA 2048 / ECDSA P-256), генерируемый локально на компьютере разработчика.
- **System Store Integration:** Поддержка автоматического импорта корневого CA в хранилище Windows (`certutil -addstore -user Root` / LocalMachine) для мгновенного доверия в Chrome, Edge, curl и Node.js.
- **Dynamic Leaf Certificates:** Генерация оконечных сертификатов с поддержкой Subject Alternative Names (SAN) для любого локального домена (`*.local`, `*.test`, `my-app.dev`, `localhost`).
- **In-Memory SNI Cache:** Кэширование `tls.SecureContext` для избежания задержек при TLS-рукопожатии.

### 2.4. Local Reverse Proxy & SNI Router (`core/proxy`)
- **Dynamic Routing Table:** Маршрутизация на основе `Host` заголовка и префикса пути (`pathname`).
  - Пример: `app.local` → `http://127.0.0.1:5173`
  - Пример: `app.local/api` → `http://127.0.0.1:8000`
- **SNI Context Switching:** Определение домена на фазе TLS-хэндшейка и предоставление соответствующего SSL-сертификата.
- **WebSocket & SSE Transparent Pass-through:** Поддержка HMR (Hot Module Replacement) для Vite, Webpack, Next.js без обрыва соединений.
- **CORS Normalizer (Опционально):** Автоматическая простановка заголовков `Access-Control-Allow-Origin` для устранения CORS в локальной разработке.

### 2.5. Webhook & HTTP Traffic Inspector (`core/inspector`)
- **Request Capture:** Перехват метаданных (метод, URL, путь, IP, заголовки, размер) и тела запроса.
- **Streaming Buffer:** Кольцевой буфер в памяти (In-Memory Ring Buffer, по умолчанию последние 500 запросов) с нулевым воздействием на диск при штатной отладке.
- **Mock Engine:** Возможность перехватить конкретный endpoint и вернуть заранее заданный оффлайн-ответ (Status, Custom Headers, JSON body) до отправки в бэкенд.

---

## 3. Data Flow

1. Пользователь заходит в браузере на `https://my-app.local`.
2. Windows разрешает `my-app.local` в `127.0.0.1` благодаря записи в `hosts`, созданной Portloom.
3. Запрос поступает на порт 443 (или настроенный порт шлюза, например 8443), слушаемый Portloom Proxy.
4. Прокси извлекает SNI (`my-app.local`), получает из кэша валидный доверенный SSL-сертификат и завершает TLS-рукопожатие.
5. Инспектор трафика клонирует заголовки и тело в шину событий WebSocket/UI.
6. Модуль маршрутизации проверяет правила: если задан mock — немедленно возвращает mock-ответ. Иначе проксирует запрос на `http://127.0.0.1:3000`.
7. Ответ от dev-сервера возвращается клиенту с корректными заголовками, а время отклика (latency) логируется в UI.

---

## 4. Storage & Persistence

- **Конфигурация:** `%APPDATA%\Portloom\config.json` (Windows) или `~/.config/portloom/config.json` (POSIX).
- **Сертификаты:** `%APPDATA%\Portloom\certs\ca.crt`, `ca.key` (с ограниченными правами доступа файловой системы NTFS).
- **Бэкапы hosts:** `%APPDATA%\Portloom\backups\`.
- **Формат хранения:** Строго валидированный JSON со схемой версии (`schemaVersion: 1`).
- **Принцип сохранности данных:** Никакие системные файлы не перезаписываются без предварительного сохранения бэкапа.

---

## 5. Security Boundaries

- **Привязка к локальному хосту (Localhost Binding):** Все управляющие интерфейсы слушают исключительно `127.0.0.1`. Доступ из внешней локальной сети заблокирован по умолчанию.
- **Privilege Separation (Разделение привилегий):** Основное приложение запускается без прав администратора. Вызов системных операций (`hosts`, доверенное хранилище сертификатов) осуществляется через изолированные системные команды Windows с явным уведомлением пользователя.
- **No Remote Telemetry:** Никакие данные об адресах, проектах, теле запросов или портах не передаются во внешнюю сеть.
- **Sanitization:** Все входные пути и имена доменов валидируются строгими регулярными выражениями во избежание path traversal и command injection.

---

## 6. Frontend / Backend Communication

- **REST API:** CRUD операций для маршрутов прокси, правил hosts, сертификатов и управления портами.
- **Event Stream / WebSocket:** Двусторонняя трансляция живого лога запросов инспектора и обновлений состояния портов в реальном времени.

---

## 7. Testing Strategy

1. **Unit Tests:**
   - Парсер и генератор файла `hosts` (пустые строки, комментарии, дубликаты, кириллические комментарии).
   - Валидация доменов и портов.
   - Генерация сертификатов и проверка валидности X.509.
   - Логика маршрутизатора прокси (сопоставление префиксов путей и хостов).
2. **Integration Tests:**
   - Запуск сквозного HTTP/HTTPS проксирования.
   - Завершение и освобождение тестового сетевого сокета.
   - Захват вебхука с JSON-полезной нагрузкой.
3. **Edge Case Tests:**
   - Кириллические пути в Windows (`C:\Пользователи\...`).
   - Пути с пробелами (`C:\Users\paranoia\Desktop\agy progeckt`).
   - Обработка внезапного обрыва целевого dev-сервера (502 Bad Gateway с красивым русским/английским описанием).
