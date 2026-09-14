import { scrypt } from 'scrypt-js';
import { KDF, type Verifier } from './credentials';

export const hex = (bytes: Uint8Array): string => Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
export async function deriveSecret(secret: string, salt: string): Promise<string> {
  const bytes = Uint8Array.from(salt.match(/../g)!.map(s => parseInt(s, 16)));
  const input = new TextEncoder().encode(secret);
  const result = await scrypt(input, bytes, KDF.N, KDF.r, KDF.p, KDF.dkLen);
  try { return hex(result); } finally { input.fill(0); result.fill(0); }
}
export function equalHash(left: string, right: string): boolean {
  let difference = left.length ^ right.length;
  for (let i = 0; i < 64; i++) difference |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  return difference === 0;
}
export async function checkSecret(secret: string, verifier: Verifier): Promise<boolean> {
  return equalHash(await deriveSecret(secret, verifier.salt), verifier.hash);
}
