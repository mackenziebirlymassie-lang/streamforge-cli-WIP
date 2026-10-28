/**
 * StreamForge CLI - Test Suite: Edge Cases, Error Isolation & Backpressure
 * Tests boundary conditions, empty inputs, abort signals, and stream backpressure
 */

import assert from 'node:assert';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { BaseAsyncTransform } from '../lib/streams/transform-base.js';
import { ManifestSchemaValidator } from '../lib/manifest/manifest-schema.js';
import { ManifestValidationError, PipelineSyntaxError } from '../lib/core/error-handler.js';
import { PipelineScriptParser } from '../lib/pipeline/script-parser.js';

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

  // 1. Empty or malformed manifest handling
  await test('Edge Case: throws on null or primitive manifest', async () => {
    assert.throws(() => {
      ManifestSchemaValidator.validate(null);
    }, ManifestValidationError);

    assert.throws(() => {
      ManifestSchemaValidator.validate('string');
    }, ManifestValidationError);
  });

  // 2. Empty pipeline stages
  await test('Edge Case: throws PipelineSyntaxError on empty pipeline stages', async () => {
    assert.throws(() => {
      PipelineScriptParser.parseDefinition({ name: 'empty', stages: [] });
    }, PipelineSyntaxError);
  });

  // 3. Abort Signal propagation
  await test('Edge Case: abort signal cleanly terminates streaming pipeline', async () => {
    const ac = new AbortController();
    const stream = new BaseAsyncTransform('abort-test', { signal: ac.signal });

    let errorCaught = false;
    const readable = new Readable({
      objectMode: true,
      read() {
        this.push('chunk-1');
        ac.abort(); // Abort immediately
      },
    });

    try {
      await pipeline(readable, stream);
    } catch {
      errorCaught = true;
    }

    assert.strictEqual(errorCaught, true);
  });

  // 4. Backpressure Stress Test (1,000 stream items)
  await test('Edge Case: handles high-volume 1,000 item backpressure stream cleanly', async () => {
    class SlowSink extends BaseAsyncTransform {
      constructor() {
        super('slow-sink', { highWaterMark: 16 });
      }
      async processChunk(item) {
        return item * 3;
      }
    }

    const items = Array.from({ length: 1000 }, (_, i) => i);
    const sink = new SlowSink();
    const collected = [];
    sink.on('data', item => collected.push(item));

    await pipeline(Readable.from(items), sink);
    assert.strictEqual(collected.length, 1000);
    assert.strictEqual(collected[999], 999 * 3);
  });

  return { passed, failed };
}
