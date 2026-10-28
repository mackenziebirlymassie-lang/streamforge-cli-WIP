/**
 * StreamForge CLI - High-Precision Benchmarking Timer
 * Sub-millisecond timing utilities for latency and throughput profiling
 */

export class PrecisionTimer {
  constructor(label = 'operation') {
    this.label = label;
    this.startTime = performance.now();
    this.endTime = null;
    this.laps = [];
  }

  start() {
    this.startTime = performance.now();
    this.endTime = null;
    this.laps = [];
    return this.startTime;
  }

  lap(name = '') {
    const now = performance.now();
    const lapDuration = now - (this.laps.length > 0 ? this.laps[this.laps.length - 1].timestamp : this.startTime);
    this.laps.push({ name, duration: lapDuration, timestamp: now });
    return lapDuration;
  }

  stop() {
    this.endTime = performance.now();
    return this.elapsedMs();
  }

  elapsedMs() {
    const end = this.endTime ?? performance.now();
    return Math.max(0, end - this.startTime);
  }

  elapsedFormatted() {
    const ms = this.elapsedMs();
    if (ms < 1) {
      return `${(ms * 1000).toFixed(0)}µs`;
    }
    if (ms < 1000) {
      return `${ms.toFixed(2)}ms`;
    }
    return `${(ms / 1000).toFixed(2)}s`;
  }
}

export function measureExecution(fn) {
  const start = performance.now();
  const result = fn();
  const duration = performance.now() - start;
  return { result, duration };
}

export async function measureAsyncExecution(asyncFn) {
  const start = performance.now();
  const result = await asyncFn();
  const duration = performance.now() - start;
  return { result, duration };
}
