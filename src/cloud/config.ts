// Supabase project used for accounts and sync.
// The anon key is designed to be public (access is enforced by Row Level Security in supabase/setup.sql).
// Values can also be provided at build time with VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const cloudConfigured = () => !!SUPABASE_URL && !!SUPABASE_ANON_KEY;

/** Usernames are mapped to internal addresses; no email is ever sent (email confirmation must be off). */
export const USERNAME_DOMAIN = 'users.novelist-studio.pages.dev';
export const usernameToEmail = (u: string) => `${u.trim().toLowerCase()}@${USERNAME_DOMAIN}`;
export const USERNAME_RE = /^[a-z0-9_.-]{3,30}$/;
