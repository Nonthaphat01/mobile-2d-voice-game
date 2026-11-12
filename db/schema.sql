-- Run in Supabase SQL Editor. The game server uses the service-role key ONLY on backend.
create table if not exists public.game_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 state jsonb not null,
 updated_at timestamptz not null default now()
);
alter table public.game_profiles enable row level security;
-- No public policies: ordinary browser clients cannot read/change game saves.
-- The backend uses service role with verified Supabase access tokens.
revoke all on public.game_profiles from anon, authenticated;
create index if not exists game_profiles_updated_at_idx on public.game_profiles (updated_at);
