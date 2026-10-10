#!/usr/bin/env bash
# Check the submission's promises against what is actually live. Reads only; sends nothing.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== canonical submission facts (source of truth) ==="
FACTORY="0x09574E49690ad378b21D2cb42a529f71A0D1DAdB"
TX="0x6a801dfb7213b78a45b4eccd39ba324f18e68e2d2ac1ba677a35cf9662faf405"
CONSOLE="https://olinea.sithunyein.com/app/?factory=${FACTORY}"
VAULT="0x88fCbF5896902527C175A9114584d5E92Cac8eB9"
VAULT_CONSOLE="https://olinea.sithunyein.com/app/?vault=${VAULT}"
SUBMIT="https://olinea.sithunyein.com/submit.html"
REPO="https://github.com/thesithunyein/olinea"

echo "factory:  ${FACTORY}"
echo "tx:       ${TX}"
echo "vault:    ${VAULT}"
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
  echo "vaultCount        $(cast call "${FACTORY}" 'vaultCount()(uint256)' --rpc-url https://rpc.blockdaemon.mainnet.arc.io)"
  echo "vault.balance     $(cast call "${VAULT}" 'balance()(uint256)' --rpc-url https://rpc.blockdaemon.mainnet.arc.io) (6 decimals)"
  echo "vault.nonceUsed(1) $(cast call "${VAULT}" 'nonceUsed(uint256)(bool)' 1 --rpc-url https://rpc.blockdaemon.mainnet.arc.io)"
else
  echo "cast not installed — skipping the chain reads (install Foundry to include them)"
fi
echo ""

echo "=== done ==="
