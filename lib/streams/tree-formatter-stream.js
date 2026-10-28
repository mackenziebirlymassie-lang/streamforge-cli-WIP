/**
 * StreamForge CLI - Streaming Tree Formatter
 * Consumes artifact records and emits a structured UTF-8 / ASCII directory tree
 */

import { BaseAsyncTransform } from './transform-base.js';
import { TreeRenderer } from '../terminal/tree-renderer.js';

export class TreeFormatterStream extends BaseAsyncTransform {
  constructor(rootLabel = '.', options = {}) {
    super('tree-formatter', options);
    this.rootLabel = rootLabel;
    this.renderer = new TreeRenderer(options);
    this.collectedEntries = [];
  }

  async processChunk(entry) {
    this.collectedEntries.push(entry);
    return null; // Buffer until flush to construct complete tree
  }

  async flushCleanup() {
    const formattedTree = this.renderer.render(this.collectedEntries, this.rootLabel);
    this.push(formattedTree);
  }
}
