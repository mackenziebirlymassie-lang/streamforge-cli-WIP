/**
 * @fileoverview Zero-dependency Module Dependency Graph Analyzer.
 * Parses ESM and CommonJS imports, detects circular dependencies,
 * determines topological build order, and renders visual dependency graphs.
 */

import fs from 'node:fs';
import path from 'node:path';

export class DependencyGraph {
  constructor() {
    /** @type {Map<string, Set<string>>} file -> Set of imported files */
    this.adjacencyList = new Map();
    /** @type {Map<string, Set<string>>} file -> Set of files importing it */
    this.reverseAdjacencyList = new Map();
    /** @type {Map<string, { size: number, external: boolean }>} */
    this.fileMetadata = new Map();
  }

  /**
   * Adds a node to the graph.
   * @param {string} file - File identifier or path
   * @param {Object} [meta] - Metadata
   */
  addNode(file, meta = {}) {
    const normalized = this._normalizePath(file);
    if (!this.adjacencyList.has(normalized)) {
      this.adjacencyList.set(normalized, new Set());
      this.reverseAdjacencyList.set(normalized, new Set());
      this.fileMetadata.set(normalized, {
        size: meta.size || 0,
        external: Boolean(meta.external)
      });
    }
  }

  /**
   * Adds a directed dependency edge from source to target.
   * @param {string} fromFile - Source file
   * @param {string} toFile - Target dependency
   */
  addEdge(fromFile, toFile) {
    const from = this._normalizePath(fromFile);
    const to = this._normalizePath(toFile);

    this.addNode(from);
    this.addNode(to);

    this.adjacencyList.get(from).add(to);
    this.reverseAdjacencyList.get(to).add(from);
  }

  /**
   * Extracts static import and require specifiers from code string.
   * @param {string} code - Source code
   * @returns {string[]} List of import specifiers
   */
  static extractSpecifiers(code) {
    const specifiers = new Set();

    // ESM static imports: import ... from 'specifier';
    const importRegex = /(?:import\s+(?:[\w*\s{},]*\s+from\s+)?['"]([^'"]+)['"])|(?:import\s*\(['"]([^'"]+)['"]\))/g;
    let match;
    while ((match = importRegex.exec(code)) !== null) {
      const spec = match[1] || match[2];
      if (spec) specifiers.add(spec);
    }

    // ESM exports from: export ... from 'specifier';
    const exportFromRegex = /export\s+(?:[\w*\s{},]*\s+from\s+)['"]([^'"]+)['"]/g;
    while ((match = exportFromRegex.exec(code)) !== null) {
      if (match[1]) specifiers.add(match[1]);
    }

    // CommonJS require: require('specifier')
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = requireRegex.exec(code)) !== null) {
      if (match[1]) specifiers.add(match[1]);
    }

    return Array.from(specifiers);
  }

  /**
   * Analyzes a single file and adds its local dependencies to the graph.
   * @param {string} filePath - Path to file
   * @param {string} [rootDir=process.cwd()] - Project root directory
   */
  analyzeFile(filePath, rootDir = process.cwd()) {
    const normalizedFile = path.resolve(filePath);
    let content = '';

    try {
      content = fs.readFileSync(normalizedFile, 'utf8');
      const stats = fs.statSync(normalizedFile);
      this.addNode(normalizedFile, { size: stats.size, external: false });
    } catch {
      return;
    }

    const specifiers = DependencyGraph.extractSpecifiers(content);
    const dir = path.dirname(normalizedFile);

    for (const spec of specifiers) {
      if (spec.startsWith('.') || spec.startsWith('/')) {
        const resolved = this._resolveModulePath(dir, spec);
        if (resolved) {
          this.addEdge(normalizedFile, resolved);
        }
      } else {
        // External package dependency
        this.addNode(spec, { external: true });
        this.addEdge(normalizedFile, spec);
      }
    }
  }

  /**
   * Scans an entire directory and maps all internal dependencies.
   * @param {string} targetDir - Directory to scan
   * @param {string[]} [extensions=['.js', '.mjs', '.cjs', '.ts']] - Extensions to include
   */
  scanDirectory(targetDir, extensions = ['.js', '.mjs', '.cjs', '.ts']) {
    const scan = (current) => {
      let entries = [];
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
            scan(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (extensions.includes(ext)) {
            this.analyzeFile(fullPath, targetDir);
          }
        }
      }
    };

    scan(path.resolve(targetDir));
  }

  /**
   * Detects all circular dependency cycles using DFS cycle detection.
   * @returns {string[][]} Array of cycle paths
   */
  findCycles() {
    const visited = new Set();
    const recursionStack = new Set();
    const cycles = [];
    const currentPath = [];

    const dfs = (node) => {
      visited.add(node);
      recursionStack.add(node);
      currentPath.push(node);

      const neighbors = this.adjacencyList.get(node) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          dfs(neighbor);
        } else if (recursionStack.has(neighbor)) {
          // Cycle found: extract the subpath forming the cycle
          const cycleStartIndex = currentPath.indexOf(neighbor);
          if (cycleStartIndex !== -1) {
            cycles.push([...currentPath.slice(cycleStartIndex), neighbor]);
          }
        }
      }

      recursionStack.delete(node);
      currentPath.pop();
    };

    for (const node of this.adjacencyList.keys()) {
      if (!visited.has(node)) {
        dfs(node);
      }
    }

    return cycles;
  }

  /**
   * Returns a topologically sorted list of files for build execution.
   * Throws an error if cyclic dependencies are detected unless allowCycles is true.
   * Uses Kahn's algorithm.
   * @param {boolean} [allowCycles=false]
   * @returns {string[]} Topologically sorted file paths
   */
  getTopologicalOrder(allowCycles = false) {
    const inDegree = new Map();
    for (const node of this.adjacencyList.keys()) {
      inDegree.set(node, 0);
    }

    for (const [node, targets] of this.adjacencyList.entries()) {
      for (const target of targets) {
        inDegree.set(target, (inDegree.get(target) || 0) + 1);
      }
    }

    const queue = [];
    for (const [node, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(node);
      }
    }

    const sorted = [];
    while (queue.length > 0) {
      const node = queue.shift();
      sorted.push(node);

      const targets = this.adjacencyList.get(node) || new Set();
      for (const target of targets) {
        inDegree.set(target, inDegree.get(target) - 1);
        if (inDegree.get(target) === 0) {
          queue.push(target);
        }
      }
    }

    if (sorted.length !== this.adjacencyList.size && !allowCycles) {
      const cycles = this.findCycles();
      throw new Error(`Circular dependency detected preventing topological sort: ${JSON.stringify(cycles)}`);
    }

    return sorted;
  }

  /**
   * Generates a Graphviz DOT representation of the dependency graph.
   * @returns {string} DOT syntax string
   */
  toDot() {
    const lines = ['digraph StreamForgeDependencies {', '  rankdir=LR;', '  node [shape=box, fontname="sans-serif", fontsize=10];'];

    for (const [node, meta] of this.fileMetadata.entries()) {
      const label = path.basename(node);
      const color = meta.external ? 'lightgray' : 'deepskyblue';
      lines.push(`  "${node}" [label="${label}", fillcolor="${color}", style=filled];`);
    }

    for (const [node, targets] of this.adjacencyList.entries()) {
      for (const target of targets) {
        lines.push(`  "${node}" -> "${target}";`);
      }
    }

    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Formats the dependency graph into an ASCII tree string.
   * @param {string} rootNode - Root file to start rendering from
   * @returns {string} ASCII rendered dependency tree
   */
  renderAscii(rootNode) {
    const normalizedRoot = this._normalizePath(rootNode);
    if (!this.adjacencyList.has(normalizedRoot)) {
      return `(Empty or unknown root: ${rootNode})`;
    }

    const lines = [];
    const visited = new Set();

    const printTree = (node, prefix = '', isLast = true) => {
      const isCircular = visited.has(node);
      const label = path.basename(node) + (isCircular ? ' (cyclic)' : '');
      const branch = isLast ? '└── ' : '├── ';

      if (prefix === '') {
        lines.push(label);
      } else {
        lines.push(`${prefix}${branch}${label}`);
      }

      if (isCircular) return;

      visited.add(node);
      const nextPrefix = prefix + (isLast ? '    ' : '│   ');
      const children = Array.from(this.adjacencyList.get(node) || []);

      for (let i = 0; i < children.length; i++) {
        printTree(children[i], nextPrefix, i === children.length - 1);
      }
      visited.delete(node);
    };

    printTree(normalizedRoot);
    return lines.join('\n');
  }

  /**
   * Normalizes file path to cross-platform format.
   * @private
   */
  _normalizePath(p) {
    if (!p) return '';
    return p.replace(/\\/g, '/');
  }

  /**
   * Resolves relative module specifier to disk path.
   * @private
   */
  _resolveModulePath(dir, specifier) {
    const directPath = path.resolve(dir, specifier);
    const candidates = [
      directPath,
      `${directPath}.js`,
      `${directPath}.mjs`,
      `${directPath}.ts`,
      path.join(directPath, 'index.js'),
      path.join(directPath, 'index.mjs')
    ];

    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return candidate;
        }
      } catch {
        // Continue searching
      }
    }

    return directPath;
  }
}
