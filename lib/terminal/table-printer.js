/**
 * StreamForge CLI - Deterministic Terminal Table Printer
 * Produces structured fixed-width and dynamic tables with right-aligned numeric metrics
 */

import { ansi } from './ansi-styler.js';

export class TablePrinter {
  constructor(options = {}) {
    this.columns = options.columns || []; // Array<{ key, label, align: 'left'|'right', width?: number }>
  }

  print(rows) {
    if (!rows || rows.length === 0) return '';

    // Calculate column widths
    const widths = {};
    for (const col of this.columns) {
      widths[col.key] = Math.max(col.label.length, ...(col.width ? [col.width] : []));
    }

    for (const row of rows) {
      for (const col of this.columns) {
        const valStr = ansi.strip(String(row[col.key] ?? ''));
        widths[col.key] = Math.max(widths[col.key], valStr.length);
      }
    }

    // Build Header
    const headerCells = this.columns.map(col => {
      const pad = widths[col.key];
      return col.align === 'right' ? col.label.padStart(pad) : col.label.padEnd(pad);
    });

    const dividerCells = this.columns.map(col => '─'.repeat(widths[col.key]));

    const lines = [];
    lines.push(ansi.bold(headerCells.join('  ')));
    lines.push(ansi.gray(dividerCells.join('  ')));

    // Build Rows
    for (const row of rows) {
      const rowCells = this.columns.map(col => {
        const rawVal = String(row[col.key] ?? '');
        const strippedLen = ansi.strip(rawVal).length;
        const totalPad = Math.max(0, widths[col.key] - strippedLen);

        if (col.align === 'right') {
          return ' '.repeat(totalPad) + rawVal;
        } else {
          return rawVal + ' '.repeat(totalPad);
        }
      });
      lines.push(rowCells.join('  '));
    }

    return lines.join('\n');
  }
}
