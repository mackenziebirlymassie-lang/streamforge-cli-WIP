/**
 * @fileoverview Build Artifact and Bundle Optimizer for StreamForge.
 * Inspects generated outputs, detects duplicated code patterns,
 * enforces size budgets, and generates distribution histograms.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { formatBytes } from '../utils/byte-format.js';

export class BundleOptimizer {
  /**
   * @param {Object} [options]
   * @param {number} [options.maxBundleBytes=500000] - 500 KB limit
   * @param {number} [options.maxChunkBytes=100000] - 100 KB limit
   */
  constructor(options = {}) {
    this.maxBundleBytes = options.maxBundleBytes || 500 * 1024;
    this.maxChunkBytes = options.maxChunkBytes || 100 * 1024;
    this.assets = [];
  }

  /**
   * Adds an asset for bundle analysis.
   * @param {string} filePath - Path or identifier
   * @param {string | Buffer} content - Asset content
   */
  addAsset(filePath, content) {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');

    this.assets.push({
      path: filePath.replace(/\\/g, '/'),
      size: buffer.length,
      hash,
      extension: path.extname(filePath).toLowerCase(),
      content: buffer.toString('utf8')
    });
  }

  /**
   * Scans a target build directory and adds all files.
   * @param {string} buildDir - Directory to analyze
   */
  scanBuildDir(buildDir) {
    const scan = (current) => {
      let entries = [];
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          scan(full);
        } else if (entry.isFile()) {
          const content = fs.readFileSync(full);
          const rel = path.relative(buildDir, full);
          this.addAsset(rel, content);
        }
      }
    };

    scan(path.resolve(buildDir));
  }

  /**
   * Analyzes assets and detects budget violations, duplicates, and dead patterns.
   * @returns {Object} Optimization audit report
   */
  audit() {
    let totalBytes = 0;
    const extensions = {};
    const hashGroups = new Map();
    const budgetViolations = [];
    const suggestions = [];

    for (const asset of this.assets) {
      totalBytes += asset.size;

      // Group by hash to detect identical duplicate assets
      if (!hashGroups.has(asset.hash)) {
        hashGroups.set(asset.hash, []);
      }
      hashGroups.get(asset.hash).push(asset.path);

      // Track extensions
      const ext = asset.extension || '(none)';
      extensions[ext] = (extensions[ext] || 0) + asset.size;

      // Check chunk size budget
      if (asset.size > this.maxChunkBytes) {
        budgetViolations.push({
          type: 'CHUNK_SIZE_EXCEEDED',
          file: asset.path,
          size: asset.size,
          limit: this.maxChunkBytes,
          formattedSize: formatBytes(asset.size),
          formattedLimit: formatBytes(this.maxChunkBytes)
        });
      }

      // Check for common dead code / console statement leaks in production bundles
      if (['.js', '.mjs', '.cjs'].includes(asset.extension)) {
        if (asset.content.includes('console.debug(') || asset.content.includes('debugger')) {
          suggestions.push({
            file: asset.path,
            severity: 'WARN',
            message: 'Contains debugger or debug/console statements that should be stripped in release builds.'
          });
        }
      }
    }

    // Check total bundle size budget
    if (totalBytes > this.maxBundleBytes) {
      budgetViolations.push({
        type: 'TOTAL_BUNDLE_SIZE_EXCEEDED',
        size: totalBytes,
        limit: this.maxBundleBytes,
        formattedSize: formatBytes(totalBytes),
        formattedLimit: formatBytes(this.maxBundleBytes)
      });
    }

    // Identify duplicates
    const duplicates = [];
    for (const [hash, paths] of hashGroups.entries()) {
      if (paths.length > 1) {
        duplicates.push({
          hash: hash.slice(0, 12),
          paths,
          count: paths.length
        });
        suggestions.push({
          severity: 'INFO',
          message: `Identical content detected across ${paths.length} files (${paths.join(', ')}). Consider symlinking or sharing.`
        });
      }
    }

    return {
      summary: {
        totalAssets: this.assets.length,
        totalBytes,
        formattedTotal: formatBytes(totalBytes),
        isBudgetCompliant: budgetViolations.length === 0
      },
      byExtension: extensions,
      budgetViolations,
      duplicates,
      suggestions,
      histogram: this.generateHistogram()
    };
  }

  /**
   * Generates an ASCII visual bar chart of file sizes by extension.
   * @returns {string} ASCII histogram chart
   */
  generateHistogram() {
    if (this.assets.length === 0) return '(No assets analyzed)';

    const extTotals = {};
    for (const a of this.assets) {
      const ext = a.extension || '(no ext)';
      extTotals[ext] = (extTotals[ext] || 0) + a.size;
    }

    const sorted = Object.entries(extTotals).sort((a, b) => b[1] - a[1]);
    const maxVal = sorted[0][1] || 1;
    const maxBarWidth = 30;

    const lines = ['Asset Distribution:'];
    for (const [ext, bytes] of sorted) {
      const barLen = Math.max(1, Math.round((bytes / maxVal) * maxBarWidth));
      const bar = '█'.repeat(barLen);
      lines.push(`  ${ext.padEnd(8)} │ ${bar.padEnd(maxBarWidth)} │ ${formatBytes(bytes)}`);
    }

    return lines.join('\n');
  }

  /**
   * Formats full audit report into human-readable terminal string.
   * @returns {string} Formatted terminal summary
   */
  formatReport() {
    const report = this.audit();
    const lines = [
      '📦 StreamForge Bundle Optimization Report',
      '────────────────────────────────────────────────────────────',
      `  Total Assets:  ${report.summary.totalAssets}`,
      `  Total Size:    ${report.summary.formattedTotal}`,
      `  Budget Status: ${report.summary.isBudgetCompliant ? '✔ PASSED' : '✖ VIOLATION'}`,
      '────────────────────────────────────────────────────────────',
      report.histogram,
      '────────────────────────────────────────────────────────────'
    ];

    if (report.budgetViolations.length > 0) {
      lines.push('  Budget Violations:');
      for (const v of report.budgetViolations) {
        lines.push(`    • [${v.type}] ${v.file || 'Bundle'}: ${v.formattedSize} > limit ${v.formattedLimit}`);
      }
    }

    if (report.duplicates.length > 0) {
      lines.push('  Duplicate Assets:');
      for (const d of report.duplicates) {
        lines.push(`    • Hash ${d.hash}: [${d.paths.join(', ')}]`);
      }
    }

    if (report.suggestions.length > 0) {
      lines.push('  Suggestions:');
      for (const s of report.suggestions) {
        lines.push(`    [${s.severity}] ${s.file ? s.file + ': ' : ''}${s.message}`);
      }
    }

    return lines.join('\n');
  }
}
