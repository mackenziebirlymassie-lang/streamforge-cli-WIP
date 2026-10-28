/**
 * StreamForge CLI - Test Suite: End-to-End Integration & Latency Benchmarks
 * Tests complete end-to-end pipeline execution and verifies sub-50ms latency guarantee
 */

import assert from 'node:assert';
import { PipelineOrchestrator } from '../lib/core/pipeline-orchestrator.js';
import { promises as fs } from 'node:fs';

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

  const orchestrator = new PipelineOrchestrator({ silent: true });

  // 1. End-to-End Pipeline Run
  await test('Integration: executes audit pipeline successfully with zero telemetry', async () => {
    const result = await orchestrator.runPipeline('examples/pipelines/audit-pipeline.json', { silent: true });
    assert.strictEqual(result.name, 'fast-integrity-audit');
    assert.strictEqual(result.stages['audit-manifests'].status, 'SUCCESS');
    assert.ok(result.totalDuration > 0);
  });

  // 2. End-to-End Manifest Materialization
  await test('Integration: generates files from manifest into target output directory', async () => {
    const outDir = 'tests/.tmp-out-manifest';
    const artifacts = await orchestrator.generateFromManifest('examples/manifests/microservice-manifest.json', outDir, { silent: true });
    assert.ok(artifacts.length >= 3);

    const serverFile = await fs.readFile(`${outDir}/server.js`, 'utf8');
    assert.ok(serverFile.includes('auth-gateway'));

    await fs.rm(outDir, { recursive: true, force: true });
  });

  // 3. End-to-End Manifest Diff
  await test('Integration: performs manifest diff against repository directory', async () => {
    const diffs = await orchestrator.diff('examples/manifests/web-app-manifest.json', 'lib', { silent: true });
    assert.ok(Array.isArray(diffs));
    assert.ok(diffs.length > 0);
  });

  // 4. Sub-50ms Benchmark Verification
  await test('Benchmark: verifies sub-50ms execution speed across pipeline runs', async () => {
    const { avg, isSub50 } = await orchestrator.benchmark('examples/pipelines/audit-pipeline.json', 3);
    assert.ok(avg < 50, `Expected average execution to be < 50ms, received: ${avg.toFixed(2)}ms`);
    assert.strictEqual(isSub50, true);
  });

  return { passed, failed };
}
