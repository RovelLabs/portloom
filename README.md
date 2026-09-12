<p align="center">
  <img src="assets/brand/logo.svg" alt="Portloom Logo" width="380" />
</p>

<p align="center">
  <strong>High-performance local developer gateway for Windows.</strong><br>
  Weaves port management, hosts profiles, 1-click trusted SSL certificates, and a reverse proxy with webhook inspection into a single zero-config workspace.
</p>

<p align="center">
  <a href="README.ru.md"><strong>🇷🇺 Читать на русском</strong></a> •
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#how-it-works">Architecture</a> •
  <a href="ROADMAP.md">Roadmap</a> •
</p>

<p align="center">
  <img src="assets/screenshots/dashboard.png" alt="Portloom Dashboard Screenshot" width="840" style="border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);" />
</p>

---

## Why Portloom?

Every developer running web services on Windows deals with repetitive friction daily:
1. **Port Conflicts (`EADDRINUSE`):** Node, Python, or Go servers crash, leaving ports 3000, 5173, or 8080 held by zombie processes. Finding the PID via `netstat -ano` and killing it with `taskkill` wastes time.
2. **Local HTTPS Requirements:** Browsers enforce Secure Context (`https://`) for Web Crypto, Service Workers, Clipboard API, WebRTC, secure cookies, and Telegram Mini Apps. Generating a local CA and configuring Windows certificates requires complicated manual OpenSSL commands.
3. **Hosts File Chaos:** Editing `C:\Windows\System32\drivers\etc\hosts` requires Administrator elevation, formatting is fragile, and switching between projects with different domains is cumbersome.
4. **CORS & Multi-Service Routing:** Connecting a frontend on port 5173 to an API on port 8000 without CORS issues traditionally requires running heavy Docker containers or complex Nginx configurations.
5. **Webhook Inspection Without Cloud Accounts:** Inspecting incoming webhooks from Telegram bots or payment providers typically requires third-party cloud tunnels that add latency or require subscription tiers.

**Portloom solves all five in one unified, local-first open-source application.**

---

## Features

- ⚡ **Live Port Matrix:** Real-time table of all listening TCP sockets on Windows. Search by port or process name, view process memory, and kill processes in 1 click.
- 🔒 **1-Click Trusted Local SSL (Root CA):** Generates and installs a self-sovereign local Root CA into the Windows Trusted Store. Automatically signs X.509 leaf certificates with SAN for `*.local`, `localhost`, or custom domains.
- 🌐 **Hosts Profile Orchestrator:** Manage `C:\Windows\System32\drivers\etc\hosts` safely. Group entries into project profiles, toggle domains on/off with checkboxes, create automatic backups before every write, and flush DNS cache on change.
- 🔀 **Dynamic Reverse Proxy:** Route domains and paths (`https://app.local` → `:5173`, `https://app.local/api` → `:8000`) with automatic TLS termination and transparent WebSocket / HMR support.
- 📡 **Live Webhook & Request Inspector:** Capture and inspect incoming HTTP requests in real time. View method, URL, headers, formatted JSON body, copy cURL commands, and configure offline mock responses.
- 🛡️ **Zero Telemetry & 100% Offline:** Operates entirely locally. No analytics, no accounts, no cloud tokens, no external CDN dependencies.
- 🇷🇺 **Native Bilingual Support:** Full Russian and English localization, with verified compatibility for Cyrillic Windows usernames and paths with spaces.

---

## Installation

### Method 1: NPX (Zero Install)
Run Portloom instantly without installing anything permanently:
```bash
npx portloom
```

### Method 2: Global NPM Install
```bash
npm install -g portloom
portloom
```

### Method 3: Standalone Portable (Windows)
Download the latest `portloom-v1.0.0-win-x64.zip` from [Releases](https://github.com/portloom/portloom/releases), unpack it to any directory, and launch `portloom.cmd`.

---

## Quick Start

1. Start Portloom:
   ```bash
   portloom
   ```
2. Open your browser at `http://localhost:24224`.
3. **Create your first HTTPS domain:**
   - Go to **Proxy & SSL** tab.
   - Click **Add Route**:
     - Host domain: `my-app.local`
     - Target port: `3000` (or whatever your dev server uses)
     - Enable **Automatic SSL** and **Update Hosts**.
   - Click **Save**.
4. Open `https://my-app.local` in your browser. The connection is secure (green padlock), and all requests appear live in the **Traffic Inspector** tab.

---

## CLI Usage

Portloom also includes a terminal utility:

```bash
# Show active listening ports and processes
portloom list

# Kill process occupying a specific port
portloom kill 3000

# Start background gateway
portloom start --port 24224

# Flush Windows DNS resolver cache
portloom flushdns
```

---

## How It Works

```
Browser / Client (https://app.local)
       │
       ▼
[Windows DNS / hosts (127.0.0.1)]
       │
       ▼
[Portloom Gateway (Port 443 / 8443)]
       │  ├─ Dynamic SNI Dispatcher (Local Root CA certs)
       │  ├─ Real-Time Request Inspector & Mock Engine
       │  └─ Stream-Piping Reverse Proxy
       ▼
Your Local Dev Servers (Vite :5173, FastAPI :8000, etc.)
```

1. Portloom points custom `.local` domains to `127.0.0.1` via safe, atomic blocks in the Windows `hosts` file.
2. The gateway listens on port 443 (or user port 8443) and matches incoming TLS SNI hostnames against registered routes.
3. If an SSL certificate does not exist yet, Portloom signs a new X.509 certificate on-the-fly using the local Root CA.
4. Traffic is piped to the target port, while headers and payload summaries are streamed to the inspector UI over a local WebSocket.

---

## Privacy & Security

- **No telemetry:** Portloom does not collect or transmit analytics, device IDs, or traffic data.
- **Localhost binding:** The management API listens exclusively on `127.0.0.1`. External local-network access is disabled by default.
- **Safe process termination:** System processes (`System`, `svchost.exe`, `explorer.exe`) are protected by an internal safety whitelist.
- For complete details, see [SECURITY_MODEL.md](docs/SECURITY_MODEL.md) and [PRIVACY.md](PRIVACY.md).

---

## Platforms

- **Primary:** Windows 10 & Windows 11 (x64)
- **Supported:** Windows Server 2019+, WSL2 (Ubuntu / Debian)
- **Node.js:** >= 18.0.0

---

## Contributing

Contributions, bug reports, and suggestions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before submitting a pull request.

---

## License

Released under the [MIT License](LICENSE).
