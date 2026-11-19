-- Gaulois Aerion Academy: SYL League Standings
-- Safe, separate tables: does not modify academy teams, players or fixtures.

create table if not exists public.syl_competitions (
  id uuid primary key default gen_random_uuid(),
  age_group text not null,
  division text not null,
  season text not null,
  source_url text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (age_group, division, season)
);

create table if not exists public.syl_standings (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.syl_competitions(id) on delete cascade,
  team_name text not null,
  played integer not null default 0 check (played >= 0),
  won integer not null default 0 check (won >= 0),
  drawn integer not null default 0 check (drawn >= 0),
  lost integer not null default 0 check (lost >= 0),
  goals_for integer not null default 0 check (goals_for >= 0),
  goals_against integer not null default 0 check (goals_against >= 0),
  goal_difference integer not null default 0,
  points integer not null default 0 check (points >= 0),
  updated_at timestamptz not null default now(),
  unique (competition_id, team_name)
);

create table if not exists public.syl_matches (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.syl_competitions(id) on delete cascade,
  match_date date not null,
  home_team text not null,
  away_team text not null,
  home_score integer check (home_score is null or home_score >= 0),
  away_score integer check (away_score is null or away_score >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (home_team <> away_team),
  check ((home_score is null and away_score is null) or (home_score is not null and away_score is not null))
);

create index if not exists syl_standings_competition_idx on public.syl_standings(competition_id);
create index if not exists syl_matches_competition_date_idx on public.syl_matches(competition_id, match_date desc);

-- SECURITY DEFINER avoids recursive RLS lookups when staff roles live in profiles.
create or replace function public.is_ga_syl_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role <> 'parent'
  );
$$;

revoke all on function public.is_ga_syl_staff() from public;
grant execute on function public.is_ga_syl_staff() to authenticated;

alter table public.syl_competitions enable row level security;
alter table public.syl_standings enable row level security;
alter table public.syl_matches enable row level security;

drop policy if exists "syl_competitions_read" on public.syl_competitions;
create policy "syl_competitions_read" on public.syl_competitions
for select to authenticated using (is_active = true or public.is_ga_syl_staff());

drop policy if exists "syl_competitions_staff_insert" on public.syl_competitions;
create policy "syl_competitions_staff_insert" on public.syl_competitions
for insert to authenticated with check (public.is_ga_syl_staff());

drop policy if exists "syl_competitions_staff_update" on public.syl_competitions;
create policy "syl_competitions_staff_update" on public.syl_competitions
for update to authenticated using (public.is_ga_syl_staff()) with check (public.is_ga_syl_staff());

drop policy if exists "syl_standings_read" on public.syl_standings;
create policy "syl_standings_read" on public.syl_standings
for select to authenticated using (
  exists (select 1 from public.syl_competitions c where c.id = competition_id and (c.is_active = true or public.is_ga_syl_staff()))
);

drop policy if exists "syl_standings_staff_insert" on public.syl_standings;
create policy "syl_standings_staff_insert" on public.syl_standings
for insert to authenticated with check (public.is_ga_syl_staff());

drop policy if exists "syl_standings_staff_update" on public.syl_standings;
create policy "syl_standings_staff_update" on public.syl_standings
for update to authenticated using (public.is_ga_syl_staff()) with check (public.is_ga_syl_staff());

drop policy if exists "syl_standings_staff_delete" on public.syl_standings;
create policy "syl_standings_staff_delete" on public.syl_standings
for delete to authenticated using (public.is_ga_syl_staff());

drop policy if exists "syl_matches_read" on public.syl_matches;
create policy "syl_matches_read" on public.syl_matches
for select to authenticated using (
  exists (select 1 from public.syl_competitions c where c.id = competition_id and (c.is_active = true or public.is_ga_syl_staff()))
);

drop policy if exists "syl_matches_staff_insert" on public.syl_matches;
create policy "syl_matches_staff_insert" on public.syl_matches
for insert to authenticated with check (public.is_ga_syl_staff());

drop policy if exists "syl_matches_staff_update" on public.syl_matches;
create policy "syl_matches_staff_update" on public.syl_matches
for update to authenticated using (public.is_ga_syl_staff()) with check (public.is_ga_syl_staff());

drop policy if exists "syl_matches_staff_delete" on public.syl_matches;
create policy "syl_matches_staff_delete" on public.syl_matches
for delete to authenticated using (public.is_ga_syl_staff());

grant select, insert, update, delete on public.syl_competitions to authenticated;
grant select, insert, update, delete on public.syl_standings to authenticated;
grant select, insert, update, delete on public.syl_matches to authenticated;
