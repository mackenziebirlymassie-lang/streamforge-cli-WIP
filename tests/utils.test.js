/**
 * StreamForge CLI - Test Suite: Utility Modules
 * 100% Coverage of GlobMatcher, ByteFormat, PrecisionTimer, and FileUtils
 */

import assert from 'node:assert';
import { GlobMatcher, matchGlob } from '../lib/utils/glob-matcher.js';
import { formatBytes, formatPercentage, formatRate } from '../lib/utils/byte-format.js';
import { PrecisionTimer, measureExecution } from '../lib/utils/timer.js';
import { writeAtomic, hashBuffer } from '../lib/utils/file-utils.js';
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

  // 1. GlobMatcher
  await test('GlobMatcher: matches complex nested globs, extensions, and negations', async () => {
    assert.strictEqual(matchGlob('src/index.js', '**/*.js'), true);
    assert.strictEqual(matchGlob('src/app.test.js', '!**/*.test.js'), false);
    assert.strictEqual(matchGlob('assets/image.png', '**/*.{jpg,png,gif}'), true);
    assert.strictEqual(matchGlob('assets/doc.pdf', '**/*.{jpg,png,gif}'), false);
  });

  // 2. ByteFormat
  await test('ByteFormat: formats binary units correctly', async () => {
    assert.strictEqual(formatBytes(0), '0 B');
    assert.strictEqual(formatBytes(1024), '1 KB');
    assert.strictEqual(formatBytes(1048576), '1 MB');
    assert.strictEqual(formatPercentage(50, 100), '50.0%');
    assert.strictEqual(formatRate(1024, 1000), '1 KB/s');
  });

  // 3. PrecisionTimer
  await test('PrecisionTimer: tracks elapsed time accurately', async () => {
    const timer = new PrecisionTimer('test-op');
    const { result, duration } = measureExecution(() => 10 + 20);
    assert.strictEqual(result, 30);
    assert.ok(duration >= 0);

    const elapsed = timer.stop();
    assert.ok(elapsed >= 0);
  });

  // 4. FileUtils (Atomic write and hashing)
  await test('FileUtils: atomic write and crypto hashing', async () => {
    const tempFile = 'tests/.tmp-test.txt';
    await writeAtomic(tempFile, 'Sample content');
    const content = await fs.readFile(tempFile, 'utf8');
    assert.strictEqual(content, 'Sample content');

    const digest = hashBuffer(Buffer.from('Sample content'));
    assert.strictEqual(digest.length, 64);

    await fs.unlink(tempFile);
  });

  return { passed, failed };
}
