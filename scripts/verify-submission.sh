#!/usr/bin/env bash
# Check the submission's promises against what is actually live. Reads only; sends nothing.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== canonical submission facts (source of truth) ==="
FACTORY="0x09574E49690ad378b21D2cb42a529f71A0D1DAdB"
TX="0x6a801dfb7213b78a45b4eccd39ba324f18e68e2d2ac1ba677a35cf9662faf405"
CONSOLE="https://olinea.sithunyein.com/app/?factory=${FACTORY}"
VAULT="0xA36f07eEB907C0eBc09ecb79802f5037a0382A22"
VAULT_CREATE_TX="0xdc170513882823758fc047d41e58d241a5fa8c7491446587ce34ee2d2210f0ab"
VAULT_DEPOSIT_TX="0x1b13b14016ae6232dffcb5e86229f2ac230b1fa82a85d1e8a10ea39bef2aa92e"
VAULT_RELEASE_TX="0x4f637edd2c27f0b2988e0c2cf62f833b215623a23cd624c7e7fa9b63e8320c43"
VAULT_CONSOLE="https://olinea.sithunyein.com/app/?vault=${VAULT}"
SUBMIT="https://olinea.sithunyein.com/submit.html"
REPO="https://github.com/thesithunyein/olinea"

echo "factory:  ${FACTORY}"
echo "tx:       ${TX}"
echo "vault:    ${VAULT}"
echo "create:   ${VAULT_CREATE_TX}"
echo "deposit:  ${VAULT_DEPOSIT_TX}"
echo "release:  ${VAULT_RELEASE_TX}"
echo "console:  ${CONSOLE}"
echo "live:     ${VAULT_CONSOLE}"
echo "submit:   ${SUBMIT}"
echo "repo:     ${REPO}"
echo ""

echo "=== 1. structural site check (factory deployed) ==="
if [ -f scripts/check-site.mjs ]; then
  CONFIG_factory="${FACTORY}" node scripts/check-site.mjs
else
  echo "skip: scripts/check-site.mjs not present"
fi
echo ""

echo "=== 2. submit page carries the canonical facts ==="
for url in \
  "${SUBMIT}" \
  "${CONSOLE}" \
  ; do
  echo "--- ${url} ---"
  curl -sL --max-time 25 "$url" | grep -o "${FACTORY}" | head -1 && echo "factory address present" || echo "factory address MISSING"
done
echo ""
echo "--- submit page links to console ---"
curl -sL --max-time 25 "${SUBMIT}" | grep -o 'href="https://olinea.sithunyein.com/app/?factory=0x09574E49690ad378b21D2cb42a529f71A0D1DAdB"' | head -1 && echo "deep link present" || echo "deep link MISSING"
echo ""
echo "--- console shell wires factory from URL ---"
curl -sL --max-time 25 "${CONSOLE}" | grep -o "factory: q.get('factory')" | head -1 && echo "console shell present" || echo "console shell MISSING"
echo ""

echo "--- live vault link carries the vault ---"
curl -sL --max-time 25 "${VAULT_CONSOLE}" | grep -o "${VAULT}" | head -1 && echo "vault address present in the console shell" || echo "vault address MISSING"
echo ""

echo "=== 3. the chain agrees (read-only, no wallet) ==="
echo "explorer: https://explorer.arc.io/tx/${TX}"
if command -v cast >/dev/null 2>&1; then
  echo "vaultCount        $(cast call "${FACTORY}" 'vaultCount()(uint256)' --rpc-url https://rpc.blockdaemon.mainnet.arc.io) (expect 2: the browser vault and the earlier one)"
  echo "vault.balance     $(cast call "${VAULT}" 'balance()(uint256)' --rpc-url https://rpc.blockdaemon.mainnet.arc.io) (6 decimals · expect 100000 = 0.10 USDC)"
  echo "vault.nonceUsed(0) $(cast call "${VAULT}" 'nonceUsed(uint256)(bool)' 0 --rpc-url https://rpc.blockdaemon.mainnet.arc.io) (expect true)"
  echo "vault.verifyingKey $(cast call "${VAULT}" 'verifyingKey()(bytes)' --rpc-url https://rpc.blockdaemon.mainnet.arc.io)"
else
  echo "cast not installed — skipping the chain reads (install Foundry to include them)"
fi
echo ""

echo "=== done ==="
