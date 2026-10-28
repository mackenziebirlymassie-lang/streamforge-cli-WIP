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
