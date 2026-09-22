import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { FileItem, itemIsDir, fileRecordCompare } from '../src/fileitem';
import * as extensionModule from '../src/extension';

const FileType = vscode.FileType;

describe('FileItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mockConfig = (vscode.workspace.getConfiguration() as any)._values;
    if (mockConfig) {
      mockConfig.clear();
    }
  });

  describe('constructor', () => {
    it('should set name from the record', () => {
      const item = new FileItem(['test.txt', FileType.File]);
      expect(item.name).toBe('test.txt');
    });

    it('should set fileType from the record', () => {
      const item = new FileItem(['test.txt', FileType.File]);
      expect(item.fileType).toBe(FileType.File);
    });

    it('should set label with folder icon for directories', () => {
      const item = new FileItem(['mydir', FileType.Directory]);
      expect(item.label).toBe('$(folder) mydir');
    });

    it('should set label with symlink-directory icon for directory + symbolic link', () => {
      const item = new FileItem(['mydir', FileType.Directory | FileType.SymbolicLink]);
      expect(item.label).toBe('$(file-symlink-directory) mydir');
    });

    it('should set label with symlink-file icon for file + symbolic link', () => {
      const item = new FileItem(['myfile', FileType.File | FileType.SymbolicLink]);
      expect(item.label).toBe('$(file-symlink-file) myfile');
    });

    it('should set label with default file icon for unknown file types', () => {
      const item = new FileItem(['myfile', FileType.File]);
      expect(item.label).toBe('$(file) myfile');
    });

    it('should set alwaysShow based on HideDotfiles config (true hides dotfiles)', () => {
      // The config() function calls getConfiguration("file-browser").get(item)
      // Mock the config function to return controlled values
      const configSpy = vi.spyOn(extensionModule, 'config')
        .mockImplementation((key) => {
          if (key === 'hideDotfiles') return true;
          return undefined;
        });
      const dotfile = new FileItem(['.hidden', FileType.File]);
      const normalFile = new FileItem(['visible.txt', FileType.File]);
      expect(dotfile.alwaysShow).toBe(false);
      expect(normalFile.alwaysShow).toBe(true);
      configSpy.mockRestore();
    });

    it('should set alwaysShow to true for all files when HideDotfiles is false', () => {
      const configSpy = vi.spyOn(extensionModule, 'config')
        .mockImplementation((key) => {
          if (key === 'hideDotfiles') return false;
          return undefined;
        });
      const dotfile = new FileItem(['.hidden', FileType.File]);
      const normalFile = new FileItem(['visible.txt', FileType.File]);
      expect(dotfile.alwaysShow).toBe(true);
      expect(normalFile.alwaysShow).toBe(true);
      configSpy.mockRestore();
    });

    it('should set alwaysShow to true when HideDotfiles config is undefined', () => {
      const configSpy = vi.spyOn(extensionModule, 'config')
        .mockReturnValue(undefined);
      const dotfile = new FileItem(['.hidden', FileType.File]);
      const normalFile = new FileItem(['visible.txt', FileType.File]);
      expect(dotfile.alwaysShow).toBe(true);
      expect(normalFile.alwaysShow).toBe(true);
      configSpy.mockRestore();
    });
  });
});

describe('itemIsDir', () => {
  it('should return false when fileType is undefined', () => {
    const item = new FileItem(['test', FileType.File]);
    item.fileType = undefined;
    expect(itemIsDir(item)).toBe(false);
  });

  it('should return true when fileType is Directory', () => {
    const item = new FileItem(['test', FileType.Directory]);
    expect(itemIsDir(item)).toBe(true);
  });

  it('should return true when fileType includes Directory via bitwise OR', () => {
    const item = new FileItem(['test', FileType.Directory | FileType.SymbolicLink]);
    expect(itemIsDir(item)).toBe(true);
  });

  it('should return false for regular files', () => {
    const item = new FileItem(['test.txt', FileType.File]);
    expect(itemIsDir(item)).toBe(false);
  });

  it('should return false for file + symbolic link', () => {
    const item = new FileItem(['test', FileType.File | FileType.SymbolicLink]);
    expect(itemIsDir(item)).toBe(false);
  });
});

describe('fileRecordCompare', () => {
  it('should return 0 for identical records', () => {
    const left: [string, vscode.FileType] = ['foo', FileType.File];
    const right: [string, vscode.FileType] = ['foo', FileType.File];
    expect(fileRecordCompare(left, right)).toBe(0);
  });

  it('should sort directories before files', () => {
    const left: [string, vscode.FileType] = ['dir', FileType.Directory];
    const right: [string, vscode.FileType] = ['file.txt', FileType.File];
    expect(fileRecordCompare(left, right)).toBe(-1);
  });

  it('should return 1 when left is file and right is directory', () => {
    const left: [string, vscode.FileType] = ['file.txt', FileType.File];
    const right: [string, vscode.FileType] = ['dir', FileType.Directory];
    expect(fileRecordCompare(left, right)).toBe(1);
  });

  it('should sort directories alphabetically among themselves', () => {
    const left: [string, vscode.FileType] = ['alpha', FileType.Directory];
    const right: [string, vscode.FileType] = ['beta', FileType.Directory];
    expect(fileRecordCompare(left, right)).toBe(-1);
  });

  it('should sort files alphabetically among themselves', () => {
    const left: [string, vscode.FileType] = ['beta.txt', FileType.File];
    const right: [string, vscode.FileType] = ['alpha.txt', FileType.File];
    expect(fileRecordCompare(left, right)).toBe(1);
  });

  it('should be case-insensitive when sorting', () => {
    const left: [string, vscode.FileType] = ['Beta.txt', FileType.File];
    const right: [string, vscode.FileType] = ['alpha.txt', FileType.File];
    expect(fileRecordCompare(left, right)).toBe(1);
  });

  it('should sort directories alphabetically ignoring case', () => {
    const left: [string, vscode.FileType] = ['zulu', FileType.Directory];
    const right: [string, vscode.FileType] = ['Alpha', FileType.Directory];
    expect(fileRecordCompare(left, right)).toBe(1);
  });

  it('should sort files before directories regardless of alphabetical order', () => {
    const left: [string, vscode.FileType] = ['apple.txt', FileType.File];
    const right: [string, vscode.FileType] = ['banana', FileType.Directory];
    expect(fileRecordCompare(left, right)).toBe(1);
  });

  it('should handle same name but different types (dir before file)', () => {
    const dir: [string, vscode.FileType] = ['test', FileType.Directory];
    const file: [string, vscode.FileType] = ['test', FileType.File];
    expect(fileRecordCompare(dir, file)).toBe(-1);
    expect(fileRecordCompare(file, dir)).toBe(1);
  });

  it('should return 0 for same directory name', () => {
    const left: [string, vscode.FileType] = ['dir', FileType.Directory];
    const right: [string, vscode.FileType] = ['dir', FileType.Directory];
    expect(fileRecordCompare(left, right)).toBe(0);
  });
});
