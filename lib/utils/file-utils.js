/**
 * StreamForge CLI - Fast Atomic File System Utilities
 * Non-blocking file I/O operations, atomic swap writes, and crypto hashing
 */

import { promises as fs } from 'node:fs';
import { createReadStream } from 'node:fs';
import { dirname, resolve, join, relative } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

export async function dirExists(dirPath) {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Write file atomically via temp-file and rename to prevent partial writes
 */
export async function writeAtomic(targetPath, content, encoding = 'utf8') {
  const dir = dirname(targetPath);
  await ensureDir(dir);

  const tempName = `${targetPath}.tmp.${randomBytes(6).toString('hex')}`;
  await fs.writeFile(tempName, content, encoding);
  await fs.rename(tempName, targetPath);
}

/**
 * Compute SHA-256 hash of a file or buffer
 */
export async function hashFile(filePath, algorithm = 'sha256') {
  return new Promise((res, rej) => {
    const hash = createHash(algorithm);
    const stream = createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => res(hash.digest('hex')));
    stream.on('error', err => rej(err));
  });
}

export function hashBuffer(buffer, algorithm = 'sha256') {
  return createHash(algorithm).update(buffer).digest('hex');
}

/**
 * Fast streaming directory walker yielding absolute and relative file entries
 */
export async function* walkDirectory(rootDir, options = {}) {
  const absRoot = resolve(rootDir);
  const maxDepth = options.maxDepth ?? Infinity;

  async function* recurse(currentDir, currentDepth) {
    if (currentDepth > maxDepth) return;
    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    // Sort entries deterministically for reproducible pipeline runs
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      const relPath = relative(absRoot, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        yield {
          fullPath,
          relPath,
          name: entry.name,
          isDirectory: true,
          depth: currentDepth,
        };
        yield* recurse(fullPath, currentDepth + 1);
      } else if (entry.isFile()) {
        const stat = await fs.stat(fullPath);
        yield {
          fullPath,
          relPath,
          name: entry.name,
          isDirectory: false,
          size: stat.size,
          mtimeMs: stat.mtimeMs,
          depth: currentDepth,
        };
      }
    }
  }

  yield* recurse(absRoot, 1);
}
