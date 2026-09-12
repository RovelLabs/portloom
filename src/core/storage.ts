import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PortloomConfig } from '../types';

export class StorageManager {
  private baseDir: string;
  private configFile: string;
  private certsDir: string;
  private backupsDir: string;

  constructor(customDir?: string) {
    if (customDir) {
      this.baseDir = customDir;
    } else {
      const appData = process.env.APPDATA || (os.platform() === 'win32' 
        ? path.join(os.homedir(), 'AppData', 'Roaming')
        : path.join(os.homedir(), '.config'));
      this.baseDir = path.join(appData, 'Portloom');
    }

    this.configFile = path.join(this.baseDir, 'config.json');
    this.certsDir = path.join(this.baseDir, 'certs');
    this.backupsDir = path.join(this.baseDir, 'backups');

    this.ensureDirectories();
  }

  public getBaseDir(): string {
    return this.baseDir;
  }

  public getCertsDir(): string {
    return this.certsDir;
  }

  public getBackupsDir(): string {
    return this.backupsDir;
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
    if (!fs.existsSync(this.certsDir)) {
      fs.mkdirSync(this.certsDir, { recursive: true });
    }
    if (!fs.existsSync(this.backupsDir)) {
      fs.mkdirSync(this.backupsDir, { recursive: true });
    }
  }

  public getDefaultConfig(): PortloomConfig {
    return {
      schemaVersion: 1,
      language: 'ru',
      managementPort: 24224,
      gatewayHttpPort: 80,
      gatewayHttpsPort: 443,
      activeHostsProfileId: 'default',
      profiles: [
        {
          id: 'default',
          name: 'Основной (Default)',
          active: true,
          records: [
            { id: '1', ip: '127.0.0.1', domain: 'my-app.local', enabled: true, comment: 'Frontend dev' },
            { id: '2', ip: '127.0.0.1', domain: 'api.my-app.local', enabled: true, comment: 'Backend API' }
          ]
        },
        {
          id: 'isolated',
          name: 'Изолированный (Clean)',
          active: false,
          records: []
        }
      ],
      routes: [
        {
          id: 'r1',
          domain: 'my-app.local',
          pathPrefix: '/',
          targetUrl: 'http://127.0.0.1:3000',
          sslEnabled: true,
          stripPrefix: false,
          corsEnabled: true,
          createdAt: new Date().toISOString()
        },
        {
          id: 'r2',
          domain: 'api.my-app.local',
          pathPrefix: '/',
          targetUrl: 'http://127.0.0.1:8000',
          sslEnabled: true,
          stripPrefix: false,
          corsEnabled: true,
          createdAt: new Date().toISOString()
        }
      ],
      mockRules: []
    };
  }

  public loadConfig(): PortloomConfig {
    try {
      if (fs.existsSync(this.configFile)) {
        const raw = fs.readFileSync(this.configFile, 'utf8');
        const parsed = JSON.parse(raw);
        return { ...this.getDefaultConfig(), ...parsed };
      }
    } catch (err) {
      console.error('[Storage] Error loading config, falling back to defaults:', err);
    }
    const def = this.getDefaultConfig();
    this.saveConfig(def);
    return def;
  }

  public saveConfig(config: PortloomConfig): void {
    try {
      this.ensureDirectories();
      const tmpFile = `${this.configFile}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpFile, JSON.stringify(config, null, 2), 'utf8');
      fs.renameSync(tmpFile, this.configFile);
    } catch (err) {
      console.error('[Storage] Error saving config:', err);
      throw err;
    }
  }
}
