import { vi } from 'vitest';

// Cache for URI objects - same path always returns same object
const uriCache = new Map<string, {}>();

const getOrCreateUri = (path: string): {} => {
  if (!uriCache.has(path)) {
    const uri = {
      scheme: 'file',
      authority: '',
      path,
      fsPath: path,
      query: '',
      fragment: '',
      toString: (_encode?: boolean) => path,
      with: (change: { scheme?: string; authority?: string; path?: string; query?: string; fragment?: string }) => {
        const newPath = change.path ?? path;
        return getOrCreateUri(newPath);
      },
    };
    uriCache.set(path, uri);
  }
  return uriCache.get(path)!;
};

// Mock @bodil/opt module
vi.mock('@bodil/opt', () => {
  const createOption = (result: unknown) => ({
    result,
    value: result,
    isSome: () => result !== undefined && result !== null,
    isNone: () => result === undefined || result === null,
    unwrap: () => {
      if (result === undefined || result === null) {
        throw new Error('Attempt to unwrap None');
      }
      return result;
    },
    match: (someFn: (val: unknown) => unknown, noneFn: () => unknown) => {
      return (result === undefined || result === null) ? noneFn() : someFn(result);
    },
    ifSome: (fn: (val: unknown) => void) => {
      if (result !== undefined && result !== null) {
        fn(result);
      }
    },
    orDefault: (dflt: unknown) => (result === undefined || result === null) ? dflt : result,
    getOrElse: (fn: () => unknown) => (result === undefined || result === null) ? fn() : result,
    map: (fn: (val: unknown) => unknown) => {
      if (result !== undefined && result !== null) {
        return createOption(fn(result));
      }
      return None;
    },
  });

  const Some = (value: unknown) => createOption(value);
  const None = createOption(null);
  const Option = { from: (val: unknown) => (val === undefined || val === null) ? None : Some(val) };

  const createResult = (result: unknown, error?: unknown) => ({
    result,
    error,
    isOk: () => error === undefined || error === null,
    isErr: () => error !== undefined && error !== null,
    unwrap: () => {
      if (error !== undefined && error !== null) {
        throw error;
      }
      return result;
    },
    unwrapErr: () => {
      if (result === undefined || result === null) {
        throw new Error('Attempt to unwrap Ok error');
      }
      return error;
    },
    match: (okFn: (val: unknown) => unknown, errFn: (err: unknown) => unknown) => {
      return (error !== undefined && error !== null) ? errFn(error) : okFn(result);
    },
    await: async (promise: Promise<unknown>) => {
      try {
        const val = await promise;
        return createResult(val, undefined);
      } catch (err) {
        return createResult(undefined, err);
      }
    },
  });

  const Ok = (value: unknown) => createResult(value, undefined);
  const Err = (error: unknown) => createResult(undefined, error);

  return { Some, None, Option, Ok, Err, Result: { await: async (promise: Promise<unknown>) => {
    try {
      const val = await promise;
      return createResult(val, undefined);
    } catch (err) {
      return createResult(undefined, err);
    }
  }} };
});

// Mock 'path' module (node:path)
vi.mock('path', () => {
  const actualPath = require('path');
  return {
    ...actualPath,
    basename: (p: string, ext?: string) => actualPath.basename(p, ext),
    join: (...paths: string[]) => actualPath.join(...paths),
    relative: (from: string, to: string) => actualPath.relative(from, to),
    sep: actualPath.sep,
  };
});

// Mock 'ignore' module - provides gitignore-like pattern matching
vi.mock('ignore', () => {
  interface IgnoreEntry {
    pattern: string;
    isDir: boolean;
  }

  class IgnoreMock {
    private entries: IgnoreEntry[] = [];

    add(pattern: string | string[] | IgnoreEntry[]): IgnoreMock {
      const patterns = Array.isArray(pattern) ? pattern : [pattern];
      for (const p of patterns) {
        if (typeof p === 'string') {
          this.entries.push({ pattern: p, isDir: false });
        } else if (Array.isArray(p)) {
          this.entries.push(...p.map((s) => ({ pattern: s, isDir: false })));
        } else {
          this.entries.push(p);
        }
      }
      return this;
    }

    test(path: string): { ignored: boolean; path: string } {
      for (const entry of this.entries) {
        const regexPattern = this.ignorePatternToRegex(entry.pattern);
        const regex = new RegExp(regexPattern);
        if (regex.test(path)) {
          return { ignored: true, path };
        }
      }
      return { ignored: false, path };
    }

    private ignorePatternToRegex(pattern: string): string {
      // Normalize the pattern
      let normalized = pattern;

      // Handle leading slashes (treated as anchored to root)
      const anchored = normalized.startsWith('/');
      if (anchored) {
        normalized = normalized.slice(1);
      }

      // Handle trailing slashes (directory-only patterns in gitignore)
      const dirOnly = normalized.endsWith('/');
      if (dirOnly) {
        normalized = normalized.slice(0, -1);
      }

      // Escape regex special characters except * and ?
      const regex = normalized
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '%%DOUBLESTAR%%')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '[^/]')
        .replace(/%%DOUBLESTAR%%/g, '.*');

      if (anchored) {
        if (dirOnly) {
          return '^' + regex + '/';
        }
        return '^' + regex + '$';
      }
      // For unanchored patterns:
      // - Directory patterns (e.g., `node_modules/`) should match the dir and anything inside it
      // - File patterns (e.g., `*.log`) should match exact filenames anywhere in the path
      if (dirOnly) {
        return '(?:^|/)' + regex + '/';
      }
      return '(?:^|/)' + regex + '$';
    }
  }

  return {
    default: () => new IgnoreMock(),
    Ignore: IgnoreMock,
  };
});
