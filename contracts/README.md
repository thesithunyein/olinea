# OlineaVault — contracts

A USDC vault on Arc whose releases are authorized by an **SLH-DSA-SHA2-128s** (FIPS 205)
signature verified on-chain through Arc's **PQ precompile** at `0x1800…0004`.

No owner. No admin key. No pause. No upgrade path. The 32-byte hash-based verifying key fixed at
deployment is the only thing that can move funds, and it is not an elliptic-curve key — a quantum
computer that breaks ECDSA cannot forge it.

## Two details are load-bearing

1. **The precompile returns `false` for a forged signature without reverting.** A contract that
   checks only whether the call succeeded accepts *every* forgery. `src/mocks/NaiveVault.sol` is that
   bug, kept as a test fixture; the suite asserts it *does* drain on a forgery and that `OlineaVault`
   does not. This is the difference between a vault and a box with no lock.
2. **The signed message binds everything.** The key signs exactly
   `keccak256(abi.encode(chainId, vault, to, amount, nonce))`, so an authorization cannot be replayed
   on another chain, in another vault, for another recipient or amount, or twice in the same vault.

## Test suite

```bash
forge test          # 31 tests: 19 for the vault, 12 for the factory
```

| Area | Tests |
|---|---|
| Deployment | default verifier is the canonical precompile; verifying key must be exactly 32 bytes |
| Production path | verifier `address(0)` calls `0x1800…0004` and decodes the boolean both ways |
| Deposits | deposits move USDC; zero deposits rejected |
| Release | valid authorization moves funds and emits `Released`; anyone may relay |
| The footgun | forged signature (returns false, no revert) is rejected; malformed input reverts; `NaiveVault` accepts the forgery |
| Replay | nonce cannot be reused; authorization cannot be replayed in another vault; bound to recipient, amount, nonce and chain id |
| Bounds | amount above balance, zero amount, zero recipient |
| Fuzz | arbitrary unauthorized releases always fail (256 runs) |

## Why the local suite uses a mock — and what *is* proven against real Arc

Arc's precompiles exist in Arc's execution layer, not in upstream EVM. Executing them locally
requires **Arc Foundry** (`circlefin/arc-foundry`, `arc-anvil --network arc`), which ships prebuilt
binaries for Linux and macOS (Apple Silicon) only — **on Windows it must be built from source**.

So the suite injects the verifier (constructor arg, `address(0)` = the real precompile on mainnet) and
etches stand-ins at the canonical address to exercise the production configuration. The **real**
precompile is exercised against **Arc mainnet** instead, which costs nothing:

```bash
cd ../scripts && npm install
node pq.mjs conformance      # 3/3: valid digest → true, tampered → false, wrong digest → false
```

That is the one-shot insurance: the exact digest format the vault signs is verified by the real
precompile before anything is deployed.

## One-shot mainnet runbook

```bash
export ARC_RPC=https://rpc.drpc.mainnet.arc.io
export ARC_PRIVATE_KEY=0x…          # funded with a few USDC (gas is USDC on Arc)
USDC=0x3600000000000000000000000000000000000000

# 1. key + conformance (free, no wallet needed)
cd ../scripts && node pq.mjs keygen && node pq.mjs conformance

# 2. deploy the vault (verifier = address(0) → the real precompile)
cd ../contracts && forge create src/OlineaVault.sol:OlineaVault --rpc-url $ARC_RPC --private-key $ARC_PRIVATE_KEY --broadcast \
  --constructor-args $USDC 0x<your-32-byte-vk> 0x0000000000000000000000000000000000000000

# 3. fund it
cast send $USDC "approve(address,uint256)" $VAULT 2000000 --rpc-url $ARC_RPC --private-key $ARC_PRIVATE_KEY
cast send $VAULT "deposit(uint256)" 1000000 --rpc-url $ARC_RPC --private-key $ARC_PRIVATE_KEY

# 4. authorize a release (prints the exact cast send command, and can check it on mainnet)
node ../scripts/pq.mjs authorize --vault $VAULT --to $RECIPIENT --amount 250000 --nonce 1 --check

# 5. release, then verify
cast call $VAULT "balance()(uint256)" --rpc-url $ARC_RPC
```

## Honest limits

- **Not audited.** Testnet and mainnet evidence is provided, but this is new code.
- **No recovery.** Lose the PQ key and the funds are unrecoverable by design — there is no admin
  escape hatch. That is the property, not an oversight.
- **Denylist still applies.** A forged SLH-DSA signature cannot move funds, but Circle's USDC
  denylist can still block transfers. Post-quantum authorization is not denylist resistance.
- **Verification cost.** 448,502 gas per release (0.00897 USDC paid, at Arc's base fee of about 20 Gwei).
