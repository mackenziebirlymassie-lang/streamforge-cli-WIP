/**
 * StreamForge CLI - High-Speed Glob Pattern Matcher
 * Zero-dependency streaming glob evaluator supporting double-star recursion and brace expansions
 */

export class GlobMatcher {
  constructor(patterns = ['*']) {
    this.rawPatterns = Array.isArray(patterns) ? patterns : [patterns];
    this.includeRegexes = [];
    this.excludeRegexes = [];
    this._compile();
  }

  _compile() {
    for (const pattern of this.rawPatterns) {
      if (!pattern || typeof pattern !== 'string') continue;
      const isNegative = pattern.startsWith('!');
      const cleanPattern = isNegative ? pattern.slice(1) : pattern;
      const regex = this._globToRegex(cleanPattern);

      if (isNegative) {
        this.excludeRegexes.push(regex);
      } else {
        this.includeRegexes.push(regex);
      }
    }
  }

  _globToRegex(pattern) {
    let normalized = pattern.replace(/\\/g, '/');

    // Handle brace expansions {jpg,png} by marking with non-printable tokens
    normalized = normalized.replace(/\{([^{}]+)\}/g, (_, group) => {
      const options = group.split(',').map(s => s.trim());
      return `\u0001${options.join('\u0002')}\u0003`;
    });

    let regexStr = '^';
    let i = 0;
    const len = normalized.length;

    while (i < len) {
      const c = normalized[i];

      if (c === '\u0001') {
        regexStr += '(?:';
        i++;
        continue;
      } else if (c === '\u0002') {
        regexStr += '|';
        i++;
        continue;
      } else if (c === '\u0003') {
        regexStr += ')';
        i++;
        continue;
      }

      if (c === '*') {
        if (normalized[i + 1] === '*') {
          // Globstar **
          if (normalized[i + 2] === '/') {
            regexStr += '(?:.*?/|)';
            i += 3;
            continue;
          } else {
            regexStr += '.*';
            i += 2;
            continue;
          }
        } else {
          // Single star * (matches within directory)
          regexStr += '[^/]*';
          i++;
          continue;
        }
      } else if (c === '?') {
        regexStr += '[^/]';
        i++;
        continue;
      } else if (c === '.' || c === '(' || c === ')' || c === '+' || c === '|' || c === '^' || c === '$') {
        regexStr += `\\${c}`;
        i++;
        continue;
      } else if (c === '/') {
        regexStr += '\\/';
        i++;
        continue;
      } else {
        regexStr += c;
        i++;
      }
    }

    regexStr += '$';
    return new RegExp(regexStr);
  }

  test(path) {
    const normalized = path.replace(/\\/g, '/').replace(/^\.\//, '');

    // Check exclusion first
    for (const exRegex of this.excludeRegexes) {
      if (exRegex.test(normalized)) {
        return false;
      }
    }

    // If no include patterns specified, default to match all
    if (this.includeRegexes.length === 0) {
      return true;
    }

    // Must match at least one include pattern
    for (const inRegex of this.includeRegexes) {
      if (inRegex.test(normalized)) {
        return true;
      }
    }

    return false;
  }
}

export function matchGlob(path, pattern) {
  const matcher = new GlobMatcher(pattern);
  return matcher.test(path);
}
