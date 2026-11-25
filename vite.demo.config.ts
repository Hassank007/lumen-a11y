import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'node:path';

// The hosted demo (dist-demo/): Lumen's panel next to made-up pages, no extension needed.
// It must never contain an App Check debug token. It uses the real reCAPTCHA provider, and
// without a reCAPTCHA site key it is built with no Firebase project, so AI runs only on the device.
export default defineConfig(({ mode }) => {
  const siteKey = loadEnv(mode, import.meta.dirname, 'VITE_').VITE_RECAPTCHA_SITE_KEY;
  const firebaseKeys = ['API_KEY', 'AUTH_DOMAIN', 'PROJECT_ID', 'STORAGE_BUCKET', 'MESSAGING_SENDER_ID', 'APP_ID'];
  const blank = ['VITE_APPCHECK_DEBUG', 'VITE_APPCHECK_DEBUG_TOKEN', ...(siteKey ? [] : firebaseKeys.map((k) => `VITE_FIREBASE_${k}`))];
  return {
    publicDir: false,
    base: './',
    define: Object.fromEntries(blank.map((k) => [`import.meta.env.${k}`, '""'])),
    build: {
      outDir: 'dist-demo',
      emptyOutDir: true,
      target: 'chrome138',
      rollupOptions: {
        input: { index: resolve(import.meta.dirname, 'demo/index.html'), sidepanel: resolve(import.meta.dirname, 'sidepanel.html') },
      },
    },
  };
});
