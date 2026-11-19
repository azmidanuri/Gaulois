-- Gaulois Aerion Academy tournament module
-- Run once in Supabase SQL Editor.
-- Existing fixtures and matchday squad tables are untouched.

create extension if not exists pgcrypto;

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  location text,
  start_date date not null,
  end_date date,
  registration_deadline date,
  status text not null default 'draft'
    check (status in ('draft','published','closed','completed')),
  fee_amount numeric(10,2) not null default 0 check (fee_amount >= 0),
  currency text not null default 'SGD',
  payment_enabled boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tournaments_dates_check
    check (end_date is null or end_date >= start_date)
);

create table if not exists public.tournament_age_groups (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  age_group text not null,
  created_at timestamptz not null default now(),
  unique (tournament_id, age_group)
);

create table if not exists public.tournament_registrations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  parent_id uuid references auth.users(id) on delete set null,
  availability text not null default 'available'
    check (availability in ('available','unavailable')),
  selection_status text not null default 'pending'
    check (selection_status in ('pending','selected','reserve','not_selected')),
  parent_confirmation text not null default 'pending'
    check (parent_confirmation in ('pending','confirmed','declined')),
  parent_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, player_id)
);

create table if not exists public.tournament_squad_players (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  squad_role text not null check (squad_role in ('selected','reserve')),
  selection_order integer not null default 0,
  selected_by uuid references auth.users(id) on delete set null,
  selected_at timestamptz not null default now(),
  unique (tournament_id, player_id)
);

create index if not exists tournament_registrations_tournament_idx
  on public.tournament_registrations(tournament_id);

create index if not exists tournament_registrations_player_idx
  on public.tournament_registrations(player_id);

create index if not exists tournament_squad_tournament_idx
  on public.tournament_squad_players(tournament_id);

create or replace function public.ga_is_tournament_staff()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.role <> 'parent'
  );
$$;

create or replace function public.ga_is_parent_of_player(p_player_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.parent_players pp
    where pp.parent_id = auth.uid()
      and pp.player_id = p_player_id
  );
$$;

alter table public.tournaments enable row level security;
alter table public.tournament_age_groups enable row level security;
alter table public.tournament_registrations enable row level security;
alter table public.tournament_squad_players enable row level security;

drop policy if exists "Tournament staff manage tournaments"
  on public.tournaments;

create policy "Tournament staff manage tournaments"
  on public.tournaments
  for all to authenticated
  using (public.ga_is_tournament_staff())
  with check (public.ga_is_tournament_staff());

drop policy if exists "Parents read published tournaments for linked children"
  on public.tournaments;

create policy "Parents read published tournaments for linked children"
  on public.tournaments
  for select to authenticated
  using (
    status in ('published','closed','completed')
    and exists (
      select 1
      from public.tournament_age_groups ag
      join public.players pl on pl.age_group = ag.age_group
      join public.parent_players pp on pp.player_id = pl.id
      where ag.tournament_id = tournaments.id
        and pp.parent_id = auth.uid()
    )
  );

drop policy if exists "Tournament staff manage age groups"
  on public.tournament_age_groups;

create policy "Tournament staff manage age groups"
  on public.tournament_age_groups
  for all to authenticated
  using (public.ga_is_tournament_staff())
  with check (public.ga_is_tournament_staff());

drop policy if exists "Parents read relevant tournament age groups"
  on public.tournament_age_groups;

create policy "Parents read relevant tournament age groups"
  on public.tournament_age_groups
  for select to authenticated
  using (
    exists (
      select 1
      from public.tournaments t
      join public.players pl on pl.age_group = tournament_age_groups.age_group
      join public.parent_players pp on pp.player_id = pl.id
      where t.id = tournament_age_groups.tournament_id
        and t.status in ('published','closed','completed')
        and pp.parent_id = auth.uid()
    )
  );

drop policy if exists "Tournament staff manage registrations"
  on public.tournament_registrations;

create policy "Tournament staff manage registrations"
  on public.tournament_registrations
  for all to authenticated
  using (public.ga_is_tournament_staff())
  with check (public.ga_is_tournament_staff());

drop policy if exists "Parents read own linked player registrations"
  on public.tournament_registrations;

create policy "Parents read own linked player registrations"
  on public.tournament_registrations
  for select to authenticated
  using (
    parent_id = auth.uid()
    and public.ga_is_parent_of_player(player_id)
  );

drop policy if exists "Tournament staff manage squad"
  on public.tournament_squad_players;

create policy "Tournament staff manage squad"
  on public.tournament_squad_players
  for all to authenticated
  using (public.ga_is_tournament_staff())
  with check (public.ga_is_tournament_staff());

drop policy if exists "Parents read linked child squad status"
  on public.tournament_squad_players;

create policy "Parents read linked child squad status"
  on public.tournament_squad_players
  for select to authenticated
  using (public.ga_is_parent_of_player(player_id));

-- Parent registration is handled through narrowly scoped RPC functions.

create or replace function public.tournament_register_player(
  p_tournament_id uuid,
  p_player_id uuid
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_t public.tournaments%rowtype;
  v_age text;
begin
  if auth.uid() is null
    or not public.ga_is_parent_of_player(p_player_id) then
    raise exception 'You are not authorised to register this player.';
  end if;

  select * into v_t
  from public.tournaments
  where id = p_tournament_id;

  if not found or v_t.status <> 'published' then
    raise exception 'This tournament is not open for registration.';
  end if;

  if v_t.registration_deadline is not null
    and current_date > v_t.registration_deadline then
    raise exception 'The registration deadline has passed.';
  end if;

  select age_group into v_age
  from public.players
  where id = p_player_id;

  if not exists (
    select 1
    from public.tournament_age_groups
    where tournament_id = p_tournament_id
      and age_group = v_age
  ) then
    raise exception 'This player is not eligible for this tournament.';
  end if;

  insert into public.tournament_registrations (
    tournament_id,
    player_id,
    parent_id,
    availability
  )
  values (
    p_tournament_id,
    p_player_id,
    auth.uid(),
    'available'
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.tournament_update_availability(
  p_tournament_id uuid,
  p_player_id uuid,
  p_availability text
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_deadline date;
  v_status text;
begin
  if p_availability not in ('available','unavailable') then
    raise exception 'Invalid availability.';
  end if;

  if not public.ga_is_parent_of_player(p_player_id) then
    raise exception 'You are not authorised to update this player.';
  end if;

  select status, registration_deadline
  into v_status, v_deadline
  from public.tournaments
  where id = p_tournament_id;

  if v_status <> 'published'
    or (v_deadline is not null and current_date > v_deadline) then
    raise exception 'Availability can no longer be changed.';
  end if;

  update public.tournament_registrations
  set availability = p_availability,
      updated_at = now()
  where tournament_id = p_tournament_id
    and player_id = p_player_id
    and parent_id = auth.uid();

  if not found then
    raise exception 'Registration not found.';
  end if;
end;
$$;

create or replace function public.tournament_respond_invitation(
  p_tournament_id uuid,
  p_player_id uuid,
  p_response text
)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if p_response not in ('confirmed','declined') then
    raise exception 'Invalid response.';
  end if;

  if not public.ga_is_parent_of_player(p_player_id) then
    raise exception 'You are not authorised to respond for this player.';
  end if;

  update public.tournament_registrations
  set parent_confirmation = p_response,
      updated_at = now()
  where tournament_id = p_tournament_id
    and player_id = p_player_id
    and parent_id = auth.uid()
    and selection_status = 'selected';

  if not found then
    raise exception 'There is no pending selected invitation for this player.';
  end if;
end;
$$;

revoke all on function public.tournament_register_player(uuid,uuid)
  from public;

revoke all on function public.tournament_update_availability(uuid,uuid,text)
  from public;

revoke all on function public.tournament_respond_invitation(uuid,uuid,text)
  from public;

grant execute on function public.tournament_register_player(uuid,uuid)
  to authenticated;

grant execute on function public.tournament_update_availability(uuid,uuid,text)
  to authenticated;

grant execute on function public.tournament_respond_invitation(uuid,uuid,text)
  to authenticated;

grant select on public.tournaments,
  public.tournament_age_groups,
  public.tournament_registrations,
  public.tournament_squad_players
to authenticated;

grant insert, update, delete on public.tournaments,
  public.tournament_age_groups,
  public.tournament_registrations,
  public.tournament_squad_players
to authenticated;

-- Row-level security policies above determine which rows users can access.
