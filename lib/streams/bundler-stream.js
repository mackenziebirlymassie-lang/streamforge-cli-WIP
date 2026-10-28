/**
 * StreamForge CLI - Streaming Destination Bundler & Output Writer
 * Writes files atomically to target destination with permissions and directory creation
 */

import { BaseAsyncTransform } from './transform-base.js';
import { resolve, join } from 'node:path';
import { promises as fs } from 'node:fs';
import { writeAtomic, ensureDir } from '../utils/file-utils.js';

export class BundlerStream extends BaseAsyncTransform {
  constructor(outputDir, options = {}) {
    super('bundler-stream', options);
    this.outputDir = resolve(outputDir);
    this.dryRun = options.dryRun ?? false;
  }

  async processChunk(entry) {
    const destPath = join(this.outputDir, entry.relPath);

    if (entry.isDirectory) {
      if (!this.dryRun) {
        await ensureDir(destPath);
      }
      return {
        ...entry,
        destPath,
        written: !this.dryRun,
      };
    }

    if (!this.dryRun) {
      if (entry.content !== undefined && entry.content !== null) {
        await writeAtomic(destPath, entry.content);
      } else if (entry.fullPath) {
        const dir = resolve(destPath, '..');
        await ensureDir(dir);
        await fs.copyFile(entry.fullPath, destPath);
      }

      if (entry.mode) {
        try {
          await fs.chmod(destPath, entry.mode);
        } catch {
          // Ignore chmod failures on systems that do not support POSIX modes
        }
      }
    }

    return {
      ...entry,
      destPath,
      written: !this.dryRun,
    };
  }
}
