import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as vscode from 'vscode';
import { Option, None, Some } from '@bodil/opt';
import { Path } from '../src/path';
import { FileBrowser, setContext } from '../src/FileBrowser';
import { FileItem } from '../src/fileitem';
import { Action } from '../src/action';
import {
  QuickPickMock,
  getQuickPickMock,
  clearQuickPickMock,
} from './vscode-mock';

describe('FileBrowser', () => {
  let quickPick: QuickPickMock;
  let browser: FileBrowser;
  let path: Path;

  // Helper to setup default mocks and create a FileBrowser
  async function createBrowser(file?: Option<string>): Promise<{ browser: FileBrowser; quickPick: QuickPickMock }> {
    // Mock stat to return a directory by default
    vi.spyOn(vscode.workspace.fs, 'stat').mockResolvedValue({
      type: vscode.FileType.Directory,
      ctime: 0,
      mtime: 0,
      size: 0,
    } as vscode.FileStat);

    // Mock readDirectory to return some sample items
    vi.spyOn(vscode.workspace.fs, 'readDirectory').mockResolvedValue([
      ['file1.txt', vscode.FileType.File],
      ['file2.txt', vscode.FileType.File],
      ['subdir', vscode.FileType.Directory],
    ]);

    // Create the path
    path = Path.fromFilePath('/home/user/test');

    // Create FileBrowser - this internally calls vscode.window.createQuickPick()
    const testBrowser = new FileBrowser(path, file ?? None);

    // Wait for async update to complete
    await new Promise(resolve => setTimeout(resolve, 50));

    // Get the mock that was created
    const testQuickPick = getQuickPickMock();

    return { browser: testBrowser, quickPick: testQuickPick };
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    clearQuickPickMock();
    ({ browser, quickPick } = await createBrowser());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create a FileBrowser instance with the given path and file', () => {
      const path = Path.fromFilePath('/home/user/test');
      const browser = new FileBrowser(path, None);

      expect(browser).toBeInstanceOf(FileBrowser);
      expect(browser.path).toBe(path);
      expect(browser.file).toBe(None);
      expect(quickPick).toBeDefined();
      expect(quickPick.createQuickPickCalled).toBe(true);
    });

    it('should set file when provided', () => {
      const path = Path.fromFilePath('/home/user/test');
      const browser = new FileBrowser(path, Some('selected.txt'));

      expect(browser.file.isSome()).toBe(true);
      expect(browser.file.value).toBe('selected.txt');
    });

    it('should set QuickPick placeholder', () => {
      const path = Path.fromFilePath('/home/user/test');
      const browser = new FileBrowser(path, None);

      expect(browser.current.placeholder).toBe('Preparing the file list...');
    });

    it('should set buttons on QuickPick', () => {
      const path = Path.fromFilePath('/home/user/test');
      const browser = new FileBrowser(path, None);

      expect(quickPick.buttons.length).toBe(3);
      // Check that buttons have icons
      quickPick.buttons.forEach((btn: any) => {
        expect(btn.iconPath).toBeDefined();
        expect(btn.tooltip).toBeDefined();
      });
    });

    it('should register event handlers on QuickPick', () => {
      const path = Path.fromFilePath('/home/user/test');
      const browser = new FileBrowser(path, None);

      expect(quickPick.onDidHide).toBeDefined();
      expect(quickPick.onDidAccept).toBeDefined();
      expect(quickPick.onDidChangeValue).toBeDefined();
      expect(quickPick.onDidTriggerButton).toBeDefined();
    });
  });

  describe('setContext', () => {
    it('should call vscode.commands.executeCommand with correct arguments', () => {
      const executeCommandSpy = vi.spyOn(vscode.commands, 'executeCommand').mockResolvedValue(undefined);

      setContext(true);
      expect(executeCommandSpy).toHaveBeenCalledWith('setContext', 'inFileBrowser', true);

      setContext(false);
      expect(executeCommandSpy).toHaveBeenCalledWith('setContext', 'inFileBrowser', false);
    });
  });

  describe('static instance management', () => {
    it('should return None for activeInstance when no instance is created', () => {
      // Reset the active instance
      const original = (FileBrowser as any).activeInstance;
      (FileBrowser as any).activeInstance = None;

      expect(FileBrowser.getInstance()).toBe(None);

      // Restore
      (FileBrowser as any).activeInstance = original;
    });

    it('should set and get active instance via createInstance', async () => {
      const testPath = Path.fromFilePath('/home/user/instance-test');

      // Clear any existing instance
      (FileBrowser as any).activeInstance = None;

      FileBrowser.createInstance(testPath, None);

      const instance = FileBrowser.getInstance();
      expect(instance.isSome()).toBe(true);
      expect((instance as Option<FileBrowser>).value.path).toBe(testPath);

      // Cleanup
      instance.ifSome((fb: FileBrowser) => fb.dispose());
      (FileBrowser as any).activeInstance = None;
    });
  });

  describe('dispose', () => {
    it('should dispose the QuickPick and clear the active instance', () => {
      expect(quickPick.disposeCalled).toBe(false);

      browser.dispose();

      expect(quickPick.disposeCalled).toBe(true);
      expect(FileBrowser.getInstance()).toBe(None);
    });
  });

  describe('hide and show', () => {
    it('should call hide on QuickPick when hiding', () => {
      browser.hide();

      expect(quickPick.hideCalled).toBe(true);
    });

    it('should call show on QuickPick when showing', () => {
      browser.show();

      expect(quickPick.showCalled).toBe(true);
    });
  });

  describe('onDidChangeValue', () => {
    beforeEach(() => {
      // Setup items for testing
      browser.items = [
        new FileItem(['file1.txt', vscode.FileType.File]),
        new FileItem(['file2.txt', vscode.FileType.File]),
        new FileItem(['subdir', vscode.FileType.Directory]),
      ];
      quickPick.items = browser.items;
    });

    it('should do nothing when inActions is true', () => {
      browser.inActions = true;
      browser.onDidChangeValue('test');
      expect(quickPick.items).toBe(browser.items); // Unchanged
    });

    it('should do nothing when updating is true', () => {
      browser.updating = true;
      browser.onDidChangeValue('test');
      expect(quickPick.items).toBe(browser.items); // Unchanged
    });

    it('should clear items when value is empty string', () => {
      browser.onDidChangeValue('');
      expect(quickPick.items).toBe(browser.items);
      expect(quickPick.activeItems).toEqual([]);
    });

    it('should activate existing item when value matches a name', () => {
      browser.onDidChangeValue('file1.txt');
      expect(quickPick.items).toBe(browser.items);
      expect(quickPick.activeItems.length).toBe(1);
      expect(quickPick.activeItems[0].name).toBe('file1.txt');
    });

    it('should activate non-existing value as new file suggestion', () => {
      browser.onDidChangeValue('newfile.txt');
      expect(quickPick.items.length).toBeGreaterThan(0);
      // First item should be the new file suggestion
      const newFileItem = quickPick.items[0] as FileItem;
      expect(newFileItem.label).toBe('$(new-file) newfile.txt');
      expect(newFileItem.description).toBe('Open as new file');
      expect(newFileItem.action).toBe(Action.NewFile);
    });
  });

  describe('onDidTriggerButton', () => {
    it('should step in when stepInButton is clicked', async () => {
      const stepInSpy = vi.spyOn(browser, 'stepIn').mockResolvedValue(undefined as any);
      browser.onDidTriggerButton(browser.stepInButton);
      expect(stepInSpy).toHaveBeenCalled();
    });

    it('should step out when stepOutButton is clicked', async () => {
      const stepOutSpy = vi.spyOn(browser, 'stepOut').mockResolvedValue(undefined as any);
      browser.onDidTriggerButton(browser.stepOutButton);
      expect(stepOutSpy).toHaveBeenCalled();
    });

    it('should enter actions mode when actionsButton is clicked', async () => {
      const actionsSpy = vi.spyOn(browser, 'actions').mockResolvedValue(undefined as any);
      browser.onDidTriggerButton(browser.actionsButton);
      expect(actionsSpy).toHaveBeenCalled();
    });
  });

  describe('stepIntoFolder', () => {
    it('should update path and call update when folder is different', async () => {
      const updateSpy = vi.spyOn(browser, 'update').mockResolvedValue(undefined as any);
      const newFolder = Path.fromFilePath('/home/user/test/subdir');

      await browser.stepIntoFolder(newFolder);

      expect(browser.path).toBe(newFolder);
      expect(updateSpy).toHaveBeenCalled();
    });

    it('should not update path when folder is the same', async () => {
      const updateSpy = vi.spyOn(browser, 'update').mockResolvedValue(undefined as any);
      const sameFolder = Path.fromFilePath('/home/user/test');

      await browser.stepIntoFolder(sameFolder);

      expect(updateSpy).not.toHaveBeenCalled();
    });
  });

  describe('activeItem', () => {
    it('should return None when no active items', () => {
      const active = browser.activeItem();
      expect(active.isNone()).toBe(true);
    });

    it('should return the first active item', () => {
      const item = new FileItem(['test.txt', vscode.FileType.File]);
      quickPick.activeItems = [item];

      const active = browser.activeItem();
      expect(active.isSome()).toBe(true);
      expect((active as Option<FileItem>).value).toBe(item);
    });
  });

  describe('tabCompletion', () => {
    beforeEach(() => {
      browser.items = [
        new FileItem(['apple.txt', vscode.FileType.File]),
        new FileItem(['banana.txt', vscode.FileType.File]),
        new FileItem(['apricot.txt', vscode.FileType.File]),
      ];
      browser.current.items = browser.items;
      browser.autoCompletion = undefined;
      browser.inActions = false;
    });

    it('should do nothing when inActions is true', () => {
      browser.inActions = true;
      browser.tabCompletion(true);
      expect(quickPick.value).toBe('');
    });

    it('should set value to first matching item on forward tab', () => {
      browser.current.value = 'app';
      browser.tabCompletion(true);

      expect(quickPick.value).toBe('apple.txt');
      expect(browser.autoCompletion).toBeDefined();
      expect(browser.autoCompletion?.index).toBe(0);
    });

    it('should cycle to last matching item on backward tab', () => {
      // 'a' matches apple.txt and apricot.txt (banana.txt does not start with 'a')
      browser.current.value = 'a';
      browser.tabCompletion(false);

      // Should jump to the last matching item
      expect(quickPick.value).toBe('apricot.txt');
      expect(browser.autoCompletion?.index).toBe(1);
    });

    it('should cycle back to first item when backward tab wraps around', () => {
      browser.current.value = 'a';
      browser.tabCompletion(false); // index 1 (apricot.txt)
      browser.tabCompletion(false); // wraps to index 0 (apple.txt)

      expect(quickPick.value).toBe('apple.txt');
      expect(browser.autoCompletion?.index).toBe(0);
    });

    it('should append / to directory on tab completion', () => {
      browser.items = [
        new FileItem(['mydir', vscode.FileType.Directory]),
      ];
      browser.current.value = 'mydir';
      // Prevent the trailing "/" from triggering stepIntoFolder; we only
      // want to test the "/" appending behavior here.
      vi.spyOn(browser, 'stepIntoFolder').mockResolvedValue(undefined as any);
      browser.tabCompletion(true);

      expect(quickPick.value).toBe('mydir/');
    });
  });

  describe('onDidAccept', () => {
    it('should call stepIn when active item is a directory', async () => {
      const dirItem = new FileItem(['mydir', vscode.FileType.Directory]);
      quickPick.activeItems = [dirItem];

      const stepInSpy = vi.spyOn(browser, 'stepIn').mockResolvedValue(undefined as any);

      await browser.onDidAccept();

      expect(stepInSpy).toHaveBeenCalled();
    });

    it('should call openFile when active item is a file', async () => {
      const fileItem = new FileItem(['file.txt', vscode.FileType.File]);
      quickPick.activeItems = [fileItem];

      const openFileSpy = vi.spyOn(browser, 'openFile').mockReturnValue(undefined);

      await browser.onDidAccept();

      expect(openFileSpy).toHaveBeenCalled();
    });

    it('should clear autoCompletion on accept', async () => {
      browser.autoCompletion = { index: 0, items: [] };
      const fileItem = new FileItem(['file.txt', vscode.FileType.File]);
      quickPick.activeItems = [fileItem];

      const openFileSpy = vi.spyOn(browser, 'openFile').mockReturnValue(undefined);

      await browser.onDidAccept();

      expect(browser.autoCompletion).toBeUndefined();
      expect(openFileSpy).toHaveBeenCalled();
    });

    it('should do nothing when no active item', async () => {
      quickPick.activeItems = [];

      // Should not throw
      await browser.onDidAccept();
    });
  });

  describe('actions', () => {
    it('should do nothing when already inActions', async () => {
      browser.inActions = true;
      const updateSpy = vi.spyOn(browser, 'update').mockResolvedValue(undefined as any);

      await browser.actions();

      expect(updateSpy).not.toHaveBeenCalled();
      expect(browser.inActions).toBe(true);
    });

    it('should set inActions and update with no active item', async () => {
      const updateSpy = vi.spyOn(browser, 'update').mockResolvedValue(undefined as any);

      await browser.actions();

      expect(browser.inActions).toBe(true);
      expect(updateSpy).toHaveBeenCalled();
    });

    it('should set inActions and update with active item', async () => {
      const item = new FileItem(['mydir', vscode.FileType.Directory]);
      quickPick.activeItems = [item];

      const updateSpy = vi.spyOn(browser, 'update').mockResolvedValue(undefined as any);

      await browser.actions();

      expect(browser.inActions).toBe(true);
      expect(updateSpy).toHaveBeenCalled();
    });
  });

  describe('stepOut', () => {
    it('should reset inActions', async () => {
      browser.inActions = true;
      const updateSpy = vi.spyOn(browser, 'update').mockResolvedValue(undefined as any);

      await browser.stepOut();

      expect(browser.inActions).toBe(false);
    });

    it('should not update when at root', async () => {
      const rootPath = Path.fromFilePath('/');
      const rootBrowser = new FileBrowser(rootPath, None);

      // Wait for async update
      await new Promise(resolve => setTimeout(resolve, 50));

      const updateSpy = vi.spyOn(rootBrowser, 'update').mockResolvedValue(undefined as any);

      await rootBrowser.stepOut();

      expect(updateSpy).not.toHaveBeenCalled();
    });
  });

  describe('runAction - OpenFile', () => {
    it('should open the selected file', async () => {
      const fileItem = new FileItem(['myfile.txt', vscode.FileType.File]);
      fileItem.action = Action.OpenFile;

      const openFileSpy = vi.spyOn(browser, 'openFile').mockReturnValue(undefined);

      await browser.runAction(fileItem);

      expect(openFileSpy).toHaveBeenCalled();
    });
  });

  describe('runAction - OpenFileBeside', () => {
    it('should open the selected file beside', async () => {
      const fileItem = new FileItem(['myfile.txt', vscode.FileType.File]);
      fileItem.action = Action.OpenFileBeside;

      const openFileSpy = vi.spyOn(browser, 'openFile').mockReturnValue(undefined);

      await browser.runAction(fileItem);

      expect(openFileSpy).toHaveBeenCalled();
    });
  });

  describe('runAction - NewFile', () => {
    it('should open a new untitled file', async () => {
      const fileItem = new FileItem(['newfile.txt', vscode.FileType.File]);
      fileItem.action = Action.NewFile;

      const openFileSpy = vi.spyOn(browser, 'openFile').mockReturnValue(undefined);

      await browser.runAction(fileItem);

      expect(openFileSpy).toHaveBeenCalled();
    });
  });

  describe('runAction - OpenFolder', () => {
    it('should execute vscode.openFolder command', async () => {
      const executeCommandSpy = vi.spyOn(vscode.commands, 'executeCommand').mockResolvedValue(undefined);

      const dirItem = new FileItem(['myfolder', vscode.FileType.Directory]);
      dirItem.action = Action.OpenFolder;

      await browser.runAction(dirItem);

      expect(executeCommandSpy).toHaveBeenCalledWith('vscode.openFolder', path.uri);
    });
  });

  describe('runAction - OpenFolderInNewWindow', () => {
    it('should execute vscode.openFolder command with true argument', async () => {
      const executeCommandSpy = vi.spyOn(vscode.commands, 'executeCommand').mockResolvedValue(undefined);

      const dirItem = new FileItem(['myfolder', vscode.FileType.Directory]);
      dirItem.action = Action.OpenFolderInNewWindow;

      await browser.runAction(dirItem);

      expect(executeCommandSpy).toHaveBeenCalledWith('vscode.openFolder', path.uri, true);
    });
  });

  describe('openFile', () => {
    // openFile chains showTextDocument in a .then() microtask, so the
    // assertions must run after the promise chain has settled.
    function flushMicrotasks(): Promise<void> {
      return new Promise((resolve) => setImmediate(resolve));
    }

    it('should dispose and open the document', async () => {
      const disposeSpy = vi.spyOn(browser, 'dispose').mockReturnValue(undefined);
      const openTextDocSpy = vi.spyOn(vscode.workspace, 'openTextDocument').mockResolvedValue({} as any);
      const showTextDocSpy = vi.spyOn(vscode.window, 'showTextDocument').mockReturnValue({} as any);

      const fileUri = vscode.Uri.file('/home/user/test/myfile.txt');
      browser.openFile(fileUri);
      await flushMicrotasks();

      expect(disposeSpy).toHaveBeenCalled();
      expect(openTextDocSpy).toHaveBeenCalledWith(fileUri);
      expect(showTextDocSpy).toHaveBeenCalledWith({}, vscode.ViewColumn.Active);
    });

    it('should open in beside column when specified', async () => {
      vi.spyOn(browser, 'dispose').mockReturnValue(undefined);
      vi.spyOn(vscode.workspace, 'openTextDocument').mockResolvedValue({} as any);
      const showTextDocSpy = vi.spyOn(vscode.window, 'showTextDocument').mockReturnValue({} as any);

      const fileUri = vscode.Uri.file('/home/user/test/myfile.txt');
      browser.openFile(fileUri, vscode.ViewColumn.Beside);
      await flushMicrotasks();

      expect(showTextDocSpy).toHaveBeenCalledWith({}, vscode.ViewColumn.Beside);
    });
  });

  describe('onDidHide with keepAlive', () => {
    it('should dispose when keepAlive is false', () => {
      browser.keepAlive = false;
      quickPick.emitDidHide();

      expect(quickPick.disposeCalled).toBe(true);
    });

    it('should not dispose when keepAlive is true', () => {
      browser.keepAlive = true;
      quickPick.emitDidHide();

      expect(quickPick.disposeCalled).toBe(false);
    });
  });
});
