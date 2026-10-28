/**
 * @fileoverview Configuration and Manifest Schema Migrator.
 * Executes versioned forward and rollback schema migrations for manifests
 * and pipeline script definitions with atomic rollback guarantees.
 */

import fs from 'node:fs';
import path from 'node:path';

export class ConfigMigrator {
  /**
   * @param {Object} [options]
   * @param {string} [options.configType='manifest'] - 'manifest' | 'pipeline'
   */
  constructor(options = {}) {
    this.configType = options.configType || 'manifest';
    /** @type {Map<number, { up: (cfg: Object) => Object, down: (cfg: Object) => Object, description: string }>} */
    this.migrations = new Map();
    this._registerDefaultMigrations();
  }

  /**
   * Registers a migration step between version V and V+1.
   * @param {number} version - Base version number
   * @param {Object} step
   * @param {(cfg: Object) => Object} step.up - Migration to version + 1
   * @param {(cfg: Object) => Object} step.down - Rollback to version
   * @param {string} step.description - Human-readable description
   */
  registerMigration(version, { up, down, description }) {
    if (typeof up !== 'function' || typeof down !== 'function') {
      throw new Error(`Migration for version ${version} must provide both 'up' and 'down' functions.`);
    }
    this.migrations.set(version, { up, down, description: description || `Migration v${version} -> v${version + 1}` });
  }

  /**
   * Calculates required migration path between fromVersion and toVersion.
   * @param {number} fromVersion
   * @param {number} toVersion
   * @returns {Array<{ version: number, direction: 'up' | 'down', description: string }>}
   */
  getPlan(fromVersion, toVersion) {
    const plan = [];
    if (fromVersion === toVersion) return plan;

    if (fromVersion < toVersion) {
      for (let v = fromVersion; v < toVersion; v++) {
        const step = this.migrations.get(v);
        if (!step) {
          throw new Error(`Missing forward migration step from version ${v} to ${v + 1}`);
        }
        plan.push({ version: v, direction: 'up', description: step.description });
      }
    } else {
      for (let v = fromVersion - 1; v >= toVersion; v--) {
        const step = this.migrations.get(v);
        if (!step) {
          throw new Error(`Missing rollback migration step from version ${v + 1} to ${v}`);
        }
        plan.push({ version: v, direction: 'down', description: `Rollback: ${step.description}` });
      }
    }

    return plan;
  }

  /**
   * Migrates a configuration object in memory to target version.
   * @param {Object} config - Raw configuration object
   * @param {number} targetVersion - Desired version
   * @param {Object} [options]
   * @param {boolean} [options.dryRun=false] - Return diff without applying
   * @returns {{ migrated: Object, stepsApplied: number, log: string[] }}
   */
  migrate(config, targetVersion, options = {}) {
    if (!config || typeof config !== 'object') {
      throw new Error('Invalid configuration object passed to migrator.');
    }

    const currentVersion = Number(config.version || 1);
    const plan = this.getPlan(currentVersion, targetVersion);
    const log = [];
    let currentConfig = JSON.parse(JSON.stringify(config));

    for (const step of plan) {
      const migration = this.migrations.get(step.version);
      log.push(`[${step.direction.toUpperCase()}] v${step.version} -> ${step.description}`);

      if (options.dryRun) continue;

      if (step.direction === 'up') {
        currentConfig = migration.up(currentConfig);
        currentConfig.version = step.version + 1;
      } else {
        currentConfig = migration.down(currentConfig);
        currentConfig.version = step.version;
      }
    }

    return {
      migrated: currentConfig,
      stepsApplied: plan.length,
      log
    };
  }

  /**
   * Migrates a file on disk atomically with automatic backup.
   * @param {string} filePath - Path to configuration file
   * @param {number} targetVersion - Target schema version
   * @param {Object} [options]
   * @param {boolean} [options.backup=true] - Create .bak file before writing
   * @returns {{ success: boolean, originalVersion: number, newVersion: number, backupPath?: string }}
   */
  migrateFile(filePath, targetVersion, options = { backup: true }) {
    const resolvedPath = path.resolve(filePath);
    const rawContent = fs.readFileSync(resolvedPath, 'utf8');
    const originalConfig = JSON.parse(rawContent);
    const originalVersion = Number(originalConfig.version || 1);

    if (originalVersion === targetVersion) {
      return { success: true, originalVersion, newVersion: targetVersion, stepsApplied: 0 };
    }

    let backupPath;
    if (options.backup) {
      backupPath = `${resolvedPath}.${Date.now()}.bak`;
      fs.writeFileSync(backupPath, rawContent, 'utf8');
    }

    try {
      const { migrated, stepsApplied } = this.migrate(originalConfig, targetVersion);
      const outputJson = JSON.stringify(migrated, null, 2) + '\n';

      const tempPath = `${resolvedPath}.tmp.${Date.now()}`;
      fs.writeFileSync(tempPath, outputJson, 'utf8');
      fs.renameSync(tempPath, resolvedPath);

      return {
        success: true,
        originalVersion,
        newVersion: targetVersion,
        stepsApplied,
        backupPath
      };
    } catch (err) {
      if (backupPath && fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, resolvedPath);
      }
      throw new Error(`Failed to migrate configuration file ${filePath}: ${err.message}`);
    }
  }

  /**
   * Registers default StreamForge migration rules (v1 -> v2 -> v3).
   * @private
   */
  _registerDefaultMigrations() {
    if (this.configType === 'manifest') {
      // Manifest v1 -> v2: Converts flat 'files' map to 'entries' array with explicit permissions
      this.registerMigration(1, {
        description: 'Upgrade manifest schema to v2: standardize entries array and metadata',
        up: (cfg) => {
          const next = { ...cfg };
          if (next.files && !Array.isArray(next.files)) {
            next.entries = Object.entries(next.files).map(([p, content]) => ({
              path: p,
              content: typeof content === 'string' ? content : '',
              mode: 0o644
            }));
            delete next.files;
          }
          next.metadata = next.metadata || { generatedBy: 'StreamForge-v2' };
          return next;
        },
        down: (cfg) => {
          const prev = { ...cfg };
          if (Array.isArray(prev.entries)) {
            prev.files = {};
            for (const item of prev.entries) {
              prev.files[item.path] = item.content || '';
            }
            delete prev.entries;
          }
          return prev;
        }
      });

      // Manifest v2 -> v3: Adds hash algorithms and environment variable overrides
      this.registerMigration(2, {
        description: 'Upgrade manifest schema to v3: add integrity hashes and env overrides',
        up: (cfg) => {
          const next = { ...cfg };
          next.integrity = next.integrity || { algorithm: 'sha256', enforceStrict: false };
          next.env = next.env || {};
          return next;
        },
        down: (cfg) => {
          const prev = { ...cfg };
          delete prev.integrity;
          delete prev.env;
          return prev;
        }
      });
    } else if (this.configType === 'pipeline') {
      // Pipeline v1 -> v2: Standardizes stage triggers and parallelism
      this.registerMigration(1, {
        description: 'Upgrade pipeline schema to v2: add stage timeouts and retry policies',
        up: (cfg) => {
          const next = { ...cfg };
          if (Array.isArray(next.stages)) {
            next.stages = next.stages.map((stage) => ({
              ...stage,
              timeoutMs: stage.timeoutMs || 30000,
              retries: stage.retries || 0
            }));
          }
          return next;
        },
        down: (cfg) => {
          const prev = { ...cfg };
          if (Array.isArray(prev.stages)) {
            prev.stages = prev.stages.map((stage) => {
              const cleaned = { ...stage };
              delete cleaned.timeoutMs;
              delete cleaned.retries;
              return cleaned;
            });
          }
          return prev;
        }
      });
    }
  }
}
