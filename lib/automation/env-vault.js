/**
 * StreamForge CLI - Environment Variable Vault & Schema Validator
 * Encrypts/decrypts secrets via native AES-256-GCM and audits .env parity
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { TablePrinter } from '../terminal/table-printer.js';
import { ansi } from '../terminal/ansi-styler.js';

export class EnvVault {
  constructor(secretKey = 'default-streamforge-secret-key-32b') {
    // Derive 256-bit key from passphrase using scrypt
    this.key = scryptSync(secretKey, 'streamforge-salt', 32);
  }

  encrypt(plainText) {
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);

    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  decrypt(cipherText) {
    const [ivHex, authTagHex, encryptedData] = cipherText.split(':');
    if (!ivHex || !authTagHex || !encryptedData) {
      throw new Error('Malformed encrypted vault payload format');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  parseEnv(content) {
    const env = {};
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        // Remove quotes if present
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        env[key] = val;
      }
    }

    return env;
  }

  auditEnvParity(exampleEnvContent, actualEnvContent) {
    const example = this.parseEnv(exampleEnvContent);
    const actual = this.parseEnv(actualEnvContent);

    const missingKeys = [];
    const extraneousKeys = [];

    for (const key of Object.keys(example)) {
      if (!(key in actual)) {
        missingKeys.push(key);
      }
    }

    for (const key of Object.keys(actual)) {
      if (!(key in example)) {
        extraneousKeys.push(key);
      }
    }

    return {
      isSynced: missingKeys.length === 0,
      missingKeys,
      extraneousKeys,
    };
  }

  formatParityReport(parity) {
    if (parity.isSynced && parity.extraneousKeys.length === 0) {
      return ansi.success('✔ .env is 100% synchronized with .env.example.\n');
    }

    const printer = new TablePrinter({
      columns: [
        { key: 'status', label: 'STATUS', align: 'left', width: 12 },
        { key: 'key', label: 'ENVIRONMENT KEY', align: 'left' },
      ],
    });

    const rows = [];
    for (const k of parity.missingKeys) {
      rows.push({ status: ansi.red('- MISSING'), key: k });
    }
    for (const k of parity.extraneousKeys) {
      rows.push({ status: ansi.yellow('+ EXTRA'), key: k });
    }

    return '\n' + ansi.bold(ansi.yellow('⚠️  ENVIRONMENT PARITY AUDIT:')) + '\n' + printer.print(rows) + '\n';
  }
}
