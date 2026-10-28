/**
 * StreamForge CLI - Resilient Base Async Transform Stream
 * Extends node:stream.Transform in objectMode with backpressure, metrics, and error isolation
 */

import { Transform } from 'node:stream';
import { TransformStreamError } from '../core/error-handler.js';

export class BaseAsyncTransform extends Transform {
  constructor(name = 'base-transform', options = {}) {
    super({
      objectMode: true,
      highWaterMark: options.highWaterMark ?? 64,
      ...options,
    });

    this.name = name;
    this.signal = options.signal ?? null;

    // Stream Execution Telemetry
    this.stats = {
      itemsIn: 0,
      itemsOut: 0,
      bytesProcessed: 0,
      startTime: null,
      endTime: null,
      totalDurationMs: 0,
    };

    if (this.signal) {
      this.signal.addEventListener('abort', () => {
        this.destroy(new Error(`Stream [${this.name}] aborted by signal`));
      });
    }
  }

  _transform(chunk, encoding, callback) {
    if (!this.stats.startTime) {
      this.stats.startTime = performance.now();
    }
    this.stats.itemsIn++;

    if (chunk && chunk.size) {
      this.stats.bytesProcessed += chunk.size;
    }

    // Execute async transform method
    this.processChunk(chunk, encoding)
      .then((result) => {
        if (result !== undefined && result !== null) {
          if (Array.isArray(result)) {
            for (const item of result) {
              this.stats.itemsOut++;
              this.push(item);
            }
          } else {
            this.stats.itemsOut++;
            this.push(result);
          }
        }
        callback();
      })
      .catch((err) => {
        callback(new TransformStreamError(`Failure in stage [${this.name}]: ${err.message}`, this.name, err));
      });
  }

  _flush(callback) {
    this.stats.endTime = performance.now();
    if (this.stats.startTime) {
      this.stats.totalDurationMs = this.stats.endTime - this.stats.startTime;
    }

    this.flushCleanup()
      .then(() => callback())
      .catch((err) => callback(err));
  }

  /**
   * Override in child classes to execute chunk transformation
   */
  async processChunk(chunk, encoding) {
    return chunk;
  }

  /**
   * Optional cleanup on stream flush
   */
  async flushCleanup() {}

  getMetrics() {
    return {
      name: this.name,
      ...this.stats,
      durationMs: this.stats.totalDurationMs.toFixed(2),
    };
  }
}
