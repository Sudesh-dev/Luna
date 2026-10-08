-- Apply in the Supabase SQL editor. The mobile app uses only the publishable key.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  tracks jsonb not null default '[]'::jsonb check (jsonb_typeof(tracks) = 'array' and jsonb_array_length(tracks) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists playlists_user_created_idx on public.playlists (user_id, created_at desc);

create or replace function public.create_profile_for_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, username)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'username', ''), 40))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.create_profile_for_new_user();

insert into public.profiles (id, username)
select id, left(coalesce(raw_user_meta_data ->> 'username', ''), 40) from auth.users
on conflict (id) do nothing;

alter table public.profiles enable row level security;
alter table public.playlists enable row level security;

drop policy if exists "Users read their own profile" on public.profiles;
drop policy if exists "Users update their own profile" on public.profiles;
drop policy if exists "Users read their own playlists" on public.playlists;
drop policy if exists "Users create their own playlists" on public.playlists;
drop policy if exists "Users update their own playlists" on public.playlists;
drop policy if exists "Users delete their own playlists" on public.playlists;

create policy "Users read their own profile" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "Users update their own profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "Users read their own playlists" on public.playlists for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users create their own playlists" on public.playlists for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update their own playlists" on public.playlists for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete their own playlists" on public.playlists for delete to authenticated using ((select auth.uid()) = user_id);
