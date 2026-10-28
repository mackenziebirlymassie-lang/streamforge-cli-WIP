/**
 * StreamForge CLI - Native Git Workflow & Conventional Hook Engine
 * Enforces branch naming standards, commit message conventions, and hook orchestration without external bloat
 */

import { ansi } from '../terminal/ansi-styler.js';

export const BranchType = Object.freeze({
  FEATURE: 'feat',
  BUGFIX: 'fix',
  HOTFIX: 'hotfix',
  RELEASE: 'release',
  CHORE: 'chore',
  REFACTOR: 'refactor',
});

export class GitWorkflowEngine {
  constructor(options = {}) {
    this.allowedTypes = options.allowedTypes || Object.values(BranchType);
    this.maxCommitSubjectLen = options.maxCommitSubjectLen || 72;
  }

  /**
   * Validates git branch name format: type/short-description (e.g. feat/stream-transform)
   */
  validateBranchName(branchName) {
    if (!branchName) return { valid: false, reason: 'Branch name is empty' };
    const clean = branchName.replace(/^refs\/heads\//, '').trim();

    // Exempt main / master / develop
    if (clean === 'main' || clean === 'master' || clean === 'develop') {
      return { valid: true, branch: clean };
    }

    const regex = new RegExp(`^(${this.allowedTypes.join('|')})\\/[a-z0-9_-]+$`);
    if (!regex.test(clean)) {
      return {
        valid: false,
        branch: clean,
        reason: `Branch "${clean}" does not match pattern: <type>/<description> (Allowed types: ${this.allowedTypes.join(', ')})`,
      };
    }

    return { valid: true, branch: clean };
  }

  /**
   * Validates Conventional Commit message: type(scope)!: subject
   */
  validateCommitMessage(message) {
    const trimmed = (message || '').trim();
    if (!trimmed) {
      return { valid: false, reason: 'Commit message is empty' };
    }

    const firstLine = trimmed.split('\n')[0];
    const regex = /^([a-z]+)(?:\(([a-zA-Z0-9_-]+)\))?(!)?:\s*(.+)$/;
    const match = firstLine.match(regex);

    if (!match) {
      return {
        valid: false,
        reason: `Commit message header does not follow Conventional Commits pattern: "type(scope): subject"`,
      };
    }

    const [, type, , , subject] = match;
    const allowedTypes = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'];

    if (!allowedTypes.includes(type)) {
      return {
        valid: false,
        reason: `Invalid commit type "${type}". Allowed types: ${allowedTypes.join(', ')}`,
      };
    }

    if (subject.length > this.maxCommitSubjectLen) {
      return {
        valid: false,
        reason: `Commit subject exceeds maximum length of ${this.maxCommitSubjectLen} characters (found ${subject.length})`,
      };
    }

    return { valid: true, header: firstLine };
  }

  /**
   * Generate lightweight zero-dependency bash git hook scripts
   */
  generateHook(hookName) {
    if (hookName === 'commit-msg') {
      return [
        `#!/bin/sh`,
        `# StreamForge Automated Commit-Msg Hook`,
        `node -e "`,
        `  import('streamforge-cli/lib/automation/git-workflow-engine.js').then(({ GitWorkflowEngine }) => {`,
        `    const fs = require('fs');`,
        `    const msg = fs.readFileSync(process.argv[2], 'utf8');`,
        `    const engine = new GitWorkflowEngine();`,
        `    const res = engine.validateCommitMessage(msg);`,
        `    if (!res.valid) { console.error('\\x1b[31m[StreamForge Hook Error]\\x1b[0m ' + res.reason); process.exit(1); }`,
        `  });`,
        `" "$1"\n`,
      ].join('\n');
    }

    if (hookName === 'pre-push') {
      return [
        `#!/bin/sh`,
        `# StreamForge Pre-Push Test Validation Hook`,
        `echo "[StreamForge] Running automated fast validation suite..."`,
        `node tests/runner.js || exit 1\n`,
      ].join('\n');
    }

    return `#!/bin/sh\nexit 0\n`;
  }
}
