/**
 * StreamForge CLI - Structured Deterministic Terminal Logger
 * Zero-telemetry, clean formatted output with level filtering and quiet modes
 */

import { ansi } from './ansi-styler.js';

export const LogLevel = Object.freeze({
  SILENT: 0,
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4,
  TRACE: 5,
});

export class Logger {
  constructor(level = LogLevel.INFO) {
    this.level = typeof level === 'number' ? level : LogLevel[level?.toUpperCase()] ?? LogLevel.INFO;
  }

  setLevel(level) {
    this.level = typeof level === 'number' ? level : LogLevel[level?.toUpperCase()] ?? LogLevel.INFO;
  }

  error(msg, ...args) {
    if (this.level < LogLevel.ERROR) return;
    const badge = ansi.bgRed(ansi.bold(' ERR '));
    console.error(`${badge} ${ansi.red(msg)}`, ...args);
  }

  warn(msg, ...args) {
    if (this.level < LogLevel.WARN) return;
    const badge = ansi.bgYellow(ansi.bold(' WRN '));
    console.warn(`${badge} ${ansi.yellow(msg)}`, ...args);
  }

  info(msg, ...args) {
    if (this.level < LogLevel.INFO) return;
    const badge = ansi.bgBlue(ansi.bold(' INF '));
    console.log(`${badge} ${msg}`, ...args);
  }

  success(msg, ...args) {
    if (this.level < LogLevel.INFO) return;
    const badge = ansi.bgGreen(ansi.bold(' OK  '));
    console.log(`${badge} ${ansi.green(msg)}`, ...args);
  }

  debug(msg, ...args) {
    if (this.level < LogLevel.DEBUG) return;
    const badge = ansi.bgMagenta(ansi.bold(' DBG '));
    console.log(`${badge} ${ansi.dim(msg)}`, ...args);
  }

  trace(msg, ...args) {
    if (this.level < LogLevel.TRACE) return;
    const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
    console.log(`${ansi.gray(`[${timestamp}]`)} ${ansi.dim(msg)}`, ...args);
  }

  raw(msg) {
    if (this.level > LogLevel.SILENT) {
      process.stdout.write(msg + '\n');
    }
  }
}

export const logger = new Logger();
