import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Content script: single IIFE file, appended to dist/ (don't wipe the main build).
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'chrome138',
    lib: {
      entry: resolve(import.meta.dirname, 'src/content.ts'),
      name: 'LumenContent',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
  },
});
