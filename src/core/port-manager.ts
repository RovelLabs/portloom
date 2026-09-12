import { exec } from 'child_process';
import { promisify } from 'util';
import { PortEntry } from '../types';

const execAsync = promisify(exec);

// Protected Windows core system processes that should never be killed
const SYSTEM_PROCESS_BLACKLIST = new Set([
  'system',
  'system idle process',
  'svchost.exe',
  'lsass.exe',
  'csrss.exe',
  'smss.exe',
  'services.exe',
  'wininit.exe',
  'winlogon.exe',
  'explorer.exe',
  'spoolsv.exe'
]);

export class PortManager {
  /**
   * Scans all listening TCP ports on Windows and maps them to active processes.
   */
  public async getListeningPorts(): Promise<PortEntry[]> {
    try {
      // Step 1: Run netstat to get listening TCP ports with PIDs
      const { stdout: netstatOut } = await execAsync('netstat -ano -p tcp', { maxBuffer: 10 * 1024 * 1024 });
      
      const lines = netstatOut.split('\n');
      const rawPorts: Array<{ address: string; port: number; pid: number }> = [];
      const pidSet = new Set<number>();

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith('TCP')) continue;

        // Example line: TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       14228
        const parts = line.split(/\s+/);
        if (parts.length >= 5 && parts[3] === 'LISTENING') {
          const localAddr = parts[1];
          const pid = parseInt(parts[4], 10);
          
          if (isNaN(pid)) continue;

          // Parse port from address (e.g. 0.0.0.0:3000, [::]:3000, 127.0.0.1:8080)
          const lastColon = localAddr.lastIndexOf(':');
          if (lastColon !== -1) {
            const portStr = localAddr.substring(lastColon + 1);
            const port = parseInt(portStr, 10);
            if (!isNaN(port)) {
              rawPorts.push({ address: localAddr, port, pid });
              pidSet.add(pid);
            }
          }
        }
      }

      // Step 2: Fetch process metadata for PIDs (Name & Working Set Memory)
      const processMap = await this.getProcessMetadata(Array.from(pidSet));

      // Step 3: Combine and deduplicate
      const seen = new Set<string>();
      const results: PortEntry[] = [];

      for (const item of rawPorts) {
        const key = `${item.port}-${item.pid}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const meta = processMap.get(item.pid) || {
          name: item.pid === 4 ? 'System' : `PID ${item.pid}`,
          memoryMb: 0
        };

        const lowerName = meta.name.toLowerCase();
        const isSystem = item.pid === 0 || item.pid === 4 || SYSTEM_PROCESS_BLACKLIST.has(lowerName);

        results.push({
          port: item.port,
          protocol: 'TCP',
          address: item.address,
          pid: item.pid,
          processName: meta.name,
          memoryMb: meta.memoryMb,
          isSystemProcess: isSystem
        });
      }

      // Sort by port ascending
      results.sort((a, b) => a.port - b.port);
      return results;
    } catch (err) {
      console.error('[PortManager] Error getting listening ports:', err);
      return [];
    }
  }

  /**
   * Safe process termination with system blacklist verification.
   */
  public async killProcessByPid(pid: number): Promise<{ success: boolean; message: string }> {
    if (pid <= 4) {
      return { success: false, message: 'Невозможно завершить системный процесс Windows (PID <= 4)' };
    }

    try {
      // Check process name before killing
      const metadata = await this.getProcessMetadata([pid]);
      const info = metadata.get(pid);
      if (info && SYSTEM_PROCESS_BLACKLIST.has(info.name.toLowerCase())) {
        return {
          success: false,
          message: `Процесс ${info.name} является критически важным для Windows и защищен от завершения.`
        };
      }

      // Execute taskkill
      await execAsync(`taskkill /F /PID ${pid}`);
      return {
        success: true,
        message: `Процесс ${info?.name || pid} успешно завершен. Порт освобожден.`
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Ошибка завершения процесса: ${err.message || String(err)}`
      };
    }
  }

  /**
   * Helper to retrieve process names and memory using tasklist / PowerShell.
   */
  private async getProcessMetadata(pids: number[]): Promise<Map<number, { name: string; memoryMb: number }>> {
    const map = new Map<number, { name: string; memoryMb: number }>();
    if (pids.length === 0) return map;

    try {
      // Run tasklist in CSV format (fast, zero dependencies, built into every Windows)
      const { stdout } = await execAsync('tasklist /FO CSV /NH', { maxBuffer: 10 * 1024 * 1024 });
      const lines = stdout.split('\n');

      for (const line of lines) {
        if (!line.trim()) continue;
        // Format: "Image Name","PID","Session Name","Session#","Mem Usage"
        // Example: "node.exe","14228","Console","1","45,210 K"
        const cols = line.split('","').map(c => c.replace(/^"|"$/g, '').trim());
        if (cols.length >= 5) {
          const name = cols[0];
          const pid = parseInt(cols[1], 10);
          const memStr = cols[4].replace(/[^\d]/g, '');
          const memKb = parseInt(memStr, 10);
          const memoryMb = !isNaN(memKb) ? Math.round(memKb / 1024) : 0;

          if (!isNaN(pid)) {
            map.set(pid, { name, memoryMb });
          }
        }
      }
    } catch (err) {
      console.warn('[PortManager] tasklist metadata lookup failed, fallback to PID labels:', err);
    }

    return map;
  }
}
