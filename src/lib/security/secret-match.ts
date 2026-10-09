import { timingSafeEqual } from 'node:crypto';

export function matchesConfiguredSecret(expected: string | undefined, supplied: string | null | undefined): boolean {
  if (!expected || expected.length < 32 || !supplied) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}
