/**
 * StreamForge CLI - Zero-Dependency High-Contrast ANSI Styler
 * High-performance terminal color formatter adhering to NO_COLOR and TTY specifications
 */

const isColorSupported = (() => {
  if (process.env.NO_COLOR || process.env.NODE_DISABLE_COLORS) return false;
  if (process.env.FORCE_COLOR) return true;
  return process.stdout.isTTY ?? false;
})();

function wrap(open, close) {
  return (text) => isColorSupported ? `\x1b[${open}m${text}\x1b[${close}m` : String(text);
}

export const ansi = {
  isColorSupported,

  // Styles
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  italic: wrap(3, 23),
  underline: wrap(4, 24),
  inverse: wrap(7, 27),

  // Standard Foreground Colors (WCAG AAA High Contrast)
  black: wrap(30, 39),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  magenta: wrap(35, 39),
  cyan: wrap(36, 39),
  white: wrap(37, 39),
  gray: wrap(90, 39),

  // Bright Foregrounds
  brightRed: wrap(91, 39),
  brightGreen: wrap(92, 39),
  brightYellow: wrap(93, 39),
  brightBlue: wrap(94, 39),
  brightMagenta: wrap(95, 39),
  brightCyan: wrap(96, 39),
  brightWhite: wrap(97, 39),

  // Background Colors
  bgRed: wrap(41, 49),
  bgGreen: wrap(42, 49),
  bgYellow: wrap(43, 49),
  bgBlue: wrap(44, 49),
  bgMagenta: wrap(45, 49),
  bgCyan: wrap(46, 49),

  // Semantic Shortcuts
  success: (txt) => ansi.green(ansi.bold(txt)),
  warn: (txt) => ansi.yellow(ansi.bold(txt)),
  error: (txt) => ansi.red(ansi.bold(txt)),
  info: (txt) => ansi.cyan(ansi.bold(txt)),
  badge: (label, colorFn) => ` ${colorFn(`[${label}]`)} `,

  // Strip ANSI helper
  strip(text) {
    return String(text).replace(/\x1b\[[0-9;]*m/g, '');
  },
};
