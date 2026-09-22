import { describe, it, expect } from 'vitest';
import { Action, action } from '../src/action';

describe('Action', () => {
  describe('enum', () => {
    it('should have all expected action values', () => {
      expect(Action.NewFile).toBe(0);
      expect(Action.NewFolder).toBe(1);
      expect(Action.OpenFile).toBe(2);
      expect(Action.OpenFileBeside).toBe(3);
      expect(Action.RenameFile).toBe(4);
      expect(Action.DeleteFile).toBe(5);
      expect(Action.OpenFolder).toBe(6);
      expect(Action.OpenFolderInNewWindow).toBe(7);
    });

    it('should allow reverse lookup by value', () => {
      expect(Action[0]).toBe('NewFile');
      expect(Action[7]).toBe('OpenFolderInNewWindow');
    });
  });

  describe('action function', () => {
    it('should create an action object with label, name, action, and alwaysShow', () => {
      const result = action('Open', Action.OpenFile);
      expect(result).toEqual({
        label: 'Open',
        name: '',
        action: Action.OpenFile,
        alwaysShow: true,
      });
    });

    it('should preserve the action value', () => {
      const result = action('New File', Action.NewFile);
      expect(result.action).toBe(Action.NewFile);
    });

    it('should set alwaysShow to true', () => {
      const result = action('Delete', Action.DeleteFile);
      expect(result.alwaysShow).toBe(true);
    });

    it('should set name to empty string', () => {
      const result = action('Rename', Action.RenameFile);
      expect(result.name).toBe('');
    });

    it('should work with all action enum values', () => {
      const allActions = [
        Action.NewFile,
        Action.NewFolder,
        Action.OpenFile,
        Action.OpenFileBeside,
        Action.RenameFile,
        Action.DeleteFile,
        Action.OpenFolder,
        Action.OpenFolderInNewWindow,
      ];

      allActions.forEach((actionValue) => {
        const result = action(`Action ${actionValue}`, actionValue);
        expect(result.action).toBe(actionValue);
        expect(result.alwaysShow).toBe(true);
        expect(result.name).toBe('');
      });
    });
  });
});
