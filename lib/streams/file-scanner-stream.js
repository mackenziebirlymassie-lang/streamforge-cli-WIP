/**
 * StreamForge CLI - Streaming Directory Scanner
 * High-throughput asynchronous directory walker pushing file entries down the stream
 */

import { Readable } from 'node:stream';
import { walkDirectory } from '../utils/file-utils.js';

export class FileScannerStream extends Readable {
  constructor(rootDir, options = {}) {
    super({
      objectMode: true,
      highWaterMark: options.highWaterMark ?? 64,
    });

    this.rootDir = rootDir;
    this.options = options;
    this._iterator = null;
    this._isReading = false;
  }

  async _read() {
    if (this._isReading) return;
    this._isReading = true;

    if (!this._iterator) {
      this._iterator = walkDirectory(this.rootDir, this.options);
    }

    try {
      while (true) {
        const { value, done } = await this._iterator.next();
        if (done) {
          this.push(null); // End of stream
          break;
        }

        const shouldContinue = this.push(value);
        if (!shouldContinue) {
          // Downstream backpressure exerted
          break;
        }
      }
    } catch (err) {
      this.destroy(err);
    } finally {
      this._isReading = false;
    }
  }
}
