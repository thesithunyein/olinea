# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The factory is deployed on Arc mainnet — see below — so some versions below are versions of a live address, and some are versions of the source only.

## [Unreleased]

### Added

- **The release path, drawn — a 3D strip between the three claims and "How it works".** The landing
  said the order of operations in words and left the reader to trust it; the strip now shows it: a
  vault on the left, Arc's precompile as a gate in the middle, and a stream of signature bytes that
  crosses from one to the other, turning from ink to accent the moment it is past the gate. Once per
  cycle a coin leaves the vault, the gate pulses as the coin crosses it, and only then does the coin
  travel out — the drawing happens in the order the page claims it does. It is procedural geometry
  from the three.js already committed beside the page (`assets/three/flow.js`, 11 KB, no model file,
  no host, nothing fetched), it draws only while it is on screen, a visitor who asked their OS for
  less motion gets one composed frame at the moment of verification, and the caption underneath says
  the whole thing for a browser without WebGL. `scripts/check-site.mjs` holds the canvas to one, the
  module to the deploy and the caption to its wording, and the page is still inside the 40 KB budget
  a person can read (37.4 KB).
- **The README is checked like the rest of the site.** `scripts/check-site.mjs` now reads it as a
  document instead of a file that happens to be in the tree: every `#` anchor in it — the badges
  included, not only the table of contents — has to resolve to a real section, every section has to be
  listed in that table, the test-count badge and the counts in the structure listing are counted from
  the suite itself, the precompile address, its selector and the 7,856-byte signature have to be
  there, every file and every `pq.mjs` subcommand it tells a reviewer to run has to exist and be
  dispatched, the factory address it publishes has to be the one the console defaults to and the
  submission page opens, and the audit it does not have has to stay disclaimed. Proven by mutation,
  because a check that has never failed is a check nobody has tested: a badge reading 30, a renamed
  anchor in the table of contents, a renamed anchor in a badge, a deleted `## Security` heading and a
  factory address that drifted from the console each fail the run, and restoring the file returns it
  to zero.
- **Every page loads from one origin, and the crypto is proved to be the same crypto.** The console's
  viem and noble primitives came from esm.sh, the hero's three.js from jsdelivr and the typeface from
  Google — several hundred requests to three hosts we do not control, on the critical path of the one
  page that has to work. The crypto is now bundled into `app/vendor/` (seven dynamic imports across
  five packages, versions pinned to the ones the derivation was measured against), three.js under
  `assets/three/` and 18 Poppins faces under `assets/fonts/`, so a cold load names no host but this one.
  `scripts/vendor/parity.mjs` is what makes that a swap rather than a rewrite: the vendored bundle
  derives the same key as the packages it was built from, and it re-derives the live vault's on-chain
  key from that vault's own 24 words — the chain is holding a key a browser made before any of this was
  bundled, so a match means the shipped path is unchanged. None of the requests are made at runtime
  either: `check-site.mjs` fails on any off-origin subresource in a shipped page, on any CDN specifier
  left inside a vendored file, and on any asset a page names that is not in the deploy. The claim is
  enforced rather than asserted — a Content-Security-Policy now confines scripts, styles, images, fonts
  and workers to this origin — and the app is verified under it: the local server applies the headers
  from `vercel.json`, so the policy a page is tested with is the policy it is served with.
- **Four failure drills, and a test for each one.** `SECURITY.md` now answers what an auditor asks first
  with the file or the test that settles it: Circle denying the address (the release reverts, the
  nonce rolls back with it, and the same signed authorization works when the deny lifts), the deployer
  key lost (the factory is erased in the test and the vault releases anyway), replacing SLH-DSA (a
  release into a replacement vault, since there is no rotation without an authority), and the live
  vault whose key was never written down. The suite is 31 tests.
- **A vault created from the console's own 24-word backup, used end to end on Arc mainnet.**
  `0xA36f07eEB907C0eBc09ecb79802f5037a0382A22`: 24 words generated in the tab, the SLH-DSA key
  derived there, the vault created through the deployed factory with that key, 0.20 USDC deposited, and
  0.10 USDC released. The page cross-checked its digest against the vault's own `authorizationDigest`
  ("identical to the vault's own hash"), signed in 21.0 s, and Arc's precompile accepted the signature
  in 404 ms before anything was broadcast. 0.10 USDC remains, spendable only with the words.
- **A vault on Arc mainnet, used end to end.** `0x88fCbF5896902527C175A9114584d5E92Cac8eB9`, created
  through the deployed factory, 0.10 USDC deposited with `deposit()`, then 0.05 USDC released against an
  SLH-DSA-SHA2-128s signature that Arc's precompile returned `true` for — before the transaction was
  broadcast, in an `eth_call` that cost nothing. 0.05 USDC is still in the vault, and nonce 1 is spent.
  Every hash is in the README's Deployment table.
- Project files: this changelog, `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, an
  architecture diagram, and a CI workflow that runs the Foundry suite and the structural checks.

### Changed

- **The README opens on the project, not on its history.** The shields now sit directly under the
  title, where a reader looks for them. The Status list is gone — every fact it carried (the factory,
  both vaults, the 21.0 s browser signature, the audit that does not exist) already lives in the
  Deployment table or the paragraph under it, and two places that can disagree is one too many. The
  structure listing was checked against the tree instead of against memory: `vercel.json`,
  `submit.html`, the light-cut diagram and the mark cuts had all been missing from it. And the
  conformance line in "Verify it yourself" no longer advertises a wrong-key case the command does not
  run — that case was checked against Arc mainnet on its own and does return `false`, which is what
  the primitive table has always said.
- **The vault chip says which of three situations it is.** It had two: matching or not. The paragraph
  under it has three — this key, another key, no key in this tab — so a visitor with no key at all, who
  is only reading someone else's vault, was shown the red warning that belongs to a person holding a
  vault they cannot open. It is neutral now, because reading is not a warning.
- **The console moves on from a provider that stalls.** Both public RPC endpoints are measured with a
  real read at boot, the faster one is asked first, each request is wrapped so the console knows which
  endpoint actually answered, and an endpoint that fails is rested before it is asked again. Against a
  local provider that accepted every request and replied to none, the probe abandoned it at 4.0 s, the
  in-flight read at 8.0 s, and it was asked nothing further while the console carried on reading Arc.
- **The signing-time copy matches the measurement.** It said 6–16 s; the console's own browser run
  measured 25.1 s for the proof signature and 21.0 s for the release, so the copy, the worker header,
  the README diagram and this file now say 10–30 s and cite the run.
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

- **The cost of a release was stated as 382,879 gas and $0.0077 on every surface, and the chain says
  448,502 gas and 0.008970824 USDC.** Read from the release transaction's own receipt. The old figure
  was a verification-only estimate wearing the label of a release, so the README, the docs table, the
  docs limitations list, the two architecture drawings and the landing page now state what the chain
  charged, and `scripts/check-site.mjs` pins the measured number and fails if the stale one returns.
  The "about 1,300× a plain transfer" comparison is gone rather than adjusted: no plain USDC transfer
  on Arc could be measured to support any ratio. `contracts/README.md` also advertised `forge test`
  as 17 tests; the suite is 31, 19 for the vault and 12 for the factory.
- **The conformance check no longer lies in either direction.** `node pq.mjs conformance` had two
  faults, and the first fix addressed only the second. It forced the process down while three RPC
  clients were still closing their sockets, so it returned **127** on a run whose every case passed.
  And when an endpoint did not answer — which one of the two public providers does, regularly — the
  error escaped as an unhandled rejection: a stack trace carrying the whole 7,856-byte signature, and
  no verdict at all. The exit code is now set and the loop drains on its own; each case asks both
  endpoints the console uses before giving up; and a case nobody could check is reported as unchecked
  and counted against the run, never as a PASS and never as a stack trace. Three consecutive runs now
  return 0 in 7–9 s with all three cases verified.
- **The Authorize panel was unreachable whenever a factory was set and a key was in memory.**
  `renderKey()` wrote to `vault-soon-chip`; the element is `v-soon-chip`. The lookup returned null, the
  function threw before its last line, and that last line was the one that un-hides the Authorize form —
  so the console that creates a vault could not authorize a release out of it. `scripts/check-site.mjs`
  now pairs every id the app looks up with the ids in its own markup, which is the check that would have
  caught it; it found no others.
- **A vault read as "different key" after its own key was restored.** A key arriving after the vault did
  not repaint the vault card, so a restored backup was shown the warning meant for someone else's vault.
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
  key generation and signing run in a Web Worker so the page stays interactive through the 10–30 s a
  signature costs (25.1 s measured in the console's own browser run on the machine that shipped it). The console creates a vault, funds it, authorizes a release, and checks that
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
