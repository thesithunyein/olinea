/*
 * Mirrors the Poppins faces the site uses into assets/fonts/, so no page asks Google for a font.
 *
 * A font is a render-blocking subresource on the one page that has to work. Fetching it from
 * googleapis means a cold visitor's first paint depends on a host we do not control — the same
 * dependency the JS had before it was bundled. This pulls the stylesheet Google would have served,
 * downloads each face it names, and rewrites the URLs to our own copies.
 *
 * Run:  node scripts/vendor/fonts.mjs
 * Output: assets/fonts/poppins.css and assets/fonts/*.woff2 — committed and served.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const WEIGHTS = '300;400;500;600;700;800';
const CSS_URL = `https://fonts.googleapis.com/css2?family=Poppins:wght@${WEIGHTS}&display=swap`;
/* Google hands woff2 only to a UA it believes can use it; without this the response is ttf. */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const outDir = path.resolve(import.meta.dirname, '../../assets/fonts');
mkdirSync(outDir, { recursive: true });

const cssRes = await fetch(CSS_URL, { headers: { 'user-agent': UA } });
if (!cssRes.ok) throw new Error(`google fonts css: ${cssRes.status}`);
let css = await cssRes.text();

const remote = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]))];
if (remote.length === 0) throw new Error('no font files referenced in the stylesheet');

for (const url of remote) {
  const name = url.split('/').pop();
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length < 512) throw new Error(`${name} came back too small to be a font (${bytes.length} bytes)`);
  writeFileSync(path.join(outDir, name), bytes);
  css = css.split(url).join(`/assets/fonts/${name}`);
  console.log(`  ${name}  ${(bytes.length / 1024).toFixed(1)} KiB`);
}

/* Anything left pointing at a Google host would silently put the dependency back. */
if (/fonts\.(googleapis|gstatic)\.com/.test(css)) throw new Error('the stylesheet still names a Google host after rewriting');

writeFileSync(path.join(outDir, 'poppins.css'), css);
console.log(`wrote ${remote.length} faces and poppins.css`);
