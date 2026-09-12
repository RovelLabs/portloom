import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import express, { Request, Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { StorageManager } from './core/storage';
import { PortManager } from './core/port-manager';
import { HostsManager } from './core/hosts-manager';
import { CertManager } from './core/cert-manager';
import { TrafficInspector } from './core/traffic-inspector';
import { ProxyEngine } from './core/proxy-engine';
import { ProxyRoute, MockRule, HostsRecord } from './types';

export class PortloomServer {
  private app: express.Application;
  private httpServer: http.Server;
  private wss: WebSocketServer;
  private storage: StorageManager;
  private portManager: PortManager;
  private hostsManager: HostsManager;
  private certManager: CertManager;
  private inspector: TrafficInspector;
  private proxyEngine: ProxyEngine;

  constructor() {
    this.storage = new StorageManager();
    this.portManager = new PortManager();
    this.hostsManager = new HostsManager(this.storage);
    this.certManager = new CertManager(this.storage);
    this.inspector = new TrafficInspector();
    this.proxyEngine = new ProxyEngine(this.certManager, this.inspector);

    // Load persisted routes & mocks
    const config = this.storage.loadConfig();
    this.proxyEngine.setRoutes(config.routes);
    this.inspector.setMockRules(config.mockRules);

    this.app = express();
    this.httpServer = http.createServer(this.app);
    this.wss = new WebSocketServer({ server: this.httpServer });

    this.setupMiddlewares();
    this.setupRoutes();
    this.setupWebSockets();
  }

  private setupMiddlewares(): void {
    this.app.use(express.json());

    // Localhost security check
    this.app.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') return res.sendStatus(204);
      next();
    });
  }

  private setupWebSockets(): void {
    this.inspector.on('traffic', (item) => {
      const msg = JSON.stringify({ type: 'TRAFFIC_ITEM', payload: item });
      for (const client of this.wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(msg);
        }
      }
    });

    this.inspector.on('clear', () => {
      const msg = JSON.stringify({ type: 'TRAFFIC_CLEAR' });
      for (const client of this.wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(msg);
        }
      }
    });
  }

  private setupRoutes(): void {
    // 1. Health & Status
    this.app.get('/api/status', (req: Request, res: Response) => {
      const config = this.storage.loadConfig();
      res.json({
        name: 'Portloom',
        version: '1.0.0',
        status: 'online',
        uptimeSeconds: Math.floor(process.uptime()),
        routesCount: config.routes.length,
        mocksCount: config.mockRules.length,
        language: config.language
      });
    });

    // 2. Ports API
    this.app.get('/api/ports', async (req: Request, res: Response) => {
      const ports = await this.portManager.getListeningPorts();
      res.json({ ports });
    });

    this.app.post('/api/ports/kill', async (req: Request, res: Response) => {
      const { pid } = req.body;
      if (typeof pid !== 'number') {
        return res.status(400).json({ success: false, message: 'Invalid PID' });
      }
      const result = await this.portManager.killProcessByPid(pid);
      res.json(result);
    });

    // 3. Hosts API
    this.app.get('/api/hosts', (req: Request, res: Response) => {
      const config = this.storage.loadConfig();
      const raw = this.hostsManager.readHostsRaw();
      const activeProfile = config.profiles.find(p => p.id === config.activeHostsProfileId) || config.profiles[0];
      res.json({
        profiles: config.profiles,
        activeProfileId: config.activeHostsProfileId,
        activeProfile,
        rawHostsPath: this.hostsManager.getHostsPath(),
        backups: this.hostsManager.listBackups()
      });
    });

    this.app.post('/api/hosts/profile', async (req: Request, res: Response) => {
      const { profileId } = req.body;
      const config = this.storage.loadConfig();
      const profile = config.profiles.find(p => p.id === profileId);
      if (!profile) {
        return res.status(404).json({ success: false, message: 'Profile not found' });
      }

      config.activeHostsProfileId = profileId;
      config.profiles.forEach(p => p.active = (p.id === profileId));
      this.storage.saveConfig(config);

      const applyResult = await this.hostsManager.applyProfile(profile);
      res.json({ ...applyResult, profiles: config.profiles, activeProfileId: profileId });
    });

    this.app.post('/api/hosts/record', async (req: Request, res: Response) => {
      const { domain, ip = '127.0.0.1', comment = '' } = req.body;
      if (!domain) return res.status(400).json({ error: 'Domain is required' });

      const config = this.storage.loadConfig();
      const profile = config.profiles.find(p => p.id === config.activeHostsProfileId) || config.profiles[0];

      const existing = profile.records.find(r => r.domain.toLowerCase() === domain.toLowerCase());
      if (existing) {
        existing.enabled = true;
        existing.ip = ip;
        existing.comment = comment;
      } else {
        profile.records.push({
          id: `rec_${Date.now()}`,
          domain: domain.toLowerCase(),
          ip,
          enabled: true,
          comment
        });
      }

      this.storage.saveConfig(config);
      const applyResult = await this.hostsManager.applyProfile(profile);
      res.json({ success: true, profile, applyResult });
    });

    this.app.post('/api/hosts/toggle-record', async (req: Request, res: Response) => {
      const { recordId, enabled } = req.body;
      const config = this.storage.loadConfig();
      const profile = config.profiles.find(p => p.id === config.activeHostsProfileId);
      if (!profile) return res.status(404).json({ error: 'Profile not found' });

      const record = profile.records.find(r => r.id === recordId);
      if (!record) return res.status(404).json({ error: 'Record not found' });

      record.enabled = enabled;
      this.storage.saveConfig(config);
      const applyResult = await this.hostsManager.applyProfile(profile);
      res.json({ success: true, profile, applyResult });
    });

    this.app.post('/api/hosts/flushdns', async (req: Request, res: Response) => {
      const ok = await this.hostsManager.flushDns();
      res.json({ success: ok, message: ok ? 'DNS-кэш Windows успешно сброшен.' : 'Не удалось выполнить ipconfig /flushdns.' });
    });

    // 4. Certificates API
    this.app.get('/api/certs', (req: Request, res: Response) => {
      const caInfo = this.certManager.getCAInfo();
      const certificates = this.certManager.listMintedCertificates();
      res.json({ caInfo, certificates });
    });

    this.app.post('/api/certs/mint', (req: Request, res: Response) => {
      const { domain } = req.body;
      if (!domain) return res.status(400).json({ error: 'Domain is required' });

      try {
        this.certManager.getCertificateForDomain(domain);
        const certificates = this.certManager.listMintedCertificates();
        res.json({ success: true, certificates, message: `Сертификат для ${domain} успешно выпущен.` });
      } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    this.app.post('/api/certs/trust', async (req: Request, res: Response) => {
      const result = await this.certManager.trustRootCAInWindows();
      res.json(result);
    });

    // 5. Proxy Routes API (with 1-click domain mesh)
    this.app.get('/api/proxy/routes', (req: Request, res: Response) => {
      const config = this.storage.loadConfig();
      res.json({ routes: config.routes });
    });

    this.app.post('/api/proxy/routes', async (req: Request, res: Response) => {
      const { domain, targetUrl, pathPrefix = '/', sslEnabled = true, corsEnabled = true, addToHosts = true } = req.body;
      if (!domain || !targetUrl) {
        return res.status(400).json({ error: 'Domain and targetUrl are required' });
      }

      const config = this.storage.loadConfig();
      const cleanDomain = domain.toLowerCase().trim();

      // Check if route already exists
      let route = config.routes.find(r => r.domain.toLowerCase() === cleanDomain && r.pathPrefix === pathPrefix);
      if (route) {
        route.targetUrl = targetUrl;
        route.sslEnabled = sslEnabled;
        route.corsEnabled = corsEnabled;
      } else {
        route = {
          id: `route_${Date.now()}`,
          domain: cleanDomain,
          pathPrefix,
          targetUrl,
          sslEnabled,
          stripPrefix: false,
          corsEnabled,
          createdAt: new Date().toISOString()
        };
        config.routes.push(route);
      }

      // Mint SSL certificate if requested
      if (sslEnabled) {
        this.certManager.getCertificateForDomain(cleanDomain);
      }

      // Add to hosts file if requested
      if (addToHosts) {
        const profile = config.profiles.find(p => p.id === config.activeHostsProfileId) || config.profiles[0];
        const existingHost = profile.records.find(r => r.domain.toLowerCase() === cleanDomain);
        if (!existingHost) {
          profile.records.push({
            id: `rec_${Date.now()}`,
            domain: cleanDomain,
            ip: '127.0.0.1',
            enabled: true,
            comment: 'Auto-added by Portloom Proxy'
          });
          await this.hostsManager.applyProfile(profile);
        }
      }

      this.storage.saveConfig(config);
      this.proxyEngine.setRoutes(config.routes);

      res.json({ success: true, route, routes: config.routes });
    });

    this.app.delete('/api/proxy/routes/:id', (req: Request, res: Response) => {
      const { id } = req.params;
      const config = this.storage.loadConfig();
      config.routes = config.routes.filter(r => r.id !== id);
      this.storage.saveConfig(config);
      this.proxyEngine.setRoutes(config.routes);
      res.json({ success: true, routes: config.routes });
    });

    // 6. Traffic & Webhook Inspector API
    this.app.get('/api/traffic', (req: Request, res: Response) => {
      res.json({ items: this.inspector.getItems() });
    });

    this.app.delete('/api/traffic', (req: Request, res: Response) => {
      this.inspector.clearItems();
      res.json({ success: true });
    });

    // 7. Mock Rules API
    this.app.get('/api/mocks', (req: Request, res: Response) => {
      const config = this.storage.loadConfig();
      res.json({ mocks: config.mockRules });
    });

    this.app.post('/api/mocks', (req: Request, res: Response) => {
      const rule: MockRule = req.body;
      if (!rule.name || !rule.path) {
        return res.status(400).json({ error: 'Name and path are required' });
      }

      const config = this.storage.loadConfig();
      if (!rule.id) rule.id = `mock_${Date.now()}`;

      const idx = config.mockRules.findIndex(m => m.id === rule.id);
      if (idx !== -1) {
        config.mockRules[idx] = rule;
      } else {
        config.mockRules.push(rule);
      }

      this.storage.saveConfig(config);
      this.inspector.setMockRules(config.mockRules);
      res.json({ success: true, mock: rule, mocks: config.mockRules });
    });

    this.app.delete('/api/mocks/:id', (req: Request, res: Response) => {
      const { id } = req.params;
      const config = this.storage.loadConfig();
      config.mockRules = config.mockRules.filter(m => m.id !== id);
      this.storage.saveConfig(config);
      this.inspector.setMockRules(config.mockRules);
      res.json({ success: true, mocks: config.mockRules });
    });

    // 8. General Config API
    this.app.get('/api/config', (req: Request, res: Response) => {
      res.json(this.storage.loadConfig());
    });

    this.app.post('/api/config', (req: Request, res: Response) => {
      const current = this.storage.loadConfig();
      const updated = { ...current, ...req.body };
      this.storage.saveConfig(updated);
      res.json(updated);
    });

    // 9. Static UI delivery
    const clientDist = path.join(__dirname, 'client');
    const fallbackDist = path.join(__dirname, '..', 'dist', 'client');
    const staticDir = fs.existsSync(clientDist) ? clientDist : (fs.existsSync(fallbackDist) ? fallbackDist : null);

    if (staticDir) {
      this.app.use(express.static(staticDir));
      this.app.get('*', (req: Request, res: Response) => {
        if (!req.path.startsWith('/api')) {
          res.sendFile(path.join(staticDir, 'index.html'));
        }
      });
    }
  }

  public async start(port: number = 24224): Promise<void> {
    const config = this.storage.loadConfig();
    
    // Start reverse proxy engine (HTTP 80 & HTTPS 443, or custom ports)
    const proxyStatus = await this.proxyEngine.start(config.gatewayHttpPort, config.gatewayHttpsPort);
    if (proxyStatus.warnings.length > 0) {
      for (const w of proxyStatus.warnings) {
        console.warn(`[Portloom Gateway Warning] ${w}`);
      }
    }

    // Start management REST & WS server
    await new Promise<void>((resolve) => {
      this.httpServer.listen(port, '127.0.0.1', () => {
        console.log(`\n======================================================`);
        console.log(`  PORTLOOM LOCAL DEVELOPER GATEWAY (v1.0.0)`);
        console.log(`======================================================`);
        console.log(`  Dashboard & Management: http://127.0.0.1:${port}`);
        console.log(`  Gateway HTTP Port:      ${config.gatewayHttpPort}`);
        console.log(`  Gateway HTTPS Port:     ${config.gatewayHttpsPort}`);
        console.log(`  Data Directory:         ${this.storage.getBaseDir()}`);
        console.log(`======================================================\n`);
        resolve();
      });
    });
  }

  public stop(): void {
    this.proxyEngine.stop();
    this.wss.close();
    this.httpServer.close();
  }
}

// Standalone execution entrypoint
if (require.main === module) {
  const port = parseInt(process.env.PORTLOOM_PORT || '24224', 10);
  const server = new PortloomServer();
  server.start(port).catch(err => {
    console.error('Fatal start error:', err);
    process.exit(1);
  });
}
