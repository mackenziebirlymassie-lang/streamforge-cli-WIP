/**
 * @fileoverview Test suite for StreamForge Advanced Automation Modules.
 * Tests Performance Profiler, Dependency Graph Analyzer, Config Migrator,
 * Bundle Optimizer, and Cryptographic Artifact Verifier.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PerformanceProfiler } from '../lib/automation/performance-profiler.js';
import { DependencyGraph } from '../lib/automation/dependency-graph.js';
import { ConfigMigrator } from '../lib/automation/config-migrator.js';
import { BundleOptimizer } from '../lib/automation/bundle-optimizer.js';
import { ArtifactVerifier } from '../lib/automation/artifact-verifier.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tempDir = path.join(__dirname, 'temp-adv-auto');

export async function run() {
  let passed = 0;
  let failed = 0;

  async function test(description, fn) {
    try {
      await fn();
      passed++;
    } catch (err) {
      failed++;
      console.error(`\nTest failed: ${description}\n`, err);
      throw err;
    }
  }

  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    // 1. PerformanceProfiler Tests
    await test('PerformanceProfiler: measures async execution, drain events, and builds report', async () => {
      const profiler = new PerformanceProfiler({ latencyBudgetMs: 100, sampleIntervalMs: 5 });
      profiler.start();

      profiler.recordDrain('CompilerStream', 1.5);
      profiler.recordDrain('BundlerStream', 2.0);

      const { result, durationMs } = await profiler.measureAsync('hashStage', async () => {
        let sum = 0;
        for (let i = 0; i < 10000; i++) sum += i;
        return sum;
      });

      assert.strictEqual(result, 49995000);
      assert.ok(durationMs >= 0);

      profiler.recordStage('bundleStage', 4.5, 10, 5000);
      const report = profiler.stop();

      assert.ok(report.execution.elapsedMs >= 0);
      assert.strictEqual(report.execution.budgetPassed, true);
      assert.strictEqual(report.backpressure.drainEventCount, 2);
      assert.ok(report.stages.hashStage);
      assert.ok(report.stages.bundleStage);

      const summaryText = profiler.formatSummary();
      assert.ok(summaryText.includes('StreamForge Execution Profiler Report'));
      assert.ok(summaryText.includes('bundleStage'));
    });

    // 2. DependencyGraph Tests
    await test('DependencyGraph: specifier extraction, cycle detection, and topological sorting', async () => {
      const graph = new DependencyGraph();
      const codeA = `
        import { b } from './b.js';
        import c from './c.js';
        import lodash from 'lodash';
        const d = require('./d.js');
      `;

      const specifiers = DependencyGraph.extractSpecifiers(codeA);
      assert.ok(specifiers.includes('./b.js'));
      assert.ok(specifiers.includes('./c.js'));
      assert.ok(specifiers.includes('lodash'));
      assert.ok(specifiers.includes('./d.js'));

      // Build acyclic graph
      graph.addEdge('app.js', 'auth.js');
      graph.addEdge('app.js', 'db.js');
      graph.addEdge('auth.js', 'crypto.js');
      graph.addEdge('db.js', 'crypto.js');

      const cycles = graph.findCycles();
      assert.strictEqual(cycles.length, 0);

      const topo = graph.getTopologicalOrder();
      assert.ok(topo.indexOf('app.js') < topo.indexOf('auth.js'));
      assert.ok(topo.indexOf('auth.js') < topo.indexOf('crypto.js'));

      const dot = graph.toDot();
      assert.ok(dot.includes('digraph StreamForgeDependencies'));
      assert.ok(dot.includes('"app.js" -> "auth.js"'));

      const ascii = graph.renderAscii('app.js');
      assert.ok(ascii.includes('app.js'));
      assert.ok(ascii.includes('auth.js'));

      // Cyclic graph test
      const cyclicGraph = new DependencyGraph();
      cyclicGraph.addEdge('a.js', 'b.js');
      cyclicGraph.addEdge('b.js', 'c.js');
      cyclicGraph.addEdge('c.js', 'a.js');

      const detectedCycles = cyclicGraph.findCycles();
      assert.ok(detectedCycles.length > 0);
      assert.throws(() => cyclicGraph.getTopologicalOrder(false), /Circular dependency detected/);
    });

    // 3. ConfigMigrator Tests
    await test('ConfigMigrator: plan calculation, forward/down migrations, and atomic backup', async () => {
      const migrator = new ConfigMigrator({ configType: 'manifest' });

      // Plan calculation: v1 -> v3
      const plan = migrator.getPlan(1, 3);
      assert.strictEqual(plan.length, 2);
      assert.strictEqual(plan[0].version, 1);
      assert.strictEqual(plan[0].direction, 'up');
      assert.strictEqual(plan[1].version, 2);
      assert.strictEqual(plan[1].direction, 'up');

      // Forward migration v1 -> v3
      const v1Config = {
        name: 'LegacyApp',
        version: 1,
        files: {
          'index.js': 'console.log("hello");',
          'package.json': '{"name":"legacy"}'
        }
      };

      const { migrated: v3Config, stepsApplied } = migrator.migrate(v1Config, 3);
      assert.strictEqual(stepsApplied, 2);
      assert.strictEqual(v3Config.version, 3);
      assert.ok(Array.isArray(v3Config.entries));
      assert.strictEqual(v3Config.entries.length, 2);
      assert.ok(v3Config.integrity);
      assert.strictEqual(v3Config.integrity.algorithm, 'sha256');

      // Rollback migration v3 -> v1
      const { migrated: rolledBackV1 } = migrator.migrate(v3Config, 1);
      assert.strictEqual(rolledBackV1.version, 1);
      assert.ok(rolledBackV1.files['index.js']);
      assert.strictEqual(rolledBackV1.integrity, undefined);

      // File migration with backup
      const cfgFilePath = path.join(tempDir, 'manifest-test.json');
      fs.writeFileSync(cfgFilePath, JSON.stringify(v1Config, null, 2), 'utf8');

      const fileResult = migrator.migrateFile(cfgFilePath, 2, { backup: true });
      assert.strictEqual(fileResult.success, true);
      assert.strictEqual(fileResult.originalVersion, 1);
      assert.strictEqual(fileResult.newVersion, 2);
      assert.ok(fs.existsSync(fileResult.backupPath));

      const updatedOnDisk = JSON.parse(fs.readFileSync(cfgFilePath, 'utf8'));
      assert.strictEqual(updatedOnDisk.version, 2);
      assert.ok(Array.isArray(updatedOnDisk.entries));
    });

    // 4. BundleOptimizer Tests
    await test('BundleOptimizer: budget compliance, duplicate asset detection, and histogram generation', async () => {
      const optimizer = new BundleOptimizer({ maxBundleBytes: 5000, maxChunkBytes: 2000 });
      optimizer.addAsset('bundle.js', 'function main() { console.log("ok"); debugger; }');
      optimizer.addAsset('style.css', 'body { margin: 0; background: #fff; }');
      optimizer.addAsset('style-copy.css', 'body { margin: 0; background: #fff; }'); // Duplicate
      optimizer.addAsset('huge-vendor.js', 'x'.repeat(3000)); // Violates chunk limit

      const audit = optimizer.audit();
      assert.strictEqual(audit.summary.totalAssets, 4);
      assert.strictEqual(audit.summary.isBudgetCompliant, false);
      assert.ok(audit.budgetViolations.some((v) => v.type === 'CHUNK_SIZE_EXCEEDED'));
      assert.strictEqual(audit.duplicates.length, 1);
      assert.ok(audit.suggestions.some((s) => s.message.includes('debugger')));

      const report = optimizer.formatReport();
      assert.ok(report.includes('StreamForge Bundle Optimization Report'));
      assert.ok(report.includes('Asset Distribution:'));
    });

    // 5. ArtifactVerifier Tests
    await test('ArtifactVerifier: SHA checksums, manifest audit, reproducible build check, and provenance cert', async () => {
      const verifier = new ArtifactVerifier({ algorithm: 'sha256' });
      const testBuildDir = path.join(tempDir, 'dist-a');
      fs.mkdirSync(path.join(testBuildDir, 'sub'), { recursive: true });

      fs.writeFileSync(path.join(testBuildDir, 'index.js'), 'export const a = 1;');
      fs.writeFileSync(path.join(testBuildDir, 'sub', 'utils.js'), 'export const util = () => 42;');

      // Checksum map & manifest
      const checksumMap = verifier.generateChecksumMap(testBuildDir);
      assert.strictEqual(checksumMap.size, 2);
      assert.ok(checksumMap.has('index.js'));
      assert.ok(checksumMap.has('sub/utils.js'));

      const manifestStr = verifier.generateManifest(testBuildDir);
      assert.ok(manifestStr.includes('index.js'));
      assert.ok(manifestStr.includes('sub/utils.js'));

      // Verification against manifest
      const verifyResult = verifier.verifyAgainstManifest(testBuildDir, manifestStr);
      assert.strictEqual(verifyResult.valid, true);
      assert.strictEqual(verifyResult.matched, 2);
      assert.strictEqual(verifyResult.corrupted.length, 0);

      // Tamper check
      fs.writeFileSync(path.join(testBuildDir, 'index.js'), 'tampered content');
      const tamperedResult = verifier.verifyAgainstManifest(testBuildDir, manifestStr);
      assert.strictEqual(tamperedResult.valid, false);
      assert.strictEqual(tamperedResult.corrupted.length, 1);

      // Reproducible build verification
      const dir1 = path.join(tempDir, 'build-1');
      const dir2 = path.join(tempDir, 'build-2');
      fs.mkdirSync(dir1, { recursive: true });
      fs.mkdirSync(dir2, { recursive: true });

      fs.writeFileSync(path.join(dir1, 'app.js'), 'console.log("identical");');
      fs.writeFileSync(path.join(dir2, 'app.js'), 'console.log("identical");');

      const reproResult = verifier.verifyReproducibility(dir1, dir2);
      assert.strictEqual(reproResult.isReproducible, true);
      assert.strictEqual(reproResult.summary.identicalCount, 1);

      // Provenance certificate
      const cert = verifier.generateProvenanceCertificate(dir1, { buildId: 'build-001' });
      const parsedCert = JSON.parse(cert);
      assert.strictEqual(parsedCert.buildId, 'build-001');
      assert.strictEqual(parsedCert.artifactCount, 1);
      assert.ok(parsedCert.rootTreeHash);
    });
  } finally {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  return { passed, failed };
}
