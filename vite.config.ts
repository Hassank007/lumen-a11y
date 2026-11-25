import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Builds the side panel page and the background service worker (ES modules).
// The content script is built separately as an IIFE (vite.content.config.ts),
// because MV3 content scripts can't be ES modules.
// "--mode keyless" leaves out every Firebase value, so the result can be shared: AI runs only on the device.
const KEYS = ['API_KEY', 'AUTH_DOMAIN', 'PROJECT_ID', 'STORAGE_BUCKET', 'MESSAGING_SENDER_ID', 'APP_ID'].map((k) => `VITE_FIREBASE_${k}`)
  .concat('VITE_RECAPTCHA_SITE_KEY', 'VITE_APPCHECK_DEBUG', 'VITE_APPCHECK_DEBUG_TOKEN');

export default defineConfig(({ mode }) => ({
  define: mode === 'keyless' ? Object.fromEntries(KEYS.map((k) => [`import.meta.env.${k}`, '""'])) : {},
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome138',
    rollupOptions: {
      input: {
        sidepanel: resolve(import.meta.dirname, 'sidepanel.html'),
        'mic-permission': resolve(import.meta.dirname, 'mic-permission.html'),
        background: resolve(import.meta.dirname, 'src/background.ts'),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
}));
