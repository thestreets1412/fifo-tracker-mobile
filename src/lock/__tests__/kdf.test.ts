import { checkSecret, deriveSecret, equalHash } from '../kdf';

test('scrypt verifier is deterministic per salt, salted, and rejects near matches', async () => {
  const first = await deriveSecret('123456', 'a'.repeat(32));
  const same = await deriveSecret('123456', 'a'.repeat(32));
  const otherSalt = await deriveSecret('123456', 'b'.repeat(32));
  expect(first).toMatch(/^[a-f0-9]{64}$/); expect(first).toBe(same); expect(first).not.toBe(otherSalt);
  expect(await checkSecret('123456', { salt: 'a'.repeat(32), hash: first })).toBe(true);
  expect(await checkSecret('123457', { salt: 'a'.repeat(32), hash: first })).toBe(false);
  expect(equalHash(first, first)).toBe(true); expect(equalHash(first, otherSalt)).toBe(false);
});
