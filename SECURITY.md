# Security policy

Olinea is a **small, unaudited, single-purpose contract** and a static web front end. This document is
the honest version of what it does and does not protect you from. Read it before trusting it with
money.

## Reporting a vulnerability

Email **sithunyein.mailto@gmail.com** with a description, the affected file or address, and a way to
reproduce it. Please do not open a public issue for anything that could move funds.

| | |
|---|---|
| First response | within 72 hours |
| Disclosure | coordinated — we will agree a date, and credit you unless you prefer otherwise |
| Bug bounty | **none.** This is an unfunded project; there is no pot to pay from |

This is a one-person project with no on-call rotation. If a report needs a fix faster than that, treat
the deployment as abandoned rather than patched.

## Scope

**In scope** — anything that lets someone move USDC out of a vault without a valid SLH-DSA signature,
replay a used authorization, or release more than the vault holds:

- `contracts/src/OlineaVault.sol`
- `contracts/src/OlineaFactory.sol`
- `app/worker.js` and `app/index.html` — the derivation, the digest, and the signature path
- the deployed bytecode of any instance of the above

**Out of scope**

- Arc's PQ precompile at `0x1800000000000000000000000000000000000004`, the USDC ERC-20, and the
  cross-chain USDC machinery. Report those to Circle.
- Losing your own 24 words. There is no recovery path and there is not meant to be one.
- Anything that requires the user's device to already be compromised, including a hostile browser
  extension reading `localStorage` (see *The throwaway account* below).
- The gas-only accounts the console can generate. They hold pocket change by design and are not a
  vault key.

## What the design guarantees

1. **No privileged role exists.** The vault has no owner, no admin, no pause, no proxy and no upgrade
   path. The verifying key is a constructor argument and is never reassigned. Nothing can redirect
   funds or freeze the balance — including us.
2. **A release needs a signature over exactly one intent.** The signed digest is
   `keccak256(abi.encode(block.chainid, address(vault), to, amount, nonce))`. It binds the chain id, the
   specific vault, the recipient, the amount and a nonce, so an authorization cannot be replayed on
   another chain, inside another vault, to another recipient, or twice.
3. **Nonces are consumed, not counted.** `nonceUsed[nonce]` is set before the transfer, so a
   re-entrant or duplicate call with the same nonce fails the second time.
4. **Failures are closed, not open.** Arc's precompile returns `false` for a forged signature **without
   reverting**. The vault decodes the returned boolean and requires it to be exactly `true`; a call
   that merely *succeeded* is treated as a rejection. Malformed input that makes the precompile revert
   is caught and also treated as a rejection.
5. **The balance is checked against the chain, not a cached number.** `release` reads
   `balanceOf(address(this))` in the same transaction.

## What it does **not** protect you from

- **A freeze.** USDC on Arc still honours Circle's denylist. A key that survives quantum computers does
  not protect you from an issuer decision. This is the largest caveat in the project.
- **A compromised browser.** The secret key is derived in a Web Worker and never leaves the tab, but it
  does live in that tab's memory, and the 24 words are typed into a page served by someone else. A
  compromised CDN, a hostile extension or a tampered build defeats everything below it. If that is in
  your threat model, build the key yourself: `node scripts/pq.mjs keygen` runs entirely offline.
- **Weak entropy at backup time.** The 24 words come from `crypto.getRandomValues` in a module worker.
  If your browser's CSPRNG is broken, the key is guessable and no design detail here helps.
- **Lost words.** There is no seed escrow, no social recovery and no support line. Lose the backup and
  the vault's USDC is unspendable by anyone, permanently.
- **Quantum threats to *deposits*.** A deposit is an ordinary ERC-20 `transferFrom` authorised by an
  ECDSA account. Only the *release* path is post-quantum. Olinea protects the money once it is inside.
- **Post-quantum authenticity of the front end.** The site is served over TLS with ECDSA certificates
  like everyone else's.
- **Audit-grade assurance.** There has been no third-party audit. The mitigations are that the vault is
  small enough to read in one sitting, that 31 Foundry tests cover the failure modes, and that every
  claim in the docs was checked against mainnet. That is not the same thing as an audit.

## When it goes wrong: four drills

These are the first questions an auditor asks, so here are the answers with the file or the test that
settles each one, rather than an adjective.

### 1. Circle denies the vault's address

Arc's USDC honours the issuer's denylist, and a denied transfer reverts. A genuine authorization cannot
get around that: the signature verifies inside the precompile, real gas is spent, and the transfer
fails. There is no owner to appeal to, no pause to lift and no second asset to fall back on — that is
the design, not a gap in it.

What survives is worth stating precisely. `release` consumes the nonce *before* it transfers, but a
reverted transaction rolls the whole thing back, so the nonce is **not** spent: the same signed
authorization still works once the deny is lifted. The balance stays readable at `balance()`
throughout, so a denied vault looks exactly like a funded one from outside.
`contracts/test/OlineaVault.t.sol::test_aDeniedAddressKeepsItsFundsAndItsNonce` proves the rollback, and
`test_aDepositIntoADeniedVaultReverts` shows the deny closes the door on the way in too.

The honest answer to "so what do you do?" is that nothing on-chain works. Moving the money to a new
vault does not help either: the money is at the old address, and leaving it needs the same transfer
that is being refused.

### 2. The deployer key is lost

The key that deployed the factory is not a key to anything else. The factory has no owner, no pause, no
upgrade path and no self-destruct, and every vault is an ordinary contract of its own that holds no
reference to the factory at all.

So losing it costs exactly this: no further vaults through **that** factory, and no further deployments
from that account. Nothing that already exists stops working.
`contracts/test/OlineaFactory.t.sol::test_theVaultOutlivesTheFactory` erases the factory's code outright
and releases from a vault it created anyway.

What it costs in convenience is one redeploy. The factory is a convenience rather than an authority,
the app trusts a vault because it can read that vault's own `verifyingKey`, and `?vault=<address>`
accepts a vault deployed by any means at all.

### 3. SLH-DSA-SHA2-128s has to be replaced

The verifying key is fixed at construction and is never reassigned, so a vault cannot rotate its key.
That is deliberate: rotation needs an authority to perform it, and an authority is the thing this
design exists to do without.

Migration is therefore a release into a replacement vault, signed by the old key — create a vault with
the new key (the same factory, a new factory, or `new OlineaVault(...)` directly), release the old
vault's whole balance into it from nonce 0, and the old key then authorizes nothing worth taking.
`test_replacingAKeyIsAReleaseIntoTheNewVault` does exactly that, then shows the new vault rejecting the
old key. The limit is stated rather than hidden: this path needs the old key *and* the old signature
path still working, which is the same assumption every release already makes. If the primitive itself
broke, the funds are as exposed as the primitive is, and there is no in-place answer.

Two things make a future swap a deployment rather than a rewrite. The algorithm is not baked into the
app: a vault takes its verifier address as a constructor argument, production passes `address(0)` and
that resolves to the canonical precompile at `0x1800..0004`, so a new precompile is a new deployment.
And the key derivation is versioned (`DERIVATION_SALT`) against pinned library versions, so a future
change of algorithm cannot silently change the keys an existing backup restores.

### 4. A vault whose key was never written down

This one is live, which is why it is here. `0x88fCbF5896902527C175A9114584d5E92Cac8eB9` is authorized
by a keypair from `node scripts/pq.mjs keygen` — the offline path, which produces a key and no words.
The file that holds it, `scripts/keys/pq-key.json`, is gitignored, so one machine holds the only copy.

Lose that file and the 0.05 USDC still in the vault is unspendable permanently, for the same reason lost
words are: no escrow, no recovery, and no way for anyone — including the people who wrote this — to move
it. The difference is only that these words were never written down. The vault created from a browser
tab's 24 words (`0xA36f07ee…`, 0.10 USDC) is the one to copy if you are copying one.

While the key still exists, the answer is one release: send that balance to the word-backed vault and
retire the key. After that it is a write-off of 0.05 USDC, which is what it has been since it was
deployed without a backup.

## The precompile footgun, restated

This is the one mistake that silently voids the vault, so it is stated twice on purpose:

> An invalid signature **does not revert**. `verifySlhDsaSha2128s` returns `false` as a successful
> call. A contract that checks only that the `staticcall` succeeded accepts **every** forgery.

`contracts/src/mocks/NaiveVault.sol` is a deliberately broken contract that makes exactly this error —
`require(ok)` with no decoding — and it is kept in the tree with a test that demonstrates the theft, so
the failure is visible rather than theoretical. Do not copy it.

## Deployment status

The factory is deployed on Arc mainnet: `0x09574E49690ad378b21D2cb42a529f71A0D1DAdB`,
deployed by `0x6a801dfb7213b78a45b4eccd39ba324f18e68e2d2ac1ba677a35cf9662faf405`.
The status section of the [README](README.md) is the single source of truth; when an address appears
there, the code at that commit is what is running, and its SHA-256 is checkable against the site.

What is **not** deployed yet: a user vault created through the factory and used end to end in the
console. The console's vault path (create → deposit → authorize → release) is wired to the deployed
factory, and a funded vault on the deployed factory is the remaining demo.

## Supported versions

There are no releases and no backports. `main` is the only supported version. A fix will be applied to
`main` and described in [CHANGELOG.md](CHANGELOG.md).
