/*
 * Bundles the console's runtime dependencies into app/vendor/ so the published site loads nothing
 * from a third-party origin.
 *
 * The site used to pull viem, @scure/bip39, @noble/hashes and @noble/post-quantum from esm.sh at
 * runtime — a cold first load was ~250 requests to a host we do not control, on the critical path
 * of the one page that has to work. The versions below are pinned to the exact ones those CDN URLs
 * served, so the crypto path is byte-for-byte the same code, just served from here.
 *
 * Run:  cd scripts/vendor && npm install && npm run build
 * Output: app/vendor/*.js — committed, because the site is deployed as static files with no build
 * step on the host. If you change a version here, rebuild and commit the output together.
 */
import { build } from 'esbuild';
import { rmSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const here = import.meta.dirname;
const outdir = path.resolve(here, '../../app/vendor');
const entries = path.resolve(here, 'entry');

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

const result = await build({
  entryPoints: {
    viem: path.join(entries, 'viem.js'),
    'viem-accounts': path.join(entries, 'viem-accounts.js'),
    'worker-deps': path.join(entries, 'worker-deps.js'),
  },
  outdir,
  absWorkingDir: here,
  bundle: true,
  format: 'esm',
  /* Splitting so the three bundles share one copy of the noble primitives instead of three. */
  splitting: true,
  target: ['es2022'],
  charset: 'utf8',
  /* Not minified on purpose: a reader who can open the bundle and find `slh_dsa_sha2_128s` is worth
     more here than the bytes, and this project's whole claim is that nothing hides. */
  minify: false,
  legalComments: 'inline',
  logLevel: 'info',
  metafile: true,
});

const files = readdirSync(outdir).sort();
let total = 0;
for (const f of files) {
  const size = statSync(path.join(outdir, f)).size;
  total += size;
  console.log(`  ${f}  ${(size / 1024).toFixed(0)} KiB`);
}
console.log(`  total ${(total / 1024).toFixed(0)} KiB across ${files.length} files`);
