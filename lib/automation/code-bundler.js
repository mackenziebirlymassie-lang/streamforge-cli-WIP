/**
 * StreamForge CLI - Single-File Code Bundler & Module Graph Resolver
 * Stream-based static dependency resolver and asset inliner
 */

import { promises as fs } from 'node:fs';
import { resolve, dirname, join } from 'node:path';

export class CodeBundler {
  constructor(entryFile, options = {}) {
    this.entryFile = resolve(entryFile);
    this.options = options;
    this.moduleGraph = new Map(); // absPath -> { code, imports: [] }
  }

  async build() {
    await this._traverse(this.entryFile);

    // Concatenate modules into a deterministic IIFE / ESM bundle
    const banner = this.options.banner || '/** Bundled by StreamForge CLI */';
    const bundledParts = [banner, '(function() {', '  const __modules = {};'];

    for (const [absPath, mod] of this.moduleGraph.entries()) {
      const relId = absPath.replace(/\\/g, '/');
      bundledParts.push(`  __modules["${relId}"] = function(exports, require, module) {`);
      bundledParts.push(mod.code.split('\n').map(l => '    ' + l).join('\n'));
      bundledParts.push('  };');
    }

    const entryId = this.entryFile.replace(/\\/g, '/');
    bundledParts.push(`  // Execute Entrypoint`);
    bundledParts.push(`  __modules["${entryId}"]({}, function() {}, { exports: {} });`);
    bundledParts.push('})();\n');

    return bundledParts.join('\n');
  }

  async _traverse(filePath) {
    const absPath = resolve(filePath);
    if (this.moduleGraph.has(absPath)) return;

    let content = '';
    try {
      content = await fs.readFile(absPath, 'utf8');
    } catch {
      return;
    }

    // Extract relative imports: import ... from './rel/path.js' or require('./rel/path.js')
    const importRegex = /(?:import\s+.*?\s+from\s+['"](\.[^'"]+)['"]|require\(['"](\.[^'"]+)['"]\))/g;
    const imports = [];
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      const targetRel = match[1] || match[2];
      const targetAbs = resolve(dirname(absPath), targetRel);
      imports.push(targetAbs);
    }

    this.moduleGraph.set(absPath, { code: content, imports });

    for (const dep of imports) {
      await this._traverse(dep);
    }
  }
}
