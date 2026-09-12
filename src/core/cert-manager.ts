import * as fs from 'fs';
import * as path from 'path';
import * as tls from 'tls';
import { exec } from 'child_process';
import { promisify } from 'util';
import forge from 'node-forge';
import { CertInfo } from '../types';
import { StorageManager } from './storage';

const execAsync = promisify(exec);

export class CertManager {
  private storage: StorageManager;
  private certsDir: string;
  private caCertPath: string;
  private caKeyPath: string;
  private sniContexts: Map<string, tls.SecureContext> = new Map();

  constructor(storage: StorageManager) {
    this.storage = storage;
    this.certsDir = storage.getCertsDir();
    this.caCertPath = path.join(this.certsDir, 'portloom-ca.crt');
    this.caKeyPath = path.join(this.certsDir, 'portloom-ca.key');

    this.ensureRootCA();
  }

  /**
   * Checks if local Root CA exists, if not creates one.
   */
  public ensureRootCA(): void {
    if (fs.existsSync(this.caCertPath) && fs.existsSync(this.caKeyPath)) {
      return;
    }

    console.log('[CertManager] Generating self-sovereign local Root CA...');
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();

    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01' + forge.util.bytesToHex(forge.random.getBytesSync(16));
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10); // 10 years validity

    const attrs = [
      { name: 'commonName', value: 'Portloom Local Development Root CA' },
      { name: 'organizationName', value: 'Portloom Security' },
      { name: 'organizationalUnitName', value: 'Local Dev Gateway' },
      { name: 'countryName', value: 'RU' }
    ];

    cert.setSubject(attrs);
    cert.setIssuer(attrs);

    cert.setExtensions([
      { name: 'basicConstraints', cA: true, critical: true },
      { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true }
    ]);

    // Self-sign root CA
    cert.sign(keys.privateKey, forge.md.sha256.create());

    const pemCert = forge.pki.certificateToPem(cert);
    const pemKey = forge.pki.privateKeyToPem(keys.privateKey);

    fs.writeFileSync(this.caCertPath, pemCert, 'utf8');
    fs.writeFileSync(this.caKeyPath, pemKey, 'utf8');

    console.log('[CertManager] Local Root CA created at:', this.caCertPath);
  }

  /**
   * Returns Root CA certificate info.
   */
  public getCAInfo(): CertInfo {
    this.ensureRootCA();
    const pemCert = fs.readFileSync(this.caCertPath, 'utf8');
    const cert = forge.pki.certificateFromPem(pemCert);

    const md = forge.md.sha256.create();
    md.update(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes());
    const fingerprint = md.digest().toHex().match(/.{2}/g)?.join(':').toUpperCase() || '';

    return {
      domain: 'Portloom Local Development Root CA',
      issuedAt: cert.validity.notBefore.toISOString(),
      expiresAt: cert.validity.notAfter.toISOString(),
      fingerprint,
      isCA: true,
      trustedInSystem: false
    };
  }

  /**
   * Installs the Root CA into the current user's Windows Trusted Root store.
   */
  public async trustRootCAInWindows(): Promise<{ success: boolean; message: string }> {
    try {
      this.ensureRootCA();
      // certutil -addstore -user Root <ca.crt> installs to current user store without UAC elevation!
      const cmd = `certutil -addstore -user Root "${this.caCertPath}"`;
      await execAsync(cmd);
      return {
        success: true,
        message: 'Корневой сертификат Portloom успешно добавлен в доверенные сертификаты Windows (хранилище пользователя).'
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Не удалось установить сертификат через certutil: ${err.message || String(err)}`
      };
    }
  }

  /**
   * Generates or retrieves an existing leaf certificate for a specific domain.
   */
  public getCertificateForDomain(domain: string): { key: string; cert: string } {
    this.ensureRootCA();
    const cleanDomain = domain.toLowerCase().trim();
    const domainDir = path.join(this.certsDir, 'domains');
    if (!fs.existsSync(domainDir)) {
      fs.mkdirSync(domainDir, { recursive: true });
    }

    const certPath = path.join(domainDir, `${cleanDomain}.crt`);
    const keyPath = path.join(domainDir, `${cleanDomain}.key`);

    if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
      return {
        key: fs.readFileSync(keyPath, 'utf8'),
        cert: fs.readFileSync(certPath, 'utf8')
      };
    }

    // Mint new certificate signed by Root CA
    const caCertPem = fs.readFileSync(this.caCertPath, 'utf8');
    const caKeyPem = fs.readFileSync(this.caKeyPath, 'utf8');
    const caCert = forge.pki.certificateFromPem(caCertPem);
    const caKey = forge.pki.privateKeyFromPem(caKeyPem);

    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();

    cert.publicKey = keys.publicKey;
    cert.serialNumber = '02' + forge.util.bytesToHex(forge.random.getBytesSync(16));
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 2); // 2 years

    cert.setSubject([
      { name: 'commonName', value: cleanDomain },
      { name: 'organizationName', value: 'Portloom Local Domain' }
    ]);
    cert.setIssuer(caCert.subject.attributes);

    // Subject Alternative Names (SAN) — critical for modern Chrome/Firefox
    const altNames = [
      { type: 2, value: cleanDomain }, // DNS
      { type: 2, value: `*.${cleanDomain}` }
    ];
    if (cleanDomain !== 'localhost') {
      altNames.push({ type: 2, value: 'localhost' });
      (altNames as any).push({ type: 7, ip: '127.0.0.1' });
    }

    cert.setExtensions([
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true, clientAuth: true },
      { name: 'subjectAltName', altNames }
    ]);

    // Sign with CA private key
    cert.sign(caKey, forge.md.sha256.create());

    const pemCert = forge.pki.certificateToPem(cert);
    const pemKey = forge.pki.privateKeyToPem(keys.privateKey);

    fs.writeFileSync(certPath, pemCert, 'utf8');
    fs.writeFileSync(keyPath, pemKey, 'utf8');

    return { key: pemKey, cert: pemCert };
  }

  /**
   * Retrieves or builds a cached TLS SecureContext for SNI routing.
   */
  public getSecureContext(domain: string): tls.SecureContext {
    const clean = domain.toLowerCase().trim();
    if (this.sniContexts.has(clean)) {
      return this.sniContexts.get(clean)!;
    }

    const { key, cert } = this.getCertificateForDomain(clean);
    const ctx = tls.createSecureContext({
      key,
      cert,
      ca: fs.readFileSync(this.caCertPath, 'utf8')
    });

    this.sniContexts.set(clean, ctx);
    return ctx;
  }

  /**
   * Lists all minted domain certificates.
   */
  public listMintedCertificates(): CertInfo[] {
    const domainDir = path.join(this.certsDir, 'domains');
    if (!fs.existsSync(domainDir)) return [];

    const files = fs.readdirSync(domainDir);
    const crtFiles = files.filter(f => f.endsWith('.crt'));
    const results: CertInfo[] = [];

    for (const f of crtFiles) {
      const domain = f.replace(/\.crt$/, '');
      try {
        const pem = fs.readFileSync(path.join(domainDir, f), 'utf8');
        const cert = forge.pki.certificateFromPem(pem);

        const md = forge.md.sha256.create();
        md.update(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes());
        const fingerprint = md.digest().toHex().match(/.{2}/g)?.join(':').toUpperCase() || '';

        results.push({
          domain,
          issuedAt: cert.validity.notBefore.toISOString(),
          expiresAt: cert.validity.notAfter.toISOString(),
          fingerprint,
          isCA: false,
          trustedInSystem: true
        });
      } catch (err) {
        console.warn(`[CertManager] Could not parse cert for ${domain}:`, err);
      }
    }

    return results;
  }
}
