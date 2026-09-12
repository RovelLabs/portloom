import * as http from 'http';
import * as https from 'https';
import * as url from 'url';
import httpProxy from 'http-proxy';
import { ProxyRoute } from '../types';
import { CertManager } from './cert-manager';
import { TrafficInspector } from './traffic-inspector';

export class ProxyEngine {
  private certManager: CertManager;
  private inspector: TrafficInspector;
  private proxy: httpProxy;
  private routes: ProxyRoute[] = [];
  private httpServer: http.Server | null = null;
  private httpsServer: https.Server | null = null;

  constructor(certManager: CertManager, inspector: TrafficInspector) {
    this.certManager = certManager;
    this.inspector = inspector;

    this.proxy = httpProxy.createProxyServer({
      changeOrigin: true,
      ws: true,
      secure: false, // Local dev target certs may be self-signed
      xfwd: true
    });

    this.proxy.on('error', (err, req, res) => {
      console.error('[ProxyEngine] Target proxy error:', err.message);
      if (res && 'writeHead' in res && !res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          error: 'Bad Gateway',
          message: 'Целевой сервер разработки недоступен. Убедитесь, что ваше приложение запущено на указанном порту.',
          details: err.message,
          suggestion: 'Check if your dev server (e.g. Vite, FastAPI, NestJS) is actively listening.'
        }, null, 2));
      }
    });
  }

  public setRoutes(routes: ProxyRoute[]): void {
    this.routes = routes;
  }

  public getRoutes(): ProxyRoute[] {
    return this.routes;
  }

  /**
   * Finds the best matching route for incoming request.
   */
  public matchRoute(host: string, pathname: string): ProxyRoute | undefined {
    const cleanHost = (host || '').split(':')[0].toLowerCase();

    // 1. Exact domain match + longest prefix
    const domainRoutes = this.routes.filter(r => r.domain.toLowerCase() === cleanHost);
    domainRoutes.sort((a, b) => b.pathPrefix.length - a.pathPrefix.length);

    for (const r of domainRoutes) {
      if (pathname.startsWith(r.pathPrefix)) {
        return r;
      }
    }

    // 2. Wildcard domain match
    const wildcardRoutes = this.routes.filter(r => r.domain.startsWith('*.') && cleanHost.endsWith(r.domain.substring(1).toLowerCase()));
    for (const r of wildcardRoutes) {
      if (pathname.startsWith(r.pathPrefix)) {
        return r;
      }
    }

    return undefined;
  }

  /**
   * Main request handler for both HTTP and HTTPS proxy servers.
   */
  public async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const startTime = process.hrtime.bigint();
    const host = req.headers.host || 'localhost';
    const parsedUrl = url.parse(req.url || '/', true);
    const pathname = parsedUrl.pathname || '/';

    // 1. Read request body for inspection (up to 1MB)
    const chunks: Buffer[] = [];
    let bodySize = 0;
    const maxBody = 1024 * 1024;

    req.on('data', (chunk: Buffer) => {
      if (bodySize < maxBody) {
        chunks.push(chunk);
        bodySize += chunk.length;
      }
    });

    req.on('end', async () => {
      const requestBody = chunks.length > 0 ? Buffer.concat(chunks).toString('utf8') : undefined;

      // 2. Check Mock Rules first
      const mock = this.inspector.findMatchingMock(host, req.method || 'GET', pathname);
      if (mock) {
        if (mock.delayMs > 0) {
          await new Promise(r => setTimeout(r, mock.delayMs));
        }

        const endTime = process.hrtime.bigint();
        const latencyMs = Number(endTime - startTime) / 1_000_000;

        res.writeHead(mock.statusCode, {
          'Content-Type': 'application/json; charset=utf-8',
          'X-Powered-By': 'Portloom Mock Engine',
          ...mock.headers
        });
        res.end(mock.responseBody);

        this.inspector.recordItem({
          timestamp: new Date().toISOString(),
          method: req.method || 'GET',
          url: `${(req.socket as any).encrypted ? 'https' : 'http'}://${host}${req.url}`,
          host,
          pathname,
          status: mock.statusCode,
          latencyMs: Math.round(latencyMs * 10) / 10,
          requestHeaders: req.headers,
          responseHeaders: { 'Content-Type': 'application/json', ...mock.headers },
          requestBody,
          responseBody: mock.responseBody,
          isMocked: true
        });
        return;
      }

      // 3. Match reverse proxy route
      const route = this.matchRoute(host, pathname);
      if (!route) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          error: 'Not Found',
          message: `В шлюзе Portloom нет настроенного маршрута для хоста: ${host} и пути: ${pathname}`,
          suggestion: 'Добавьте правило в панели Portloom во вкладке «Прокси и SSL».'
        }, null, 2));
        return;
      }

      // 4. Handle CORS if enabled
      if (route.corsEnabled) {
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || '*');
        res.setHeader('Access-Control-Allow-Credentials', 'true');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }
      }

      // 5. Intercept response for latency and traffic recording
      const originalWrite = res.write;
      const originalEnd = res.end;
      const respChunks: Buffer[] = [];

      res.write = function (chunk: any, ...args: any[]): boolean {
        if (chunk && respChunks.length < 50) {
          respChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        return originalWrite.apply(res, [chunk, ...args] as any);
      };

      res.end = (...args: any[]): any => {
        const chunk = args[0];
        if (chunk && respChunks.length < 50) {
          respChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }

        const endTime = process.hrtime.bigint();
        const latencyMs = Number(endTime - startTime) / 1_000_000;
        const responseBody = respChunks.length > 0 ? Buffer.concat(respChunks).toString('utf8') : undefined;

        this.inspector.recordItem({
          timestamp: new Date().toISOString(),
          method: req.method || 'GET',
          url: `${(req.socket as any).encrypted ? 'https' : 'http'}://${host}${req.url}`,
          host,
          pathname,
          status: res.statusCode,
          latencyMs: Math.round(latencyMs * 10) / 10,
          requestHeaders: req.headers,
          responseHeaders: res.getHeaders() as any,
          requestBody,
          responseBody: (responseBody && responseBody.length < 20000) ? responseBody : (responseBody ? `${responseBody.substring(0, 20000)}... [truncated]` : undefined),
          isMocked: false
        });

        return originalEnd.apply(res, args as any);
      };

      // 6. Forward to target
      this.proxy.web(req, res, { target: route.targetUrl });
    });
  }

  /**
   * Starts local HTTP and HTTPS gateway listeners.
   */
  public async start(httpPort: number = 80, httpsPort: number = 443): Promise<{ httpPort: number; httpsPort: number; warnings: string[] }> {
    const warnings: string[] = [];

    // HTTP Server
    try {
      this.httpServer = http.createServer((req, res) => this.handleRequest(req, res));
      await new Promise<void>((resolve, reject) => {
        this.httpServer!.listen(httpPort, '127.0.0.1', () => resolve());
        this.httpServer!.on('error', reject);
      });
    } catch (err: any) {
      warnings.push(`Не удалось занять HTTP порт ${httpPort} (${err.message}). Попробуйте запуск от Администратора или используйте свободный порт.`);
    }

    // HTTPS Server with Dynamic SNI
    try {
      const defaultCert = this.certManager.getCertificateForDomain('localhost');
      this.httpsServer = https.createServer({
        key: defaultCert.key,
        cert: defaultCert.cert,
        SNICallback: (servername, cb) => {
          try {
            const ctx = this.certManager.getSecureContext(servername || 'localhost');
            cb(null, ctx);
          } catch (e: any) {
            console.error('[ProxyEngine] SNI lookup error:', e);
            cb(e, null as any);
          }
        }
      }, (req, res) => this.handleRequest(req, res));

      // Handle WebSocket upgrades
      this.httpsServer.on('upgrade', (req, socket, head) => {
        const host = req.headers.host || 'localhost';
        const pathname = url.parse(req.url || '/').pathname || '/';
        const route = this.matchRoute(host, pathname);
        if (route) {
          this.proxy.ws(req, socket, head, { target: route.targetUrl });
        } else {
          socket.destroy();
        }
      });

      await new Promise<void>((resolve, reject) => {
        this.httpsServer!.listen(httpsPort, '127.0.0.1', () => resolve());
        this.httpsServer!.on('error', reject);
      });
    } catch (err: any) {
      warnings.push(`Не удалось занять HTTPS порт ${httpsPort} (${err.message}). В Windows порт 443 может быть занят службой IIS или требовать прав Администратора.`);
    }

    return { httpPort, httpsPort, warnings };
  }

  public stop(): void {
    if (this.httpServer) {
      this.httpServer.close();
      this.httpServer = null;
    }
    if (this.httpsServer) {
      this.httpsServer.close();
      this.httpsServer = null;
    }
  }
}
