/**
 * StreamForge CLI - High-Speed Security & Credential Leak Scanner
 * Stream-based static analysis detecting secret keys, API tokens, and dangerous runtime patterns
 */

import { BaseAsyncTransform } from '../streams/transform-base.js';
import { TablePrinter } from '../terminal/table-printer.js';
import { ansi } from '../terminal/ansi-styler.js';

export const Severity = Object.freeze({
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
});

const SECURITY_PATTERNS = [
  {
    id: 'SEC_AWS_KEY',
    name: 'AWS Access Key ID',
    severity: Severity.CRITICAL,
    regex: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g,
  },
  {
    id: 'SEC_GITHUB_TOKEN',
    name: 'GitHub Personal Access Token',
    severity: Severity.CRITICAL,
    regex: /gh[pousr]_[A-Za-z0-9_]{36,255}/g,
  },
  {
    id: 'SEC_PRIVATE_KEY',
    name: 'Private Encryption Key Header',
    severity: Severity.CRITICAL,
    regex: /-----BEGIN\s+(?:RSA|DSA|EC|OPENSSH|PGP)?\s*PRIVATE KEY-----/g,
  },
  {
    id: 'SEC_SLACK_WEBHOOK',
    name: 'Slack Incoming Webhook URL',
    severity: Severity.HIGH,
    regex: /https:\/\/hooks\.slack\.com\/services\/T[a-zA-Z0-9_]+\/B[a-zA-Z0-9_]+\/[a-zA-Z0-9_]+/g,
  },
  {
    id: 'SEC_GENERIC_API_KEY',
    name: 'Generic Hardcoded Secret/Password',
    severity: Severity.HIGH,
    regex: /(?:api_key|apikey|secret|password|passwd|auth_token)\s*[:=]\s*['"][a-zA-Z0-9_\-]{16,}['"]/gi,
  },
  {
    id: 'SEC_DANGEROUS_EVAL',
    name: 'Dangerous Dynamic eval() Invocation',
    severity: Severity.MEDIUM,
    regex: /\beval\s*\(/g,
  },
  {
    id: 'SEC_FUNCTION_CONSTRUCTOR',
    name: 'Dynamic Function Constructor Code Execution',
    severity: Severity.MEDIUM,
    regex: /\bnew\s+Function\s*\(/g,
  },
];

export class SecurityScannerStream extends BaseAsyncTransform {
  constructor(options = {}) {
    super('security-scanner', options);
    this.findings = [];
  }

  async processChunk(entry) {
    if (entry.isDirectory || !entry.content) {
      return entry;
    }

    const text = typeof entry.content === 'string' ? entry.content : entry.content.toString('utf8');
    const lines = text.split('\n');

    for (let lineNum = 1; lineNum <= lines.length; lineNum++) {
      const line = lines[lineNum - 1];

      for (const pattern of SECURITY_PATTERNS) {
        pattern.regex.lastIndex = 0; // Reset stateful regex
        let match;
        while ((match = pattern.regex.exec(line)) !== null) {
          this.findings.push({
            ruleId: pattern.id,
            ruleName: pattern.name,
            severity: pattern.severity,
            file: entry.relPath || entry.path,
            line: lineNum,
            snippet: line.trim().slice(0, 80),
          });
        }
      }
    }

    return {
      ...entry,
      securityScanned: true,
    };
  }

  formatReport() {
    if (this.findings.length === 0) {
      return ansi.success('✔ Zero security vulnerabilities or credential leaks detected.\n');
    }

    const printer = new TablePrinter({
      columns: [
        { key: 'severity', label: 'SEVERITY', align: 'left', width: 10 },
        { key: 'rule', label: 'VULNERABILITY', align: 'left', width: 28 },
        { key: 'location', label: 'FILE:LINE', align: 'left', width: 24 },
        { key: 'snippet', label: 'CODE CONTEXT', align: 'left' },
      ],
    });

    const rows = this.findings.map(f => {
      let sevBadge = ansi.red(f.severity);
      if (f.severity === Severity.HIGH) sevBadge = ansi.brightRed(f.severity);
      if (f.severity === Severity.MEDIUM) sevBadge = ansi.yellow(f.severity);
      if (f.severity === Severity.LOW) sevBadge = ansi.cyan(f.severity);

      return {
        severity: sevBadge,
        rule: ansi.bold(f.ruleName),
        location: `${f.file}:${f.line}`,
        snippet: ansi.dim(f.snippet),
      };
    });

    return '\n' + ansi.bold(ansi.red('⚠️  SECURITY VULNERABILITY AUDIT FINDINGS:')) + '\n' + printer.print(rows) + '\n';
  }
}
