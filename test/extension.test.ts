import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as vscode from 'vscode';
import { None, Some, Option } from '@bodil/opt';
import { activate, deactivate } from '../src/extension';
import { Path } from '../src/path';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

/** Tracks calls made to the module-level setContext function. */
let setContextCalls: boolean[] = [];

/** Tracks calls made to FileBrowser.createInstance. */
let createInstanceCalls: Array<{ path: Path; file: unknown }> = [];

/** The current active instance set by createInstance, or null. */
let activeInstanceValue: Option<Path> | null = null;

vi.mock('../src/FileBrowser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/FileBrowser')>();

  // Create a mock browser with stub methods that extension.ts calls on the active instance.
  const createMockBrowser = () => ({
    rename: () => {},
    stepIn: () => {},
    stepOut: () => {},
    actions: () => {},
    tabCompletion: () => {},
  });

  return {
    ...actual,
    FileBrowser: {
      /** Return the current active instance, or None if none set. */
      getInstance(): Option<unknown> {
        if (activeInstanceValue) {
          return activeInstanceValue as Option<unknown>;
        }
        return None as Option<unknown>;
      },

      /** Track createInstance calls and set the active instance. */
      createInstance(path: Path, file: unknown) {
        createInstanceCalls.push({ path, file });
        // Return a proper mock browser object so ifSome callbacks like rename() work.
        activeInstanceValue = Some(createMockBrowser()) as Option<unknown>;
      },
    },
    setContext: (state: boolean) => {
      setContextCalls.push(state);
      if (typeof (actual as Record<string, unknown>).setContext === 'function') {
        (actual as Record<string, unknown>).setContext(state);
      }
    },
  };
});

// Re-import after mocking so the module cache uses our mock
const { FileBrowser } = await vi.importActual('../src/FileBrowser');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Track which commands were registered so test handlers can invoke them later. */
const registerCommandCalls: Array<[string, (...args: any[]) => any]> = [];

/** Create a minimal mock extension context. */
const createMockContext = () => ({
  subscriptions: [] as vscode.Disposable[],
});

/** Reset all mock state before each test. */
const resetMocks = () => {
  setContextCalls = [];
  createInstanceCalls = [];
  activeInstanceValue = null;
};

// ---------------------------------------------------------------------------
// beforeEach / afterEach
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  resetMocks();
  registerCommandCalls.length = 0;

  // Patch vscode.commands.registerCommand so we can inspect command handlers.
  vi.spyOn(vscode.commands, 'registerCommand').mockImplementation(
    (name, handler) => {
      registerCommandCalls.push([name, handler]);
      return { dispose: () => {} } as vscode.Disposable;
    }
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// activate — command registration
// ---------------------------------------------------------------------------

describe('activate', () => {
  it('should register all 7 commands', () => {
    const context = createMockContext();
    activate(context);

    const registeredCommands = registerCommandCalls.map((c) => c[0]);
    expect(registeredCommands).toContain('file-browser.open');
    expect(registeredCommands).toContain('file-browser.rename');
    expect(registeredCommands).toContain('file-browser.stepIn');
    expect(registeredCommands).toContain('file-browser.stepOut');
    expect(registeredCommands).toContain('file-browser.actions');
    expect(registeredCommands).toContain('file-browser.tabNext');
    expect(registeredCommands).toContain('file-browser.tabPrev');
    expect(registerCommandCalls).toHaveLength(7);
  });

  it('should push all command disposables to context.subscriptions', () => {
    const context = createMockContext();
    activate(context);

    expect(context.subscriptions).toHaveLength(7);
  });
});

// ---------------------------------------------------------------------------
// file-browser.open
// ---------------------------------------------------------------------------

describe('file-browser.open', () => {
  it('should create a FileBrowser instance with workspace folder URI when no document', () => {
    const mockUri = vscode.Uri.file('/workspace/root');
    (vscode.workspace.workspaceFolders as unknown as Array<{ uri: {} }>) = [{ uri: mockUri }];
    (vscode.window.activeTextEditor as unknown) = undefined;

    const context = createMockContext();
    activate(context);

    const openHandler = registerCommandCalls.find((c) => c[0] === 'file-browser.open')?.[1];
    openHandler?.();

    expect(createInstanceCalls).toHaveLength(1);
    expect(createInstanceCalls[0].path.fsPath).toBe('/workspace/root');
    expect(createInstanceCalls[0].file).toBe(None);
  });

  it('should fall back to home directory when no workspace and no document', () => {
    (vscode.workspace.workspaceFolders as unknown) = [];
    (vscode.window.activeTextEditor as unknown) = undefined;

    const context = createMockContext();
    activate(context);

    const openHandler = registerCommandCalls.find((c) => c[0] === 'file-browser.open')?.[1];
    openHandler?.();

    expect(createInstanceCalls).toHaveLength(1);
    expect(createInstanceCalls[0].path.fsPath).toBe('/home/mock-user');
  });

  it('should use document path and pop filename when a document is open', () => {
    const mockUri = vscode.Uri.file('/workspace/docs/notes.md');
    (vscode.workspace.workspaceFolders as unknown) = [{ uri: vscode.Uri.file('/workspace') }];
    (vscode.window.activeTextEditor as unknown) = {
      document: { uri: mockUri, isUntitled: false },
    };

    const context = createMockContext();
    activate(context);

    const openHandler = registerCommandCalls.find((c) => c[0] === 'file-browser.open')?.[1];
    openHandler?.();

    expect(createInstanceCalls).toHaveLength(1);
    expect(createInstanceCalls[0].path.fsPath).toBe('/workspace/docs');
    const calledFile = createInstanceCalls[0].file;
    expect(calledFile.isSome()).toBe(true);
    expect(calledFile.value).toBe('notes.md');
  });

  it('should use document path but no filename for untitled documents', () => {
    const mockUri = vscode.Uri.parse('untitled:Untitled-1');
    (vscode.workspace.workspaceFolders as unknown) = [{ uri: vscode.Uri.file('/workspace') }];
    (vscode.window.activeTextEditor as unknown) = {
      document: { uri: mockUri, isUntitled: true },
    };

    const context = createMockContext();
    activate(context);

    const openHandler = registerCommandCalls.find((c) => c[0] === 'file-browser.open')?.[1];
    openHandler?.();

    expect(createInstanceCalls).toHaveLength(1);
    expect(createInstanceCalls[0].file).toBe(None);
  });

  it('should call setContext(true) after creating instance', () => {
    (vscode.workspace.workspaceFolders as unknown) = [{ uri: vscode.Uri.file('/workspace') }];
    (vscode.window.activeTextEditor as unknown) = undefined;

    const context = createMockContext();
    activate(context);

    const openHandler = registerCommandCalls.find((c) => c[0] === 'file-browser.open')?.[1];
    openHandler?.();

    // activate() calls setContext(false) first, then command calls setContext(true)
    expect(setContextCalls).toContain(true);
    expect(setContextCalls[setContextCalls.length - 1]).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// file-browser.rename
// ---------------------------------------------------------------------------

describe('file-browser.rename', () => {
  it('should delegate to active FileBrowser rename()', () => {
    const mockInstance = { rename: vi.fn() };
    // Pre-set an active instance so getInstance() returns Some
    activeInstanceValue = Some(mockInstance) as Option<unknown>;

    const context = createMockContext();
    activate(context);

    const renameHandler = registerCommandCalls.find((c) => c[0] === 'file-browser.rename')?.[1];
    renameHandler?.();

    expect(mockInstance.rename).toHaveBeenCalled();
  });

  it('should create new FileBrowser when no active instance', () => {
    // No active instance set — None branch of chainNone will be taken
    (vscode.workspace.workspaceFolders as unknown) = [{ uri: vscode.Uri.file('/workspace') }];
    (vscode.window.activeTextEditor as unknown) = {
      document: { uri: vscode.Uri.file('/workspace/src/test.ts') },
    };

    const context = createMockContext();
    activate(context);

    const renameHandler = registerCommandCalls.find((c) => c[0] === 'file-browser.rename')?.[1];
    renameHandler?.();

    expect(createInstanceCalls).toHaveLength(1);
    expect(createInstanceCalls[0].path.fsPath).toBe('/workspace/src/test.ts');
  });

  it('should fall back through document -> workspace -> home on rename', () => {
    (vscode.workspace.workspaceFolders as unknown) = [];
    (vscode.window.activeTextEditor as unknown) = undefined;

    const context = createMockContext();
    activate(context);

    const renameHandler = registerCommandCalls.find((c) => c[0] === 'file-browser.rename')?.[1];
    renameHandler?.();

    expect(createInstanceCalls).toHaveLength(1);
    expect(createInstanceCalls[0].path.fsPath).toBe('/home/mock-user');
  });
});

// ---------------------------------------------------------------------------
// Navigation commands (stepIn, stepOut, actions)
// ---------------------------------------------------------------------------

describe('navigation commands', () => {
  const mockActiveBrowser = {
    stepIn: vi.fn(),
    stepOut: vi.fn(),
    actions: vi.fn(),
    tabCompletion: vi.fn(),
  };

  beforeEach(() => {
    activeInstanceValue = Some(mockActiveBrowser) as Option<unknown>;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('stepIn delegates to active instance stepIn()', () => {
    const context = createMockContext();
    activate(context);

    const stepInHandler = registerCommandCalls.find((c) => c[0] === 'file-browser.stepIn')?.[1];
    stepInHandler?.();

    expect(mockActiveBrowser.stepIn).toHaveBeenCalled();
  });

  it('stepOut delegates to active instance stepOut()', () => {
    const context = createMockContext();
    activate(context);

    const stepOutHandler = registerCommandCalls.find((c) => c[0] === 'file-browser.stepOut')?.[1];
    stepOutHandler?.();

    expect(mockActiveBrowser.stepOut).toHaveBeenCalled();
  });

  it('actions delegates to active instance actions()', () => {
    const context = createMockContext();
    activate(context);

    const actionsHandler = registerCommandCalls.find((c) => c[0] === 'file-browser.actions')?.[1];
    actionsHandler?.();

    expect(mockActiveBrowser.actions).toHaveBeenCalled();
  });

  it('no-op when no active instance (stepIn)', () => {
    activeInstanceValue = null;

    const context = createMockContext();
    activate(context);

    const stepInHandler = registerCommandCalls.find((c) => c[0] === 'file-browser.stepIn')?.[1];
    expect(() => stepInHandler?.()).not.toThrow();
  });

  it('no-op when no active instance (stepOut)', () => {
    activeInstanceValue = null;

    const context = createMockContext();
    activate(context);

    const stepOutHandler = registerCommandCalls.find((c) => c[0] === 'file-browser.stepOut')?.[1];
    expect(() => stepOutHandler?.()).not.toThrow();
  });

  it('no-op when no active instance (actions)', () => {
    activeInstanceValue = null;

    const context = createMockContext();
    activate(context);

    const actionsHandler = registerCommandCalls.find((c) => c[0] === 'file-browser.actions')?.[1];
    expect(() => actionsHandler?.()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Tab completion commands (tabNext, tabPrev)
// ---------------------------------------------------------------------------

describe('tab completion commands', () => {
  const mockActiveBrowser = {
    tabCompletion: vi.fn(),
  };

  beforeEach(() => {
    activeInstanceValue = Some(mockActiveBrowser) as Option<unknown>;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('tabNext calls tabCompletion(true)', () => {
    const context = createMockContext();
    activate(context);

    const tabNextHandler = registerCommandCalls.find((c) => c[0] === 'file-browser.tabNext')?.[1];
    tabNextHandler?.();

    expect(mockActiveBrowser.tabCompletion).toHaveBeenCalledWith(true);
  });

  it('tabPrev calls tabCompletion(false)', () => {
    const context = createMockContext();
    activate(context);

    const tabPrevHandler = registerCommandCalls.find((c) => c[0] === 'file-browser.tabPrev')?.[1];
    tabPrevHandler?.();

    expect(mockActiveBrowser.tabCompletion).toHaveBeenCalledWith(false);
  });

  it('no-op when no active instance (tabNext)', () => {
    activeInstanceValue = null;

    const context = createMockContext();
    activate(context);

    const tabNextHandler = registerCommandCalls.find((c) => c[0] === 'file-browser.tabNext')?.[1];
    expect(() => tabNextHandler?.()).not.toThrow();
  });

  it('no-op when no active instance (tabPrev)', () => {
    activeInstanceValue = null;

    const context = createMockContext();
    activate(context);

    const tabPrevHandler = registerCommandCalls.find((c) => c[0] === 'file-browser.tabPrev')?.[1];
    expect(() => tabPrevHandler?.()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// deactivate
// ---------------------------------------------------------------------------

describe('deactivate', () => {
  it('should exit without error', () => {
    const context = createMockContext();
    activate(context);

    expect(() => deactivate()).not.toThrow();
  });
});
