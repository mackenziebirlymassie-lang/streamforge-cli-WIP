/**
 * StreamForge CLI - Flicker-Free Terminal Progress Ticker
 * Lightweight non-blocking terminal spinner & status monitor for high-speed streaming
 */

import { ansi } from './ansi-styler.js';

export class ProgressTicker {
  constructor(options = {}) {
    this.stream = options.stream || process.stdout;
    this.isTTY = Boolean(this.stream.isTTY);
    this.intervalMs = options.intervalMs || 80;
    this.frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    this.frameIndex = 0;
    this.currentText = '';
    this.timer = null;
    this.isActive = false;
  }

  start(initialText = 'Processing pipeline stream...') {
    this.currentText = initialText;
    if (!this.isTTY) return this;

    this.isActive = true;
    this.timer = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
      this._render();
    }, this.intervalMs);

    this._render();
    return this;
  }

  update(text) {
    this.currentText = text;
    if (this.isTTY && this.isActive) {
      this._render();
    }
  }

  _render() {
    if (!this.isTTY) return;
    const spinner = ansi.cyan(this.frames[this.frameIndex]);
    const line = `\r${spinner} ${this.currentText}`;
    this.stream.write(line);
  }

  stop(finalMessage = null) {
    if (!this.isActive) return;
    this.isActive = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (this.isTTY) {
      // Clear current spinner line completely
      this.stream.write('\r\x1b[2K');
      if (finalMessage) {
        this.stream.write(`${finalMessage}\n`);
      }
    }
  }
}
