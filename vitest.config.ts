import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-utils/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    fileParallelism: false,
  },
  // Point to empty dir to prevent loading .env.local (test env vars are in setup.ts)
  envDir: './src/test-utils',
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
