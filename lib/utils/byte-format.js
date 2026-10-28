/**
 * StreamForge CLI - Deterministic Byte & Metric Formatter
 * Zero-dependency numerical formatting strictly conforming to 1024-based binary units
 */

export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 B';
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const safeIndex = Math.min(i, sizes.length - 1);
  const val = parseFloat((bytes / Math.pow(k, safeIndex)).toFixed(dm));

  return `${val} ${sizes[safeIndex]}`;
}

export function formatNumber(num) {
  return new Intl.NumberFormat('en-US').format(num);
}

export function formatPercentage(part, total, decimals = 1) {
  if (total <= 0) return '0.0%';
  const pct = (part / total) * 100;
  return `${pct.toFixed(decimals)}%`;
}

export function formatRate(bytes, durationMs) {
  if (durationMs <= 0) return '0 B/s';
  const bytesPerSec = (bytes / durationMs) * 1000;
  return `${formatBytes(bytesPerSec)}/s`;
}
