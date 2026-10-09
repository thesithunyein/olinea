# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The factory is deployed on Arc mainnet — see below — so some versions below are versions of a live address, and some are versions of the source only.

## [Unreleased]

### Added

- Project files: this changelog, `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, an
  architecture diagram, and a CI workflow that runs the Foundry suite and the structural checks.

### Changed

- **The console opens on a dashboard.** Five tiles — Key, Proof, Vault, Gas account and Chain — say
  where you are without a paragraph, and each one opens the tab that owns the work. The page title
  shrank to an application's size, and the section tabs pin themselves under the app bar rather than
  scrolling away. The proof and vault tiles are repainted from state, so they cannot drift from what
  the panels below show.

### Fixed

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
