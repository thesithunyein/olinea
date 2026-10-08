## What this changes

<!-- One or two sentences. What was wrong or missing, and what it does now. -->

## Why

<!-- The reasoning. If you decided against an approach, say which and why — that is usually the most
     useful part of a pull request. -->

## Which rule does this touch?

- [ ] Neither of the two non-negotiable rules (see [CONTRIBUTING.md](../CONTRIBUTING.md))
- [ ] It changes the key derivation — a salt or version bump, with the affected backups named below
- [ ] It adds a privileged role — **stop and open an issue instead**

## Checks

- [ ] `cd contracts && forge fmt --check && forge test`
- [ ] `node scripts/check-site.mjs`
- [ ] If it touches money or keys, there is a test that fails without the change
- [ ] If it adds a claim about mainnet, the command that verifies it is written down

## Evidence

<!-- Paste the command you ran and its output. "Tests pass" is not evidence; the output is. -->

```
```
