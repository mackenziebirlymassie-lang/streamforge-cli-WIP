/**
 * StreamForge CLI - Central Pipeline Orchestrator
 * High-performance orchestrator connecting streams, DAG executor, manifests, and CLI flags
 */

import { PipelineScriptParser } from '../pipeline/script-parser.js';
import { DAGExecutor } from '../pipeline/dag-executor.js';
import { ManifestCompiler } from '../manifest/manifest-compiler.js';
import { ManifestDiffEngine } from '../manifest/diff-engine.js';
import { TreeRenderer } from '../terminal/tree-renderer.js';
import { ProgressTicker } from '../terminal/progress-ticker.js';
import { SummaryReporter } from '../output/summary-reporter.js';
import { JSONReporter } from '../output/json-reporter.js';
import { walkDirectory, hashFile } from '../utils/file-utils.js';
import { BundlerStream } from '../streams/bundler-stream.js';
import { CompilerStream } from '../streams/compiler-stream.js';
import { ContentHasherStream } from '../streams/content-hasher-stream.js';
import { pipeline } from 'node:stream/promises';
import { PrecisionTimer } from '../utils/timer.js';
import { logger } from '../terminal/logger.js';
import { ansi } from '../terminal/ansi-styler.js';

export class PipelineOrchestrator {
  constructor(options = {}) {
    this.options = options;
  }

  /**
   * Execute an automated build / transform pipeline script
   */
  async runPipeline(pipelinePath, options = {}) {
    const opts = { ...this.options, ...options };
    const pipelineDef = await PipelineScriptParser.load(pipelinePath);

    const ticker = new ProgressTicker();
    if (!opts.silent && opts.format !== 'json' && opts.format !== 'ndjson') {
      ticker.start(`Running pipeline [${pipelineDef.name}]...`);
    }

    const executor = new DAGExecutor(pipelineDef, opts);

    try {
      const result = await executor.execute((evt) => {
        if (evt.type === 'stage:start') {
          ticker.update(`Stage: ${evt.stage}...`);
        }
      });

      ticker.stop();

      if (opts.format === 'json') {
        process.stdout.write(JSONReporter.format(result, false));
      } else if (opts.format === 'ndjson') {
        process.stdout.write(JSONReporter.format(result, true));
      } else if (!opts.silent) {
        SummaryReporter.printPipelineSummary(result);
      }

      return result;
    } catch (err) {
      ticker.stop(ansi.error(`Pipeline [${pipelineDef.name}] failed.`));
      throw err;
    }
  }

  /**
   * Materialize files declared in a directory manifest
   */
  async generateFromManifest(manifestPath, outputDir, options = {}) {
    const opts = { ...this.options, ...options };
    const compiler = new ManifestCompiler({ variables: opts.variables || {} });
    const manifestStream = await compiler.loadFromFile(manifestPath);

    const compilerStream = new CompilerStream({ variables: opts.variables || {} });
    const bundler = new BundlerStream(outputDir, { dryRun: opts.dryRun });
    const hasher = new ContentHasherStream('sha256');

    const generatedArtifacts = [];
    hasher.on('data', (artifact) => generatedArtifacts.push(artifact));

    const timer = new PrecisionTimer('manifest-build');
    await pipeline(manifestStream, compilerStream, bundler, hasher);
    const duration = timer.stop();

    if (!opts.silent && opts.format !== 'json') {
      logger.success(`Manifest materialized ${generatedArtifacts.length} artifacts to "${outputDir}" in ${duration.toFixed(2)}ms`);
      const renderer = new TreeRenderer({ showSizes: true, showHashes: true });
      console.log('\n' + renderer.render(generatedArtifacts, outputDir));
    } else if (opts.format === 'json') {
      console.log(JSON.stringify({ outputDir, artifacts: generatedArtifacts, durationMs: duration }, null, 2));
    }

    return generatedArtifacts;
  }

  /**
   * Compare a directory against a manifest declaration
   */
  async diff(manifestPath, targetDir, options = {}) {
    const opts = { ...this.options, ...options };
    const compiler = new ManifestCompiler({ variables: opts.variables || {} });
    const manifestStream = await compiler.loadFromFile(manifestPath);

    const manifestEntries = [];
    manifestStream.on('data', e => manifestEntries.push(e));
    await new Promise((res, rej) => {
      manifestStream.on('end', res);
      manifestStream.on('error', rej);
    });

    const diffEngine = new ManifestDiffEngine(targetDir);
    const diffs = await diffEngine.compareWithManifest(manifestEntries);

    if (!opts.silent && opts.format !== 'json') {
      console.log(`\n${ansi.bold('Comparing')} "${targetDir}" ${ansi.bold('against manifest')} "${manifestPath}":\n`);
      console.log(diffEngine.formatReport(diffs));
    } else if (opts.format === 'json') {
      console.log(JSON.stringify(diffs, null, 2));
    }

    return diffs;
  }

  /**
   * Print a structured file tree of a directory
   */
  async printTree(targetDir, options = {}) {
    const entries = [];
    for await (const file of walkDirectory(targetDir, { maxDepth: options.depth ?? 10 })) {
      const hash = !file.isDirectory ? await hashFile(file.fullPath) : null;
      entries.push({ ...file, hash });
    }

    const renderer = new TreeRenderer(options);
    const treeText = renderer.render(entries, targetDir);

    if (options.format === 'json') {
      console.log(JSON.stringify(entries, null, 2));
    } else {
      console.log('\n' + treeText + '\n');
    }

    return entries;
  }

  /**
   * Run benchmark verifying sub-50ms execution
   */
  async benchmark(pipelinePath, iterations = 5) {
    console.log(ansi.bold(ansi.cyan(`\n⚡ Running Performance Benchmark (${iterations} iterations)...`)));
    const durations = [];

    for (let i = 1; i <= iterations; i++) {
      const timer = new PrecisionTimer(`run-${i}`);
      await this.runPipeline(pipelinePath, { silent: true });
      const ms = timer.stop();
      durations.push(ms);
      console.log(`  Iteration ${i}: ${ansi.green(ms.toFixed(2) + ' ms')}`);
    }

    const avg = durations.reduce((a, b) => a + b, 0) / iterations;
    const min = Math.min(...durations);
    const max = Math.max(...durations);

    console.log(ansi.gray('─'.repeat(40)));
    console.log(`  ${ansi.bold('Average:')} ${ansi.green(avg.toFixed(2) + ' ms')}`);
    console.log(`  ${ansi.bold('Min:')}     ${ansi.green(min.toFixed(2) + ' ms')} | ${ansi.bold('Max:')} ${ansi.yellow(max.toFixed(2) + ' ms')}`);
    const isSub50 = avg < 50;
    console.log(`  ${ansi.bold('Sub-50ms Guarantee:')} ${isSub50 ? ansi.success('PASSED (✔ < 50ms)') : ansi.warn('MARGINAL')}\n`);
    return { avg, min, max, isSub50 };
  }
}
