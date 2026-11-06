/**
 * StreamForge CLI - DAG Pipeline Dependency Executor
 * Resolves topological order, governs concurrency, and streams multi-stage executions
 */

import { PipelineSyntaxError } from '../core/error-handler.js';
import { GlobalStepRegistry } from './step-registry.js';
import { pipeline } from 'node:stream/promises';
import { PrecisionTimer } from '../utils/timer.js';
import { StageStatus } from '../core/types.js';

export class DAGExecutor {
  constructor(pipelineDef, options = {}) {
    this.pipelineDef = pipelineDef;
    this.options = options;
    this.stepRegistry = options.stepRegistry || GlobalStepRegistry;
    this.stageResults = new Map();
  }

  /**
   * Compute topological sort of pipeline stages based on dependsOn
   */
  getExecutionOrder() {
    const stages = new Map(this.pipelineDef.stages.map(s => [s.name, s]));
    const visited = new Set();
    const visiting = new Set();
    const order = [];

    function visit(stageName) {
      if (visiting.has(stageName)) {
        throw new PipelineSyntaxError(`Circular dependency detected in pipeline stage "${stageName}"`);
      }
      if (!visited.has(stageName)) {
        visiting.add(stageName);
        const stage = stages.get(stageName);
        if (!stage) {
          throw new PipelineSyntaxError(`Stage depends on undefined stage: "${stageName}"`);
        }

        for (const dep of stage.dependsOn || []) {
          visit(dep);
        }

        visiting.delete(stageName);
        visited.add(stageName);
        order.push(stage);
      }
    }

    for (const stage of this.pipelineDef.stages) {
      if (!visited.has(stage.name)) {
        visit(stage.name);
      }
    }

    return order;
  }

  /**
   * Partition stages into topological concurrency waves (levels)
   * Stages in the same wave have no interdependencies and can run concurrently
   */
  getExecutionWaves() {
    // Validates dependencies & cycles via getExecutionOrder
    this.getExecutionOrder();

    const stages = new Map(this.pipelineDef.stages.map(s => [s.name, s]));
    const inDegrees = new Map();
    const dependents = new Map();

    for (const stage of this.pipelineDef.stages) {
      const deps = stage.dependsOn || [];
      inDegrees.set(stage.name, deps.length);
      for (const dep of deps) {
        if (!dependents.has(dep)) {
          dependents.set(dep, []);
        }
        dependents.get(dep).push(stage.name);
      }
    }

    const waves = [];
    let currentWave = this.pipelineDef.stages.filter(s => (inDegrees.get(s.name) || 0) === 0);

    while (currentWave.length > 0) {
      waves.push(currentWave);
      const nextWave = [];

      for (const stage of currentWave) {
        const dependentNames = dependents.get(stage.name) || [];
        for (const depName of dependentNames) {
          const newDeg = (inDegrees.get(depName) || 1) - 1;
          inDegrees.set(depName, newDeg);
          if (newDeg === 0) {
            nextWave.push(stages.get(depName));
          }
        }
      }

      currentWave = nextWave;
    }

    return waves;
  }

  /**
   * Execute a single pipeline stage stream chain
   */
  async _executeStage(stage, onStageEvent = null) {
    const stageTimer = new PrecisionTimer(stage.name);
    if (onStageEvent) {
      onStageEvent({ type: 'stage:start', stage: stage.name });
    }

    // Build stream chain
    const streamInstances = stage.steps.map(stepDef => {
      return this.stepRegistry.createStep(stepDef.type, {
        ...stepDef.config,
        dryRun: this.options.dryRun ?? false,
      });
    });

    try {
      if (streamInstances.length === 1) {
        // If only 1 readable or transform stream, consume it to end
        const s = streamInstances[0];
        await new Promise((res, rej) => {
          s.on('data', () => {});
          s.on('end', res);
          s.on('error', rej);
          if (typeof s.resume === 'function') s.resume();
        });
      } else if (streamInstances.length > 1) {
        // Pipeline all streams together
        await pipeline(...streamInstances);
      }

      const durationMs = stageTimer.stop();
      this.stageResults.set(stage.name, {
        status: StageStatus.SUCCESS,
        durationMs,
      });

      if (onStageEvent) {
        onStageEvent({ type: 'stage:end', stage: stage.name, status: StageStatus.SUCCESS, durationMs });
      }
    } catch (err) {
      const durationMs = stageTimer.stop();
      this.stageResults.set(stage.name, {
        status: StageStatus.FAILED,
        durationMs,
        error: err.message,
      });

      if (onStageEvent) {
        onStageEvent({ type: 'stage:end', stage: stage.name, status: StageStatus.FAILED, error: err.message });
      }

      if (this.options.bail !== false) {
        throw err;
      }
    }
  }

  /**
   * Execute the resolved pipeline stages sequentially or in parallel batches
   */
  async execute(onStageEvent = null) {
    const overallTimer = new PrecisionTimer('pipeline-total');

    if (this.options.parallel === false) {
      const stages = this.getExecutionOrder();
      for (const stage of stages) {
        await this._executeStage(stage, onStageEvent);
      }
    } else {
      const waves = this.getExecutionWaves();
      for (const wave of waves) {
        await Promise.all(wave.map(stage => this._executeStage(stage, onStageEvent)));
      }
    }

    const totalDuration = overallTimer.stop();
    return {
      name: this.pipelineDef.name,
      totalDuration,
      stages: Object.fromEntries(this.stageResults),
    };
  }
}
