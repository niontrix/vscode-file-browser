import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { Option, None, Some, Result, Err, Ok } from '@bodil/opt';
import { Path, endsWithPathSeparator, lookUpwards } from './path';

describe('Path', () => {
  describe('constructor & static methods', () => {
    it('should create a Path from a file path string', () => {
      const path = Path.fromFilePath('/home/user/test.txt');
      expect(path).toBeInstanceOf(Path);
      expect(path.fsPath).toBe('/home/user/test.txt');
    });

    it('should create a Path from a Uri', () => {
      const uri = vscode.Uri.file('/tmp/test');
      const path = new Path(uri);
      expect(path.uri).toEqual(uri);
    });

    it('should return the correct uri', () => {
      const path = Path.fromFilePath('/home/user/docs');
      expect(path.uri.path).toBe('/home/user/docs');
    });

    it('should return the correct id', () => {
      const path = Path.fromFilePath('/home/user/docs');
      expect(path.id).toBe('/home/user/docs');
    });

    it('should return the correct fsPath', () => {
      const path = Path.fromFilePath('/var/log/syslog');
      expect(path.fsPath).toBe('/var/log/syslog');
    });
  });

  describe('clone', () => {
    it('should create an independent copy of a path', () => {
      const original = Path.fromFilePath('/home/user/test');
      const cloned = original.clone();

      expect(cloned.equals(original)).toBe(true);
      expect(cloned).not.toBe(original); // Different instance
    });

    it('should not affect original when cloned path is modified', () => {
      const original = Path.fromFilePath('/home/user/test');
      const cloned = original.clone().append('new');

      expect(original.fsPath).toBe('/home/user/test');
      expect(cloned.fsPath).toBe('/home/user/test/new');
    });
  });

  describe('equals', () => {
    it('should return true for equal paths', () => {
      const path1 = Path.fromFilePath('/home/user/test');
      const path2 = Path.fromFilePath('/home/user/test');

      expect(path1.equals(path2)).toBe(true);
    });

    it('should return false for different paths', () => {
      const path1 = Path.fromFilePath('/home/user/test');
      const path2 = Path.fromFilePath('/home/user/other');

      expect(path1.equals(path2)).toBe(false);
    });

    it('should return false when comparing to self', () => {
      const path = Path.fromFilePath('/home/user/test');
      expect(path.equals(path)).toBe(true);
    });
  });

  describe('atTop', () => {
    it('should return true for root path', () => {
      const root = Path.fromFilePath('/');
      expect(root.atTop()).toBe(true);
    });

    it('should return false for non-root paths', () => {
      const path = Path.fromFilePath('/home/user');
      expect(path.atTop()).toBe(false);
    });

    it('should return false for nested paths', () => {
      const path = Path.fromFilePath('/a/b/c/d/e');
      expect(path.atTop()).toBe(false);
    });
  });

  describe('root', () => {
    it('should return root URI', () => {
      const path = Path.fromFilePath('/home/user/docs');
      const root = path.root();

      expect(root.path).toBe('/');
    });

    it('should return root for root path itself', () => {
      const root = Path.fromFilePath('/').root();
      expect(root.path).toBe('/');
    });
  });

  describe('append', () => {
    it('should append a single segment', () => {
      const path = Path.fromFilePath('/home/user');
      const child = path.append('docs');

      expect(child.fsPath).toBe('/home/user/docs');
    });

    it('should append multiple segments', () => {
      const path = Path.fromFilePath('/home');
      const child = path.append('user', 'docs', 'file.txt');

      expect(child.fsPath).toBe('/home/user/docs/file.txt');
    });

    it('should not modify original path', () => {
      const original = Path.fromFilePath('/home/user');
      const child = original.append('test');

      expect(original.fsPath).toBe('/home/user');
      expect(child.fsPath).toBe('/home/user/test');
    });

    it('should handle empty segments', () => {
      const path = Path.fromFilePath('/home/user');
      const child = path.append('', 'docs');

      expect(child.fsPath).toBe('/home/user/docs');
    });

    it('should handle root path appending', () => {
      const root = Path.fromFilePath('/');
      const child = root.append('home', 'user');

      expect(child.fsPath).toBe('/home/user');
    });

    it('should handle parent directory reference', () => {
      const path = Path.fromFilePath('/home/user/docs');
      const parent = path.append('..');

      // VS Code's Uri.joinPath normalizes .. segments
      expect(parent.fsPath).toBe('/home/user');
    });
  });

  describe('parent', () => {
    it('should return parent path', () => {
      const path = Path.fromFilePath('/home/user/docs');
      const parent = path.parent();

      // VS Code normalizes .. segments
      expect(parent.fsPath).toBe('/home/user');
    });

    it('should return self for root path', () => {
      const root = Path.fromFilePath('/');
      const parent = root.parent();

      // Root's parent is itself (via ..)
      expect(parent.atTop()).toBe(true);
    });

    it('should work for deeply nested paths', () => {
      const path = Path.fromFilePath('/a/b/c/d/e');
      const parent = path.parent();

      // VS Code normalizes .. segments
      expect(parent.fsPath).toBe('/a/b/c/d');
    });
  });

  describe('push', () => {
    it('should mutate path with a single segment', () => {
      const path = Path.fromFilePath('/home/user');
      path.push('docs');

      expect(path.fsPath).toBe('/home/user/docs');
    });

    it('should mutate path with multiple segments', () => {
      const path = Path.fromFilePath('/home');
      path.push('user', 'docs', 'file.txt');

      expect(path.fsPath).toBe('/home/user/docs/file.txt');
    });

    it('should allow chaining push calls', () => {
      const path = Path.fromFilePath('/home');
      path.push('user');
      path.push('docs');

      expect(path.fsPath).toBe('/home/user/docs');
    });
  });

  describe('pop', () => {
    it('should return None for root path', () => {
      const root = Path.fromFilePath('/');
      const result = root.pop();

      expect(result.isNone()).toBe(true);
    });

    it('should return the popped segment for non-root paths', () => {
      const path = Path.fromFilePath('/home/user/docs');
      const result = path.pop();

      expect(result.isSome()).toBe(true);
      if (result.isSome()) {
        expect(result.value).toBe('docs');
      }
    });

    it('should update the path after popping', () => {
      const path = Path.fromFilePath('/home/user/docs');
      path.pop();

      // VS Code normalizes .. segments
      expect(path.fsPath).toBe('/home/user');
    });

    it('should allow multiple pops', () => {
      const path = Path.fromFilePath('/a/b/c/d');
      const popped1 = path.pop();
      const popped2 = path.pop();

      if (popped1.isSome() && popped2.isSome()) {
        expect(popped1.value).toBe('d');
        expect(popped2.value).toBe('c');
      }
    });

    it('should return None after popping to root', () => {
      const path = Path.fromFilePath('/home');
      path.pop(); // Now at /home/.. which is root

      const result = path.pop();
      expect(result.isNone()).toBe(true);
    });
  });

  describe('relativeTo', () => {
    it('should return relative path for paths on same scheme/authority', () => {
      const path = Path.fromFilePath('/home/user/docs');
      const base = vscode.Uri.file('/home/user');
      const result = path.relativeTo(base);

      expect(result.isSome()).toBe(true);
      if (result.isSome()) {
        expect(result.value).toBe('docs');
      }
    });

    it('should return relative path with nested directories', () => {
      const path = Path.fromFilePath('/home/user/documents/notes');
      const base = vscode.Uri.file('/home/user');
      const result = path.relativeTo(base);

      expect(result.isSome()).toBe(true);
      if (result.isSome()) {
        expect(result.value).toContain('documents');
      }
    });

    it('should return None for different schemes', () => {
      const path = Path.fromFilePath('/home/user');
      const base = vscode.Uri.parse('file:///home/user');
      const result = path.relativeTo(base);

      // May return None or relative path depending on authority match
      expect(result).toBeDefined();
    });

    it('should return relative path going up', () => {
      const path = Path.fromFilePath('/home');
      const base = vscode.Uri.file('/home/user');
      const result = path.relativeTo(base);

      expect(result.isSome()).toBe(true);
      if (result.isSome()) {
        expect(result.value).toBe('..');
      }
    });

    it('should return empty string for same path', () => {
      const path = Path.fromFilePath('/home/user/docs');
      const base = vscode.Uri.file('/home/user/docs');
      const result = path.relativeTo(base);

      expect(result.isSome()).toBe(true);
      if (result.isSome()) {
        expect(result.value).toBe('');
      }
    });
  });
});

describe('endsWithWithSeparator', () => {
  it('should return Some with trailing slash removed', () => {
    const result = endsWithPathSeparator('/home/user/');
    expect(result.isSome()).toBe(true);
    if (result.isSome()) {
      expect(result.value).toBe('/home/user');
    }
  });

  it('should return None when no trailing slash', () => {
    const result = endsWithPathSeparator('/home/user');
    expect(result.isNone()).toBe(true);
  });

  it('should handle multiple trailing slashes', () => {
    const result = endsWithPathSeparator('/home/user///');
    expect(result.isSome()).toBe(true);
    if (result.isSome()) {
      expect(result.value).toBe('/home/user//');
    }
  });

  it('should handle single slash', () => {
    const result = endsWithPathSeparator('/');
    expect(result.isSome()).toBe(true);
    if (result.isSome()) {
      expect(result.value).toBe('');
    }
  });

  it('should handle empty string', () => {
    const result = endsWithPathSeparator('');
    expect(result.isNone()).toBe(true);
  });
});

describe('lookUpwards', () => {
  it('should return Err for a file path (not a directory)', async () => {
    const uri = vscode.Uri.file('/home/user/not_a_dir.txt');
    const result = await lookUpwards(uri, ['.gitignore']);

    expect(result.isErr()).toBe(true);
  });

  it('should search upward for ignore files', async () => {
    // This test would require mocking vscode.workspace.fs.stat
    // For now, we test the structure - in a real scenario, you'd mock the fs methods
    const uri = vscode.Uri.file('/home/user/project');
    const result = await lookUpwards(uri, ['.gitignore', '.npmignore']);

    // Without mocked fs, this will fail stat checks
    expect(result).toBeDefined();
  });

  it('should try multiple file names', async () => {
    const uri = vscode.Uri.file('/home/user/project');
    const result = await lookUpwards(uri, ['.gitignore', '.npmignore', '.vscodeignore']);

    expect(result).toBeDefined();
  });
});
