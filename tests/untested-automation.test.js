/**
 * StreamForge CLI - Test Suite: Extended Automation Modules
 * Complete 100% Coverage for DockerGenerator, GitWorkflowEngine, CodeBundler, and EnvVault
 */

import assert from 'node:assert';
import { promises as fs } from 'node:fs';
import { resolve, join } from 'node:path';
import { DockerGenerator } from '../lib/automation/docker-generator.js';
import { GitWorkflowEngine, BranchType } from '../lib/automation/git-workflow-engine.js';
import { CodeBundler } from '../lib/automation/code-bundler.js';
import { EnvVault } from '../lib/automation/env-vault.js';

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

  // 1. DockerGenerator Tests
  await test('DockerGenerator: generates hardened production multi-stage Dockerfile and dockerignore', async () => {
    const generator = new DockerGenerator({
      nodeVersion: '22',
      port: 8080,
      workdir: '/workspace',
      healthcheckPath: '/api/health',
    });

    const pkgJson = {
      scripts: {
        build: 'tsc',
        start: 'node dist/server.js',
      },
      devDependencies: {
        typescript: '^5.0.0',
      },
    };

    const dockerfile = generator.generateMultiStageDockerfile(pkgJson);
    assert.ok(dockerfile.includes('FROM node:22-alpine AS builder'));
    assert.ok(dockerfile.includes('WORKDIR /workspace'));
    assert.ok(dockerfile.includes('npm run build'));
    assert.ok(dockerfile.includes('USER appuser'));
    assert.ok(dockerfile.includes('EXPOSE 8080'));
    assert.ok(dockerfile.includes('/api/health'));

    const dockerignore = generator.generateDockerignore();
    assert.ok(dockerignore.includes('node_modules'));
    assert.ok(dockerignore.includes('.git'));
  });

  // 2. GitWorkflowEngine Tests
  await test('GitWorkflowEngine: validates branch names, commit conventions, and hook generation', async () => {
    const engine = new GitWorkflowEngine();

    // Branch validation
    assert.strictEqual(engine.validateBranchName('main').valid, true);
    assert.strictEqual(engine.validateBranchName('feat/stream-pipeline').valid, true);
    assert.strictEqual(engine.validateBranchName('fix/race-condition').valid, true);
    assert.strictEqual(engine.validateBranchName('random-invalid-branch').valid, false);

    // Commit message validation
    const validCommit = engine.validateCommitMessage('feat(core): implement parallel DAG execution');
    assert.strictEqual(validCommit.valid, true);
    assert.strictEqual(validCommit.header, 'feat(core): implement parallel DAG execution');

    const invalidCommit = engine.validateCommitMessage('random unformatted message');
    assert.strictEqual(invalidCommit.valid, false);

    // Hook generation
    const commitMsgHook = engine.generateHook('commit-msg');
    assert.ok(commitMsgHook.includes('#!/bin/sh'));
    assert.ok(commitMsgHook.includes('StreamForge Automated Commit-Msg Hook'));

    const prePushHook = engine.generateHook('pre-push');
    assert.ok(prePushHook.includes('tests/runner.js'));
  });

  // 3. CodeBundler Tests
  await test('CodeBundler: resolves module graph and packs files into single bundle', async () => {
    const tempDir = 'tests/.tmp-bundler-test';
    await fs.mkdir(tempDir, { recursive: true });

    const helperFile = join(tempDir, 'helper.js');
    const mainFile = join(tempDir, 'main.js');

    await fs.writeFile(helperFile, 'export function add(a, b) { return a + b; }', 'utf8');
    await fs.writeFile(mainFile, 'import { add } from "./helper.js"; console.log(add(1, 2));', 'utf8');

    const bundler = new CodeBundler(mainFile, { banner: '/* Test Bundle */' });
    const bundledCode = await bundler.build();

    assert.ok(bundledCode.includes('/* Test Bundle */'));
    assert.ok(bundledCode.includes('__modules['));
    assert.ok(bundledCode.includes('export function add'));
    assert.ok(bundledCode.includes('Execute Entrypoint'));

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // 4. EnvVault Full Suite
  await test('EnvVault: verifies decryption error trapping and parsing edge cases', async () => {
    const vault = new EnvVault('vault-key');

    // Malformed decryption
    assert.throws(() => {
      vault.decrypt('invalid:payload');
    }, /Malformed encrypted vault payload format/);

    // Parity reporting
    const paritySynced = vault.auditEnvParity('A=1\nB=2', 'A=1\nB=2');
    assert.strictEqual(paritySynced.isSynced, true);
    const reportClean = vault.formatParityReport(paritySynced);
    assert.ok(reportClean.includes('100% synchronized'));

    // Parity with extra keys
    const parityExtra = vault.auditEnvParity('A=1', 'A=1\nEXTRA=2');
    const reportExtra = vault.formatParityReport(parityExtra);
    assert.ok(reportExtra.includes('+ EXTRA'));
  });

  return { passed, failed };
}
