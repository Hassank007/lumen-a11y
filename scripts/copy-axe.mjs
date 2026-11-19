// Copies axe-core's browser build next to content.js, so the side panel can inject it into the page.
import { copyFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
copyFileSync(require.resolve('axe-core/axe.min.js'), new URL('../dist/axe.min.js', import.meta.url));
console.log('copied axe.min.js');
