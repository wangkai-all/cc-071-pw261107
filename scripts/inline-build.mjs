/**
 * Produces a single self-contained HTML file at dist/index.html so the
 * dashboard can be opened directly from disk (file://), with no server and no
 * network requests. The multi-file Vite output stays available in dist/assets.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
let html = readFileSync(join(dist, 'index.html'), 'utf8');

const assetDir = join(dist, 'assets');
const files = readdirSync(assetDir);
const css = files.filter((f) => f.endsWith('.css'));
const js = files.filter((f) => f.endsWith('.js'));

for (const file of css) {
  const tag = new RegExp(`<link[^>]*assets/${file}[^>]*>`);
  const content = readFileSync(join(assetDir, file), 'utf8');
  html = html.replace(tag, `<style>\n${content}\n</style>`);
}
for (const file of js) {
  const tag = new RegExp(`<script[^>]*assets/${file}[^>]*></script>`);
  const content = readFileSync(join(assetDir, file), 'utf8');
  html = html.replace(tag, () => `<script type="module">\n${content}\n</script>`);
}

writeFileSync(join(dist, 'standalone.html'), html);
console.log(`standalone.html written (${(html.length / 1024).toFixed(0)} kB)`);
