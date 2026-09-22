const uriCache = new Map<string, {}>();

const getOrCreateUri = (path: string) => {
  if (!uriCache.has(path)) {
    const uri: {
      scheme: string;
      authority: string;
      path: string;
      fsPath: string;
      query: string;
      fragment: string;
      toString: (encode?: boolean) => string;
      with: (change: { scheme?: string; authority?: string; path?: string; query?: string; fragment?: string }) => {};
    } = {
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

export const Uri = {
  file: (path: string) => getOrCreateUri(path),
  parse: (str: string) => {
    const pathStr = str.replace('file://', '');
    return getOrCreateUri(pathStr);
  },
  joinPath: (base: {}, ...segments: string[]) => {
    const basePath = (base as { path: string }).path;
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
};

export const FileType = {
  File: 1,
  Directory: 2,
  SymbolicLink: 64,
};

export const WorkspaceFolder = class {};

export const FileSystemError = {
  FileNotFound: (uri?: {}) => ({ name: 'FileSystemError', message: 'File not found', uri }),
  FileNotADirectory: (uri?: {}) => ({ name: 'FileSystemError', message: 'Not a directory', uri }),
};

export const window = {
  createQuickPick: () => ({}),
  showQuickPick: () => Promise.resolve(undefined),
};

export const workspace = {
  getConfiguration: () => {
    const mockConfig: { _values: Map<string, unknown> } = {
      _values: new Map(),
    };
    const mockWsConfig = {
      get: (key: string) => mockConfig._values.get(key),
      update: () => Promise.resolve(),
      has: () => false,
      inspect: () => undefined,
      _values: mockConfig._values,
    };
    return mockWsConfig;
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
};

export const commands = {
  executeCommand: () => Promise.resolve(),
  registerCommand: () => ({ dispose: () => {} }),
  registerProvider: () => ({ dispose: () => {} }),
};

class DisposableClass {
  static from(...disposableLike: { dispose: () => any }[]) {
    const cls = class extends DisposableClass {
      constructor() { super(() => {}); }
    };
    return new cls();
  }
  constructor(_dispose: () => any) {}
  dispose() {}
  combine(other: DisposableClass) { return this; }
}

export { DisposableClass as Disposable };

export const Event = class {};

export class EventEmitter {
  event: () => void;
  fire: () => void;
  dispose: () => void;

  constructor() {
    this.event = () => {};
    this.fire = () => {};
    this.dispose = () => {};
  }
}

export const ThemeIcon = class {
  id: string;
  color?: {};
  constructor(id: string, color?: {}) {
    this.id = id;
    this.color = color;
  }
};

export const QuickInputButton = class {};

export const QuickPickItem = class {};

// Export all named exports as a namespace for `import * as vscode from 'vscode'`
export default {
  Uri,
  FileType,
  WorkspaceFolder,
  FileSystemError,
  window,
  workspace,
  commands,
  Disposable: DisposableClass,
  Event,
  EventEmitter,
  ThemeIcon,
  QuickInputButton,
  QuickPickItem,
};
