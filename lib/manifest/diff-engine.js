/**
 * StreamForge CLI - Structural Directory & Manifest Diff Engine
 * Detects ADDED, REMOVED, and MODIFIED files between disk state and declared blueprint
 */

import { walkDirectory, hashFile, hashBuffer } from '../utils/file-utils.js';
import { TablePrinter } from '../terminal/table-printer.js';
import { ansi } from '../terminal/ansi-styler.js';

export const DiffStatus = Object.freeze({
  MATCH: 'MATCH',
  MODIFIED: 'MODIFIED',
  ADDED: 'ADDED',
  REMOVED: 'REMOVED',
});

export class ManifestDiffEngine {
  constructor(targetDir) {
    this.targetDir = targetDir;
  }

  async compareWithManifest(manifestEntries) {
    // 1. Scan actual disk state
    const diskMap = new Map();
    for await (const file of walkDirectory(this.targetDir)) {
      if (!file.isDirectory) {
        const hash = await hashFile(file.fullPath);
        diskMap.set(file.relPath, { ...file, hash });
      }
    }

    // 2. Map declared manifest entries
    const manifestMap = new Map();
    for (const entry of manifestEntries) {
      if (!entry.isDirectory) {
        const hash = entry.content !== undefined ? hashBuffer(Buffer.from(entry.content)) : null;
        manifestMap.set(entry.relPath, { ...entry, hash });
      }
    }

    const diffResults = [];

    // Check manifest expectations against disk
    for (const [path, expected] of manifestMap.entries()) {
      if (!diskMap.has(path)) {
        diffResults.push({
          path,
          status: DiffStatus.REMOVED, // Missing on disk
          expectedHash: expected.hash,
          actualHash: null,
        });
      } else {
        const actual = diskMap.get(path);
        const isMatch = !expected.hash || expected.hash === actual.hash;
        diffResults.push({
          path,
          status: isMatch ? DiffStatus.MATCH : DiffStatus.MODIFIED,
          expectedHash: expected.hash,
          actualHash: actual.hash,
        });
        diskMap.delete(path); // Handled
      }
    }

    // Remaining files on disk were not in manifest
    for (const [path, actual] of diskMap.entries()) {
      diffResults.push({
        path,
        status: DiffStatus.ADDED, // Extraneous on disk
        expectedHash: null,
        actualHash: actual.hash,
      });
    }

    // Sort deterministically
    diffResults.sort((a, b) => a.path.localeCompare(b.path));
    return diffResults;
  }

  formatReport(diffResults) {
    const printer = new TablePrinter({
      columns: [
        { key: 'status', label: 'DIFF STATUS', align: 'left', width: 12 },
        { key: 'path', label: 'FILE PATH', align: 'left' },
        { key: 'details', label: 'CHECKSUM DELTA', align: 'left' },
      ],
    });

    const rows = diffResults.map(r => {
      let statusFormatted = ansi.dim(r.status);
      let details = ansi.gray('Hashes match');

      if (r.status === DiffStatus.ADDED) {
        statusFormatted = ansi.green('+ ADDED');
        details = ansi.green(`On disk (${r.actualHash.slice(0, 8)})`);
      } else if (r.status === DiffStatus.REMOVED) {
        statusFormatted = ansi.red('- MISSING');
        details = ansi.red('Expected in manifest');
      } else if (r.status === DiffStatus.MODIFIED) {
        statusFormatted = ansi.yellow('~ MODIFIED');
        details = ansi.yellow(`${r.expectedHash.slice(0, 8)} != ${r.actualHash.slice(0, 8)}`);
      }

      return {
        status: statusFormatted,
        path: r.path,
        details,
      };
    });

    return printer.print(rows);
  }
}
