/**
 * StreamForge CLI - Directory Manifest Schema Validator
 * Validates manifest definitions, variable types, and path security constraints
 */

import { ManifestValidationError } from '../core/error-handler.js';

export class ManifestSchemaValidator {
  static validate(manifest) {
    if (!manifest || typeof manifest !== 'object') {
      throw new ManifestValidationError('Manifest must be a valid JSON object or array');
    }

    const files = Array.isArray(manifest) ? manifest : (manifest.files || Object.entries(manifest).map(([path, val]) => ({ path, ...(typeof val === 'object' ? val : { content: val }) })));

    if (!Array.isArray(files)) {
      throw new ManifestValidationError('Manifest "files" property must be an array of file specifications');
    }

    for (let i = 0; i < files.length; i++) {
      const entry = files[i];
      const targetPath = entry.path || entry.relPath;

      if (!targetPath || typeof targetPath !== 'string') {
        throw new ManifestValidationError(`Entry at index ${i} missing required string "path"`, entry);
      }

      // Security check: prohibit path traversal vulnerabilities
      if (targetPath.includes('..') || targetPath.startsWith('/') || targetPath.startsWith('\\')) {
        throw new ManifestValidationError(`Path traversal detected in manifest path: "${targetPath}"`, entry);
      }

      if (entry.mode !== undefined && (typeof entry.mode !== 'number' || entry.mode < 0 || entry.mode > 0o777)) {
        throw new ManifestValidationError(`Invalid octal file permissions mode in path "${targetPath}": ${entry.mode}`, entry);
      }
    }

    return true;
  }
}
