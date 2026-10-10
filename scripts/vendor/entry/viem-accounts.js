/*
 * What the console page needs from viem/accounts — generatePrivateKey and privateKeyToAccount.
 * Kept a separate bundle so the two namespaces the page already destructures (V and A) stay exactly
 * the namespaces they are today.
 */
export * from 'viem/accounts';
