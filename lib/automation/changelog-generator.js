/**
 * StreamForge CLI - Conventional Commits Changelog Generator
 * Parses Git commit streams and generates semantic release notes categorized by type
 */

export const CommitType = Object.freeze({
  FEAT: 'Features',
  FIX: 'Bug Fixes',
  PERF: 'Performance Optimizations',
  REFACTOR: 'Code Refactoring',
  DOCS: 'Documentation',
  TEST: 'Testing & Coverage',
  CHORE: 'Maintenance & Tooling',
  OTHER: 'Miscellaneous Changes',
});

export class ChangelogGenerator {
  constructor(options = {}) {
    this.repoUrl = options.repoUrl || '';
  }

  parseCommit(message) {
    const trimmed = message.trim();
    // Conventional commit format: type(scope)!: description
    const match = trimmed.match(/^([a-z]+)(?:\(([a-zA-Z0-9_\-]+)\))?(!)?:\s*(.+)$/);

    if (!match) {
      return {
        type: 'other',
        category: CommitType.OTHER,
        scope: null,
        breaking: false,
        subject: trimmed,
      };
    }

    const [, rawType, scope, breakingFlag, subject] = match;
    const isBreaking = Boolean(breakingFlag);

    let category = CommitType.OTHER;
    switch (rawType.toLowerCase()) {
      case 'feat': category = CommitType.FEAT; break;
      case 'fix': category = CommitType.FIX; break;
      case 'perf': category = CommitType.PERF; break;
      case 'refactor': category = CommitType.REFACTOR; break;
      case 'docs': category = CommitType.DOCS; break;
      case 'test': category = CommitType.TEST; break;
      case 'chore': category = CommitType.CHORE; break;
    }

    return {
      type: rawType.toLowerCase(),
      category,
      scope: scope || null,
      breaking: isBreaking,
      subject,
    };
  }

  generateMarkdown(version, dateStr, commitMessages = []) {
    const commits = commitMessages.map(msg => this.parseCommit(msg));
    const grouped = new Map();

    for (const cat of Object.values(CommitType)) {
      grouped.set(cat, []);
    }

    for (const c of commits) {
      grouped.get(c.category).push(c);
    }

    const lines = [];
    lines.push(`## [${version}] - ${dateStr}\n`);

    for (const [category, list] of grouped.entries()) {
      if (list.length === 0) continue;
      lines.push(`### ${category}\n`);

      for (const item of list) {
        const scopePrefix = item.scope ? `**${item.scope}:** ` : '';
        const breakingBadge = item.breaking ? '`BREAKING CHANGE` ' : '';
        lines.push(`- ${breakingBadge}${scopePrefix}${item.subject}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}
