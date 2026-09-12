import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CertManager } from '../src/core/cert-manager';
import { StorageManager } from '../src/core/storage';

describe('CertManager', () => {
  let tmpDir: string;
  let storage: StorageManager;
  let certManager: CertManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'portloom-cert-test-'));
    storage = new StorageManager(path.join(tmpDir, 'data'));
    certManager = new CertManager(storage);
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('should initialize and produce Root CA certificate', () => {
    const ca = certManager.getCAInfo();
    expect(ca.isCA).toBe(true);
    expect(ca.domain).toContain('Portloom');
    expect(ca.fingerprint).toMatch(/^([0-9A-F]{2}:)+[0-9A-F]{2}$/);
    expect(new Date(ca.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('should generate valid leaf certificate for custom local domain', () => {
    const { key, cert } = certManager.getCertificateForDomain('test-app.local');
    expect(key).toContain('BEGIN RSA PRIVATE KEY');
    expect(cert).toContain('BEGIN CERTIFICATE');

    const minted = certManager.listMintedCertificates();
    const found = minted.find(m => m.domain === 'test-app.local');
    expect(found).toBeDefined();
    expect(found?.isCA).toBe(false);
  });

  it('should reuse cached certificates on subsequent calls for same domain', () => {
    const cert1 = certManager.getCertificateForDomain('reused.local');
    const cert2 = certManager.getCertificateForDomain('reused.local');
    expect(cert1.cert).toBe(cert2.cert);
    expect(cert1.key).toBe(cert2.key);
  });
});
