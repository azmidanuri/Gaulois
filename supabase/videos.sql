-- Gaulois Aerion Academy: Veo video library
-- Run once in Supabase SQL Editor.

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 120),
  team_name text not null,
  video_type text not null default 'match'
    check (video_type in ('match', 'training', 'clip')),
  recorded_on date not null,
  video_url text not null check (video_url ~ '^https://'),
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists videos_team_date_idx
  on public.videos (team_name, recorded_on desc);

alter table public.videos enable row level security;

grant select, insert, update, delete on public.videos to authenticated;

drop policy if exists "Staff can manage academy videos" on public.videos;
create policy "Staff can manage academy videos"
on public.videos
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role <> 'parent'
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role <> 'parent'
  )
);

drop policy if exists "Parents can view videos for linked teams" on public.videos;
create policy "Parents can view videos for linked teams"
on public.videos
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'parent'
  )
  and exists (
    select 1
    from public.parent_players pp
    join public.players pl on pl.id = pp.player_id
    where pp.parent_id = auth.uid()
      and pl.age_group = videos.team_name
  )
);
