# Contributing

Small project, small rules. The most useful thing you can send is a **counterexample**: a
signature the vault accepts that it should not, an authorization that replays, or a claim in the docs
that the chain contradicts.

## Setup

```bash
git clone --recurse-submodules https://github.com/thesithunyein/olinea
cd olinea/contracts && forge test          # 27 tests
cd ../scripts && npm install               # optional, for the CLI
```

`forge-std` is a submodule. If you cloned without `--recurse-submodules`, run
`git submodule update --init --recursive`.

## Before you open a pull request

```bash
cd contracts && forge fmt --check && forge test    # must be clean
cd .. && node scripts/check-site.mjs               # structural checks on the site and the console
```

Both run in CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)). A pull request that leaves
either red is not ready.

## Two rules that are not negotiable

**1. Never change the derivation without a version bump.** The 24-word backup maps to a verifying key
through PBKDF2 and then HKDF with the salt `olinea/slh-dsa/v1` and the info `vault/<index>`, producing
the 48-byte seed that `slh_dsa_sha2_128s.keygen` takes. **Every backup ever taken depends on those
bytes.** If a change is genuinely required, add a new salt version, keep the old path, and say in the
PR exactly which backups the change strands. noble's deterministic keygen is documented as a library
hook around its internal flow rather than a FIPS 205 derivation, which is why the noble version is
pinned — bumping it is a derivation change too.

**2. Never add a privileged role.** No owner, no admin, no pause, no proxy, no upgrade path, no
rescuer. If a proposal needs one to work, the proposal has failed — open an issue about the problem
instead. This is the property the whole project exists to demonstrate, and it is worth more than any
feature.

## What needs a test

Anything that touches money or keys. Practically: a new failure mode in the vault, a change to the
digest, a change to the derivation, or a new call path in the console. The critical test that must
never be weakened is the one asserting that a `false` return from the verifier is a **rejection** — the
precompile does not revert, so the vault has to decode the boolean. `NaiveVault.sol` exists to show
what happens without it.

When you add a mainnet-facing claim to the docs, say how you checked it, and prefer a command a reader
can rerun over a number they have to trust.

## Style

- Commit messages: a subject in the imperative, then why it was needed, then anything you decided
  against. No generated-by footers.
- Solidity: `forge fmt` decides, with `line_length = 110`.
- Web: no build step. The pages are hand-written HTML with ES modules and CDN imports, pinned to exact
  versions. Adding a bundler is a design decision, not a convenience — open an issue first.
- Comments explain *why*. The two comments worth preserving verbatim are the ones about decoding the
  precompile's boolean and about not using `overflow-x: hidden` on `html, body`, because both encode
  a bug that is invisible until it bites.

## Reporting security issues

Do not open an issue. See [SECURITY.md](SECURITY.md).

## Conduct

Participation is covered by the [Code of Conduct](CODE_OF_CONDUCT.md).
