import type { SqlDatabase } from '../db/sqlDatabase';
import { captureBackup, restoreBackup, validateBackupLedger } from '../services/backup';
import { backupJson, evidenceNames, type BackupData } from './data';
import { buildArchiveFiles, inspectArchive, type Hash, type ImportReview } from './archive';
import type { ArchiveFiles } from './zip';
import { assessPassword } from './password';

export interface BackupAdapter {
  hash: Hash;
  encrypt(files: ArchiveFiles, password: string): Promise<Uint8Array>;
  decrypt(bytes: Uint8Array, password: string): Promise<ArchiveFiles>;
  readEvidence(directory: string, name: string): Promise<Uint8Array>;
  writeArchive(bytes: Uint8Array, automatic: boolean): Promise<string>;
  share(uri: string): Promise<void>;
  stageEvidence(files: ArchiveFiles, names: string[]): Promise<string>;
  removeStage(directory: string): Promise<void>;
  cleanup(): Promise<void>;
  now(): string;
  appVersion: string;
  validatePassword?(password: string): Promise<void | (() => void)>;
}
export class BackupBusyError extends Error {}
export class BackupController {
  private busy = false;
  constructor(private adapter: BackupAdapter) {}
  private async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.busy) throw new BackupBusyError();
    this.busy = true;
    try { return await fn(); } finally { this.busy = false; }
  }
  private async password(password: string): Promise<() => void> {
    const check = assessPassword(password);
    if (check.error) throw new Error(check.error);
    const lease = await this.adapter.validatePassword?.(password);
    return typeof lease === 'function' ? lease : () => {};
  }
  private async archive(db: SqlDatabase, password: string, automatic: boolean, assert: () => void) {
    const snapshot = captureBackup(db);
    const files = await buildArchiveFiles(snapshot.data, n => this.adapter.readEvidence(snapshot.directory, n), this.adapter.hash, this.adapter.now(), this.adapter.appVersion);
    assert();
    const bytes = await this.adapter.encrypt(files, password);
    assert();
    const uri = await this.adapter.writeArchive(bytes, automatic);
    assert();
    return { uri, snapshot };
  }
  export(db: SqlDatabase, password: string): Promise<string> {
    return this.run(async () => {
      const assert = await this.password(password);
      await this.adapter.cleanup();
      assert(); const { uri } = await this.archive(db, password, false, assert);
      await this.adapter.share(uri);
      assert();
      return uri;
    });
  }
  inspect(bytes: Uint8Array, password: string): Promise<ImportReview> {
    // Old archives may use a password that no longer meets the creation policy.
    return this.run(async () => inspectArchive(await this.adapter.decrypt(bytes, password), this.adapter.hash));
  }
  restore(db: SqlDatabase, review: ImportReview, side: 'json' | 'csv', password: string, confirmed: boolean): Promise<string> {
    return this.run(async () => {
      if (!confirmed) throw new Error('Restore confirmation required');
      const assert = await this.password(password);
      const data: BackupData | undefined = side === 'json' ? review.json : review.csv;
      if (!data) throw new Error('CSV unavailable');
      validateBackupLedger(data);
      // Durable automatic backup must succeed before staging or replacing anything.
      const { uri, snapshot } = await this.archive(db, password, true, assert);
      const directory = await this.adapter.stageEvidence(review.files, evidenceNames(data));
      assert();
      try {
        restoreBackup(db, data, directory, backupJson(snapshot.data));
      } catch (error) {
        await this.adapter.removeStage(directory).catch(() => {});
        throw error;
      }
      // Old evidence is retained until a later cleanup. A crash cannot strand the
      // database pointing at partially written files: the pointer commits with it.
      return uri;
    });
  }
}
