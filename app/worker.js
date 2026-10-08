/*
 * Olinea vault console — post-quantum key worker.
 *
 * SLH-DSA-SHA2-128s keygen costs about 1.3–2.2 s and a single signature costs 9–16 s in a
 * browser. Both block the thread they run on, so they run here and the page stays interactive.
 *
 * noble reports no progress from inside keygen or sign, so each stage is announced *before* it
 * starts and the page renders its own elapsed timer. The durations above are measurements, not
 * guesses — the page records your device's real numbers as it goes.
 *
 * The secret key never leaves this worker: the page receives the verifying key only, and asks
 * for a signature by handing over a 32-byte digest.
 */

const CDN = 'https://esm.sh';

/* Changing anything in this derivation breaks every backup taken with the old one. It is versioned
 * for exactly that reason. See docs#vault. */
const DERIVATION_SALT = 'olinea/slh-dsa/v1';

let mods;
let secretKey = null;
let verifyingKey = null;

async function load() {
  if (mods) return mods;
  const [bip39, wordlist, hkdf, sha2, pq] = await Promise.all([
    import(`${CDN}/@scure/bip39@2.4.0`),
    import(`${CDN}/@scure/bip39@2.4.0/wordlists/english.js`),
    import(`${CDN}/@noble/hashes@2.4.0/hkdf.js`),
    import(`${CDN}/@noble/hashes@2.4.0/sha2.js`),
    import(`${CDN}/@noble/post-quantum@0.7.1/slh-dsa.js`),
  ]);
  mods = {
    bip39,
    wordlist: wordlist.wordlist ?? wordlist.english ?? wordlist.default,
    hkdf: hkdf.hkdf,
    sha256: sha2.sha256,
    slh: pq.slh_dsa_sha2_128s,
  };
  return mods;
}

const toHex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (s) => {
  const h = String(s).replace(/^0x/, '');
  if (h.length % 2 || /[^0-9a-f]/i.test(h)) throw new Error('not valid hex');
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
};

function reply(id, body) {
  self.postMessage({ id, ...body });
}

function stage(id, name) {
  self.postMessage({ id, stage: name });
}

async function derive(id, mnemonic, index) {
  const m = await load();

  /* The words are the backup; everything below is reproducible from them. */
  stage(id, 'mnemonic');
  if (!m.bip39.validateMnemonic(mnemonic, m.wordlist)) throw new Error('that phrase is not a valid BIP-39 backup');
  const seed64 = await m.bip39.mnemonicToSeed(mnemonic, '');

  stage(id, 'hkdf');
  const seed48 = m.hkdf(
    m.sha256,
    seed64,
    new TextEncoder().encode(DERIVATION_SALT),
    new TextEncoder().encode(`vault/${index}`),
    48,
  );

  /* SLH-DSA-SHA2-128s takes a 48-byte seed here. noble documents this deterministic keygen as a
   * library hook around its internal flow, not a FIPS 205 derivation, which is why the noble
   * version is pinned and the derivation is versioned. */
  stage(id, 'keygen');
  const pair = m.slh.keygen(seed48);
  secretKey = pair.secretKey;
  verifyingKey = toHex(pair.publicKey);

  return { mnemonic: mnemonic.trim().toLowerCase(), verifyingKey, secretKeyBytes: secretKey.length, publicKeyBytes: pair.publicKey.length };
}

async function sign(id, digest) {
  const m = await load();
  if (!secretKey) throw new Error('no key in this tab — restore your backup first');
  const message = fromHex(digest);
  stage(id, 'sign');
  const signature = m.slh.sign(message, secretKey);
  return { signature: '0x' + toHex(signature), signatureBytes: signature.length, message: '0x' + toHex(message) };
}

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    if (type === 'warmup') {
      const m = await load();
      return reply(id, { ok: true, wordlist: m.wordlist.length });
    }
    if (type === 'words') {
      const m = await load();
      stage(id, 'entropy');
      const mnemonic = m.bip39.generateMnemonic(m.wordlist, 256);
      return reply(id, { ok: true, mnemonic });
    }
    if (type === 'derive') {
      const out = await derive(id, data.mnemonic, data.index);
      return reply(id, { ok: true, ...out, fingerprint: null });
    }
    if (type === 'sign') {
      return reply(id, { ok: true, ...(await sign(id, data.digest)) });
    }
    if (type === 'check') {
      const m = await load();
      const expected = data.expected.toLowerCase();
      const seed64 = await m.bip39.mnemonicToSeed(data.mnemonic, '');
      const seed48 = m.hkdf(
        m.sha256,
        seed64,
        new TextEncoder().encode(DERIVATION_SALT),
        new TextEncoder().encode(`vault/${data.index}`),
        48,
      );
      const { publicKey } = m.slh.keygen(seed48);
      return reply(id, { ok: true, matches: toHex(publicKey) === expected, verifyingKey: toHex(publicKey) });
    }
    throw new Error(`unknown message ${type}`);
  } catch (err) {
    reply(id, { ok: false, error: (err && err.message) || String(err) });
  }
};
