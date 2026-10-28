/**
 * StreamForge CLI - Comprehensive Summary Audit Reporter
 * Generates deterministic terminal summaries, stage breakdowns, and performance benchmarks
 */

import { TablePrinter } from '../terminal/table-printer.js';
import { ansi } from '../terminal/ansi-styler.js';

export class SummaryReporter {
  static printPipelineSummary(executionResult) {
    console.log('\n' + ansi.bold(ansi.cyan(`═══ PIPELINE AUDIT REPORT: ${executionResult.name} ═══`)));

    const printer = new TablePrinter({
      columns: [
        { key: 'stage', label: 'STAGE NAME', align: 'left', width: 20 },
        { key: 'status', label: 'STATUS', align: 'left', width: 10 },
        { key: 'duration', label: 'DURATION', align: 'right', width: 12 },
      ],
    });

    const rows = Object.entries(executionResult.stages).map(([name, data]) => {
      const isOk = data.status === 'SUCCESS';
      return {
        stage: ansi.white(name),
        status: isOk ? ansi.green('✔ SUCCESS') : ansi.red('✖ FAILED'),
        duration: ansi.dim(`${data.durationMs.toFixed(2)} ms`),
      };
    });

    console.log(printer.print(rows));
    console.log(ansi.gray('─'.repeat(48)));
    console.log(
      `${ansi.bold('Total Execution Time:')} ${ansi.green(executionResult.totalDuration.toFixed(2) + ' ms')}  ` +
      `(${ansi.dim('Zero external telemetry · Offline-first')})\n`
    );
  }
}
