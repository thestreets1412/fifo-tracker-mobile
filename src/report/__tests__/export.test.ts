import { ReportExporter, REPORT_CACHE_TTL, type ReportExportDeps } from '../export';
import { fixture, generatedAt } from './fixture';

function setup() {
  const f = fixture(); f.buy('100', '1');
  const deps: jest.Mocked<ReportExportDeps> = {
    now: jest.fn(() => new Date(generatedAt)), sweepCache: jest.fn(async (_before: number) => {}),
    print: jest.fn(async (_html: string) => 'file:///intermediate.pdf'), readBytes: jest.fn(async (_uri: string) => new Uint8Array([1])),
    stamp: jest.fn(async (_bytes: Uint8Array, _date: string) => new Uint8Array([2])),
    writeCache: jest.fn(async (name: string, _content: string | Uint8Array) => `file:///cache/${name}`),
    remove: jest.fn(async (_uri: string) => {}), save: jest.fn(async (_uri: string, _name: string, _mime: string): Promise<string | null> => 'content://saved'),
    share: jest.fn(async (_uri: string, _mime: string) => {}),
  };
  return { ...f, deps, exporter: new ReportExporter(deps) };
}

test('PDF uses the snapshot, stamps before sharing and only removes intermediate', async () => {
  const f = setup(); const report = f.report();
  await expect(f.exporter.run(report, 'pdf', 'share')).resolves.toEqual({ status: 'shared' });
  expect(f.deps.stamp).toHaveBeenCalledWith(new Uint8Array([1]), generatedAt);
  expect(f.deps.writeCache).toHaveBeenCalledWith(expect.stringMatching(/\.pdf$/), new Uint8Array([2]));
  expect(f.deps.share).toHaveBeenCalledWith(expect.any(String), 'application/pdf');
  expect(f.deps.remove.mock.calls).toEqual([['file:///intermediate.pdf']]);
  expect(f.deps.sweepCache).toHaveBeenCalledWith(new Date(generatedAt).getTime() - REPORT_CACHE_TTL);
});

test('CSV never invokes the PDF path and successful save cleans cache', async () => {
  const f = setup();
  await expect(f.exporter.run(f.report(), 'csv', 'save')).resolves.toEqual({ status: 'saved', uri: 'content://saved' });
  expect(f.deps.print).not.toHaveBeenCalled(); expect(f.deps.stamp).not.toHaveBeenCalled();
  expect(f.deps.writeCache).toHaveBeenCalledWith(expect.stringMatching(/\.csv$/), expect.stringContaining('\uFEFFFIFO Portfolio Report'));
  expect(f.deps.remove).toHaveBeenCalledTimes(1);
});

test('picker cancellation is normal, clears artifact and permits retry', async () => {
  const f = setup(); f.deps.save.mockResolvedValueOnce(null);
  await expect(f.exporter.run(f.report(), 'pdf', 'save')).resolves.toEqual({ status: 'cancelled' });
  expect(f.deps.remove).toHaveBeenCalledTimes(2);
  await expect(f.exporter.run(f.report(), 'pdf', 'save')).resolves.toMatchObject({ status: 'saved' });
});

test.each(['print', 'readBytes', 'stamp', 'writeCache', 'save', 'share'] as const)('%s failure permits retry and never deletes unrelated files', async (step) => {
  const f = setup(); f.deps[step].mockRejectedValueOnce(new Error('failed'));
  const destination = step === 'share' ? 'share' : 'save';
  await expect(f.exporter.run(f.report(), 'pdf', destination)).rejects.toThrow('failed');
  for (const [uri] of f.deps.remove.mock.calls) expect(uri).toMatch(/^file:\/\/\/(intermediate\.pdf|cache\/fifo-report-)/);
  await expect(f.exporter.run(f.report(), 'pdf', destination)).resolves.toHaveProperty('status');
});

test('synchronous busy gate prevents duplicate presses; changed snapshot regenerates content', async () => {
  const f = setup(); let resume!: (value: string) => void;
  f.deps.print.mockImplementationOnce(() => new Promise((resolve) => { resume = resolve; }));
  const report = f.report();
  const first = f.exporter.run(report, 'pdf', 'share');
  await expect(f.exporter.run(report, 'pdf', 'share')).resolves.toEqual({ status: 'busy' });
  f.buy('200', '1');
  resume('file:///intermediate.pdf');
  await first;
  expect(f.deps.print.mock.calls[0]![0]).toContain('THB 3,500.00');
  await f.exporter.run(f.report(), 'pdf', 'share');
  expect(f.deps.print.mock.calls[1]![0]).toContain('THB 10,500.00');
  expect(f.deps.writeCache.mock.calls[0]![0]).not.toBe(f.deps.writeCache.mock.calls[1]![0]);
});

test('cleanup failure cannot hide original error or permanently latch busy', async () => {
  const f = setup(); f.deps.stamp.mockRejectedValueOnce(new Error('stamp failed'));
  f.deps.remove.mockRejectedValue(new Error('cleanup failed'));
  await expect(f.exporter.run(f.report(), 'pdf', 'save')).rejects.toThrow('stamp failed');
  await expect(f.exporter.run(f.report(), 'pdf', 'save')).resolves.toMatchObject({ status: 'saved' });
});
