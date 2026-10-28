/**
 * @fileoverview Cryptographic Artifact Verifier & Reproducible Build Auditor.
 * Computes deterministic SHA-256/SHA-512 checksum manifests, checks bit-for-bit
 * identity across multi-pass compilation runs, and verifies build provenance.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { formatBytes } from '../utils/byte-format.js';

export class ArtifactVerifier {
  /**
   * @param {Object} [options]
   * @param {'sha256' | 'sha512'} [options.algorithm='sha256']
   */
  constructor(options = {}) {
    this.algorithm = options.algorithm || 'sha256';
  }

  /**
   * Hashes a file buffer or stream with selected algorithm.
   * @param {Buffer | string} content
   * @returns {string} Hex hash digest
   */
  hash(content) {
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    return crypto.createHash(this.algorithm).update(buf).digest('hex');
  }

  /**
   * Generates a deterministic checksum map for all files in a directory.
   * Keys are sorted lexicographically for reproducible output.
   * @param {string} targetDir
   * @returns {Map<string, { hash: string, size: number }>}
   */
  generateChecksumMap(targetDir) {
    const resolved = path.resolve(targetDir);
    const checksumMap = new Map();

    const walk = (current) => {
      let entries = [];
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch {
        return;
      }

      // Sort entries lexicographically for deterministic traversal
      entries.sort((a, b) => a.name.localeCompare(b.name));

      for (const entry of entries) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile()) {
          const content = fs.readFileSync(full);
          const relPath = path.relative(resolved, full).replace(/\\/g, '/');
          const fileHash = this.hash(content);
          checksumMap.set(relPath, {
            hash: fileHash,
            size: content.length
          });
        }
      }
    };

    walk(resolved);
    return checksumMap;
  }

  /**
   * Generates a standard UNIX sha256sum formatted manifest string.
   * @param {string} targetDir
   * @returns {string} Checksum manifest
   */
  generateManifest(targetDir) {
    const map = this.generateChecksumMap(targetDir);
    const lines = [];

    // Sort paths deterministically
    const sortedPaths = Array.from(map.keys()).sort();
    for (const p of sortedPaths) {
      const entry = map.get(p);
      lines.push(`${entry.hash}  ${p}`);
    }

    return lines.join('\n') + (lines.length > 0 ? '\n' : '');
  }

  /**
   * Verifies existing directory files against a checksum manifest string.
   * @param {string} targetDir
   * @param {string} manifestContent
   * @returns {{ valid: boolean, matched: number, corrupted: string[], missing: string[], total: number }}
   */
  verifyAgainstManifest(targetDir, manifestContent) {
    const resolved = path.resolve(targetDir);
    const lines = manifestContent.trim().split('\n').filter(Boolean);

    let matched = 0;
    const corrupted = [];
    const missing = [];

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 2) continue;

      const expectedHash = parts[0].toLowerCase();
      const relPath = parts.slice(1).join(' ').replace(/^\.\//, '');
      const fullPath = path.join(resolved, relPath);

      if (!fs.existsSync(fullPath)) {
        missing.push(relPath);
        continue;
      }

      const fileContent = fs.readFileSync(fullPath);
      const actualHash = this.hash(fileContent).toLowerCase();

      if (actualHash === expectedHash) {
        matched++;
      } else {
        corrupted.push({
          path: relPath,
          expected: expectedHash,
          actual: actualHash
        });
      }
    }

    return {
      valid: corrupted.length === 0 && missing.length === 0,
      matched,
      corrupted,
      missing,
      total: lines.length
    };
  }

  /**
   * Verifies reproducible build: compares two directory outputs bit-for-bit.
   * @param {string} dirA - First build output directory
   * @param {string} dirB - Second build output directory
   * @returns {Object} Reproducibility audit result
   */
  verifyReproducibility(dirA, dirB) {
    const mapA = this.generateChecksumMap(dirA);
    const mapB = this.generateChecksumMap(dirB);

    const identical = [];
    const differing = [];
    const onlyInA = [];
    const onlyInB = [];

    for (const [file, infoA] of mapA.entries()) {
      if (!mapB.has(file)) {
        onlyInA.push(file);
      } else {
        const infoB = mapB.get(file);
        if (infoA.hash === infoB.hash) {
          identical.push(file);
        } else {
          differing.push({
            file,
            hashA: infoA.hash,
            hashB: infoB.hash,
            sizeA: infoA.size,
            sizeB: infoB.size
          });
        }
      }
    }

    for (const file of mapB.keys()) {
      if (!mapA.has(file)) {
        onlyInB.push(file);
      }
    }

    const isReproducible = differing.length === 0 && onlyInA.length === 0 && onlyInB.length === 0;

    return {
      isReproducible,
      algorithm: this.algorithm,
      summary: {
        totalA: mapA.size,
        totalB: mapB.size,
        identicalCount: identical.length,
        differingCount: differing.length,
        onlyInACount: onlyInA.length,
        onlyInBCount: onlyInB.length
      },
      differing,
      onlyInA,
      onlyInB
    };
  }

  /**
   * Formats a provenance certificate string.
   * @param {string} targetDir - Directory of artifacts
   * @param {Object} [meta] - Metadata (buildId, commit, timestamp)
   * @returns {string} Formatted certificate
   */
  generateProvenanceCertificate(targetDir, meta = {}) {
    const map = this.generateChecksumMap(targetDir);
    const timestamp = meta.timestamp || '2026-10-28T12:00:00.000Z';
    const buildId = meta.buildId || crypto.randomUUID();

    // Calculate root composite tree hash
    const compositeHasher = crypto.createHash(this.algorithm);
    const sortedEntries = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    let totalSize = 0;

    for (const [p, info] of sortedEntries) {
      compositeHasher.update(`${p}:${info.hash}:${info.size}\n`);
      totalSize += info.size;
    }
    const treeRootHash = compositeHasher.digest('hex');

    const cert = {
      streamforgeProvenance: '1.0',
      buildId,
      timestamp,
      algorithm: this.algorithm,
      rootTreeHash: treeRootHash,
      artifactCount: map.size,
      totalBytes: totalSize,
      formattedTotal: formatBytes(totalSize),
      artifacts: sortedEntries.map(([p, info]) => ({
        path: p,
        hash: info.hash,
        size: info.size
      }))
    };

    return JSON.stringify(cert, null, 2);
  }
}
