/**
 * StreamForge CLI - Comprehensive Error Trapping & Diagnostics
 * Clean actionable error handling with exit code mapping and zero-telemetry privacy
 */

import { ansi } from '../terminal/ansi-styler.js';

export class StreamForgeError extends Error {
  constructor(message, code = 'ERR_STREAMFORGE', details = null) {
    super(message);
    this.name = 'StreamForgeError';
    this.code = code;
    this.details = details;
  }
}

export class ManifestValidationError extends StreamForgeError {
  constructor(message, details = null) {
    super(message, 'ERR_MANIFEST_VALIDATION', details);
    this.name = 'ManifestValidationError';
  }
}

export class PipelineSyntaxError extends StreamForgeError {
  constructor(message, details = null) {
    super(message, 'ERR_PIPELINE_SYNTAX', details);
    this.name = 'PipelineSyntaxError';
  }
}

export class TransformStreamError extends StreamForgeError {
  constructor(message, stageName, cause = null) {
    super(message, 'ERR_TRANSFORM_STREAM', { stageName, cause: cause?.message });
    this.name = 'TransformStreamError';
  }
}

export function handleFatalError(err) {
  const isDebug = process.env.DEBUG || process.argv.includes('--verbose');
  const badge = ansi.bgRed(ansi.bold(' FATAL '));

  console.error('\n' + badge + ' ' + ansi.red(err.message || String(err)));

  if (err.details) {
    console.error(ansi.dim(JSON.stringify(err.details, null, 2)));
  }

  if (isDebug && err.stack) {
    console.error('\n' + ansi.gray(err.stack));
  }

  // Map error types to standard UNIX exit codes
  let exitCode = 1;
  if (err.code === 'ERR_MANIFEST_VALIDATION') exitCode = 2;
  if (err.code === 'ERR_PIPELINE_SYNTAX') exitCode = 3;
  if (err.code === 'ERR_TRANSFORM_STREAM') exitCode = 4;

  process.exit(exitCode);
}
