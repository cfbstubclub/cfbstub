-- Stub Club schema. Paste into Supabase → SQL Editor → New query → Run.
-- Safe to run once on a fresh project.

-- One profile per signed-in user. Usernames are lowercase, 3–20 chars.
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text check (display_name is null or char_length(display_name) <= 40),
  is_public    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- One collection per user, stored as the same JSON the tracker exports.
create table if not exists public.collections (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint collection_size check (pg_column_size(data) < 250000)
);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
drop trigger if exists collections_touch on public.collections;
create trigger collections_touch before update on public.collections
  for each row execute function public.touch_updated_at();

-- Row-level security: you can edit only your own rows;
-- anyone can read a profile and collection that is marked public.
alter table public.profiles    enable row level security;
alter table public.collections enable row level security;

drop policy if exists "profiles readable when public or own" on public.profiles;
create policy "profiles readable when public or own" on public.profiles
  for select using (is_public or auth.uid() = id);
drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own" on public.profiles
  for insert with check (auth.uid() = id);
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "profiles delete own" on public.profiles;
create policy "profiles delete own" on public.profiles
  for delete using (auth.uid() = id);

drop policy if exists "collections readable when public or own" on public.collections;
create policy "collections readable when public or own" on public.collections
  for select using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = user_id and p.is_public)
  );
drop policy if exists "collections insert own" on public.collections;
create policy "collections insert own" on public.collections
  for insert with check (auth.uid() = user_id);
drop policy if exists "collections update own" on public.collections;
create policy "collections update own" on public.collections
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "collections delete own" on public.collections;
create policy "collections delete own" on public.collections
  for delete using (auth.uid() = user_id);

grant select on public.profiles, public.collections to anon, authenticated;
grant insert, update, delete on public.profiles, public.collections to authenticated;
