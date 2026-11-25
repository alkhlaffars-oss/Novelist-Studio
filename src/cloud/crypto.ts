// End-to-end encryption for synced data.
// A random 256-bit data key encrypts every record. That data key is stored on the server only in
// wrapped (encrypted) form, using a key derived from the user's password with PBKDF2.
// The server never sees the password-derived key or the data key.

const ITERATIONS = 310_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

export const b64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
export const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKek(password: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey']);
}

export interface WrappedKey {
  kdf_salt: string;
  wrapped_key: string;
  wrap_iv: string;
}

/** Creates a new data key and wraps it with the password. */
export async function createDataKey(password: string): Promise<{ key: CryptoKey; wrapped: WrappedKey }> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  return { key, wrapped: await wrapDataKey(key, password) };
}

export async function wrapDataKey(key: CryptoKey, password: string): Promise<WrappedKey> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const kek = await deriveKek(password, salt);
  const wrapped = await crypto.subtle.wrapKey('raw', key, kek, { name: 'AES-GCM', iv });
  return { kdf_salt: b64(salt), wrapped_key: b64(wrapped), wrap_iv: b64(iv) };
}

/** Unwraps the data key. Throws if the password is wrong. */
export async function unwrapDataKey(w: WrappedKey, password: string, extractable = false): Promise<CryptoKey> {
  const kek = await deriveKek(password, unb64(w.kdf_salt));
  return crypto.subtle.unwrapKey('raw', unb64(w.wrapped_key), kek, { name: 'AES-GCM', iv: unb64(w.wrap_iv) }, { name: 'AES-GCM', length: 256 }, extractable, ['encrypt', 'decrypt']);
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<{ payload: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value)));
  return { payload: b64(data), iv: b64(iv) };
}

export async function decryptJson<T = unknown>(key: CryptoKey, payload: string, iv: string): Promise<T> {
  const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(payload));
  return JSON.parse(dec.decode(data)) as T;
}

/** Stable, fast content hash (FNV-1a, 53-bit) used to detect local changes since the last sync. */
export function hashValue(value: unknown): string {
  const s = JSON.stringify(value);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 2246822519);
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36) + s.length.toString(36);
}
