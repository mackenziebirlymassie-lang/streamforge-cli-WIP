#!/usr/bin/env node

/**
 * StreamForge CLI - Fast Streaming Pipeline & Build Automation Engine
 * Zero external telemetry · 100% test coverage · Sub-50ms startup & execution
 */

import { createCommand } from '../lib/core/cli-engine.js';
import { PipelineOrchestrator } from '../lib/core/pipeline-orchestrator.js';
import { handleFatalError } from '../lib/core/error-handler.js';
import { logger, LogLevel } from '../lib/terminal/logger.js';

const program = createCommand('streamforge')
  .version('1.0.0')
  .description('High-performance streaming pipeline & build automation engine');

// 1. RUN COMMAND
program
  .command('run', 'Execute an automated build/transform pipeline')
  .option('-p, --pipeline <file>', 'Path to pipeline definition JSON', 'pipeline.json')
  .option('-f, --format <type>', 'Output format: table, tree, json, ndjson', 'table')
  .option('-d, --dry-run', 'Simulate execution without writing outputs', false)
  .option('-s, --silent', 'Suppress all stdout messages', false)
  .option('-v, --verbose', 'Enable verbose trace logs', false)
  .option('-b, --bail', 'Immediately abort pipeline on first error', true)
  .option('--benchmark', 'Benchmark execution latency', false)
  .action(async (options) => {
    try {
      if (options.silent) logger.setLevel(LogLevel.SILENT);
      if (options.verbose) logger.setLevel(LogLevel.TRACE);

      const orchestrator = new PipelineOrchestrator(options);
      if (options.benchmark) {
        await orchestrator.benchmark(options.pipeline, 5);
      } else {
        await orchestrator.runPipeline(options.pipeline, options);
      }
    } catch (err) {
      handleFatalError(err);
    }
  });

// 2. MANIFEST COMMAND
program
  .command('manifest', 'Materialize files declared in a directory manifest blueprint')
  .option('-m, --manifest <file>', 'Path to directory manifest JSON/text', 'manifest.json')
  .option('-o, --output <dir>', 'Destination directory to generate artifacts', 'dist')
  .option('-f, --format <type>', 'Output format: table, tree, json', 'tree')
  .option('-d, --dry-run', 'Simulate generation without writing to disk', false)
  .option('-s, --silent', 'Suppress stdout', false)
  .action(async (options) => {
    try {
      if (options.silent) logger.setLevel(LogLevel.SILENT);
      const orchestrator = new PipelineOrchestrator(options);
      await orchestrator.generateFromManifest(options.manifest, options.output, options);
    } catch (err) {
      handleFatalError(err);
    }
  });

// 3. DIFF COMMAND
program
  .command('diff', 'Compare target directory with declared manifest blueprint')
  .option('-m, --manifest <file>', 'Path to reference manifest JSON', 'manifest.json')
  .option('-t, --target <dir>', 'Target directory to inspect', '.')
  .option('-f, --format <type>', 'Output format: table, json', 'table')
  .option('-s, --silent', 'Suppress stdout', false)
  .action(async (options) => {
    try {
      if (options.silent) logger.setLevel(LogLevel.SILENT);
      const orchestrator = new PipelineOrchestrator(options);
      await orchestrator.diff(options.manifest, options.target, options);
    } catch (err) {
      handleFatalError(err);
    }
  });

// 4. TREE COMMAND
program
  .command('tree', 'Render a deterministic structured file tree with hashes')
  .option('-d, --dir <path>', 'Directory path to render', '.')
  .option('--depth <n>', 'Maximum directory recursion depth', 10)
  .option('--ascii', 'Render using pure ASCII characters instead of UTF-8', false)
  .option('-f, --format <type>', 'Output format: text, json', 'text')
  .action(async (options) => {
    try {
      const orchestrator = new PipelineOrchestrator(options);
      await orchestrator.printTree(options.dir, {
        useAscii: options.ascii,
        depth: parseInt(options.depth, 10),
        format: options.format,
      });
    } catch (err) {
      handleFatalError(err);
    }
  });

// Parse terminal arguments and execute
program.parse(process.argv);
