# Olinea

**USDC a quantum computer can't move.** A USDC vault on Arc that releases funds only when a
post-quantum signature — SLH-DSA-SHA2-128s (FIPS 205) — verifies on-chain via Arc's PQ precompile.

Live site: **https://olinea.sithunyein.com**

## Status

- [x] ABI of Arc's PQ precompile mapped and verified against mainnet (see below)
- [ ] `QDayVault`-style contract deployed to Arc mainnet
- [ ] Web app: browser keygen, deposit, authorize, verify
- [ ] Public evidence: verifying transaction, negative cases, tests

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

## License

MIT © 2026 Sithu Nyein
