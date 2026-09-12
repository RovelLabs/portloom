import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { HostsManager } from '../src/core/hosts-manager';
import { StorageManager } from '../src/core/storage';
import { HostsProfile } from '../src/types';

describe('HostsManager', () => {
  let tmpDir: string;
  let tmpHostsFile: string;
  let storage: StorageManager;
  let hostsManager: HostsManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'portloom-test-'));
    tmpHostsFile = path.join(tmpDir, 'hosts');
    storage = new StorageManager(path.join(tmpDir, 'portloom-data'));

    const initialHosts = `# Initial system hosts
127.0.0.1  localhost
::1        localhost
192.168.1.5 router.local # Custom router
`;
    fs.writeFileSync(tmpHostsFile, initialHosts, 'utf8');
    hostsManager = new HostsManager(storage, tmpHostsFile);
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('should preserve existing entries when applying a profile', async () => {
    const profile: HostsProfile = {
      id: 'p1',
      name: 'Test Profile',
      active: true,
      records: [
        { id: '1', ip: '127.0.0.1', domain: 'my-app.local', enabled: true, comment: 'Frontend' },
        { id: '2', ip: '127.0.0.1', domain: 'api.my-app.local', enabled: true }
      ]
    };

    const res = await hostsManager.applyProfile(profile);
    expect(res.success).toBe(true);

    const content = fs.readFileSync(tmpHostsFile, 'utf8');
    expect(content).toContain('127.0.0.1  localhost');
    expect(content).toContain('router.local');
    expect(content).toContain('my-app.local');
    expect(content).toContain('api.my-app.local');
    expect(content).toContain('BEGIN PORTLOOM MANAGED BLOCK');
  });

  it('should ignore disabled records in profile', async () => {
    const profile: HostsProfile = {
      id: 'p2',
      name: 'Partial Profile',
      active: true,
      records: [
        { id: '1', ip: '127.0.0.1', domain: 'enabled.local', enabled: true },
        { id: '2', ip: '127.0.0.1', domain: 'disabled.local', enabled: false }
      ]
    };

    await hostsManager.applyProfile(profile);
    const content = fs.readFileSync(tmpHostsFile, 'utf8');
    expect(content).toContain('enabled.local');
    expect(content).not.toContain('disabled.local');
  });

  it('should cleanly remove previous managed block when switching profiles', async () => {
    const p1: HostsProfile = {
      id: 'p1',
      name: 'P1',
      active: true,
      records: [{ id: '1', ip: '127.0.0.1', domain: 'alpha.local', enabled: true }]
    };
    await hostsManager.applyProfile(p1);

    const p2: HostsProfile = {
      id: 'p2',
      name: 'P2',
      active: true,
      records: [{ id: '2', ip: '127.0.0.1', domain: 'beta.local', enabled: true }]
    };
    await hostsManager.applyProfile(p2);

    const content = fs.readFileSync(tmpHostsFile, 'utf8');
    expect(content).not.toContain('alpha.local');
    expect(content).toContain('beta.local');
    expect(content.split('BEGIN PORTLOOM MANAGED BLOCK').length - 1).toBe(1);
  });
});
