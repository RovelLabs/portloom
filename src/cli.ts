import { PortManager } from './core/port-manager';
import { StorageManager } from './core/storage';
import { HostsManager } from './core/hosts-manager';
import { CertManager } from './core/cert-manager';
import { PortloomServer } from './server';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'start';

  const storage = new StorageManager();
  const portManager = new PortManager();
  const hostsManager = new HostsManager(storage);
  const certManager = new CertManager(storage);

  switch (command.toLowerCase()) {
    case 'list':
    case 'ports': {
      console.log('\n--- Active Listening Ports on Windows ---');
      const ports = await portManager.getListeningPorts();
      if (ports.length === 0) {
        console.log('No listening ports found.');
      } else {
        console.log(
          'PORT'.padEnd(8) +
          'PROTO'.padEnd(8) +
          'PID'.padEnd(10) +
          'MEMORY'.padEnd(12) +
          'PROCESS NAME'
        );
        console.log('-'.repeat(60));
        for (const p of ports) {
          const mem = p.memoryMb ? `${p.memoryMb} MB` : '-';
          console.log(
            String(p.port).padEnd(8) +
            p.protocol.padEnd(8) +
            String(p.pid).padEnd(10) +
            mem.padEnd(12) +
            p.processName + (p.isSystemProcess ? ' [System]' : '')
          );
        }
      }
      console.log('');
      break;
    }

    case 'kill': {
      const target = args[1];
      if (!target) {
        console.error('Usage: portloom kill <port_or_pid>');
        process.exit(1);
      }

      const num = parseInt(target, 10);
      if (isNaN(num)) {
        console.error('Error: Port or PID must be an integer.');
        process.exit(1);
      }

      // Check if it's a port or PID
      const ports = await portManager.getListeningPorts();
      const match = ports.find(p => p.port === num || p.pid === num);

      if (!match) {
        console.log(`No active listening process found on port/PID: ${num}`);
      } else {
        console.log(`Killing process ${match.processName} (PID: ${match.pid}) on port ${match.port}...`);
        const res = await portManager.killProcessByPid(match.pid);
        console.log(res.message);
      }
      break;
    }

    case 'flushdns': {
      console.log('Flushing Windows DNS Resolver Cache...');
      const ok = await hostsManager.flushDns();
      console.log(ok ? 'Successfully flushed the DNS Resolver Cache.' : 'Failed to flush DNS cache.');
      break;
    }

    case 'certs': {
      const ca = certManager.getCAInfo();
      console.log('\n--- Portloom Local Root CA ---');
      console.log(`Subject:     ${ca.domain}`);
      console.log(`Fingerprint: ${ca.fingerprint}`);
      console.log(`Expires:     ${ca.expiresAt}\n`);

      const minted = certManager.listMintedCertificates();
      console.log(`Minted Domain Certificates (${minted.length}):`);
      for (const c of minted) {
        console.log(`  * ${c.domain} (Expires: ${c.expiresAt.split('T')[0]})`);
      }
      console.log('');
      break;
    }

    case 'trust': {
      console.log('Installing Portloom Root CA into Windows Trusted Store...');
      const res = await certManager.trustRootCAInWindows();
      console.log(res.message);
      break;
    }

    case 'link': {
      const domain = args[1];
      const targetPort = args[2];
      if (!domain || !targetPort) {
        console.error('Usage: portloom link <domain> <target_port>');
        console.error('Example: portloom link my-app.local 3000');
        process.exit(1);
      }

      const config = storage.loadConfig();
      const cleanDomain = domain.toLowerCase().trim();
      const targetUrl = `http://127.0.0.1:${targetPort}`;

      let route = config.routes.find(r => r.domain.toLowerCase() === cleanDomain);
      if (route) {
        route.targetUrl = targetUrl;
      } else {
        config.routes.push({
          id: `route_${Date.now()}`,
          domain: cleanDomain,
          pathPrefix: '/',
          targetUrl,
          sslEnabled: true,
          stripPrefix: false,
          corsEnabled: true,
          createdAt: new Date().toISOString()
        });
      }

      certManager.getCertificateForDomain(cleanDomain);

      const profile = config.profiles.find(p => p.id === config.activeHostsProfileId) || config.profiles[0];
      const existingHost = profile.records.find(r => r.domain.toLowerCase() === cleanDomain);
      if (!existingHost) {
        profile.records.push({
          id: `rec_${Date.now()}`,
          domain: cleanDomain,
          ip: '127.0.0.1',
          enabled: true,
          comment: 'CLI linked'
        });
      }

      storage.saveConfig(config);
      await hostsManager.applyProfile(profile);

      console.log(`\n[SUCCESS] Linked https://${cleanDomain} -> ${targetUrl}`);
      console.log(`* SSL Certificate generated (X.509 with SAN)`);
      console.log(`* Added ${cleanDomain} -> 127.0.0.1 in hosts`);
      console.log(`* DNS resolver cache flushed\n`);
      break;
    }

    case 'start': {
      const portIdx = args.indexOf('--port');
      const port = portIdx !== -1 && args[portIdx + 1] ? parseInt(args[portIdx + 1], 10) : 24224;
      const server = new PortloomServer();
      await server.start(port);
      break;
    }

    case 'help':
    case '--help':
    case '-h':
    default: {
      console.log(`
Portloom CLI (v1.0.0) - Local Developer Gateway for Windows

Usage:
  portloom [command] [options]

Commands:
  start [--port 24224]    Start the Portloom local gateway and dashboard
  list | ports            Show all listening TCP sockets and processes
  kill <port|pid>         Terminate the process occupying a port
  flushdns                Flush the Windows DNS resolver cache
  certs                   View Root CA status and minted domain certificates
  trust                   Add Portloom Root CA to Windows Trusted Store
  help                    Show this help message
`);
      break;
    }
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('CLI Error:', err);
    process.exit(1);
  });
}
