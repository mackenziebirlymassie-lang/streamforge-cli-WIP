/**
 * StreamForge CLI - JSON / NDJSON Machine-Readable Reporter
 * Emits sorted structured outputs for CI/CD integrations
 */

import { DeterministicWriter } from './deterministic-writer.js';

export class JSONReporter {
  static format(result, ndjson = false) {
    if (ndjson) {
      const lines = [];
      lines.push(JSON.stringify({ type: 'pipeline:header', name: result.name, totalDurationMs: result.totalDuration }));
      for (const [stage, data] of Object.entries(result.stages)) {
        lines.push(JSON.stringify({ type: 'stage:result', stage, ...data }));
      }
      return lines.join('\n') + '\n';
    }

    return DeterministicWriter.serializeJSON(result);
  }
}
