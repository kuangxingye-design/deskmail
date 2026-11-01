/**
 * 凭据安全存储（#17）：Electron safeStorage（Windows DPAPI）加密后写入 userData/credentials.json。
 * 文件中只有 base64 密文；授权码明文不落盘、不进日志。
 */
import { app, safeStorage } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CredentialPlatform } from '../../platform/types';

type CredentialFile = Record<string, string>;

export class SafeStorageCredentialPlatform implements CredentialPlatform {
  private readonly filePath: string;

  constructor() {
    this.filePath = join(app.getPath('userData'), 'credentials.json');
  }

  async get(key: string): Promise<string | null> {
    const data = this.read();
    const encrypted = data[key];
    if (!encrypted) return null;
    await this.requireEncryption();
    const decrypted = await safeStorage.decryptStringAsync(
      Buffer.from(encrypted, 'base64'),
    );
    if (decrypted.shouldReEncrypt) {
      const reEncrypted = await safeStorage.encryptStringAsync(decrypted.result);
      const data = this.read();
      data[key] = reEncrypted.toString('base64');
      this.write(data);
    }
    return decrypted.result;
  }

  async set(key: string, value: string): Promise<void> {
    await this.requireEncryption();
    const data = this.read();
    const encrypted = await safeStorage.encryptStringAsync(value);
    data[key] = encrypted.toString('base64');
    this.write(data);
  }

  async delete(key: string): Promise<void> {
    const data = this.read();
    if (!(key in data)) return;
    delete data[key];
    this.write(data);
  }

  private read(): CredentialFile {
    if (!existsSync(this.filePath)) return {};
    try {
      return JSON.parse(readFileSync(this.filePath, 'utf8')) as CredentialFile;
    } catch {
      throw new Error('凭据文件损坏，无法读取');
    }
  }

  private write(data: CredentialFile): void {
    writeFileSync(this.filePath, JSON.stringify(data), {
      encoding: 'utf8',
      mode: 0o600,
    });
  }

  private async requireEncryption(): Promise<void> {
    if (!(await safeStorage.isAsyncEncryptionAvailable())) {
      throw new Error('系统加密不可用（safeStorage/DPAPI）');
    }
  }
}
