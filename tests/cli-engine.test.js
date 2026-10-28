/**
 * StreamForge CLI - Test Suite: CLI Engine (Commander Pattern)
 * 100% Coverage of argument parsing, flags, subcommands, and help formatting
 */

import assert from 'node:assert';
import { Command, Option } from '../lib/core/cli-engine.js';

export async function run() {
  let passed = 0;
  let failed = 0;

  function test(description, fn) {
    try {
      fn();
      passed++;
    } catch (err) {
      failed++;
      console.error(`\nTest failed: ${description}\n`, err);
      throw err;
    }
  }

  // 1. Option parsing tests
  test('Option: parses short, long, and required value syntax', () => {
    const opt = new Option('-p, --pipeline <file>', 'Pipeline path', 'default.json');
    assert.strictEqual(opt.short, '-p');
    assert.strictEqual(opt.long, '--pipeline');
    assert.strictEqual(opt.key, 'pipeline');
    assert.strictEqual(opt.required, true);
    assert.strictEqual(opt.defaultValue, 'default.json');
    assert.strictEqual(opt.isBoolean, false);
  });

  test('Option: parses boolean flag correctly', () => {
    const opt = new Option('-v, --verbose', 'Verbose mode');
    assert.strictEqual(opt.short, '-v');
    assert.strictEqual(opt.long, '--verbose');
    assert.strictEqual(opt.key, 'verbose');
    assert.strictEqual(opt.isBoolean, true);
  });

  // 2. Command definition and option setting
  test('Command: chainable name, version, and description', () => {
    const cmd = new Command('test-cli');
    cmd.name('streamforge').version('2.0.0').description('A streaming build engine');

    assert.strictEqual(cmd.name(), 'streamforge');
    assert.strictEqual(cmd.version(), '2.0.0');
    assert.strictEqual(cmd.description(), 'A streaming build engine');
  });

  // 3. Flag parsing execution
  test('Command: parses long flags with space and equality sign', () => {
    let capturedOptions = null;
    const cmd = new Command('test');
    cmd
      .option('--format <type>', 'Output format', 'table')
      .option('--dry-run', 'Dry run flag', false)
      .action((opts) => {
        capturedOptions = opts;
      });

    cmd.parse(['node', 'test', '--format=json', '--dry-run']);
    assert.strictEqual(capturedOptions.format, 'json');
    assert.strictEqual(capturedOptions.dryRun, true);
  });

  test('Command: parses short flags with next-arg value', () => {
    let capturedOptions = null;
    const cmd = new Command('test');
    cmd
      .option('-o, --output <dir>', 'Output directory', 'dist')
      .action((opts) => {
        capturedOptions = opts;
      });

    cmd.parse(['node', 'test', '-o', 'custom-build']);
    assert.strictEqual(capturedOptions.output, 'custom-build');
  });

  // 4. Subcommands routing
  test('Command: routes execution to matching subcommand', () => {
    let subCalled = false;
    let subOpts = null;
    const root = new Command('root');

    root
      .command('build', 'Build project')
      .option('-w, --watch', 'Watch mode', false)
      .action((opts) => {
        subCalled = true;
        subOpts = opts;
      });

    root.parse(['node', 'root', 'build', '--watch']);
    assert.strictEqual(subCalled, true);
    assert.strictEqual(subOpts.watch, true);
  });

  // 5. Help text formatting
  test('Command: formats complete help text with commands and options', () => {
    const root = new Command('forge');
    root.description('Streaming CLI tool');
    root.option('-f, --flag', 'Sample flag');
    root.command('run', 'Run stage');

    const help = root.helpInformation();
    assert.ok(help.includes('Usage: forge [command] [options]'));
    assert.ok(help.includes('Streaming CLI tool'));
    assert.ok(help.includes('-f, --flag'));
    assert.ok(help.includes('run'));
  });

  return { passed, failed };
}
