/** Join class names, dropping anything falsy. The whole of our class helper. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
