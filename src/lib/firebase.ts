import { initializeApp, type FirebaseApp } from 'firebase/app';
import { CustomProvider, ReCaptchaV3Provider, initializeAppCheck } from 'firebase/app-check';
import { fetchAndActivate, getRemoteConfig, getValue } from 'firebase/remote-config';
import { DEFAULT_PROMPTS, type PromptKey } from './prompts';

const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

export const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

let app: FirebaseApp | null = null;

/** Firebase app with App Check. Firebase AI Logic requires App Check. */
export function getFirebaseApp(): FirebaseApp {
  if (app) return app;
  app = initializeApp(firebaseConfig);

  const debug = env.VITE_APPCHECK_DEBUG === 'true';
  if (debug) {
    // Uses VITE_APPCHECK_DEBUG_TOKEN if set; otherwise the SDK prints a new token
    // in the console. Register it in Firebase console → App Check → Apps →
    // Manage debug tokens.
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: boolean | string }).FIREBASE_APPCHECK_DEBUG_TOKEN =
      env.VITE_APPCHECK_DEBUG_TOKEN || true;
  }
  // MV3 extensions can't load remote scripts, so reCAPTCHA can't run inside the
  // extension. In debug mode the custom provider is never called (the debug
  // token is used instead).
  const provider = debug || !env.VITE_RECAPTCHA_SITE_KEY
    ? new CustomProvider({ getToken: () => Promise.reject(new Error('App Check: use a debug token in development')) })
    : new ReCaptchaV3Provider(env.VITE_RECAPTCHA_SITE_KEY);
  initializeAppCheck(app, { provider, isTokenAutoRefreshEnabled: true });
  return app;
}

/** Remote Config lets prompts and the cloud model be tuned without a new release. */
export async function loadRemoteSettings(): Promise<{ prompts: Record<PromptKey, string>; cloudModel: string }> {
  const fallback = { prompts: { ...DEFAULT_PROMPTS }, cloudModel: 'gemini-3.5-flash-lite' };
  if (!isConfigured) return fallback;
  try {
    const rc = getRemoteConfig(getFirebaseApp());
    rc.settings.minimumFetchIntervalMillis = 60 * 60 * 1000;
    rc.defaultConfig = {
      prompt_alt_text: DEFAULT_PROMPTS.altText,
      prompt_link_text: DEFAULT_PROMPTS.linkText,
      prompt_simplify: DEFAULT_PROMPTS.simplify,
      cloud_model: fallback.cloudModel,
    };
    await fetchAndActivate(rc);
    return {
      prompts: {
        altText: getValue(rc, 'prompt_alt_text').asString(),
        linkText: getValue(rc, 'prompt_link_text').asString(),
        simplify: getValue(rc, 'prompt_simplify').asString(),
      },
      cloudModel: getValue(rc, 'cloud_model').asString(),
    };
  } catch (err) {
    console.warn('Lumen: Remote Config unavailable, using defaults', err);
    return fallback;
  }
}
