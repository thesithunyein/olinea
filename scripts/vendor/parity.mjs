/*
 * Parity check for the vendored bundles.
 *
 * Two questions, both answered by deriving a key and comparing it to something that cannot be fudged:
 *
 *   1. Did bundling change the crypto?   Derive with app/vendor/worker-deps.js and with the raw npm
 *      packages it was built from. Same seed, same index, same 32-byte verifying key or it fails.
 *
 *   2. Does this still make the key that is on chain?   If LOCAL/ holds the vault's words, derive
 *      from them and compare against verifyingKey() on the live Arc vault. That is the real test:
 *      the chain is holding a key that a browser made from those 24 words before any of this was
 *      bundled, so a match means the vendored path reproduces the shipped path exactly.
 *
 * Prints only public values — a verifying key is public (the vault stores it in the clear). The
 * mnemonic is read from disk and never echoed.
 *
 * Run:  node scripts/vendor/parity.mjs [--vault 0x…] [--words LOCAL/browser-vault.txt]
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const here = import.meta.dirname;
const root = path.resolve(here, '../..');
const SALT = 'olinea/slh-dsa/v1';
const CHAIN_ID = 5042n;
const PQ_PRECOMPILE = '0x1800000000000000000000000000000000000004';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const VAULT = arg('vault', '0xA36f07eEB907C0eBc09ecb79802f5037a0382A22');
const WORDS = path.resolve(root, arg('words', 'LOCAL/browser-vault.txt'));
const RPC = process.env.ARC_RPC ?? 'https://rpc.blockdaemon.mainnet.arc.io';

const toHex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');

/* The derivation, copied from app/worker.js. If that file's derivation changes, this must change with
   it — and the parity check is exactly what catches a change made in only one of the two places. */
async function derive(m, mnemonic, index) {
  if (!m.bip39.validateMnemonic(mnemonic, m.wordlist)) throw new Error('not a valid BIP-39 phrase');
  const seed64 = await m.bip39.mnemonicToSeed(mnemonic, '');
  const seed48 = m.hkdf(m.sha256, seed64, new TextEncoder().encode(SALT), new TextEncoder().encode(`vault/${index}`), 48);
  return toHex(m.slh.keygen(seed48).publicKey);
}

const shape = (bip39, wordlist, hkdf, sha2, pq) => ({
  bip39,
  wordlist: wordlist.wordlist ?? wordlist.english ?? wordlist.default,
  hkdf: hkdf.hkdf,
  sha256: sha2.sha256,
  slh: pq.slh_dsa_sha2_128s,
});

let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

/* --- 1. the bundle against the packages it was built from ------------------------------------- */
const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

const built = await import('file://' + path.join(root, 'app/vendor/worker-deps.js'));
const builtShape = shape(built.bip39, built.wordlist, built.hkdf, built.sha2, built.pq);

const raw = {
  bip39: await import('file://' + path.join(here, 'node_modules/@scure/bip39/index.js')),
  wordlist: await import('file://' + path.join(here, 'node_modules/@scure/bip39/wordlists/english.js')),
  hkdf: await import('file://' + path.join(here, 'node_modules/@noble/hashes/hkdf.js')),
  sha2: await import('file://' + path.join(here, 'node_modules/@noble/hashes/sha2.js')),
  pq: await import('file://' + path.join(here, 'node_modules/@noble/post-quantum/slh-dsa.js')),
};
const rawShape = shape(raw.bip39, raw.wordlist, raw.hkdf, raw.sha2, raw.pq);

const fromBundle = await derive(builtShape, TEST_MNEMONIC, 0);
const fromRaw = await derive(rawShape, TEST_MNEMONIC, 0);
console.log(`bundle     ${fromBundle}`);
console.log(`raw npm    ${fromRaw}`);
check(fromBundle === fromRaw, 'the bundled primitives derive the same key as the packages they were built from');
check(builtShape.wordlist.length === 2048, `the bundled wordlist is the full 2048-word list (${builtShape.wordlist.length})`);

/* --- 2. against the key the live vault is holding --------------------------------------------- */
if (!existsSync(WORDS)) {
  console.log(`SKIP  no words at ${path.relative(root, WORDS)} — cannot compare against the live vault`);
} else {
  const text = readFileSync(WORDS, 'utf8');
  const runs = [...text.matchAll(/\b(?:[a-z]{3,8}[ \t]+){11,23}[a-z]{3,8}\b/g)].map((m) => m[0].trim().split(/\s+/));
  const phrase = runs.find((w) => w.length === 24) ?? runs.find((w) => w.length === 12) ?? null;
  if (!phrase) {
    console.log('SKIP  no 24-word phrase found in the words file');
  } else {
    const viem = await import('file://' + path.join(here, 'node_modules/viem/_esm/index.js'));
    const client = viem.createPublicClient({ transport: viem.http(RPC) });
    const onChain = await client.readContract({
      address: VAULT,
      abi: [{ name: 'verifyingKey', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'bytes' }] }],
      functionName: 'verifyingKey',
    });
    const want = String(onChain).replace(/^0x/, '').toLowerCase();
    console.log(`vault      ${VAULT}`);
    console.log(`on chain   ${want}`);
    check(want.length === 64, `the vault answers with a 32-byte verifying key (${want.length / 2} bytes)`);

    let matched = null;
    for (let i = 0; i < 6; i++) {
      const derived = await derive(builtShape, phrase.join(' '), i);
      const hit = derived.toLowerCase() === want;
      console.log(`  index ${i}  ${derived}  ${hit ? '<-- matches' : ''}`);
      if (hit) { matched = i; break; }
    }
    check(matched !== null,
      matched !== null
        ? `the vendored bundle reproduces the live vault's key from its backup words (index ${matched})`
        : 'the vendored bundle reproduces the live vault\'s key from its backup words');
    /* Only worth reporting if it matched: this is the real claim, that the chain's key is reachable. */
    if (matched !== null) console.log(`\n  the live vault's on-chain key is derived from the same words, through the vendored code path`);
  }
}

console.log(failures === 0 ? '\nparity holds' : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
