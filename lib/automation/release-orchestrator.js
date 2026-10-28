/**
 * StreamForge CLI - Automated Release Orchestrator
 * Governs semantic versioning, release manifest generation, and package validation
 */

import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import { ChangelogGenerator } from './changelog-generator.js';
import { DeterministicWriter } from '../output/deterministic-writer.js';

export class ReleaseOrchestrator {
  constructor(packageJsonPath = 'package.json') {
    this.pkgPath = resolve(packageJsonPath);
  }

  bumpVersion(currentVersion, bumpType = 'patch') {
    const parts = currentVersion.split('.').map(p => parseInt(p, 10));
    if (parts.length !== 3 || parts.some(isNaN)) {
      throw new Error(`Invalid semver version string: "${currentVersion}"`);
    }

    let [major, minor, patch] = parts;

    switch (bumpType) {
      case 'major':
        major++;
        minor = 0;
        patch = 0;
        break;
      case 'minor':
        minor++;
        patch = 0;
        break;
      case 'patch':
      default:
        patch++;
        break;
    }

    return `${major}.${minor}.${patch}`;
  }

  async prepareRelease(bumpType = 'patch', commits = []) {
    const raw = await fs.readFile(this.pkgPath, 'utf8');
    const pkg = JSON.parse(raw);

    const oldVersion = pkg.version;
    const newVersion = this.bumpVersion(oldVersion, bumpType);
    pkg.version = newVersion;

    // Generate Changelog
    const dateStr = new Date().toISOString().split('T')[0];
    const changelogGen = new ChangelogGenerator();
    const changelogSnippet = changelogGen.generateMarkdown(newVersion, dateStr, commits);

    // Save updated package.json deterministically
    await DeterministicWriter.writeJSON(this.pkgPath, pkg);

    return {
      oldVersion,
      newVersion,
      dateStr,
      changelog: changelogSnippet,
    };
  }
}
