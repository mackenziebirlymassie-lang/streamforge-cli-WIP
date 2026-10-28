/**
 * StreamForge CLI - Core Enums, Types, and System Schemas
 */

export const PipelineStatus = Object.freeze({
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  ABORTED: 'ABORTED',
});

export const StageStatus = Object.freeze({
  IDLE: 'IDLE',
  STREAMING: 'STREAMING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
});

export const OutputFormat = Object.freeze({
  TABLE: 'table',
  TREE: 'tree',
  JSON: 'json',
  NDJSON: 'ndjson',
  SILENT: 'silent',
});

export const StreamEvent = Object.freeze({
  PIPELINE_START: 'pipeline:start',
  STAGE_START: 'stage:start',
  ITEM_PROCESSED: 'item:processed',
  STAGE_END: 'stage:end',
  PIPELINE_END: 'pipeline:end',
  ERROR: 'pipeline:error',
});
