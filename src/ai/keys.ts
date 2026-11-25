// API key handling. Keys are never stored in plain text:
//  - "session": kept in sessionStorage only (cleared when the tab closes)
//  - "encrypted": AES-GCM encrypted with a key derived (PBKDF2) from the user's passphrase and stored in IndexedDB;
//    the decrypted key lives only in memory until the tab closes.
// Note: any key used directly from a browser is visible to that browser (devtools, extensions).
// For shared/public deployments, route requests through a backend proxy instead (see README).
import { create } from 'zustand';
import { db } from '@/db/db';
import type { AIProvider } from '@/store/settings';

const SESSION_KEY = (p: AIProvider) => `ns-ai-key-${p}`;
const VAULT_KEY = (p: AIProvider) => `ai-vault-${p}`;

interface Vault {
  salt: string;
  iv: string;
  data: string;
}

const memory = new Map<AIProvider, string>();
export const useKeyState = create<{ version: number; bump: () => void }>((set) => ({ version: 0, bump: () => set((s) => ({ version: s.version + 1 })) }));

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(passphrase: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250_000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export function getApiKey(provider: AIProvider): string | undefined {
  if (memory.has(provider)) return memory.get(provider);
  try {
    return sessionStorage.getItem(SESSION_KEY(provider)) ?? undefined;
  } catch {
    return undefined;
  }
}

export function setSessionKey(provider: AIProvider, key: string) {
  memory.set(provider, key);
  try {
    sessionStorage.setItem(SESSION_KEY(provider), key);
  } catch {
    /* memory only */
  }
  useKeyState.getState().bump();
}

export async function saveEncryptedKey(provider: AIProvider, key: string, passphrase: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await deriveKey(passphrase, salt);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(key));
  await db.kv.put({ key: VAULT_KEY(provider), value: { salt: b64(salt), iv: b64(iv), data: b64(data) } satisfies Vault });
  memory.set(provider, key);
  useKeyState.getState().bump();
}

export async function hasVault(provider: AIProvider) {
  return !!(await db.kv.get(VAULT_KEY(provider)));
}

export async function unlockVault(provider: AIProvider, passphrase: string): Promise<boolean> {
  const row = await db.kv.get(VAULT_KEY(provider));
  if (!row) return false;
  const v = row.value as Vault;
  try {
    const k = await deriveKey(passphrase, unb64(v.salt));
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(v.iv) }, k, unb64(v.data));
    memory.set(provider, new TextDecoder().decode(plain));
    useKeyState.getState().bump();
    return true;
  } catch {
    return false;
  }
}

export async function forgetKey(provider: AIProvider) {
  memory.delete(provider);
  try {
    sessionStorage.removeItem(SESSION_KEY(provider));
  } catch {
    /* ignore */
  }
  await db.kv.delete(VAULT_KEY(provider));
  useKeyState.getState().bump();
}

export const maskKey = (k?: string) => (k ? `${k.slice(0, 7)}…${k.slice(-4)}` : '');
