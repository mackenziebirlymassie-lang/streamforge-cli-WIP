/**
 * StreamForge CLI - Streaming Directory Manifest Parser
 * Transforms raw manifest files or text chunks into validated file blueprint entries
 */

import { BaseAsyncTransform } from './transform-base.js';
import { ManifestValidationError } from '../core/error-handler.js';

export class ManifestParserStream extends BaseAsyncTransform {
  constructor(options = {}) {
    super('manifest-parser', options);
    this.buffer = '';
    this.variables = options.variables || {};
  }

  async processChunk(chunk) {
    if (typeof chunk === 'object' && !Buffer.isBuffer(chunk)) {
      // Direct object chunk
      return this._normalizeEntry(chunk);
    }

    // Stream string/buffer accumulation
    const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    this.buffer += text;
    return null;
  }

  async flushCleanup() {
    if (this.buffer.trim().length === 0) return;

    try {
      // Attempt JSON parsing first
      const parsed = JSON.parse(this.buffer);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          this.push(this._normalizeEntry(item));
        }
      } else if (parsed && typeof parsed === 'object') {
        if (parsed.files && Array.isArray(parsed.files)) {
          for (const item of parsed.files) {
            this.push(this._normalizeEntry(item, parsed));
          }
        } else {
          // Object map: path -> content or config
          for (const [path, val] of Object.entries(parsed)) {
            this.push(this._normalizeEntry({ path, ...(typeof val === 'object' ? val : { content: val }) }));
          }
        }
      }
    } catch {
      // Fallback: parse raw indentation-based directory manifest text
      const lines = this.buffer.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        // format: path [permissions] [template]
        const parts = trimmed.split(/\s+/);
        const relPath = parts[0];
        const mode = parts[1] && parts[1].startsWith('0o') ? parseInt(parts[1], 8) : 0o644;
        this.push(this._normalizeEntry({ path: relPath, mode }));
      }
    }
  }

  _normalizeEntry(entry, parentConfig = {}) {
    if (!entry.path && !entry.relPath) {
      throw new ManifestValidationError('Manifest entry missing required "path" or "relPath" property', entry);
    }

    const relPath = (entry.path || entry.relPath).replace(/\\/g, '/').replace(/^\.\//, '');
    const isDir = entry.type === 'dir' || entry.type === 'directory' || relPath.endsWith('/');

    return {
      relPath: isDir && !relPath.endsWith('/') ? `${relPath}/` : relPath,
      isDirectory: isDir,
      mode: entry.mode || (isDir ? 0o755 : 0o644),
      content: entry.content ?? '',
      template: entry.template ?? false,
      variables: { ...this.variables, ...(parentConfig.variables || {}), ...(entry.variables || {}) },
      tags: entry.tags || [],
    };
  }
}
