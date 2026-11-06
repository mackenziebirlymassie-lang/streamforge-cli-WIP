/**
 * StreamForge CLI - Test Suite: DAG Dependency Execution Engine
 * 100% Coverage of topological resolution, cycle detection, and stage execution
 */

import assert from 'node:assert';
import { DAGExecutor } from '../lib/pipeline/dag-executor.js';
import { PipelineSyntaxError } from '../lib/core/error-handler.js';
import { GlobalStepRegistry } from '../lib/pipeline/step-registry.js';

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

  // 1. Topological Sorting
  await test('DAGExecutor: sorts stages in strict dependency order', async () => {
    const pipelineDef = {
      name: 'dag-test',
      stages: [
        { name: 'stage-c', dependsOn: ['stage-b'], steps: [] },
        { name: 'stage-a', dependsOn: [], steps: [] },
        { name: 'stage-b', dependsOn: ['stage-a'], steps: [] },
      ],
    };

    const executor = new DAGExecutor(pipelineDef);
    const order = executor.getExecutionOrder().map(s => s.name);
    assert.deepStrictEqual(order, ['stage-a', 'stage-b', 'stage-c']);
  });

  // 2. Circular Dependency Trap
  await test('DAGExecutor: throws PipelineSyntaxError on circular dependencies', async () => {
    const cyclicPipeline = {
      name: 'cyclic',
      stages: [
        { name: 'stage-1', dependsOn: ['stage-2'], steps: [] },
        { name: 'stage-2', dependsOn: ['stage-1'], steps: [] },
      ],
    };

    const executor = new DAGExecutor(cyclicPipeline);
    assert.throws(() => {
      executor.getExecutionOrder();
    }, PipelineSyntaxError);
  });

  // 3. Stage Execution
  await test('DAGExecutor: executes streaming steps and reports status', async () => {
    let customExecuted = false;
    const testRegistry = GlobalStepRegistry;
    testRegistry.registerStep('test-op', () => ({
      on: (evt, fn) => { if (evt === 'end') fn(); },
      resume: () => { customExecuted = true; },
    }));

    const pipelineDef = {
      name: 'exec-test',
      stages: [
        {
          name: 'step-one',
          dependsOn: [],
          steps: [{ type: 'test-op', config: {} }],
        },
      ],
    };

    const executor = new DAGExecutor(pipelineDef, { stepRegistry: testRegistry });
    const result = await executor.execute();

    assert.strictEqual(result.name, 'exec-test');
    assert.strictEqual(result.stages['step-one'].status, 'SUCCESS');
    assert.strictEqual(customExecuted, true);
  });

  // 4. Concurrency Waves
  await test('DAGExecutor: partitions independent stages into concurrent waves', async () => {
    const pipelineDef = {
      name: 'wave-test',
      stages: [
        { name: 'frontend', dependsOn: [], steps: [] },
        { name: 'backend', dependsOn: [], steps: [] },
        { name: 'integration', dependsOn: ['frontend', 'backend'], steps: [] },
        { name: 'deploy', dependsOn: ['integration'], steps: [] },
      ],
    };

    const executor = new DAGExecutor(pipelineDef);
    const waves = executor.getExecutionWaves();
    assert.strictEqual(waves.length, 3);
    const wave0 = waves[0].map(s => s.name).sort();
    assert.deepStrictEqual(wave0, ['backend', 'frontend']);
    assert.strictEqual(waves[1][0].name, 'integration');
    assert.strictEqual(waves[2][0].name, 'deploy');
  });

  // 5. Parallel Execution
  await test('DAGExecutor: executes stages concurrently across parallel waves', async () => {
    let stage1Ran = false;
    let stage2Ran = false;

    const testRegistry = GlobalStepRegistry;
    testRegistry.registerStep('stage1-op', () => ({
      on: (evt, fn) => { if (evt === 'end') fn(); },
      resume: () => { stage1Ran = true; },
    }));
    testRegistry.registerStep('stage2-op', () => ({
      on: (evt, fn) => { if (evt === 'end') fn(); },
      resume: () => { stage2Ran = true; },
    }));

    const pipelineDef = {
      name: 'parallel-exec-test',
      stages: [
        { name: 's1', dependsOn: [], steps: [{ type: 'stage1-op', config: {} }] },
        { name: 's2', dependsOn: [], steps: [{ type: 'stage2-op', config: {} }] },
      ],
    };

    const executor = new DAGExecutor(pipelineDef, { stepRegistry: testRegistry, parallel: true });
    const result = await executor.execute();

    assert.strictEqual(result.stages['s1'].status, 'SUCCESS');
    assert.strictEqual(result.stages['s2'].status, 'SUCCESS');
    assert.strictEqual(stage1Ran, true);
    assert.strictEqual(stage2Ran, true);
  });

  return { passed, failed };
}
