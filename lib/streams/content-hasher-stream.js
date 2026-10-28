/**
 * StreamForge CLI - Streaming Content Hasher Transform
 * Calculates cryptographic SHA-256 digests for stream entries
 */

import { BaseAsyncTransform } from './transform-base.js';
import { hashFile, hashBuffer } from '../utils/file-utils.js';

export class ContentHasherStream extends BaseAsyncTransform {
  constructor(algorithm = 'sha256', options = {}) {
    super(`content-hasher-${algorithm}`, options);
    this.algorithm = algorithm;
  }

  async processChunk(entry) {
    if (entry.isDirectory) {
      return entry;
    }

    let hash;
    if (entry.content !== undefined && entry.content !== null) {
      hash = hashBuffer(Buffer.from(entry.content), this.algorithm);
    } else if (entry.fullPath) {
      hash = await hashFile(entry.fullPath, this.algorithm);
    } else {
      hash = hashBuffer(Buffer.alloc(0), this.algorithm);
    }

    return {
      ...entry,
      hash,
      algorithm: this.algorithm,
    };
  }
}
