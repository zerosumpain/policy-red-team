/**
 * Language features this build uses that the installed Node does not have yet.
 *
 * `package.json` asks for Node >= 22.23.2, which is upstream's floor. THIS FILE
 * EXISTS ONLY BECAUSE THE BOX IT WAS WRITTEN ON RUNS 22.22.0. Both of the
 * features below are ES2025 and both are called by `pdfjs-dist` 5.4 during PDF
 * ingestion — `Promise.try` from its message handler, `Uint8Array.toHex` from
 * its document fingerprinting. Neither is ours.
 *
 * Polyfilled rather than solved by upgrading Node, because the Node on this
 * machine also runs the live site and a system-wide upgrade is not a change this
 * project gets to make on its own. Every guard means the polyfill disappears the
 * moment the real thing is there, so nothing here changes behaviour on a correct
 * Node — and the whole file can be deleted once the floor is met everywhere.
 *
 * If a THIRD missing API turns up, stop adding to this file: that is the version
 * gap talking, and the answer is the Node upgrade, not another shim.
 *
 * Import before anything that touches PDFs: the server entry, and the test setup.
 */

interface PromiseTry {
  try<T, A extends unknown[]>(fn: (...args: A) => T | PromiseLike<T>, ...args: A): Promise<T>;
}

if (typeof (Promise as unknown as Partial<PromiseTry>).try !== 'function') {
  Object.defineProperty(Promise, 'try', {
    configurable: true,
    writable: true,
    value: function <T, A extends unknown[]>(
      this: PromiseConstructor,
      fn: (...args: A) => T | PromiseLike<T>,
      ...args: A
    ): Promise<T> {
      // Spec shape: the callback runs SYNCHRONOUSLY and a throw becomes a
      // rejection, which is the whole point of it over `Promise.resolve().then`.
      return new this<T>((resolve) => resolve(fn(...args)));
    },
  });
}

/**
 * `Uint8Array.prototype.toHex` and friends — the ES2025 base64/hex accessors.
 * pdfjs calls `toHex` on a document's MD5 to build its fingerprint.
 */
interface ByteAccessors {
  toHex(): string;
  toBase64(options?: { alphabet?: 'base64' | 'base64url' }): string;
}

const proto = Uint8Array.prototype as unknown as Partial<ByteAccessors>;

if (typeof proto.toHex !== 'function') {
  Object.defineProperty(Uint8Array.prototype, 'toHex', {
    configurable: true,
    writable: true,
    value(this: Uint8Array): string {
      let out = '';
      for (const byte of this) out += byte.toString(16).padStart(2, '0');
      return out;
    },
  });
}

if (typeof proto.toBase64 !== 'function') {
  Object.defineProperty(Uint8Array.prototype, 'toBase64', {
    configurable: true,
    writable: true,
    value(this: Uint8Array, options?: { alphabet?: 'base64' | 'base64url' }): string {
      const base64 = Buffer.from(this.buffer, this.byteOffset, this.byteLength).toString('base64');
      if (options?.alphabet !== 'base64url') return base64;
      return base64.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
    },
  });
}

const ctor = Uint8Array as unknown as { fromHex?: unknown; fromBase64?: unknown };

if (typeof ctor.fromHex !== 'function') {
  Object.defineProperty(Uint8Array, 'fromHex', {
    configurable: true,
    writable: true,
    value(hex: string): Uint8Array {
      if (hex.length % 2 !== 0) throw new SyntaxError('hex string must have an even length');
      const out = new Uint8Array(hex.length / 2);
      for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      return out;
    },
  });
}

if (typeof ctor.fromBase64 !== 'function') {
  Object.defineProperty(Uint8Array, 'fromBase64', {
    configurable: true,
    writable: true,
    value(text: string): Uint8Array {
      return new Uint8Array(Buffer.from(text, 'base64'));
    },
  });
}

export {};
