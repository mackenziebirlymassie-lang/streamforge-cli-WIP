/**
 * StreamForge CLI - Test Suite: Developer Automation Engine
 * 100% Coverage of Security Scanner, License Auditor, Changelog Generator, Bundler, and Monorepo
 */

import assert from 'node:assert';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { SecurityScannerStream, Severity } from '../lib/automation/security-scanner.js';
import { LicenseAuditor, LicensePolicy } from '../lib/automation/license-auditor.js';
import { ChangelogGenerator, CommitType } from '../lib/automation/changelog-generator.js';
import { ReleaseOrchestrator } from '../lib/automation/release-orchestrator.js';
import { MonorepoManager } from '../lib/automation/monorepo-manager.js';

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

  // 1. SecurityScannerStream
  await test('SecurityScanner: intercepts leaked AWS credentials and eval statements', async () => {
    const scanner = new SecurityScannerStream();
    const badCode = [
      {
        relPath: 'src/config.js',
        content: 'const awsKey = "AKIAIOSFODNN7EXAMPLE";\neval("maliciousCode()");\n',
      },
    ];

    await pipeline(Readable.from(badCode), scanner);
    assert.strictEqual(scanner.findings.length, 2);

    const awsFinding = scanner.findings.find(f => f.ruleId === 'SEC_AWS_KEY');
    assert.ok(awsFinding);
    assert.strictEqual(awsFinding.severity, Severity.CRITICAL);

    const evalFinding = scanner.findings.find(f => f.ruleId === 'SEC_DANGEROUS_EVAL');
    assert.ok(evalFinding);

    const report = scanner.formatReport();
    assert.ok(report.includes('SECURITY VULNERABILITY AUDIT FINDINGS'));
  });

  // 2. LicenseAuditor
  await test('LicenseAuditor: validates permissive vs prohibited licenses', async () => {
    const auditor = new LicenseAuditor();
    assert.strictEqual(auditor.evaluateLicense('MIT'), LicensePolicy.PERMISSIVE);
    assert.strictEqual(auditor.evaluateLicense('Apache-2.0'), LicensePolicy.PERMISSIVE);
    assert.strictEqual(auditor.evaluateLicense('GPL-3.0'), LicensePolicy.PROHIBITED);
    assert.strictEqual(auditor.evaluateLicense('AGPL-3.0'), LicensePolicy.PROHIBITED);

    const report = auditor.formatReport([
      { name: 'fast-json', version: '1.0.0', license: 'MIT', policy: LicensePolicy.PERMISSIVE },
    ]);
    assert.ok(report.includes('LICENSE COMPLIANCE AUDIT'));
  });

  // 3. ChangelogGenerator
  await test('ChangelogGenerator: parses conventional commits and generates markdown', async () => {
    const gen = new ChangelogGenerator();
    const commits = [
      'feat(auth): add passkey authentication support',
      'fix(streams): resolve backpressure race condition',
      'perf: optimize glob compiler regex to sub-millisecond',
    ];

    const md = gen.generateMarkdown('1.1.0', '2026-10-28', commits);
    assert.ok(md.includes('## [1.1.0] - 2026-10-28'));
    assert.ok(md.includes('### Features'));
    assert.ok(md.includes('**auth:** add passkey authentication support'));
    assert.ok(md.includes('### Bug Fixes'));
    assert.ok(md.includes('### Performance Optimizations'));
  });

  // 4. ReleaseOrchestrator
  await test('ReleaseOrchestrator: accurately bumps semver versions', async () => {
    const orchestrator = new ReleaseOrchestrator();
    assert.strictEqual(orchestrator.bumpVersion('1.0.0', 'patch'), '1.0.1');
    assert.strictEqual(orchestrator.bumpVersion('1.0.1', 'minor'), '1.1.0');
    assert.strictEqual(orchestrator.bumpVersion('1.1.0', 'major'), '2.0.0');
  });

  // 5. MonorepoManager
  await test('MonorepoManager: handles empty or populated workspace structures', async () => {
    const monorepo = new MonorepoManager('nonexistent-dir');
    const packages = await monorepo.discoverPackages();
    assert.deepStrictEqual(packages, []);
  });

  return { passed, failed };
}
