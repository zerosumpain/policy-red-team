import { createHash } from 'node:crypto';

/**
 * WHICH SET OF DOCUMENTS (phase 25): the hash of the sorted member digests.
 * A one-document set is that document's own digest, so every run before this
 * phase — and every one-paper run after it — keeps the identity it had.
 */
export function documentSetHash(shas: string[]): string {
  if (shas.length === 1) return shas[0];
  return createHash('sha256').update([...shas].sort().join('\n')).digest('hex');
}
