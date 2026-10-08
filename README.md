# Olinea

**USDC a quantum computer can't move.** A USDC vault on Arc that releases funds only when a
post-quantum signature — SLH-DSA-SHA2-128s (FIPS 205) — verifies on-chain via Arc's PQ precompile.

Live site: **https://olinea.sithunyein.com**

## Status

- [x] ABI of Arc's PQ precompile mapped and verified against mainnet (see below)
- [x] `OlineaVault.sol` + conformance suite — **17 Foundry tests green**, and the vault's exact
      authorization digest verified against the **real mainnet precompile** (`node scripts/pq.mjs conformance`, 3/3)
- [ ] Vault deployed to Arc mainnet
- [ ] Web app: browser keygen, deposit, authorize, verify
- [ ] Public evidence: the verifying transaction


## The primitive (verified, undocumented anywhere else)

| Thing | Value |
|---|---|
| Precompile | `0x1800000000000000000000000000000000000004` |
| Selector | `0xbf4db8ba` — `verifySlhDsaSha2128s(bytes,bytes,bytes)` |
| Arguments | `(verifyingKey 32 B, message any length, signature 7856 B)` |
| Returns | `bool` — an invalid signature returns `false`, **it does not revert** |
| Gas | 382,879 ≈ $0.0077 per verification |

Verified on Arc mainnet with a real keypair: a valid signature returns `true`; a 1-bit tampered
signature, a wrong public key, and a mismatched message all return `false`.

## The footgun

```solidity
// WRONG — accepts every forged signature, because a bad signature is a value, not an exception
(bool ok, ) = PRECOMPILE.staticcall(data);
require(ok, "verify failed");

// CORRECT
(bool ok, bytes memory ret) = PRECOMPILE.staticcall(data);
require(ok && abi.decode(ret, (bool)), "invalid PQ signature");
```

## Contracts

`contracts/` holds the vault: a USDC vault whose releases are authorized by an SLH-DSA-SHA2-128s
signature verified on-chain through Arc's PQ precompile. No owner, no admin, no upgrade path.

```bash
cd contracts && forge test          # 17 tests
cd ../scripts && npm install && node pq.mjs conformance   # real mainnet precompile, no wallet
```

Read [contracts/README.md](contracts/README.md) for the two load-bearing details (the precompile's
`false`-without-revert footgun, and the digest binding that blocks replay) and the one-shot mainnet
runbook. The vault is unaudited; see the honest limits there.

## License

MIT © 2026 Sithu Nyein
