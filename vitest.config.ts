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
  // Disable .env file loading - test env vars are set in setup.ts
  envDir: false,
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
