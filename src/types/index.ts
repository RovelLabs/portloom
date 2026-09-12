export interface PortEntry {
  port: number;
  protocol: 'TCP' | 'UDP';
  address: string;
  pid: number;
  processName: string;
  commandLine?: string;
  memoryMb?: number;
  isSystemProcess: boolean;
}

export interface HostsRecord {
  id: string;
  ip: string;
  domain: string;
  enabled: boolean;
  comment?: string;
}

export interface HostsProfile {
  id: string;
  name: string;
  records: HostsRecord[];
  active: boolean;
}

export interface CertInfo {
  domain: string;
  issuedAt: string;
  expiresAt: string;
  fingerprint: string;
  isCA: boolean;
  trustedInSystem: boolean;
}

export interface ProxyRoute {
  id: string;
  domain: string;
  pathPrefix: string;
  targetUrl: string;
  sslEnabled: boolean;
  stripPrefix: boolean;
  corsEnabled: boolean;
  createdAt: string;
}

export interface TrafficItem {
  id: string;
  timestamp: string;
  method: string;
  url: string;
  host: string;
  pathname: string;
  status: number;
  latencyMs: number;
  requestHeaders: Record<string, string | string[] | undefined>;
  responseHeaders: Record<string, string | string[] | undefined>;
  requestBody?: string;
  responseBody?: string;
  isMocked: boolean;
  curlCommand: string;
}

export interface MockRule {
  id: string;
  name: string;
  domain: string;
  path: string;
  method: string;
  statusCode: number;
  delayMs: number;
  headers: Record<string, string>;
  responseBody: string;
  enabled: boolean;
}

export interface PortloomConfig {
  schemaVersion: number;
  language: 'ru' | 'en';
  managementPort: number;
  gatewayHttpPort: number;
  gatewayHttpsPort: number;
  activeHostsProfileId: string;
  profiles: HostsProfile[];
  routes: ProxyRoute[];
  mockRules: MockRule[];
}
