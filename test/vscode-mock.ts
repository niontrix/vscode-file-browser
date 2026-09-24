import { EventEmitter as VSEventEmitter, Event } from 'vscode';

// ==================== EventEmitter Mock ====================

export class EventEmitter<T> {
  private listeners: Array<(e: T) => void> = [];
  event: (listener: (e: T) => void, thisArg?: any) => { dispose: () => void };
  fire: (e: T) => void;
  dispose: () => void;

  constructor() {
    this.event = (listener: (e: T) => void, thisArg?: any) => {
      const bound = thisArg ? listener.bind(thisArg) : listener;
      this.listeners.push(bound);
      return {
        dispose: () => {
          this.listeners = this.listeners.filter((l) => l !== bound);
        },
      };
    };
    this.fire = (e: T) => {
      // Copy so listeners can dispose themselves during firing.
      for (const listener of [...this.listeners]) {
        listener(e);
      }
    };
    this.dispose = () => {
      this.listeners = [];
    };
  }
}

// ==================== QuickPick Mock ====================

export interface QuickPickMock {
  disposeCalled: boolean;
  showCalled: boolean;
  hideCalled: boolean;
  ignoreFocusOut: boolean;
  buttons: any[];
  placeholder: string;
  busy: boolean;
  title: string;
  value: string;
  enabled: boolean;
  items: any[];
  activeItems: any[];
  onDidHide: any;
  onDidAccept: any;
  onDidChangeValue: any;
  onDidTriggerButton: any;
  emitDidHide: () => void;
  emitDidAccept: () => void;
  emitDidChangeValue: (value: string) => void;
  emitDidTriggerButton: (button: any) => void;
  dispose: () => void;
  show: () => void;
  hide: () => void;
  createQuickPickCalled: boolean;
}

const quickPickInstances: QuickPickMock[] = [];

class QuickPickMockImpl implements QuickPickMock {
  disposeCalled = false;
  showCalled = false;
  hideCalled = false;
  createQuickPickCalled = true;
  ignoreFocusOut = false;
  buttons: any[] = [];
  placeholder = '';
  busy = false;
  title = '';
  value = '';
  enabled = true;
  items: any[] = [];
  activeItems: any[] = [];

  _onDidHide = new VSEventEmitter<any>();
  _onDidAccept = new VSEventEmitter<any>();
  _onDidChangeValue = new VSEventEmitter<string>();
  _onDidTriggerButton = new VSEventEmitter<any>();

  onDidHide: any = this._onDidHide.event;
  onDidAccept: any = this._onDidAccept.event;
  onDidChangeValue: any = this._onDidChangeValue.event;
  onDidTriggerButton: any = this._onDidTriggerButton.event;

  emitDidHide() { this._onDidHide.fire(undefined); }
  emitDidAccept() { this._onDidAccept.fire(undefined); }
  emitDidChangeValue(value: string) { this._onDidChangeValue.fire(value); }
  emitDidTriggerButton(button: any) { this._onDidTriggerButton.fire(button); }

  dispose() {
    this.disposeCalled = true;
  }

  show() {
    this.showCalled = true;
  }

  hide() {
    this.hideCalled = true;
  }
}

export function getQuickPickMock(): QuickPickMock {
  return quickPickInstances[quickPickInstances.length - 1];
}

export function clearQuickPickMock() {
  quickPickInstances.length = 0;
}

export function createQuickPick(): QuickPickMock {
  const qp = new QuickPickMockImpl();
  quickPickInstances.push(qp);
  return qp;
}

// ==================== URI & Types ====================

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

export const ViewColumn = {
  Active: -1,
  Beside: -2,
};

export const WorkspaceFolder = class {};

export const FileSystemError = {
  FileNotFound: (uri?: {}) => ({ name: 'FileSystemError', message: 'File not found', uri }),
  FileNotADirectory: (uri?: {}) => ({ name: 'FileSystemError', message: 'Not a directory', uri }),
};

export const window = {
  createQuickPick: () => createQuickPick(),
  showQuickPick: () => Promise.resolve(undefined),
  showTextDocument: () => Promise.resolve({}),
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
    readDirectory: () => Promise.resolve([]),
    delete: () => Promise.resolve(),
    copy: () => Promise.resolve(),
    move: () => Promise.resolve(),
    exists: () => Promise.resolve(false),
  },
  openTextDocument: () => Promise.resolve({}),
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

export const ThemeIcon = class {
  id: string;
  color?: any;
  constructor(id: string, color?: any) {
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
