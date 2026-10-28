/**
 * StreamForge CLI - Monorepo Workspaces & Concurrency Manager
 * Discovers packages, resolves workspace dependency DAGs, and governs parallel builds
 */

import { promises as fs } from 'node:fs';
import { resolve, join } from 'node:path';

export class MonorepoManager {
  constructor(rootDir = '.') {
    this.rootDir = resolve(rootDir);
    this.packages = new Map(); // name -> { path, pkgJson, dependencies: [] }
  }

  async discoverPackages(packagesDir = 'packages') {
    const absDir = join(this.rootDir, packagesDir);
    let entries = [];
    try {
      entries = await fs.readdir(absDir, { withFileTypes: true });
    } catch {
      return [];
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const pkgPath = join(absDir, entry.name, 'package.json');
        try {
          const raw = await fs.readFile(pkgPath, 'utf8');
          const parsed = JSON.parse(raw);
          this.packages.set(parsed.name, {
            name: parsed.name,
            version: parsed.version,
            dir: join(absDir, entry.name),
            pkgJson: parsed,
            deps: Object.keys({ ...(parsed.dependencies || {}), ...(parsed.devDependencies || {}) }),
          });
        } catch {
          // Skip directories without valid package.json
        }
      }
    }

    return Array.from(this.packages.values());
  }

  getBuildOrder() {
    const visited = new Set();
    const visiting = new Set();
    const order = [];

    const visit = (pkgName) => {
      if (visiting.has(pkgName)) {
        throw new Error(`Circular workspace dependency detected in: ${pkgName}`);
      }
      if (!visited.has(pkgName)) {
        visiting.add(pkgName);
        const pkg = this.packages.get(pkgName);
        if (pkg) {
          // Check internal monorepo dependencies
          for (const dep of pkg.deps) {
            if (this.packages.has(dep)) {
              visit(dep);
            }
          }
        }
        visiting.delete(pkgName);
        visited.add(pkgName);
        if (pkg) order.push(pkg);
      }
    };

    for (const name of this.packages.keys()) {
      if (!visited.has(name)) {
        visit(name);
      }
    }

    return order;
  }
}
