import type { FifoReport } from './types';
import { renderReportHtml } from './html';
import { renderReportCsv } from './csv';

export type ReportFormat = 'pdf' | 'csv';
export type ReportDestination = 'save' | 'share';
export type ExportResult = { status: 'saved'; uri: string } | { status: 'shared' | 'cancelled' | 'busy' };
export const REPORT_CACHE_TTL = 24 * 60 * 60 * 1000;

export interface ReportExportDeps {
  now(): Date;
  sweepCache(before: number): Promise<void>;
  print(html: string): Promise<string>;
  readBytes(uri: string): Promise<Uint8Array>;
  stamp(bytes: Uint8Array, generatedAt: string): Promise<Uint8Array>;
  writeCache(name: string, content: string | Uint8Array): Promise<string>;
  remove(uri: string): Promise<void>;
  save(uri: string, name: string, mime: string): Promise<string | null>;
  share(uri: string, mime: string): Promise<void>;
}

let sequence = 0;

/** One coordinator per screen; no reusable artifact can outlive its input snapshot. */
export class ReportExporter {
  private active = false;
  constructor(private readonly deps: ReportExportDeps) {}

  async run(report: FifoReport, format: ReportFormat, destination: ReportDestination): Promise<ExportResult> {
    if (this.active) return { status: 'busy' };
    if (report.sections.length === 0) throw new Error('No transactions to report');
    this.active = true;
    let intermediate: string | undefined;
    let artifact: string | undefined;
    let keepArtifact = false;
    try {
      const now = this.deps.now();
      // Cache housekeeping is best effort and must not prevent a user's export.
      await this.deps.sweepCache(now.getTime() - REPORT_CACHE_TTL).catch(() => {});
      const name = `fifo-report-${now.toISOString().replace(/[:.]/g, '-')}-${++sequence}.${format}`;
      let content: string | Uint8Array;
      if (format === 'pdf') {
        intermediate = await this.deps.print(renderReportHtml(report));
        content = await this.deps.stamp(await this.deps.readBytes(intermediate), report.generatedAt);
      } else {
        content = renderReportCsv(report);
      }
      artifact = await this.deps.writeCache(name, content);
      const mime = format === 'pdf' ? 'application/pdf' : 'text/csv';
      if (destination === 'save') {
        const uri = await this.deps.save(artifact, name, mime);
        return uri === null ? { status: 'cancelled' } : { status: 'saved', uri };
      }
      await this.deps.share(artifact, mime);
      keepArtifact = true; // The receiving application can still be reading it.
      return { status: 'shared' }; // Means sheet closed, not delivery confirmed.
    } finally {
      if (intermediate) await this.deps.remove(intermediate).catch(() => {});
      if (artifact && !keepArtifact) await this.deps.remove(artifact).catch(() => {});
      this.active = false;
    }
  }
}
