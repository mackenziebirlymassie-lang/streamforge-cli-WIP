/**
 * StreamForge CLI - Streaming Glob & Attribute Filter Transform
 * Evaluates inclusion/exclusion criteria on pipeline chunks with zero overhead
 */

import { BaseAsyncTransform } from './transform-base.js';
import { GlobMatcher } from '../utils/glob-matcher.js';

export class FilterStream extends BaseAsyncTransform {
  constructor(patterns = ['*'], options = {}) {
    super('filter-stream', options);
    this.matcher = new GlobMatcher(patterns);
    this.maxSize = options.maxSize ?? Infinity;
    this.minSize = options.minSize ?? 0;
  }

  async processChunk(entry) {
    const path = entry.relPath || entry.path || '';

    // Check glob match
    if (!this.matcher.test(path)) {
      return null; // Drop item
    }

    // Check size range for files
    if (!entry.isDirectory && entry.size !== undefined) {
      if (entry.size < this.minSize || entry.size > this.maxSize) {
        return null;
      }
    }

    return entry;
  }
}
