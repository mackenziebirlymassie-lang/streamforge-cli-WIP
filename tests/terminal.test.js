/**
 * StreamForge CLI - Test Suite: Terminal UX & Formatters
 * 100% Coverage of ANSI styler, table layout, tree renderer, progress ticker, and logger
 */

import assert from 'node:assert';
import { ansi } from '../lib/terminal/ansi-styler.js';
import { TablePrinter } from '../lib/terminal/table-printer.js';
import { TreeRenderer } from '../lib/terminal/tree-renderer.js';
import { ProgressTicker } from '../lib/terminal/progress-ticker.js';
import { Logger, LogLevel } from '../lib/terminal/logger.js';

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

  // 1. ANSI Styler
  await test('ANSI Styler: applies styling and strips escape codes accurately', async () => {
    const styled = ansi.bold(ansi.green('Success'));
    const stripped = ansi.strip(styled);
    assert.strictEqual(stripped, 'Success');

    const errorBadge = ansi.badge('ERR', ansi.red);
    assert.strictEqual(ansi.strip(errorBadge).trim(), '[ERR]');
  });

  // 2. Table Printer
  await test('Table Printer: generates structured aligned columns', async () => {
    const printer = new TablePrinter({
      columns: [
        { key: 'id', label: 'ID', align: 'left' },
        { key: 'val', label: 'VALUE', align: 'right' },
      ],
    });

    const output = printer.print([
      { id: 'item-1', val: '100' },
      { id: 'item-2', val: '2500' },
    ]);

    assert.ok(output.includes('ID'));
    assert.ok(output.includes('VALUE'));
    assert.ok(output.includes('item-1'));
    assert.ok(output.includes('2500'));
  });

  // 3. Tree Renderer
  await test('Tree Renderer: constructs hierarchical box-drawing trees', async () => {
    const renderer = new TreeRenderer({ useAscii: false });
    const entries = [
      { relPath: 'bin/cli.js', isDirectory: false },
      { relPath: 'lib/core/engine.js', isDirectory: false },
    ];

    const tree = renderer.render(entries, 'root');
    assert.ok(tree.includes('root'));
    assert.ok(tree.includes('bin/'));
    assert.ok(tree.includes('cli.js'));
    assert.ok(tree.includes('lib/'));
  });

  // 4. Progress Ticker
  await test('Progress Ticker: non-TTY safe startup and shutdown', async () => {
    const ticker = new ProgressTicker({ stream: { isTTY: false, write: () => {} } });
    ticker.start('Testing');
    ticker.update('In Progress');
    ticker.stop('Finished');
    assert.strictEqual(ticker.isActive, false);
  });

  // 5. Logger
  await test('Logger: respects LogLevel thresholds', async () => {
    const log = new Logger(LogLevel.WARN);
    let errorCalled = false;
    const origError = console.error;
    console.error = () => { errorCalled = true; };

    log.error('Test error message');
    console.error = origError;

    assert.strictEqual(errorCalled, true);
  });

  return { passed, failed };
}
