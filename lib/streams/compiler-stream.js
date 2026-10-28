/**
 * StreamForge CLI - Streaming Compiler & Template Transformer
 * Substitutes variables, injects headers, and optimizes textual assets in-flight
 */

import { BaseAsyncTransform } from './transform-base.js';
import { promises as fs } from 'node:fs';

export class CompilerStream extends BaseAsyncTransform {
  constructor(options = {}) {
    super('compiler-stream', options);
    this.variables = options.variables || {};
    this.header = options.header || '';
    this.minifyWhitespace = options.minifyWhitespace ?? false;
  }

  async processChunk(entry) {
    if (entry.isDirectory) {
      return entry;
    }

    let rawContent = entry.content;
    if (rawContent === undefined && entry.fullPath) {
      rawContent = await fs.readFile(entry.fullPath, 'utf8');
    }

    if (rawContent === undefined || rawContent === null) {
      return entry;
    }

    let text = typeof rawContent === 'string' ? rawContent : rawContent.toString('utf8');

    // 1. Template variable substitution: {{VAR_NAME}}
    const mergedVars = { ...this.variables, ...(entry.variables || {}) };
    text = text.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (_, key) => {
      return mergedVars[key] !== undefined ? String(mergedVars[key]) : `{{${key}}}`;
    });

    // 2. Whitespace optimization / trimming if requested
    if (this.minifyWhitespace) {
      text = text
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n/g, '\n')
        .trim();
    }

    // 3. Header insertion
    if (this.header && !text.startsWith(this.header)) {
      text = `${this.header}\n${text}`;
    }

    const compiledBuffer = Buffer.from(text, 'utf8');

    return {
      ...entry,
      content: text,
      size: compiledBuffer.length,
      originalSize: entry.size ?? rawContent.length,
      isTransformed: true,
    };
  }
}
