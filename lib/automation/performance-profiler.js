/**
 * @fileoverview Performance Profiler for StreamForge Async Pipelines.
 * Measures backpressure drain latency, stream throughput, event loop lag,
 * and memory heap utilization with microsecond resolution.
 */

import { performance } from 'node:perf_hooks';
import { PrecisionTimer } from '../utils/timer.js';
import { formatBytes, formatRate } from '../utils/byte-format.js';

export class PerformanceProfiler {
  /**
   * @param {Object} [options]
   * @param {number} [options.sampleIntervalMs=10] - Sampling interval for event loop lag
   * @param {number} [options.latencyBudgetMs=50] - Maximum allowed latency budget
   */
  constructor(options = {}) {
    this.sampleIntervalMs = options.sampleIntervalMs || 10;
    this.latencyBudgetMs = options.latencyBudgetMs || 50;
    this.timer = new PrecisionTimer();
    this.samples = [];
    this.drainEvents = [];
    this.stageTimings = new Map();
    this.initialMemory = process.memoryUsage();
    this.peakMemory = { ...this.initialMemory };
    this.isRunning = false;
    this._intervalHandle = null;
  }

  /**
   * Starts performance profiling and event loop monitoring.
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.timer.start();
    this.initialMemory = process.memoryUsage();
    this.peakMemory = { ...this.initialMemory };
    this.samples = [];
    this.drainEvents = [];

    let lastCheck = performance.now();
    this._intervalHandle = setInterval(() => {
      const now = performance.now();
      const delta = now - lastCheck;
      const lag = Math.max(0, delta - this.sampleIntervalMs);
      lastCheck = now;

      const mem = process.memoryUsage();
      if (mem.heapUsed > this.peakMemory.heapUsed) {
        this.peakMemory = { ...mem };
      }

      this.samples.push({
        timestamp: now,
        lagMs: lag,
        heapUsedBytes: mem.heapUsed,
        externalBytes: mem.external
      });
    }, this.sampleIntervalMs);

    if (this._intervalHandle.unref) {
      this._intervalHandle.unref();
    }
  }

  /**
   * Stops performance profiling and calculates summary metrics.
   * @returns {Object} Profiler metrics summary
   */
  stop() {
    if (!this.isRunning) {
      return this.generateReport();
    }

    if (this._intervalHandle) {
      clearInterval(this._intervalHandle);
      this._intervalHandle = null;
    }

    this.timer.stop();
    this.isRunning = false;
    return this.generateReport();
  }

  /**
   * Records a pipeline stage execution duration.
   * @param {string} stageName - Stage identifier
   * @param {number} durationMs - Duration in milliseconds
   * @param {number} [itemCount=0] - Number of items processed
   * @param {number} [byteCount=0] - Number of bytes processed
   */
  recordStage(stageName, durationMs, itemCount = 0, byteCount = 0) {
    this.stageTimings.set(stageName, {
      durationMs,
      itemCount,
      byteCount,
      throughputItemsPerSec: durationMs > 0 ? (itemCount / durationMs) * 1000 : 0,
      throughputBytesPerSec: durationMs > 0 ? (byteCount / durationMs) * 1000 : 0
    });
  }

  /**
   * Records a backpressure drain event in a stream transform.
   * @param {string} streamName - Name of the stream experiencing backpressure
   * @param {number} pauseDurationMs - Time paused until drain event fired
   */
  recordDrain(streamName, pauseDurationMs) {
    this.drainEvents.push({
      streamName,
      pauseDurationMs,
      timestamp: performance.now()
    });
  }

  /**
   * Measures the execution time of an async function.
   * @template T
   * @param {string} label - Benchmark label
   * @param {() => Promise<T>} fn - Async function to measure
   * @returns {Promise<{ result: T, durationMs: number }>}
   */
  async measureAsync(label, fn) {
    const start = performance.now();
    const result = await fn();
    const durationMs = performance.now() - start;
    this.recordStage(label, durationMs);
    return { result, durationMs };
  }

  /**
   * Generates a deterministic performance metrics report.
   * @returns {Object} Detailed performance analysis
   */
  generateReport() {
    const elapsedMs = this.timer.elapsedMs();
    const finalMemory = process.memoryUsage();

    // Event loop lag stats
    let totalLag = 0;
    let maxLag = 0;
    for (const sample of this.samples) {
      totalLag += sample.lagMs;
      if (sample.lagMs > maxLag) maxLag = sample.lagMs;
    }
    const avgLag = this.samples.length > 0 ? totalLag / this.samples.length : 0;

    // Drain latency stats
    let totalDrainLatency = 0;
    let maxDrainLatency = 0;
    for (const drain of this.drainEvents) {
      totalDrainLatency += drain.pauseDurationMs;
      if (drain.pauseDurationMs > maxDrainLatency) {
        maxDrainLatency = drain.pauseDurationMs;
      }
    }
    const avgDrainLatency = this.drainEvents.length > 0
      ? totalDrainLatency / this.drainEvents.length
      : 0;

    // Memory deltas
    const heapDelta = finalMemory.heapUsed - this.initialMemory.heapUsed;
    const peakHeapUsed = this.peakMemory.heapUsed;

    const stages = {};
    let totalStageDuration = 0;
    for (const [name, stats] of this.stageTimings.entries()) {
      stages[name] = {
        ...stats,
        formattedBytes: formatBytes(stats.byteCount),
        formattedRate: formatRate(stats.throughputBytesPerSec)
      };
      totalStageDuration += stats.durationMs;
    }

    const budgetPassed = elapsedMs <= this.latencyBudgetMs;

    return {
      execution: {
        elapsedMs: Number(elapsedMs.toFixed(3)),
        latencyBudgetMs: this.latencyBudgetMs,
        budgetPassed,
        sampleCount: this.samples.length
      },
      eventLoop: {
        avgLagMs: Number(avgLag.toFixed(3)),
        maxLagMs: Number(maxLag.toFixed(3))
      },
      backpressure: {
        drainEventCount: this.drainEvents.length,
        avgDrainMs: Number(avgDrainLatency.toFixed(3)),
        maxDrainMs: Number(maxDrainLatency.toFixed(3))
      },
      memory: {
        initialHeapBytes: this.initialMemory.heapUsed,
        finalHeapBytes: finalMemory.heapUsed,
        peakHeapBytes: peakHeapUsed,
        heapDeltaBytes: heapDelta,
        formattedInitial: formatBytes(this.initialMemory.heapUsed),
        formattedPeak: formatBytes(peakHeapUsed),
        formattedDelta: (heapDelta >= 0 ? '+' : '-') + formatBytes(Math.abs(heapDelta))
      },
      stages
    };
  }

  /**
   * Formats the performance report as a terminal table string.
   * @returns {string} Formatted performance report
   */
  formatSummary() {
    const report = this.generateReport();
    const lines = [
      '⚡ StreamForge Execution Profiler Report',
      '────────────────────────────────────────────────────────────',
      `  Total Duration:     ${report.execution.elapsedMs.toFixed(2)} ms (Budget: ${report.execution.latencyBudgetMs} ms) [${report.execution.budgetPassed ? 'PASSED' : 'EXCEEDED'}]`,
      `  Event Loop Lag:     avg: ${report.eventLoop.avgLagMs.toFixed(2)} ms | max: ${report.eventLoop.maxLagMs.toFixed(2)} ms`,
      `  Backpressure Pauses: count: ${report.backpressure.drainEventCount} | avg: ${report.backpressure.avgDrainMs.toFixed(2)} ms`,
      `  Memory Footprint:   peak: ${report.memory.formattedPeak} | delta: ${report.memory.formattedDelta}`,
      '────────────────────────────────────────────────────────────'
    ];

    if (Object.keys(report.stages).length > 0) {
      lines.push('  Stage Breakdown:');
      for (const [name, s] of Object.entries(report.stages)) {
        lines.push(`    • ${name.padEnd(20)}: ${s.durationMs.toFixed(2).padStart(8)} ms | ${s.itemCount.toString().padStart(5)} items | ${s.formattedRate}`);
      }
      lines.push('────────────────────────────────────────────────────────────');
    }

    return lines.join('\n');
  }
}
