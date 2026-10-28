/**
 * StreamForge CLI - Manifest Compiler & Blueprint Generator
 * Converts directory manifests into optimized file generation streams
 */

import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import { ManifestSchemaValidator } from './manifest-schema.js';
import { ManifestParserStream } from '../streams/manifest-parser-stream.js';
import { Readable } from 'node:stream';

export class ManifestCompiler {
  constructor(options = {}) {
    this.variables = options.variables || {};
  }

  async loadFromFile(manifestFilePath) {
    const absPath = resolve(manifestFilePath);
    const content = await fs.readFile(absPath, 'utf8');

    let parsed;
    try {
      parsed = JSON.parse(content);
      ManifestSchemaValidator.validate(parsed);
    } catch {
      // Raw format will be processed by stream
    }

    return this.createStream(content);
  }

  createStream(manifestData) {
    const parser = new ManifestParserStream({ variables: this.variables });
    const readable = Readable.from(typeof manifestData === 'string' ? [manifestData] : [JSON.stringify(manifestData)]);
    return readable.pipe(parser);
  }
}
