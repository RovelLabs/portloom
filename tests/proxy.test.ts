import { describe, it, expect } from 'vitest';
import { ProxyEngine } from '../src/core/proxy-engine';
import { CertManager } from '../src/core/cert-manager';
import { TrafficInspector } from '../src/core/traffic-inspector';
import { StorageManager } from '../src/core/storage';
import * as os from 'os';
import * as path from 'path';

describe('ProxyEngine Route Matching', () => {
  const storage = new StorageManager(path.join(os.tmpdir(), `portloom-proxy-${Date.now()}`));
  const certs = new CertManager(storage);
  const inspector = new TrafficInspector();
  const engine = new ProxyEngine(certs, inspector);

  engine.setRoutes([
    {
      id: '1',
      domain: 'my-app.local',
      pathPrefix: '/api/v2',
      targetUrl: 'http://127.0.0.1:8002',
      sslEnabled: true,
      stripPrefix: false,
      corsEnabled: true,
      createdAt: ''
    },
    {
      id: '2',
      domain: 'my-app.local',
      pathPrefix: '/api',
      targetUrl: 'http://127.0.0.1:8000',
      sslEnabled: true,
      stripPrefix: false,
      corsEnabled: true,
      createdAt: ''
    },
    {
      id: '3',
      domain: 'my-app.local',
      pathPrefix: '/',
      targetUrl: 'http://127.0.0.1:3000',
      sslEnabled: true,
      stripPrefix: false,
      corsEnabled: true,
      createdAt: ''
    },
    {
      id: '4',
      domain: '*.dev.local',
      pathPrefix: '/',
      targetUrl: 'http://127.0.0.1:9000',
      sslEnabled: true,
      stripPrefix: false,
      corsEnabled: true,
      createdAt: ''
    }
  ]);

  it('should match longest prefix first for same domain', () => {
    const matchApi2 = engine.matchRoute('my-app.local', '/api/v2/users');
    expect(matchApi2?.targetUrl).toBe('http://127.0.0.1:8002');

    const matchApi = engine.matchRoute('my-app.local', '/api/users');
    expect(matchApi?.targetUrl).toBe('http://127.0.0.1:8000');

    const matchRoot = engine.matchRoute('my-app.local', '/dashboard');
    expect(matchRoot?.targetUrl).toBe('http://127.0.0.1:3000');
  });

  it('should ignore port in Host header when matching', () => {
    const match = engine.matchRoute('my-app.local:443', '/api/status');
    expect(match?.targetUrl).toBe('http://127.0.0.1:8000');
  });

  it('should match wildcard domains correctly', () => {
    const match = engine.matchRoute('service1.dev.local', '/status');
    expect(match?.targetUrl).toBe('http://127.0.0.1:9000');
  });

  it('should return undefined when no route matches', () => {
    const match = engine.matchRoute('unknown.local', '/');
    expect(match).toBeUndefined();
  });
});
