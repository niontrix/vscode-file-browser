import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { Uri } from 'vscode';
import { Path } from '../src/path';
import { Rules } from '../src/filter';
import { FileItem, itemIsDir } from '../src/fileitem';
import * as extensionModule from '../src/extension';

describe('Rules', () => {
  const testRoot = '/home/user/project';
  const ignoreFileUri = Uri.file(`${testRoot}/.gitignore`);
  const ignoreFileContent = `# Comment line
node_modules/
*.log
build/
.env
dist`;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the mock configuration values
    const mockConfig = (vscode.workspace.getConfiguration() as any)._values;
    if (mockConfig) {
      mockConfig.clear();
    }
  });

  describe('constructor', () => {
    it('should create an empty rules instance', () => {
      // Rules constructor is private, use forPath factory
      const path = Rules.forPath(Path.fromFilePath(testRoot));
      // We can't directly test the constructor since it's private,
      // but forPath with undefined config creates empty rules
    });
  });

  describe('forPath', () => {
    it('should return empty rules when IgnoreFileTypes config is undefined', async () => {
      const configSpy = vi.spyOn(extensionModule, 'config').mockReturnValue(undefined);

      const path = Path.fromFilePath(testRoot);
      const rules = await Rules.forPath(path);

      expect(rules).toBeDefined();
      expect(configSpy).toHaveBeenCalledWith('ignoreFileTypes');
    });

    it('should return empty rules when no ignore file is found', async () => {
      vi.spyOn(extensionModule, 'config').mockReturnValue(['.gitignore']);

      // Make sure lookUpwards returns Err (file not found)
      // The mock for vscode.workspace.fs.stat already rejects with FileSystemError
      const path = Path.fromFilePath(testRoot);
      const rules = await Rules.forPath(path);

      expect(rules).toBeDefined();
    });

    it('should read rules when ignore file exists', async () => {
      vi.spyOn(extensionModule, 'config').mockReturnValue(['.gitignore']);
      const readFileSpy = vi.spyOn(vscode.workspace.fs, 'readFile').mockResolvedValue(
        Buffer.from(ignoreFileContent)
      );
      vi.spyOn(vscode.workspace.fs, 'stat').mockResolvedValue({
        type: vscode.FileType.Directory,
        ctime: 0,
        mtime: 0,
        size: 0,
      } as any);

      const path = Path.fromFilePath(testRoot);
      const rules = await Rules.forPath(path);

      expect(rules).toBeDefined();
      expect(readFileSpy).toHaveBeenCalledWith(
        expect.objectContaining({ path: ignoreFileUri.path })
      );
    });
  });

  describe('read', () => {
    it('should parse ignore file content correctly', async () => {
      vi.spyOn(vscode.workspace.fs, 'readFile').mockResolvedValue(
        Buffer.from(ignoreFileContent)
      );

      const rules = await Rules.read(ignoreFileUri);

      expect(rules).toBeDefined();
    });

    it('should handle empty ignore file', async () => {
      vi.spyOn(vscode.workspace.fs, 'readFile').mockResolvedValue(Buffer.from(''));

      const rules = await Rules.read(ignoreFileUri);

      expect(rules).toBeDefined();
    });

    it('should handle ignore file with only comments', async () => {
      const commentsOnly = `# This is a comment
# Another comment`;
      vi.spyOn(vscode.workspace.fs, 'readFile').mockResolvedValue(Buffer.from(commentsOnly));

      const rules = await Rules.read(ignoreFileUri);

      expect(rules).toBeDefined();
    });

    it('should handle ignore file with blank lines', async () => {
      const withBlanks = `

node_modules/

*.log

`;
      vi.spyOn(vscode.workspace.fs, 'readFile').mockResolvedValue(Buffer.from(withBlanks));

      const rules = await Rules.read(ignoreFileUri);

      expect(rules).toBeDefined();
    });

    it('should handle windows-style line endings', async () => {
      const windowsNewlines = 'node_modules/\r\n*.log\r\nbuild/\r\n';
      vi.spyOn(vscode.workspace.fs, 'readFile').mockResolvedValue(Buffer.from(windowsNewlines));

      const rules = await Rules.read(ignoreFileUri);

      expect(rules).toBeDefined();
    });
  });

  describe('filter', () => {
    it('should return all items when no rules are defined', async () => {
      const path = Path.fromFilePath(testRoot);
      const rules = await Rules.forPath(path);

      const items: FileItem[] = [
        new FileItem(['file1.txt', vscode.FileType.File]),
        new FileItem(['dir1', vscode.FileType.Directory]),
        new FileItem(['file2.js', vscode.FileType.File]),
      ];

      const filtered = rules.filter(path, items);

      expect(filtered).toEqual(items);
    });

    it('should not filter when ignore file is not found', async () => {
      const path = Path.fromFilePath(testRoot);
      const rules = await Rules.forPath(path);

      // Add a rule but don't set up config - filter should still work
      const items: FileItem[] = [
        new FileItem(['file1.txt', vscode.FileType.File]),
        new FileItem(['node_modules', vscode.FileType.Directory]),
      ];

      const filtered = rules.filter(path, items);

      // With empty rules, nothing should be filtered
      expect(filtered.length).toBe(items.length);
    });

    it('should mark ignored directories', async () => {
      const path = Path.fromFilePath(testRoot);
      const rules = await Rules.forPath(path);
      rules.add(['node_modules/', 'build/', 'dist/']);

      const items: FileItem[] = [
        new FileItem(['node_modules', vscode.FileType.Directory]),
        new FileItem(['src', vscode.FileType.Directory]),
        new FileItem(['build', vscode.FileType.Directory]),
      ];

      const filtered = rules.filter(path, items);

      const nodeModulesItem = filtered.find((i) => i.name === 'node_modules');
      const srcItem = filtered.find((i) => i.name === 'src');
      const buildItem = filtered.find((i) => i.name === 'build');

      expect(nodeModulesItem).toBeDefined();
      expect(nodeModulesItem!.alwaysShow).toBe(false);
      expect(srcItem).toBeDefined();
      expect(srcItem!.alwaysShow).toBe(true);
      expect(buildItem).toBeDefined();
      expect(buildItem!.alwaysShow).toBe(false);
    });

    it('should mark ignored files by extension', async () => {
      const path = Path.fromFilePath(testRoot);
      const rules = await Rules.forPath(path);
      rules.add(['*.log']);

      const items: FileItem[] = [
        new FileItem(['error.log', vscode.FileType.File]),
        new FileItem(['debug.log', vscode.FileType.File]),
        new FileItem(['output.txt', vscode.FileType.File]),
        new FileItem(['app.js', vscode.FileType.File]),
      ];

      const filtered = rules.filter(path, items);

      const logItem = filtered.find((i) => i.name === 'error.log');
      const txtItem = filtered.find((i) => i.name === 'output.txt');

      expect(logItem).toBeDefined();
      expect(logItem!.alwaysShow).toBe(false);
      expect(txtItem).toBeDefined();
      expect(txtItem!.alwaysShow).toBe(true);
    });

    it('should mark ignored files by name', async () => {
      const path = Path.fromFilePath(testRoot);
      const rules = await Rules.forPath(path);
      rules.add(['.env']);

      const items: FileItem[] = [
        new FileItem(['.env', vscode.FileType.File]),
        new FileItem(['.env.production', vscode.FileType.File]),
        new FileItem(['config.env', vscode.FileType.File]),
      ];

      const filtered = rules.filter(path, items);

      const envItem = filtered.find((i) => i.name === '.env');
      expect(envItem).toBeDefined();
      expect(envItem!.alwaysShow).toBe(false);
    });

    it('should set description when LabelIgnoredFiles is enabled', async () => {
      vi.spyOn(extensionModule, 'config')
        .mockImplementation((key) => {
          if (key === 'labelIgnoredFiles') {
            return true;
          }
          return 'src';
        });

      const path = Path.fromFilePath(testRoot);
      const rules = await Rules.forPath(path);
      rules.name = '.gitignore';
      rules.add(['node_modules/']);

      const items: FileItem[] = [
        new FileItem(['node_modules', vscode.FileType.Directory]),
      ];

      const filtered = rules.filter(path, items);

      const nodeModulesItem = filtered[0];
      expect(nodeModulesItem!.description).toBe('(in .gitignore)');
    });

    it('should not set description when LabelIgnoredFiles is disabled', async () => {
      vi.spyOn(extensionModule, 'config')
        .mockImplementation((key) => {
          if (key === 'labelIgnoredFiles') {
            return false;
          }
          return 'src';
        });

      const path = Path.fromFilePath(testRoot);
      const rules = await Rules.forPath(path);
      rules.name = '.gitignore';
      rules.add(['node_modules/']);

      const items: FileItem[] = [
        new FileItem(['node_modules', vscode.FileType.Directory]),
      ];

      const filtered = rules.filter(path, items);

      const nodeModulesItem = filtered[0];
      expect(nodeModulesItem!.alwaysShow).toBe(false);
      expect(nodeModulesItem!.description).toBeUndefined();
    });

    it('should not modify non-ignored items', async () => {
      const path = Path.fromFilePath(testRoot);
      const rules = await Rules.forPath(path);
      rules.add(['ignored/']);

      const items: FileItem[] = [
        new FileItem(['src', vscode.FileType.Directory]),
        new FileItem(['README.md', vscode.FileType.File]),
      ];

      const originalItems = items.map((i) => ({
        name: i.name,
        alwaysShow: i.alwaysShow,
        description: i.description,
      }));

      const filtered = rules.filter(path, items);

      const srcItem = filtered.find((i) => i.name === 'src');
      expect(srcItem!.alwaysShow).toBe(originalItems[0].alwaysShow);
    });

    it('should handle relative path calculation correctly', async () => {
      // Test with base path that differs from rules path
      const rulesPath = Path.fromFilePath('/home/user/project');
      const base = Path.fromFilePath('/home/user/project/src');

      const rules = await Rules.forPath(rulesPath);
      rules.add(['../temp/', '*.tmp']);

      const items: FileItem[] = [
        new FileItem(['temp', vscode.FileType.Directory]),
        new FileItem(['app.js', vscode.FileType.File]),
      ];

      // This should not throw when computing relative paths
      expect(() => rules.filter(base, items)).not.toThrow();
    });

    it('should preserve item properties after filtering', async () => {
      const path = Path.fromFilePath(testRoot);
      const rules = await Rules.forPath(path);

      const items: FileItem[] = [
        new FileItem(['src', vscode.FileType.Directory]),
        new FileItem(['test.js', vscode.FileType.File]),
      ];

      const filtered = rules.filter(path, items);

      // Verify all items are preserved with their properties
      expect(filtered.length).toBe(2);
      expect(filtered.every((f) => f.fileType !== undefined)).toBe(true);
    });
  });

  describe('integration with FileItem', () => {
    it('should correctly identify directory items in filter output', async () => {
      const path = Path.fromFilePath(testRoot);
      const rules = await Rules.forPath(path);
      rules.add(['node_modules/', 'dist/']);

      const items: FileItem[] = [
        new FileItem(['node_modules', vscode.FileType.Directory]),
        new FileItem(['src', vscode.FileType.Directory]),
        new FileItem(['index.js', vscode.FileType.File]),
      ];

      const filtered = rules.filter(path, items);

      for (const item of filtered) {
        if (item.name === 'node_modules') {
          expect(itemIsDir(item)).toBe(true);
          expect(item.alwaysShow).toBe(false);
        } else if (item.name === 'src') {
          expect(itemIsDir(item)).toBe(true);
          expect(item.alwaysShow).toBe(true);
        } else if (item.name === 'index.js') {
          expect(itemIsDir(item)).toBe(false);
          expect(item.alwaysShow).toBe(true);
        }
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty item list', async () => {
      const path = Path.fromFilePath(testRoot);
      const rules = await Rules.forPath(path);
      rules.add(['ignored/']);

      const filtered = rules.filter(path, []);

      expect(filtered).toEqual([]);
    });

    it('should handle items with special characters in names', async () => {
      const path = Path.fromFilePath(testRoot);
      const rules = await Rules.forPath(path);
      rules.add(['*.log']);

      const items: FileItem[] = [
        new FileItem(['my-file.log', vscode.FileType.File]),
        new FileItem(['my_file.log', vscode.FileType.File]),
        new FileItem(['my file.log', vscode.FileType.File]),
        new FileItem(['my-file.txt', vscode.FileType.File]),
      ];

      const filtered = rules.filter(path, items);

      const logItems = filtered.filter((i) => i.name.endsWith('.log'));
      const nonLogItems = filtered.filter((i) => !i.name.endsWith('.log'));

      expect(logItems.every((i) => i.alwaysShow === false)).toBe(true);
      expect(nonLogItems.every((i) => i.alwaysShow === true)).toBe(true);
    });

    it('should not throw on symlinks', async () => {
      const path = Path.fromFilePath(testRoot);
      const rules = await Rules.forPath(path);
      rules.add(['link/']);

      const items: FileItem[] = [
        new FileItem(['link', vscode.FileType.SymbolicLink]),
        new FileItem(['real', vscode.FileType.Directory]),
      ];

      expect(() => rules.filter(path, items)).not.toThrow();
    });
  });
});
