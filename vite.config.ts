import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Builds the side panel page and the background service worker (ES modules).
// The content script is built separately as an IIFE (vite.content.config.ts),
// because MV3 content scripts can't be ES modules.
export default defineConfig({
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome138',
    rollupOptions: {
      input: {
        sidepanel: resolve(import.meta.dirname, 'sidepanel.html'),
        background: resolve(import.meta.dirname, 'src/background.ts'),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
});
