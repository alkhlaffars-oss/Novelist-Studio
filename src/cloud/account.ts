// Accounts (username + password) on Supabase, with the encryption key kept only on the user's devices.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { create } from 'zustand';
import { db } from '@/db/db';
import { SUPABASE_ANON_KEY, SUPABASE_URL, USERNAME_RE, cloudConfigured, usernameToEmail } from './config';
import { createDataKey, unwrapDataKey, wrapDataKey, type WrappedKey } from './crypto';

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'ns-auth' } });
  return client;
}

export type CloudStatus = 'unconfigured' | 'signed-out' | 'locked' | 'ready';

interface CloudState {
  status: CloudStatus;
  userId?: string;
  username?: string;
  syncing: boolean;
  lastSync?: number;
  error?: string;
  set: (p: Partial<Omit<CloudState, 'set'>>) => void;
}

export const useCloud = create<CloudState>((set) => ({ status: cloudConfigured() ? 'signed-out' : 'unconfigured', syncing: false, set: (p) => set(p) }));

const KEY_ROW = 'cloud:dek';
let dataKey: CryptoKey | null = null;
export const getDataKey = () => dataKey;

export class CloudError extends Error {
  constructor(public code: 'username' | 'password' | 'taken' | 'wrong' | 'unknown-user' | 'network' | 'config' | 'weak', message: string = code) {
    super(message);
  }
}

async function storeKey(userId: string, key: CryptoKey) {
  dataKey = key;
  await db.kv.put({ key: KEY_ROW, value: { userId, key } });
}

/** Restores the session and key on app start. */
export async function initCloud() {
  if (!cloudConfigured()) return;
  const { data } = await supabase().auth.getSession();
  const session = data.session;
  if (!session) return useCloud.getState().set({ status: 'signed-out' });
  const username = (session.user.user_metadata?.username as string) ?? session.user.email?.split('@')[0];
  const row = (await db.kv.get(KEY_ROW))?.value as { userId: string; key: CryptoKey } | undefined;
  if (row && row.userId === session.user.id) {
    dataKey = row.key;
    useCloud.getState().set({ status: 'ready', userId: session.user.id, username });
  } else {
    useCloud.getState().set({ status: 'locked', userId: session.user.id, username });
  }
}

function validate(username: string, password: string) {
  if (!USERNAME_RE.test(username.trim().toLowerCase())) throw new CloudError('username');
  if (password.length < 8) throw new CloudError('weak');
}

function mapAuthError(e: { message?: string; status?: number } | null): CloudError {
  const m = (e?.message ?? '').toLowerCase();
  if (m.includes('already registered') || m.includes('already exists')) return new CloudError('taken');
  if (m.includes('invalid login') || m.includes('invalid credentials')) return new CloudError('wrong');
  if (m.includes('password')) return new CloudError('weak', e?.message);
  if (m.includes('fetch') || m.includes('network')) return new CloudError('network');
  return new CloudError('network', e?.message);
}

export async function signUp(usernameRaw: string, password: string) {
  const username = usernameRaw.trim().toLowerCase();
  validate(username, password);
  const sb = supabase();
  const { data: taken, error: tErr } = await sb.rpc('username_taken', { p_username: username });
  if (tErr) throw mapAuthError(tErr);
  if (taken) throw new CloudError('taken');
  const { data, error } = await sb.auth.signUp({ email: usernameToEmail(username), password, options: { data: { username } } });
  if (error) throw mapAuthError(error);
  if (!data.session || !data.user) throw new CloudError('config', 'Email confirmation must be disabled in Supabase (Authentication → Sign In / Providers → Email → Confirm email: off).');
  const { key, wrapped } = await createDataKey(password);
  const { error: pErr } = await sb.from('profiles').insert({ user_id: data.user.id, username, ...wrapped });
  if (pErr) throw mapAuthError(pErr);
  // Store a non-extractable copy locally.
  const local = await unwrapDataKey(wrapped, password, false);
  void key;
  await storeKey(data.user.id, local);
  useCloud.getState().set({ status: 'ready', userId: data.user.id, username, error: undefined });
}

export async function signIn(usernameRaw: string, password: string) {
  const username = usernameRaw.trim().toLowerCase();
  if (!USERNAME_RE.test(username)) throw new CloudError('username');
  const sb = supabase();
  const { data, error } = await sb.auth.signInWithPassword({ email: usernameToEmail(username), password });
  if (error) {
    const { data: exists } = await sb.rpc('username_taken', { p_username: username });
    throw exists === false ? new CloudError('unknown-user') : mapAuthError(error);
  }
  await unlockWith(data.user.id, password);
  useCloud.getState().set({ status: 'ready', userId: data.user.id, username, error: undefined });
}

/** For a signed-in session on a device that does not hold the key yet. */
export async function unlock(password: string) {
  const { userId } = useCloud.getState();
  if (!userId) throw new CloudError('wrong');
  await unlockWith(userId, password);
  useCloud.getState().set({ status: 'ready', error: undefined });
}

async function fetchWrapped(userId: string): Promise<WrappedKey> {
  const { data, error } = await supabase().from('profiles').select('kdf_salt, wrapped_key, wrap_iv').eq('user_id', userId).single();
  if (error || !data) throw mapAuthError(error);
  return data as WrappedKey;
}

async function unlockWith(userId: string, password: string) {
  const wrapped = await fetchWrapped(userId);
  try {
    await storeKey(userId, await unwrapDataKey(wrapped, password, false));
  } catch {
    throw new CloudError('wrong');
  }
}

export async function changePassword(oldPassword: string, newPassword: string) {
  const { userId } = useCloud.getState();
  if (!userId) throw new CloudError('wrong');
  if (newPassword.length < 8) throw new CloudError('weak');
  const wrapped = await fetchWrapped(userId);
  let key: CryptoKey;
  try {
    key = await unwrapDataKey(wrapped, oldPassword, true);
  } catch {
    throw new CloudError('wrong');
  }
  const rewrapped = await wrapDataKey(key, newPassword);
  const sb = supabase();
  const { error } = await sb.auth.updateUser({ password: newPassword });
  if (error) throw mapAuthError(error);
  const { error: pErr } = await sb.from('profiles').update(rewrapped).eq('user_id', userId);
  if (pErr) throw mapAuthError(pErr);
}

/** Signs out. Optionally wipes this device's local copy (the cloud copy stays). */
export async function signOut(removeLocal: boolean) {
  await supabase().auth.signOut().catch(() => undefined);
  dataKey = null;
  await db.kv.delete(KEY_ROW);
  await db.kv.delete('cloud:lastPull');
  await db.syncState.clear();
  if (removeLocal) {
    await db.delete();
    location.reload();
    return;
  }
  useCloud.getState().set({ status: 'signed-out', userId: undefined, username: undefined, lastSync: undefined });
}

export async function isAdmin(): Promise<boolean> {
  const { data } = await supabase().rpc('is_admin');
  return data === true;
}

export interface AdminStats {
  users: number;
  new_7d: number;
  active_1d: number;
  active_7d: number;
  active_30d: number;
  novels: number;
  words: number;
  signups_30d: { day: string; count: number }[];
}
export async function adminStats(): Promise<AdminStats> {
  const { data, error } = await supabase().rpc('admin_stats');
  if (error) throw new CloudError('network', error.message);
  return data as AdminStats;
}
