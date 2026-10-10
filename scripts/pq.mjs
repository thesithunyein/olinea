#!/usr/bin/env node
/**
 * Olinea — post-quantum tooling for Arc.
 *
 *   node pq.mjs keygen                       generate an SLH-DSA-SHA2-128s keypair
 *   node pq.mjs authorize --vault 0x… --to 0x… --amount 1000000 --nonce 1
 *                                            print the signature that authorizes one release
 *   node pq.mjs conformance [--vault 0x…]    verify the authorization-digest path against
 *                                            Arc mainnet's real PQ precompile (free, no wallet)
 *
 * The vault signs exactly 32 bytes:
 *   keccak256(abi.encode(chainId, vault, to, amount, nonce))
 * which is why a signature cannot be replayed on another chain, in another vault, for another
 * recipient, another amount, or twice.
 *
 * Keys are written to scripts/keys/pq-key.json (gitignored). Never commit them.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeAbiParameters, keccak256, createPublicClient, http, toHex } from 'viem';
import { slh_dsa_sha2_128s as slh } from '@noble/post-quantum/slh-dsa.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const KEY_FILE = join(HERE, 'keys', 'pq-key.json');

const CHAIN_ID = 5042n; // Arc mainnet
const PQ_PRECOMPILE = '0x1800000000000000000000000000000000000004';
const RPC = process.env.ARC_RPC ?? 'https://rpc.drpc.mainnet.arc.io';
/* Both endpoints the console uses, the named one first. A public provider that is rate-limiting is
 * ordinary weather for this project rather than a conformance failure, and one that fails must not
 * end the run: that is what turned a passing check into a crash and a stack trace. */
const RPC_FALLBACKS = ['https://rpc.drpc.mainnet.arc.io', 'https://rpc.blockdaemon.mainnet.arc.io'];
const endpoints = () => [...new Set([RPC, ...RPC_FALLBACKS])];
const PROBE_VAULT = '0x0000000000000000000000000000000000000abc'; // placeholder for conformance runs

const PQ_ABI = [
  {
    name: 'verifySlhDsaSha2128s',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'vk', type: 'bytes' },
      { name: 'message', type: 'bytes' },
      { name: 'sig', type: 'bytes' },
    ],
    outputs: [{ name: 'isValid', type: 'bool' }],
  },
];

/** The exact 32 bytes a release authorization is signed over (mirrors OlineaVault.authorizationDigest). */
export function authorizationDigest(vault, to, amount, nonce) {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'uint256' }, { type: 'address' }, { type: 'address' }, { type: 'uint256' }, { type: 'uint256' }],
      [CHAIN_ID, vault, to, BigInt(amount), BigInt(nonce)],
    ),
  );
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`missing --${name}`);
}

function loadKey() {
  if (!existsSync(KEY_FILE)) throw new Error(`no key at ${KEY_FILE} — run: node pq.mjs keygen`);
  const { vk, sk } = JSON.parse(readFileSync(KEY_FILE, 'utf8'));
  return { vk: Uint8Array.from(Buffer.from(vk, 'hex')), sk: Uint8Array.from(Buffer.from(sk, 'hex')) };
}

function client(url = RPC) {
  return createPublicClient({ transport: http(url) });
}

/* Each endpoint is asked in turn. What a failure means is the caller's judgement, not this
 * function's: conformance() reports it as a case nobody could check rather than as a wrong answer,
 * because an endpoint that did not reply has said nothing at all about the signature. */
async function verifyOnMainnet(vk, message, signature) {
  let lastError;
  for (const url of endpoints()) {
    try {
      return await client(url).readContract({
        address: PQ_PRECOMPILE,
        abi: PQ_ABI,
        functionName: 'verifySlhDsaSha2128s',
        args: [toHex(vk), message, toHex(signature)],
      });
    } catch (err) {
      lastError = err;
      console.log(`  … ${new URL(url).host} did not answer (${err.shortMessage ?? err.message})`);
    }
  }
  throw lastError;
}

function keygen() {
  const t0 = Date.now();
  const { secretKey, publicKey } = slh.keygen();
  mkdirSync(dirname(KEY_FILE), { recursive: true });
  writeFileSync(KEY_FILE, JSON.stringify({ vk: toHex(publicKey).slice(2), sk: toHex(secretKey).slice(2) }, null, 2));
  console.log(`verifying key (32 B):  ${toHex(publicKey)}`);
  console.log(`secret key:            written to ${KEY_FILE} (gitignored)`);
  console.log(`keygen took            ${Date.now() - t0} ms`);
}

async function authorize() {
  const vault = arg('vault');
  const to = arg('to');
  const amount = arg('amount');
  const nonce = arg('nonce');
  const { vk, sk } = loadKey();

  const digest = authorizationDigest(vault, to, amount, nonce);
  const t0 = Date.now();
  const signature = slh.sign(Buffer.from(digest.slice(2), 'hex'), sk);
  const ms = Date.now() - t0;

  console.log(`vault:     ${vault}`);
  console.log(`digest:    ${digest}`);
  console.log(`signature: ${toHex(signature).slice(2)}`);
  console.log(`signed in  ${ms} ms`);
  console.log('');
  console.log('submit with:');
  console.log(`  cast send ${vault} "release(address,uint256,uint256,bytes)" ${to} ${amount} ${nonce} 0x${toHex(signature).slice(2)} \\`);
  console.log('    --rpc-url https://rpc.drpc.mainnet.arc.io --private-key $ARC_PRIVATE_KEY');

  if (process.argv.includes('--check')) {
    const ok = await verifyOnMainnet(vk, digest, signature);
    console.log(`\nmainnet precompile check: ${ok ? 'true ✅' : 'false ❌'}`);
  }
}

async function conformance() {
  const vault = arg('vault', PROBE_VAULT);
  const to = '0x00000000000000000000000000000000000000b0';
  const amount = 1000000n;
  const nonce = 1n;

  const { vk, sk } = loadKey();
  const digest = authorizationDigest(vault, to, amount, nonce);
  const signature = slh.sign(Buffer.from(digest.slice(2), 'hex'), sk);

  const tampered = Uint8Array.from(signature);
  tampered[4000] ^= 0x01;
  const otherDigest = authorizationDigest(vault, to, amount, nonce + 1n);

  console.log(`RPC:        ${endpoints().join(' → ')}`);
  console.log(`precompile: ${PQ_PRECOMPILE}`);
  console.log(`chain:      Arc mainnet (${CHAIN_ID})\n`);

  const cases = [
    ['authorization digest, valid signature', digest, signature, true],
    ['tampered signature', digest, tampered, false],
    ['valid signature over a different digest', otherDigest, signature, false],
  ];

  let failures = 0;
  let unanswered = 0;
  for (const [name, message, sig, expected] of cases) {
    let got;
    let error;
    try {
      got = await verifyOnMainnet(vk, message, sig);
    } catch (err) {
      error = err;
    }
    /* A case nobody could check is not a case that passed. It is counted against the run and it says
     * so, because reporting "unverified" as "PASS" is how a project comes to believe something that
     * is not true of it — and reporting it as a stack trace is how a reader stops reading. */
    if (error) unanswered++;
    const pass = !error && got === expected;
    if (!pass) failures++;
    const answer = error
      ? `no answer from ${endpoints().length} endpoints (${error.shortMessage ?? error.message})`
      : got;
    console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${name.padEnd(42)} expected=${expected} got=${answer}`);
  }

  console.log(
    failures === 0
      ? '\nthe vault authorization path is verified against the real Arc mainnet precompile'
      : unanswered === failures
        ? `\n${failures} case(s) could not be checked: no endpoint answered, so nothing is known about\nthe path yet. This is not a failing signature — run it again.`
        : `\n${failures} case(s) FAILED — do not deploy`,
  );
  /* The exit code is set rather than forced. process.exit() here tore down the process while the
   * three RPC clients were still closing their sockets, and Node aborted at the libuv layer on
   * Windows — exit 127 on a run whose every case passed, which is the one outcome a verification
   * command must never produce. Setting the code lets the loop drain and close on its own. */
  process.exitCode = failures === 0 ? 0 : 1;
}

const command = process.argv[2];
if (command === 'keygen') keygen();
else if (command === 'authorize') await authorize();
else if (command === 'conformance') await conformance();
else {
  console.log('usage: node pq.mjs <keygen|authorize|conformance> [--flags]');
  process.exit(2);
}
