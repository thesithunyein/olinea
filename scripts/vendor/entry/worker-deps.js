/*
 * What the key worker needs: mnemonic decoding, HKDF, SHA-256, and SLH-DSA-SHA2-128s.
 *
 * Exported as namespaces rather than flattened names so the worker's own mapping line — which reads
 * `wordlist.wordlist ?? wordlist.english ?? wordlist.default` and friends — stays exactly as it was
 * when these modules came from esm.sh, and cannot silently drift from it.
 */
export * as bip39 from '@scure/bip39';
export * as wordlist from '@scure/bip39/wordlists/english.js';
export * as hkdf from '@noble/hashes/hkdf.js';
export * as sha2 from '@noble/hashes/sha2.js';
export * as pq from '@noble/post-quantum/slh-dsa.js';
