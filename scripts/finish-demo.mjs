// Finishes dist-demo/: the demo at the root, the page script, axe-core and the made-up pages.
// Stops if an App Check debug token got into the build.
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'dist-demo');

const html = readFileSync(join(out, 'demo/index.html'), 'utf8').replaceAll('="../assets/', '="./assets/');
writeFileSync(join(out, 'index.html'), html);
rmSync(join(out, 'demo'), { recursive: true });
copyFileSync(join(root, 'dist/content.js'), join(out, 'content.js'));
copyFileSync(require.resolve('axe-core/axe.min.js'), join(out, 'axe.min.js'));
mkdirSync(join(out, 'pages'), { recursive: true });
for (const f of ['demo.html', 'clinic.html', 'council.html']) copyFileSync(join(root, 'test-page', f), join(out, 'pages', f));
cpSync(join(root, 'test-page/img'), join(out, 'pages/img'), { recursive: true });

const env = join(root, '.env.local');
const token = existsSync(env) ? /^VITE_APPCHECK_DEBUG_TOKEN=(.+)$/m.exec(readFileSync(env, 'utf8'))?.[1].trim() : '';
if (token) {
  for (const f of readdirSync(out, { recursive: true, withFileTypes: true })) {
    if (f.isFile() && readFileSync(join(f.parentPath, f.name), 'utf8').includes(token)) {
      rmSync(out, { recursive: true });
      throw new Error(`The App Check debug token is in ${f.name}. The demo build was deleted.`);
    }
  }
}
console.log('dist-demo is ready. No App Check debug token in it.');
