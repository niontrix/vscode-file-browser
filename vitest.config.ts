import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      vscode: path.resolve(__dirname, 'test/vscode-mock.ts'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./test/test-setup.ts'],
  },
});
