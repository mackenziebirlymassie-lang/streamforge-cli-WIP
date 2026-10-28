/**
 * StreamForge CLI - Deterministic Output Writer
 * Writes files with strict byte-for-byte reproducibility, sorted keys, and normalized line endings
 */

import { writeAtomic } from '../utils/file-utils.js';

export class DeterministicWriter {
  /**
   * Sort object keys recursively to ensure deterministic JSON serialization
   */
  static sortObjectKeys(obj) {
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
      return obj;
    }

    const sorted = {};
    const keys = Object.keys(obj).sort();
    for (const key of keys) {
      sorted[key] = this.sortObjectKeys(obj[key]);
    }
    return sorted;
  }

  static serializeJSON(data, indent = 2) {
    const sorted = this.sortObjectKeys(data);
    return JSON.stringify(sorted, null, indent) + '\n';
  }

  static async writeJSON(filePath, data, indent = 2) {
    const content = this.serializeJSON(data, indent);
    await writeAtomic(filePath, content);
  }
}
