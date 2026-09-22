import { vi } from 'vitest';

// Cache for URI objects - same path always returns same object
const uriCache = new Map<string, vscode.Uri>();

const getOrCreateUri = (path: string): vscode.Uri => {
  if (!uriCache.has(path)) {
    const uri: vscode.Uri = {
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

// Mock vscode module
vi.mock('vscode', () => ({
  Uri: {
    file: (path: string): vscode.Uri => getOrCreateUri(path),
    parse: (str: string): vscode.Uri => {
      // Simple parse: extract path from file:///...
      const pathStr = str.replace('file://', '');
      return getOrCreateUri(pathStr);
    },
    joinPath: (base: vscode.Uri, ...segments: string[]): vscode.Uri => {
      const basePath = base.path;
      // VS Code Uri.joinPath normalizes . and .. segments
      const allParts = [basePath, ...segments].join('/').split('/').filter(Boolean);
      const stack: string[] = [];
      for (const part of allParts) {
        if (part === '..') {
          stack.pop();
        } else if (part !== '.' && part !== '') {
          stack.push(part);
        }
      }
      const newPath = '/' + stack.join('/');
      return getOrCreateUri(newPath);
    },
  },
  FileType: {
    File: 1,
    Directory: 2,
    SymbolicLink: 64,
  },
  WorkspaceFolder: class {},
  FileSystemError: {
    FileNotFound: (uri?: any) => ({ name: 'FileSystemError', message: 'File not found', uri }),
    FileNotADirectory: (uri?: any) => ({ name: 'FileSystemError', message: 'Not a directory', uri }),
  },
  window: {
    createQuickPick: () => ({}),
    showQuickPick: () => Promise.resolve(undefined),
  },
  workspace: {
    getConfiguration: () => {
      // Return a mock WorkspaceConfiguration with a controllable get method
      const mockConfig: { _values: Map<string, unknown> } = {
        _values: new Map(),
      };
      const mockWsConfig = {
        get: vi.fn((key: string) => mockConfig._values.get(key)),
        update: vi.fn(() => Promise.resolve()),
        has: vi.fn(() => false),
        inspect: vi.fn(() => undefined),
      };
      // Attach the _values map to the mock so tests can set values
      Object.defineProperty(mockWsConfig, '_values', {
        value: mockConfig._values,
        writable: true,
        configurable: true,
      });
      return mockWsConfig as any;
    },
    getWorkspaceFolder: () => null,
    fs: {
      stat: () => Promise.reject({ name: 'FileSystemError' }),
      readFile: () => Promise.resolve(Buffer.from('')),
      writeFile: () => Promise.resolve(),
      mkdir: () => Promise.resolve(),
      readdir: () => Promise.resolve([]),
      delete: () => Promise.resolve(),
      copy: () => Promise.resolve(),
      move: () => Promise.resolve(),
      exists: () => Promise.resolve(false),
    },
    folders: [],
    hasWorkspaceFolder: () => false,
    updateWorkspaceFolders: () => false,
  },
  commands: {
    executeCommand: () => Promise.resolve(),
    registerCommand: () => ({ dispose: () => {} }),
    registerProvider: () => ({ dispose: () => {} }),
  },
  Disposable: class {
    static from(...disposableLike: { dispose: () => any }[]) {
      return new class extends vscode.Disposable {
        constructor() { super(() => {}); }
      };
    }
    constructor(_dispose: () => any) {}
    dispose() {}
    combine(other: vscode.Disposable) { return this; }
  },
  Event: class {},
  EventEmitter: class {
    event = vi.fn();
    fire = vi.fn();
    dispose = vi.fn();
  },
  ThemeIcon: class {
    constructor(public id: string, public color?: any) {}
  },
  QuickInputButton: class {},
  QuickPickItem: class {},
}));

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
