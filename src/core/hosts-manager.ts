import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { HostsRecord, HostsProfile } from '../types';
import { StorageManager } from './storage';

const execAsync = promisify(exec);

const BLOCK_HEADER_PREFIX = '# --- BEGIN PORTLOOM MANAGED BLOCK';
const BLOCK_FOOTER = '# --- END PORTLOOM MANAGED BLOCK ---';

export class HostsManager {
  private hostsPath: string;
  private storage: StorageManager;

  constructor(storage: StorageManager, customHostsPath?: string) {
    this.storage = storage;
    if (customHostsPath) {
      this.hostsPath = customHostsPath;
    } else {
      const sysRoot = process.env.SystemRoot || 'C:\\Windows';
      this.hostsPath = path.join(sysRoot, 'System32', 'drivers', 'etc', 'hosts');
    }
  }

  public getHostsPath(): string {
    return this.hostsPath;
  }

  /**
   * Reads raw hosts file content safely.
   */
  public readHostsRaw(): string {
    try {
      if (fs.existsSync(this.hostsPath)) {
        return fs.readFileSync(this.hostsPath, 'utf8');
      }
    } catch (err) {
      console.warn('[HostsManager] Could not read system hosts file directly:', err);
    }
    return '';
  }

  /**
   * Applies the active profile records to the hosts file within the managed block.
   */
  public async applyProfile(profile: HostsProfile): Promise<{ success: boolean; message: string }> {
    try {
      // 1. Read existing content
      let existingContent = '';
      if (fs.existsSync(this.hostsPath)) {
        existingContent = fs.readFileSync(this.hostsPath, 'utf8');
      }

      // 2. Create timestamped backup
      this.createBackup(existingContent);

      // 3. Remove any previous Portloom managed block
      const cleaned = this.removeManagedBlock(existingContent);

      // 4. Generate new managed block
      const enabledRecords = profile.records.filter(r => r.enabled);
      let newManagedBlock = '';

      if (enabledRecords.length > 0) {
        const lines = [
          `${BLOCK_HEADER_PREFIX} [Profile: ${profile.name}] ---`,
          '# This block is automatically maintained by Portloom. Do not edit manually.',
          ...enabledRecords.map(r => `${r.ip.padEnd(16)} ${r.domain} ${r.comment ? `# ${r.comment}` : ''}`),
          BLOCK_FOOTER
        ];
        newManagedBlock = `\n\n${lines.join('\n')}\n`;
      }

      const finalContent = cleaned.trimEnd() + newManagedBlock;

      // 5. Write atomically
      await this.writeHostsFile(finalContent);

      // 6. Flush Windows DNS resolver cache
      await this.flushDns();

      return {
        success: true,
        message: `Профиль «${profile.name}» успешно применен. DNS-кэш обновлен.`
      };
    } catch (err: any) {
      const isPermission = err.code === 'EPERM' || err.code === 'EACCES' || String(err).includes('permission');
      return {
        success: false,
        message: isPermission
          ? 'Для записи в системный файл hosts требуются права Администратора. Запустите Portloom от имени Администратора или отключите блокировку hosts в антивирусе.'
          : `Ошибка обновления hosts: ${err.message || String(err)}`
      };
    }
  }

  /**
   * Flushes the Windows DNS cache.
   */
  public async flushDns(): Promise<boolean> {
    try {
      await execAsync('ipconfig /flushdns');
      return true;
    } catch (err) {
      console.warn('[HostsManager] ipconfig /flushdns warning:', err);
      return false;
    }
  }

  /**
   * Strips out existing managed blocks from content.
   */
  public removeManagedBlock(content: string): string {
    const startIndex = content.indexOf(BLOCK_HEADER_PREFIX);
    if (startIndex === -1) return content;

    const endIndex = content.indexOf(BLOCK_FOOTER, startIndex);
    if (endIndex === -1) return content;

    const before = content.substring(0, startIndex);
    const after = content.substring(endIndex + BLOCK_FOOTER.length);
    return (before + after).replace(/\n{3,}/g, '\n\n');
  }

  /**
   * Creates a backup of current hosts file.
   */
  private createBackup(content: string): string {
    const backupsDir = this.storage.getBackupsDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupsDir, `hosts_${timestamp}.bak`);
    try {
      fs.writeFileSync(backupFile, content, 'utf8');
      return backupFile;
    } catch (err) {
      console.error('[HostsManager] Failed to create hosts backup:', err);
      return '';
    }
  }

  /**
   * Lists available backups.
   */
  public listBackups(): Array<{ name: string; path: string; date: string }> {
    const dir = this.storage.getBackupsDir();
    if (!fs.existsSync(dir)) return [];
    
    return fs.readdirSync(dir)
      .filter(f => f.startsWith('hosts_') && f.endsWith('.bak'))
      .map(f => {
        const fullPath = path.join(dir, f);
        const stat = fs.statSync(fullPath);
        return {
          name: f,
          path: fullPath,
          date: stat.mtime.toISOString()
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  /**
   * Restores hosts file from a chosen backup.
   */
  public async restoreFromBackup(backupPath: string): Promise<boolean> {
    if (!fs.existsSync(backupPath)) return false;
    const content = fs.readFileSync(backupPath, 'utf8');
    await this.writeHostsFile(content);
    await this.flushDns();
    return true;
  }

  private async writeHostsFile(content: string): Promise<void> {
    const dir = path.dirname(this.hostsPath);
    const tempFile = path.join(dir, `hosts.tmp.${Date.now()}`);
    try {
      fs.writeFileSync(tempFile, content, 'utf8');
      fs.renameSync(tempFile, this.hostsPath);
    } catch (err: any) {
      if (fs.existsSync(tempFile)) {
        try { fs.unlinkSync(tempFile); } catch {}
      }

      // Try direct write first
      try {
        fs.writeFileSync(this.hostsPath, content, 'utf8');
      } catch (permErr: any) {
        // Fallback: Trigger Windows UAC elevation helper
        const pendingFile = path.join(this.storage.getBaseDir(), 'hosts_pending.txt');
        fs.writeFileSync(pendingFile, content, 'utf8');

        const psScript = `Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'Copy-Item -Path \\"${pendingFile}\\" -Destination \\"${this.hostsPath}\\" -Force; ipconfig /flushdns'`;
        try {
          await execAsync(`powershell -NoProfile -Command "${psScript}"`);
        } catch (uacErr: any) {
          throw new Error(`UAC Elevation failed: ${uacErr.message || String(uacErr)}`);
        }
      }
    }
  }
}
