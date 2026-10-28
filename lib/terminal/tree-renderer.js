/**
 * StreamForge CLI - Deterministic Terminal File Tree Renderer
 * Formats hierarchical directory graphs into clean box-drawing glyph outputs
 */

import { ansi } from './ansi-styler.js';
import { formatBytes } from '../utils/byte-format.js';

export class TreeRenderer {
  constructor(options = {}) {
    this.useAscii = options.useAscii ?? false;
    this.showSizes = options.showSizes ?? true;
    this.showHashes = options.showHashes ?? true;

    this.glyphs = this.useAscii ? {
      branch: '|-- ',
      last: '`-- ',
      pipe: '|   ',
      space: '    ',
    } : {
      branch: '├── ',
      last: '└── ',
      pipe: '│   ',
      space: '    ',
    };
  }

  /**
   * Convert flat list of relative paths into hierarchical nested tree node
   */
  buildTreeStructure(entries) {
    const root = { name: '.', isDirectory: true, children: new Map() };

    for (const entry of entries) {
      const parts = entry.relPath.split('/').filter(Boolean);
      let current = root;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLeaf = (i === parts.length - 1);
        const isDir = isLeaf ? (entry.isDirectory ?? false) : true;

        if (!current.children.has(part)) {
          current.children.set(part, {
            name: part,
            isDirectory: isDir,
            size: isLeaf ? (entry.size ?? 0) : 0,
            hash: isLeaf ? (entry.hash ?? null) : null,
            children: new Map(),
          });
        }
        current = current.children.get(part);
      }
    }

    return root;
  }

  render(entries, rootLabel = '.') {
    const rootNode = this.buildTreeStructure(entries);
    const lines = [ansi.bold(ansi.cyan(rootLabel))];
    this._renderNode(rootNode, '', lines);
    return lines.join('\n');
  }

  _renderNode(node, prefix, lines) {
    // Sort directories first, then alphabetical
    const children = Array.from(node.children.values()).sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const isLast = (i === children.length - 1);
      const connector = isLast ? this.glyphs.last : this.glyphs.branch;
      const nextPrefix = prefix + (isLast ? this.glyphs.space : this.glyphs.pipe);

      let lineText = `${prefix}${connector}`;

      if (child.isDirectory) {
        lineText += ansi.bold(ansi.blue(child.name + '/'));
      } else {
        lineText += ansi.white(child.name);
        const meta = [];
        if (this.showSizes && child.size !== undefined) {
          meta.push(ansi.gray(formatBytes(child.size)));
        }
        if (this.showHashes && child.hash) {
          meta.push(ansi.dim(child.hash.slice(0, 8)));
        }
        if (meta.length > 0) {
          lineText += ` (${meta.join(' • ')})`;
        }
      }

      lines.push(lineText);

      if (child.children.size > 0) {
        this._renderNode(child, nextPrefix, lines);
      }
    }
  }
}
