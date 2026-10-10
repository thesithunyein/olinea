# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The factory is deployed on Arc mainnet — see below — so some versions below are versions of a live address, and some are versions of the source only.

## [Unreleased]

### Added

- **A vault on Arc mainnet, used end to end.** `0x88fCbF5896902527C175A9114584d5E92Cac8eB9`, created
  through the deployed factory, 0.10 USDC deposited with `deposit()`, then 0.05 USDC released against an
  SLH-DSA-SHA2-128s signature that Arc's precompile returned `true` for — before the transaction was
  broadcast, in an `eth_call` that cost nothing. 0.05 USDC is still in the vault, and nonce 1 is spent.
  Every hash is in the README's Deployment table.
- Project files: this changelog, `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, an
  architecture diagram, and a CI workflow that runs the Foundry suite and the structural checks.

### Changed

- **A vault no longer needs a key to be read.** Its address, balance and record come from Arc, not from
  a secret, so the Vault tab now opens on a vault that is in view instead of asking for a key first. The
  key is still what creates a vault and what moves money — a visitor with no wallet can now check
  someone else's vault against the chain instead of taking a screenshot's word for it.
- **The console ships the deployed factory as its default.** `/app/` works from a bare link; the
  `?factory=` parameter and `localStorage` remain overrides rather than requirements.
- **The README's first screen survives GitHub.** GitHub strips inline `style`, so the centered wrapper
  never centered anything — the logo now uses `<picture>` inside `align="center"`, which GitHub keeps,
  and the Deployment badge no longer swallows the `## The problem` heading it was welded to.
- **The console opens on a dashboard.** Five tiles — Key, Proof, Vault, Gas account and Chain — say
  where you are without a paragraph, and each one opens the tab that owns the work. The page title
  shrank to an application's size, and the section tabs pin themselves under the app bar rather than
  scrolling away. The proof and vault tiles are repainted from state, so they cannot drift from what
  the panels below show.

### Fixed

- **`scripts/check-site.mjs` had been cut from 449 lines to 14** — the header and one constant. It still
  exited 0, so CI's structural check passed without checking anything. The whole file is back, it reads
  `CONFIG_factory` from the environment instead of crashing on it, and it now holds at 182 assertions.
- **The README's `#verify-it-yourself` anchor had no section**, though the badge row and the table of
  contents both linked to it. The section is back, and every anchor in the file resolves again.
- **A hidden flex row painted anyway.** `.row { display: flex }` outranks the browser's own `[hidden]`
  rule, so the disabled "Create my key" button was on the first screen before any words existed.
  Nothing marked hidden can be drawn now, whatever an author rule says.

## [0.2.0] — 2026-10-08

The release that made this usable by someone who is not its author.

### Added

- **Vault console** at `/app/`. A 24-word BIP-39 backup is stretched by PBKDF2 and HKDF (salt
  `olinea/slh-dsa/v1`, info `vault/<index>`) into the 48-byte seed that SLH-DSA-SHA2-128s keygen takes;
  key generation and signing run in a Web Worker so the page stays interactive through the 6–16 s a
  signature costs. The console creates a vault, funds it, authorizes a release, and checks that
  authorization against Arc's precompile **before** anything is broadcast.
- **`OlineaFactory.sol`** — `createVault(bytes verifyingKey)` in one transaction, plus `vaultsOf`,
  `vaultCount` and `vaultAt`. No owner, holds no funds, nothing to administer. `isVault` is
  informational only: the console trusts a vault by reading its `verifyingKey()`, never by the
  factory's word. 10 Foundry tests.
- Live event history read from the vault (`Deposited` / `Released`), and `nonceUsed` reporting so a
  spent nonce is visible before you sign.
- Docs: the console's derivation is now pinned in `docs/#quickstart`, because a salt change would
  strand every backup made before it.

### Fixed

- **viem's retry policy re-sent definitive reverts.** Asking a non-vault address for `verifyingKey()`
  took about ten seconds to say "not a vault" because a revert was being retried with backoff across
  both RPC providers. Retries are now handled locally and only for failures that might succeed next
  time; a revert is an answer, not a glitch.
- The console asked for a token balance *before* checking whether an address was a vault at all. It now
  establishes identity first, which is both faster and a better answer.
- The mainnet-proof step gated vault creation, so a flaky RPC could leave you unable to open a vault.
  Proving the key is recommended, never required.
- The vault balance went stale after a release.
- esm.sh's `viem` root bundle does not export `privateKeyToAccount` or `generatePrivateKey`; they come
  from the `viem/accounts` submodule.

## [0.1.0] — 2026-10-07

### Added

- `OlineaVault.sol` — USDC in escrow, released only when an SLH-DSA-SHA2-128s signature verifies
  on-chain through Arc's PQ precompile. No owner, no admin, no pause, no upgrade path. The signed
  digest is `keccak256(abi.encode(block.chainid, address(vault), to, amount, nonce))`.
- Command-line tooling (`scripts/pq.mjs`): `keygen`, `authorize --check`, and `conformance`, which
  verifies a real signature against the **live mainnet precompile** with no wallet and no gas.
- Landing page, documentation, and the deploy hygiene that stopped Vercel publishing repository
  internals as public web assets — `.vercelignore` plus security headers; deployment size fell from
  1.8 MB to 60.7 KB.
- 17 Foundry tests for the vault, including the theft that `NaiveVault.sol` demonstrates.

### Verified, not just written

- The precompile's ABI was mapped from `circlefin/arc-node` and confirmed on Arc mainnet: a valid
  signature returns `true`; a one-bit tampered signature, a wrong verifying key and a mismatched
  message all return `false` **without reverting**.
- Precompile `0x1800000000000000000000000000000000000004`, selector `0xbf4db8ba`,
  382,879 gas per verification, 7,856-byte signatures.
