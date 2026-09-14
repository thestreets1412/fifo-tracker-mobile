import { BackupBusyError, BackupController, type BackupAdapter } from '../controller';
import { buildArchiveFiles, inspectArchive } from '../archive';
import { backupJson } from '../data';
import { captureBackup } from '../../services/backup';
import { evidenceDirectory } from '../../db/backupRepo';
import { data, database, encode, hash, password } from './fixtures';

async function setup() {
  const files = await buildArchiveFiles(data, async () => encode('image'), hash, '2026-09-13T00:00:00Z', '1.0.0');
  const calls: string[] = [];
  const adapter: BackupAdapter = {
    hash, encrypt: jest.fn(async () => encode('zip')), decrypt: jest.fn(async () => files),
    readEvidence: jest.fn(async () => encode('image')),
    writeArchive: jest.fn(async (_bytes, auto) => { calls.push(auto ? 'automatic' : 'export'); return 'file:///backup.zip'; }),
    share: jest.fn(async () => { calls.push('share'); }),
    stageEvidence: jest.fn(async () => { calls.push('stage'); return 'evidence-restore-bbbb'; }),
    removeStage: jest.fn(async () => {}), cleanup: jest.fn(async () => {}),
    now: () => '2026-09-13T00:00:00Z', appVersion: '1.0.0',
  };
  return { files, calls, adapter, controller: new BackupController(adapter), review: await inspectArchive(files, hash), db: database() };
}
test('automatic backup precedes staging and atomic replace; it is not dependent on share sheet', async () => {
  const { controller, db, review, calls, adapter } = await setup();
  await controller.restore(db, review, 'json', password, true);
  expect(calls).toEqual(['automatic', 'stage']); expect(adapter.share).not.toHaveBeenCalled();
  expect(evidenceDirectory(db)).toBe('evidence-restore-bbbb');
});
test('no confirmation, invalid CSV selection or weak password never replaces', async () => {
  const { controller, db, review, adapter } = await setup();
  await expect(controller.restore(db, review, 'json', password, false)).rejects.toThrow('confirmation');
  await expect(controller.restore(db, review, 'csv', password, true)).rejects.toThrow('unavailable');
  await expect(controller.restore(db, review, 'json', '123', true)).rejects.toThrow();
  expect(adapter.stageEvidence).not.toHaveBeenCalled(); expect(adapter.writeArchive).not.toHaveBeenCalled();
});
test.each(['encrypt', 'writeArchive', 'stageEvidence'] as const)('%s failure preserves current database; retry works', async step => {
  const { controller, db, review, adapter } = await setup(); const before = backupJson(captureBackup(db).data);
  (adapter[step] as jest.Mock).mockRejectedValueOnce(new Error('failure'));
  await expect(controller.restore(db, review, 'json', password, true)).rejects.toThrow('failure');
  expect(backupJson(captureBackup(db).data)).toBe(before); expect(evidenceDirectory(db)).toBe('evidence-restore-aaaa');
  await expect(controller.restore(db, review, 'json', password, true)).resolves.toBeTruthy();
});
test('concurrent ledger change during staging refuses replace and removes only new stage', async () => {
  const { controller, db, review, adapter } = await setup();
  (adapter.stageEvidence as jest.Mock).mockImplementation(async () => {
    db.runSync('UPDATE symbols SET name = ? WHERE id = 3;', ['updated']); return 'evidence-restore-bbbb';
  });
  await expect(controller.restore(db, review, 'json', password, true)).rejects.toThrow('Ledger changed');
  expect(adapter.removeStage).toHaveBeenCalledWith('evidence-restore-bbbb'); expect(evidenceDirectory(db)).toBe('evidence-restore-aaaa');
});
test('share failure releases busy gate and retries generate a new snapshot', async () => {
  const { controller, db, adapter } = await setup();
  (adapter.share as jest.Mock).mockRejectedValueOnce(new Error('share failed'));
  await expect(controller.export(db, password)).rejects.toThrow('share failed');
  db.runSync('UPDATE symbols SET name = ? WHERE id = 3;', ['new snapshot']);
  await controller.export(db, password);
  const calls = (adapter.encrypt as jest.Mock).mock.calls;
  expect(new TextDecoder().decode(calls[1][0].get('backup.json'))).toContain('new snapshot');
  expect(adapter.writeArchive).toHaveBeenCalledTimes(2);
});
test('duplicate operation is blocked synchronously until first operation completes', async () => {
  const { controller, db, adapter } = await setup();
  let done!: (bytes: Uint8Array) => void;
  (adapter.encrypt as jest.Mock).mockImplementation(() => new Promise<Uint8Array>(resolve => { done = resolve; }));
  const pending = controller.export(db, password);
  await expect(controller.export(db, password)).rejects.toBeInstanceOf(BackupBusyError);
  while (!done) await new Promise(resolve => setImmediate(resolve));
  done(encode('zip')); await pending;
});
test('edited CSV that oversells cannot reach automatic backup or replacement', async () => {
  const { controller, db, review, adapter } = await setup();
  review.csv = { ...review.json, lots: review.json.lots.map(l => ({ ...l, qty: '0.10000000' })) };
  await expect(controller.restore(db, review, 'csv', password, true)).rejects.toThrow();
  expect(adapter.writeArchive).not.toHaveBeenCalled();
});
test('a lock-session lease aborts export before share when the app locks mid-operation', async () => {
  const { controller, db, adapter } = await setup(); let active = true;
  adapter.validatePassword = async () => () => { if (!active) throw new Error('locked'); };
  (adapter.encrypt as jest.Mock).mockImplementation(async () => { active = false; return encode('zip'); });
  await expect(controller.export(db, password)).rejects.toThrow('locked');
  expect(adapter.share).not.toHaveBeenCalled();
});
