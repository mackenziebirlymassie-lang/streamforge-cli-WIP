/**
 * StreamForge CLI - Deterministic Report Sink Stream
 * Formats stream artifacts into final tabular audits, JSON, or NDJSON stdout reports
 */

import { BaseAsyncTransform } from './transform-base.js';
import { TablePrinter } from '../terminal/table-printer.js';
import { formatBytes } from '../utils/byte-format.js';
import { ansi } from '../terminal/ansi-styler.js';

export class ReportSinkStream extends BaseAsyncTransform {
  constructor(format = 'table', options = {}) {
    super('report-sink', options);
    this.format = format;
    this.records = [];
    this.totalBytes = 0;
  }

  async processChunk(entry) {
    if (this.format === 'ndjson') {
      this.push(JSON.stringify(entry) + '\n');
      return null;
    }

    this.records.push(entry);
    if (!entry.isDirectory && entry.size) {
      this.totalBytes += entry.size;
    }
    return null;
  }

  async flushCleanup() {
    if (this.format === 'json') {
      const output = JSON.stringify({
        totalFiles: this.records.filter(r => !r.isDirectory).length,
        totalBytes: this.totalBytes,
        artifacts: this.records,
      }, null, 2);
      this.push(output + '\n');
      return;
    }

    if (this.format === 'table') {
      const printer = new TablePrinter({
        columns: [
          { key: 'status', label: 'STATUS', align: 'left', width: 8 },
          { key: 'path', label: 'ARTIFACT PATH', align: 'left' },
          { key: 'size', label: 'SIZE', align: 'right', width: 10 },
          { key: 'hash', label: 'SHA-256 (PREFIX)', align: 'left', width: 16 },
        ],
      });

      const rows = this.records.map(r => ({
        status: r.isDirectory ? ansi.dim('DIR') : ansi.green('OK'),
        path: r.relPath || r.path,
        size: r.isDirectory ? '-' : formatBytes(r.size ?? 0),
        hash: r.hash ? r.hash.slice(0, 12) + '...' : ansi.gray('-'),
      }));

      const tableReport = printer.print(rows);
      this.push('\n' + tableReport + '\n');
    }
  }
}
