import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { ConfigItem, config } from '../src/ConfigItem';

describe('ConfigItem', () => {
  let mockConfig: { _values: Map<string, unknown> };
  let mockWsConfig: { get: (key: string) => unknown };

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = { _values: new Map() };
    mockWsConfig = {
      get: (key: string) => mockConfig._values.get(key),
    };
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(mockWsConfig as any);
  });

  describe('enum', () => {
    it('should export all expected config keys', () => {
      expect(ConfigItem.RemoveIgnoredFiles).toBe('removeIgnoredFiles');
      expect(ConfigItem.HideDotfiles).toBe('hideDotfiles');
      expect(ConfigItem.HideIgnoreFiles).toBe('hideIgnoredFiles');
      expect(ConfigItem.IgnoreFileTypes).toBe('ignoreFileTypes');
      expect(ConfigItem.LabelIgnoredFiles).toBe('labelIgnoredFiles');
      expect(ConfigItem.IgnoreFocusLoss).toBe('ignoreFocusLoss');
    });

    it('should be string-valued', () => {
      const values = Object.values(ConfigItem);
      values.forEach(v => expect(typeof v).toBe('string'));
    });
  });

  describe('config function', () => {
    it('should return undefined when config key is not set', () => {
      const result = config(ConfigItem.HideDotfiles);
      expect(result).toBeUndefined();
    });

    it('should return the configured value when present', () => {
      mockConfig._values.set(ConfigItem.HideDotfiles, true);
      const result = config(ConfigItem.HideDotfiles);
      expect(result).toBe(true);
    });

    it('should return false when configured value is false', () => {
      mockConfig._values.set(ConfigItem.HideDotfiles, false);
      const result = config(ConfigItem.HideDotfiles);
      expect(result).toBe(false);
    });

    it('should return the configured array for IgnoreFileTypes', () => {
      const ignoreTypes = ['.gitignore', '.hgignore'];
      mockConfig._values.set(ConfigItem.IgnoreFileTypes, ignoreTypes);
      const result = config(ConfigItem.IgnoreFileTypes);
      expect(result).toEqual(ignoreTypes);
    });

    it('should return the configured string for IgnoreFocusLoss', () => {
      mockConfig._values.set(ConfigItem.IgnoreFocusLoss, 'example');
      const result = config(ConfigItem.IgnoreFocusLoss);
      expect(result).toBe('example');
    });

    it('should call getConfiguration with "file-browser"', () => {
      config(ConfigItem.HideDotfiles);
      expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('file-browser');
    });
  });
});
