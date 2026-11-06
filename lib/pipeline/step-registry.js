/**
 * StreamForge CLI - Pipeline Step Transform Registry
 * Factory for instantiating streaming transformation stages by name
 */

import { FileScannerStream } from '../streams/file-scanner-stream.js';
import { FilterStream } from '../streams/filter-stream.js';
import { ContentHasherStream } from '../streams/content-hasher-stream.js';
import { CompilerStream } from '../streams/compiler-stream.js';
import { BundlerStream } from '../streams/bundler-stream.js';
import { TreeFormatterStream } from '../streams/tree-formatter-stream.js';
import { ReportSinkStream } from '../streams/report-sink-stream.js';
import { BaseAsyncTransform } from '../streams/transform-base.js';
import { SecurityScannerStream } from '../automation/security-scanner.js';
import { LicenseAuditor } from '../automation/license-auditor.js';
import { ArtifactVerifier } from '../automation/artifact-verifier.js';
import { BundleOptimizer } from '../automation/bundle-optimizer.js';
import { hashFile } from '../utils/file-utils.js';
import { promises as fs } from 'node:fs';

export class StepRegistry {
  constructor() {
    this._factories = new Map();
    this._registerDefaults();
  }

  _registerDefaults() {
    this._factories.set('scan', (config) => new FileScannerStream(config.dir || '.', config));
    this._factories.set('filter', (config) => new FilterStream(config.patterns || ['*'], config));
    this._factories.set('hash', (config) => new ContentHasherStream(config.algorithm || 'sha256', config));
    this._factories.set('compile', (config) => new CompilerStream(config));
    this._factories.set('bundle', (config) => new BundlerStream(config.outDir || 'dist', config));
    this._factories.set('tree', (config) => new TreeFormatterStream(config.rootLabel || '.', config));
    this._factories.set('report', (config) => new ReportSinkStream(config.format || 'table', config));

    // Automation pipeline steps
    this._factories.set('security', (config) => new SecurityScannerStream(config));
    this._factories.set('audit', (config) => new SecurityScannerStream(config));

    this._factories.set('license', (config) => {
      const auditor = new LicenseAuditor(config);
      const step = new BaseAsyncTransform('license-auditor-step', config);
      step.processChunk = async (chunk) => {
        if (chunk.relPath === 'package.json' || chunk.name === 'package.json') {
          const raw = chunk.content ? chunk.content : await fs.readFile(chunk.fullPath, 'utf8');
          const pkg = typeof raw === 'string' ? JSON.parse(raw) : JSON.parse(raw.toString('utf8'));
          chunk.licenseAudit = auditor.auditDependencies(pkg);
        }
        return chunk;
      };
      return step;
    });

    this._factories.set('verify', (config) => {
      const verifier = new ArtifactVerifier(config);
      const step = new BaseAsyncTransform('artifact-verifier-step', config);
      step.processChunk = async (chunk) => {
        if (!chunk.isDirectory && (chunk.content || chunk.fullPath)) {
          const hash = chunk.content ? verifier.hash(chunk.content) : await hashFile(chunk.fullPath, config.algorithm || 'sha256');
          chunk.verifiedHash = hash;
        }
        return chunk;
      };
      return step;
    });

    this._factories.set('optimize', (config) => {
      const optimizer = new BundleOptimizer(config);
      const step = new BaseAsyncTransform('bundle-optimizer-step', config);
      step.processChunk = async (chunk) => {
        if (!chunk.isDirectory && chunk.content) {
          optimizer.addAsset(chunk.relPath || chunk.name, chunk.content);
        }
        return chunk;
      };
      return step;
    });

    // Custom user inline transform step
    this._factories.set('transform', (config) => {
      const transformFn = config.fn || (x => x);
      const customStep = new BaseAsyncTransform(config.name || 'custom-transform', config);
      customStep.processChunk = async (chunk) => transformFn(chunk);
      return customStep;
    });
  }

  createStep(type, config = {}) {
    const factory = this._factories.get(type);
    if (!factory) {
      throw new Error(`Unknown pipeline step type: "${type}". Available steps: ${Array.from(this._factories.keys()).join(', ')}`);
    }
    return factory(config);
  }

  registerStep(name, factoryFn) {
    this._factories.set(name, factoryFn);
  }
}

export const GlobalStepRegistry = new StepRegistry();
