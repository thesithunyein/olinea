# Olinea

**USDC a quantum computer can't move.**

A USDC vault on Arc that releases funds only when a post-quantum signature — **SLH-DSA-SHA2-128s**
(FIPS 205) — verifies on-chain through Arc's PQ precompile. No owner, no admin key, no pause, no
upgrade path. The vault has no privileged role at all, including for the people who wrote it.

[![License: MIT](https://img.shields.io/badge/license-MIT-6ee7b7?style=flat-square)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-27%20passing-6ee7b7?style=flat-square)](#verify-it-yourself)
[![Chain](https://img.shields.io/badge/chain-Arc%20mainnet%20%C2%B7%205042-6ee7b7?style=flat-square)](#the-primitive)
[![Signature](https://img.shields.io/badge/signature-SLH--DSA--SHA2--128s%20%C2%B7%207%2C856%20B-6ee7b7?style=flat-square)](#the-primitive)
[![Audit](https://img.shields.io/badge/audit-none-fca5a5?style=flat-square)](#security)
[![Deployment](https://img.shields.io/badge/deployed-not%20yet-fcd34d?style=flat-square)](#status)

| | |
|---|---|
| Site | https://olinea.sithunyein.com |
| **Try it** | **https://olinea.sithunyein.com/app/** — back up 24 words, prove the key against Arc mainnet, open a vault |
| Docs | https://olinea.sithunyein.com/docs/ |
| Contracts | [`contracts/src/OlineaVault.sol`](contracts/src/OlineaVault.sol) · [`OlineaFactory.sol`](contracts/src/OlineaFactory.sol) |

## The idea

Every USDC account on every chain today is guarded by an elliptic-curve key. A quantum computer running
Shor's algorithm breaks that, retroactively for recorded signatures. Arc ships a post-quantum precompile
that verifies **hash-based** signatures on-chain; Olinea is a small, boring piece of infrastructure built
on it, so the property is demonstrable rather than a whitepaper claim.

The console is the part that makes this checkable by someone who is not its author: it derives a real
SLH-DSA key in your browser from 24 words, and has **Arc mainnet's own precompile return `true` for a
signature it just made** — 7,856 bytes, about 9 seconds of your CPU, 260 ms to verify, **zero gas**.

![Olinea architecture](docs/architecture.svg)

## How a release works

```mermaid
sequenceDiagram
    autonumber
    participant U as Browser
    participant W as Web Worker<br/>SLH-DSA key
    participant P as PQ precompile<br/>0x1800…0004
    participant V as OlineaVault
    participant T as USDC ERC-20

    U->>W: sign(keccak256(abi.encode(chainId, vault, to, amount, nonce)))
    Note over W: 7,856 B · 6–16 s · the secret key never leaves the tab
    W-->>U: signature
    U->>P: eth_call verify(vk, digest, sig)
    P-->>U: true
    Note over U: checked before spending anything
    U->>V: release(to, amount, nonce, signature)
    V->>P: staticcall verify(vk, digest, sig)
    P-->>V: true
    V->>V: nonceUsed[nonce] = true, before the transfer
    V->>T: transfer(to, amount)
    V-->>U: Released(to, amount, nonce, digest)
```

The relayer never needs the key, and the key never needs an Arc account. Anyone can pay the gas for
someone else's release and gain nothing by it.

## Status

This section is the single source of truth, including the parts that are missing.

- [x] ABI of Arc's PQ precompile mapped from `circlefin/arc-node` and **verified against mainnet**
- [x] `OlineaVault.sol` — 17 Foundry tests, including a test that demonstrates the theft a careless
      implementation allows (`NaiveVault.sol`)
- [x] The vault's exact authorization digest verified against the **live mainnet precompile**
      (`node scripts/pq.mjs conformance` — 3/3, no wallet, no gas)
- [x] `OlineaFactory.sol` — one transaction per vault, no owner, nothing to administer — 10 Foundry tests
- [x] **Vault console** at `/app/` — 24-word backup, in-browser derivation, mainnet precompile proof,
      factory deploy, deposit, authorize, release, and the vault's own event history
- [ ] **The factory and a first vault deployed to Arc mainnet** — this costs about two cents of gas that
      the project does not have. Everything that needs a vault is verified end to end on a local chain
      with real transactions; the real precompile is verified separately on mainnet. Neither has been
      run against the other.
- [ ] Public evidence: the verifying transaction
- [ ] A third-party audit. There has not been one.

## Verify it yourself

No API key, no wallet, no Arc account, and no dependency on this project being honest: every command
below reads public state or runs locally.

```bash
git clone --recurse-submodules https://github.com/thesithunyein/olinea
cd olinea

# 1. the contracts
cd contracts && forge test                       # 27 tests, 0 failed

# 2. a real signature, verified by Arc's real precompile on mainnet
cd ../scripts && npm install
node pq.mjs conformance                          # valid → true; tampered / wrong key / wrong message → false

# 3. the site and console still agree with the contracts
cd .. && node scripts/check-site.mjs             # no network, no dependencies
```

## The primitive (verified, and undocumented anywhere else)

| Thing | Value |
|---|---|
| Precompile | `0x1800000000000000000000000000000000000004` |
| Selector | `0xbf4db8ba` — `verifySlhDsaSha2128s(bytes,bytes,bytes)` |
| Arguments | `(verifyingKey 32 B, message any length, signature 7856 B)` |
| Returns | `bool` — an invalid signature returns `false`, **it does not revert** |
| Gas | 382,879 ≈ $0.0077 per verification — about 1,300× a plain USDC transfer |

Verified on Arc mainnet with a real keypair: a valid signature returns `true`; a one-bit tampered
signature, a wrong public key, and a mismatched message all return `false`. Arc's execution layer is
public in `circlefin/arc-node` (`crates/pq-precompile`), so the ABI is not a secret — the work is in
executing it correctly and saying honestly what it does and does not buy you.

## The footgun

```solidity
// WRONG — accepts every forged signature, because a bad signature is a value, not an exception
(bool ok, ) = PRECOMPILE.staticcall(data);
require(ok, "verify failed");

// CORRECT
(bool ok, bytes memory ret) = PRECOMPILE.staticcall(data);
require(ok && abi.decode(ret, (bool)), "invalid PQ signature");
```

`contracts/src/mocks/NaiveVault.sol` is this mistake, written out on purpose and kept in the tree with a
test that lets the attacker walk away with the balance. Do not copy it.

## Project structure

```
olinea/
├── index.html                  the landing page                        → /
├── docs/
│   ├── index.html              the documentation                       → /docs/
│   └── architecture.svg        the diagram above, and in the docs
├── app/
│   ├── index.html              the vault console                       → /app/
│   └── worker.js               keygen and signing, off the main thread
├── contracts/                  Foundry project
│   ├── src/
│   │   ├── OlineaVault.sol     the vault: no owner, no admin, no upgrade path
│   │   ├── OlineaFactory.sol   createVault(bytes verifyingKey) in one transaction
│   │   ├── interfaces/         IPQ.sol · IUSDC.sol — the ABIs, kept minimal
│   │   └── mocks/              MockUSDC · MockPQ · NaiveVault (deliberately broken)
│   ├── test/                   OlineaVault.t.sol (17) · OlineaFactory.t.sol (10)
│   ├── lib/forge-std           a submodule — clone with --recurse-submodules
│   ├── README.md               the two load-bearing details and the mainnet runbook
│   └── foundry.toml            arc / arc_blockdaemon RPC endpoints · fmt rules
├── scripts/
│   ├── pq.mjs                  keygen · authorize · conformance — no wallet, no gas
│   └── check-site.mjs          structural checks: docs and console vs the contracts
├── .github/                    CI (contracts + site), issue forms, PR template
├── .vercelignore               the deploy publishes web pages and nothing else
├── .editorconfig
├── SECURITY.md                 threat model: what this protects you from, and what it does not
├── CONTRIBUTING.md             setup, and the two rules that must not be broken
├── CHANGELOG.md                Keep a Changelog
├── CODE_OF_CONDUCT.md
└── LICENSE                     MIT
```

There is no build step and no bundler. The pages are hand-written HTML with ES modules imported from a
CDN at pinned versions, so what is deployed is what is in the repository — the live site can be diffed
against a commit, byte for byte. `LOCAL/` and build output are gitignored; nothing else is.

## Security

Read [**SECURITY.md**](SECURITY.md) before trusting this with money. The short version:

- **What it guarantees.** No privileged role exists; the verifying key is a constructor argument and is
  never reassigned; a release needs a signature over a digest binding the chain, the vault, the
  recipient, the amount and a nonce; the nonce is consumed before the transfer; and the precompile's
  boolean is decoded, so a forged signature is a rejection rather than a successful call.
- **What it does not.** USDC on Arc still honours Circle's denylist — the largest caveat in the project.
  A compromised browser defeats everything below it. Only the *release* path is post-quantum; a deposit
  is an ordinary ERC-20 transfer authorised by an ECDSA account. Lose the 24 words and the USDC is
  unspendable by anyone, permanently. This is unaudited.
- **Reporting.** Anything that could move funds without a valid signature goes to
  **sithunyein.mailto@gmail.com**, not the issue tracker. There is no bug bounty — this is an unfunded
  project and there is no pot to pay from.

## Roadmap

Ordered by how much it would change an honest reader's mind, not by how impressive it sounds.

1. **Deploy.** About two cents of gas, and it converts the largest untested seam in this repository —
   "the vault runs on a local chain, the precompile was proven on mainnet" — into a single tested path.
2. **M-of-N release.** k-of-n SLH-DSA signatures over the same digest, reusing the same precompile.
   The digest already binds the whole intent, so the contract change is small and the story is not:
   a vault that no single compromised machine can open.
3. **Make the console's limits visible in the console.** A per-transaction cap and an allowlist enforced
   on-chain, so a stolen key has a bounded loss rather than an unbounded one.
4. **Borrowing, when it is real.** Arc mainnet has 14 live Morpho markets reachable through Circle's
   Borrow Kit with no credential, and a total of **0.274 USDC** of borrowable liquidity across all of
   them. A borrow feature built today is a UI for a market where nobody can borrow. Revisit when that
   number is worth a user's time; the interesting composition is a borrowing position whose authority
   is post-quantum, which is a genuine gap in the sample Circle shipped.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The two rules that are not up for debate: **never change the
key derivation without a version bump** (every backup depends on those bytes), and **never add a
privileged role**. Participation is covered by the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

MIT © 2026 Sithu Nyein. See [LICENSE](LICENSE).
