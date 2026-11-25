-- Novelist Studio — cloud sync setup for Supabase.
-- Paste this whole file into Supabase → SQL Editor → New query → Run. Safe to run more than once.
--
-- Privacy model:
--   • Every record is encrypted in the browser (AES-GCM) with a key that only the user's password can unlock.
--     The server — and you as its owner — only ever store ciphertext.
--   • Row Level Security: each user can read and write only their own rows.
--   • Admins can call admin_stats(), which returns aggregate numbers only (users, novels, words, activity).

-- ───────────── Profiles ─────────────
create table if not exists public.profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  username    text not null unique check (username ~ '^[a-z0-9_.-]{3,30}$'),
  kdf_salt    text not null,          -- PBKDF2 salt (base64)
  wrapped_key text not null,          -- data key encrypted with the password-derived key (base64)
  wrap_iv     text not null,          -- IV used for wrapping (base64)
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "own profile select" on public.profiles;
drop policy if exists "own profile insert" on public.profiles;
drop policy if exists "own profile update" on public.profiles;
create policy "own profile select" on public.profiles for select using (auth.uid() = user_id);
create policy "own profile insert" on public.profiles for insert with check (auth.uid() = user_id);
create policy "own profile update" on public.profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Lets the sign-in screen tell "unknown username" apart from "wrong password" without exposing any data.
create or replace function public.username_taken(p_username text) returns boolean
language sql security definer set search_path = public as $$
  select exists(select 1 from profiles where username = lower(p_username));
$$;
grant execute on function public.username_taken(text) to anon, authenticated;

-- ───────────── Encrypted records ─────────────
create table if not exists public.records (
  user_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  kind       text not null,           -- local table name (projects, scenes, sceneTexts, …)
  id         text not null,           -- local record id
  payload    text,                    -- encrypted JSON (base64); null when deleted
  iv         text,
  words      integer not null default 0, -- plain word count for projects only (used for admin totals)
  deleted    boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, id)
);
create index if not exists records_user_updated on public.records (user_id, updated_at);
alter table public.records enable row level security;
drop policy if exists "own records" on public.records;
create policy "own records" on public.records for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Server-side timestamp on every write so devices can pull "everything changed since X".
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;
drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records for each row execute function public.touch_updated_at();

-- ───────────── Admins & statistics (numbers only) ─────────────
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admins enable row level security; -- no policies: not readable from the app

create or replace function public.is_admin() returns boolean
language sql security definer set search_path = public as $$
  select exists(select 1 from admins where user_id = auth.uid());
$$;
grant execute on function public.is_admin() to authenticated;

create or replace function public.admin_stats() returns json
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from admins where user_id = auth.uid()) then
    raise exception 'not allowed';
  end if;
  return json_build_object(
    'users',      (select count(*) from profiles),
    'new_7d',     (select count(*) from profiles where created_at > now() - interval '7 days'),
    'active_1d',  (select count(*) from profiles where last_seen > now() - interval '1 day'),
    'active_7d',  (select count(*) from profiles where last_seen > now() - interval '7 days'),
    'active_30d', (select count(*) from profiles where last_seen > now() - interval '30 days'),
    'novels',     (select count(*) from records where kind = 'projects' and not deleted),
    'words',      (select coalesce(sum(words), 0) from records where kind = 'projects' and not deleted),
    'signups_30d', (
      select coalesce(json_agg(json_build_object('day', d, 'count', c) order by d), '[]'::json)
      from (select created_at::date as d, count(*) as c from profiles
            where created_at > now() - interval '30 days' group by 1) s
    )
  );
end $$;
revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;

-- ───────────── API access ─────────────
-- New Supabase projects may not expose new tables automatically; grant exactly what the app needs.
-- Row Level Security above still limits every user to their own rows.
grant usage on schema public to anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.records to authenticated;
revoke all on public.admins from anon, authenticated;

-- ───────────── Make yourself admin ─────────────
-- After you create your own account in the app, run this line with YOUR username:
--   insert into public.admins (user_id) select user_id from public.profiles where username = 'your-username' on conflict do nothing;
