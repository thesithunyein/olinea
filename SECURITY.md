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
  small enough to read in one sitting, that 27 Foundry tests cover the failure modes, and that every
  claim in the docs was checked against mainnet. That is not the same thing as an audit.

## The precompile footgun, restated

This is the one mistake that silently voids the vault, so it is stated twice on purpose:

> An invalid signature **does not revert**. `verifySlhDsaSha2128s` returns `false` as a successful
> call. A contract that checks only that the `staticcall` succeeded accepts **every** forgery.

`contracts/src/mocks/NaiveVault.sol` is a deliberately broken contract that makes exactly this error —
`require(ok)` with no decoding — and it is kept in the tree with a test that demonstrates the theft, so
the failure is visible rather than theoretical. Do not copy it.

## Deployment status

Nothing is deployed on Arc mainnet yet. The status section of the [README](README.md) is the single
source of truth; when an address appears there, the code at that commit is what is running, and its
SHA-256 is checkable against the site.

## Supported versions

There are no releases and no backports. `main` is the only supported version. A fix will be applied to
`main` and described in [CHANGELOG.md](CHANGELOG.md).
