create extension if not exists pgcrypto with schema extensions;

drop function if exists public.start_mafia_game(uuid, uuid, jsonb);
drop function if exists public.mark_role_seen_and_transition(uuid, uuid);
drop function if exists public.request_phase_transition(uuid, uuid);
drop function if exists public.submit_vote(uuid, uuid, uuid);
drop function if exists public.submit_night_action(uuid, uuid, text, uuid);
drop function if exists public.finish_game_if_needed(uuid);
drop function if exists public.get_mafia_winner(uuid);
drop function if exists public.resolve_day_vote(uuid);
drop function if exists public.resolve_night(uuid);
drop function if exists public.game_phase_end(text);
drop function if exists public.game_phase_seconds(text);

alter table public.rooms
add column if not exists phase text not null default 'lobby',
add column if not exists day_number integer not null default 1,
add column if not exists phase_started_at timestamptz,
add column if not exists phase_ends_at timestamptz,
add column if not exists execution_target_id uuid,
add column if not exists last_dead_player_id uuid,
add column if not exists night_kill_target_id uuid,
add column if not exists night_save_target_id uuid,
add column if not exists winner text,
add column if not exists vote_result jsonb not null default '{}'::jsonb;

alter table public.room_players
add column if not exists user_id uuid,
add column if not exists role text,
add column if not exists player_order integer,
add column if not exists has_seen_role boolean not null default false,
add column if not exists can_vote boolean not null default true,
add column if not exists has_voted boolean not null default false,
add column if not exists vote_target_id uuid,
add column if not exists night_action_completed boolean not null default false,
add column if not exists night_target_id uuid,
add column if not exists investigation_result text;

update public.room_players
set can_vote = true
where can_vote is null;

update public.room_players
set has_voted = false
where has_voted is null;

update public.room_players
set night_action_completed = false
where night_action_completed is null;

create table if not exists public.room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.room_players(id) on delete cascade,
  channel text not null,
  message text not null check (char_length(trim(message)) between 1 and 160),
  created_at timestamptz not null default now()
);

alter table public.room_messages
drop constraint if exists room_messages_channel_check;

alter table public.room_messages
add constraint room_messages_channel_check
check (channel in ('lobby', 'day', 'mafia_night'));

create index if not exists room_messages_room_id_created_at_idx
on public.room_messages(room_id, created_at);

alter table public.room_messages enable row level security;

drop policy if exists "dev room messages select" on public.room_messages;
create policy "dev room messages select"
on public.room_messages for select
to anon, authenticated
using (true);

drop policy if exists "dev room messages insert" on public.room_messages;
create policy "dev room messages insert"
on public.room_messages for insert
to anon, authenticated
with check (true);

alter table public.room_messages replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'room_messages'
  ) then
    alter publication supabase_realtime add table public.room_messages;
  end if;
end;
$$;

create or replace function public.game_phase_seconds(target_phase text)
returns integer
language sql
immutable
security definer
set search_path = public
as $$
  select case
    when target_phase = 'day_discussion' then 20
    when target_phase = 'day_vote' then 30
    when target_phase in ('night_mafia', 'night_police', 'night_doctor') then 25
    when target_phase = 'night_result' then 8
    else 0
  end;
$$;

create or replace function public.game_phase_end(target_phase text)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.game_phase_seconds(target_phase) > 0
      then now() + make_interval(secs => public.game_phase_seconds(target_phase))
    else null
  end;
$$;

create or replace function public.get_mafia_winner(target_room_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  alive_mafia integer;
  alive_citizen_team integer;
begin
  select count(*) into alive_mafia
  from public.room_players
  where room_id = target_room_id
    and is_alive = true
    and role = 'mafia';

  select count(*) into alive_citizen_team
  from public.room_players
  where room_id = target_room_id
    and is_alive = true
    and coalesce(role, '') <> 'mafia';

  if alive_mafia <= 0 then
    return 'citizen';
  end if;

  if alive_mafia >= alive_citizen_team then
    return 'mafia';
  end if;

  return null;
end;
$$;

create or replace function public.finish_game_if_needed(target_room_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  decided_winner text;
begin
  decided_winner := public.get_mafia_winner(target_room_id);

  if decided_winner is not null then
    update public.rooms
    set status = 'finished',
        phase = 'game_over',
        winner = decided_winner,
        phase_started_at = now(),
        phase_ends_at = null
    where id = target_room_id;
  end if;

  return decided_winner;
end;
$$;

create or replace function public.start_mafia_game(
  target_room_id uuid,
  requester_player_id uuid,
  role_assignments jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  target_room public.rooms;
  assignment jsonb;
begin
  select * into target_room
  from public.rooms
  where id = target_room_id
  for update;

  if target_room.id is null then
    raise exception 'room not found';
  end if;

  if target_room.host_player_id <> requester_player_id then
    raise exception 'host only';
  end if;

  if target_room.status <> 'waiting' then
    raise exception 'game already started';
  end if;

  update public.room_players
  set role = null,
      player_order = null,
      has_seen_role = false,
      is_alive = true,
      can_vote = true,
      has_voted = false,
      vote_target_id = null,
      night_action_completed = false,
      night_target_id = null,
      investigation_result = null
  where room_id = target_room_id;

  for assignment in select * from jsonb_array_elements(role_assignments)
  loop
    update public.room_players
    set role = assignment->>'role',
        player_order = (assignment->>'player_order')::integer
    where room_id = target_room_id
      and id = (assignment->>'player_id')::uuid;
  end loop;

  update public.rooms
  set status = 'starting',
      phase = 'role_reveal',
      day_number = 1,
      phase_started_at = now(),
      phase_ends_at = null,
      execution_target_id = null,
      last_dead_player_id = null,
      night_kill_target_id = null,
      night_save_target_id = null,
      winner = null,
      vote_result = '{}'::jsonb
  where id = target_room_id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.mark_role_seen_and_transition(
  target_room_id uuid,
  target_player_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  unseen_count integer;
begin
  update public.room_players
  set has_seen_role = true
  where room_id = target_room_id
    and id = target_player_id;

  select count(*) into unseen_count
  from public.room_players
  where room_id = target_room_id
    and has_seen_role = false;

  if unseen_count = 0 then
    update public.rooms
    set status = 'playing',
        phase = 'day_discussion',
        phase_started_at = now(),
        phase_ends_at = public.game_phase_end('day_discussion')
    where id = target_room_id
      and phase = 'role_reveal';
  end if;

  return jsonb_build_object('ok', true, 'unseenCount', unseen_count);
end;
$$;

create or replace function public.resolve_day_vote(target_room_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  selected_target uuid;
  selected_votes integer;
  top_count integer;
begin
  with vote_counts as (
    select vote_target_id, count(*)::integer as votes
    from public.room_players
    where room_id = target_room_id
      and can_vote = true
      and has_voted = true
      and vote_target_id is not null
    group by vote_target_id
  ),
  ranked as (
    select vote_target_id, votes, dense_rank() over (order by votes desc) as rank_no
    from vote_counts
  )
  select vote_target_id, votes
  into selected_target, selected_votes
  from ranked
  where rank_no = 1;

  with vote_counts as (
    select vote_target_id, count(*)::integer as votes
    from public.room_players
    where room_id = target_room_id
      and can_vote = true
      and has_voted = true
      and vote_target_id is not null
    group by vote_target_id
  ),
  top_votes as (
    select votes
    from vote_counts
    where votes = (select max(votes) from vote_counts)
  )
  select count(*) into top_count
  from top_votes;

  if top_count <> 1 then
    selected_target := null;
  end if;

  if selected_target is not null then
    update public.room_players
    set is_alive = false
    where room_id = target_room_id
      and id = selected_target;
  end if;

  update public.rooms
  set phase = 'execution_result',
      execution_target_id = selected_target,
      vote_result = jsonb_build_object('targetId', selected_target, 'votes', selected_votes),
      phase_started_at = now(),
      phase_ends_at = null
  where id = target_room_id;
end;
$$;

create or replace function public.resolve_night(target_room_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  target_room public.rooms;
  dead_target uuid;
begin
  select * into target_room
  from public.rooms
  where id = target_room_id
  for update;

  dead_target := target_room.night_kill_target_id;

  if dead_target is not null and dead_target = target_room.night_save_target_id then
    dead_target := null;
  end if;

  if dead_target is not null then
    update public.room_players
    set is_alive = false
    where room_id = target_room_id
      and id = dead_target;
  end if;

  update public.rooms
  set phase = 'night_result',
      last_dead_player_id = dead_target,
      phase_started_at = now(),
      phase_ends_at = public.game_phase_end('night_result')
  where id = target_room_id;
end;
$$;

create or replace function public.request_phase_transition(
  target_room_id uuid,
  requester_player_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  target_room public.rooms;
  decided_winner text;
begin
  if not exists (
    select 1 from public.room_players
    where room_id = target_room_id and id = requester_player_id
  ) then
    raise exception 'player not in room';
  end if;

  select * into target_room
  from public.rooms
  where id = target_room_id
  for update;

  if target_room.phase = 'game_over' then
    return jsonb_build_object('ok', true);
  end if;

  if target_room.phase = 'role_reveal' then
    if exists (
      select 1 from public.room_players
      where room_id = target_room_id and has_seen_role = false
    ) then
      return jsonb_build_object('ok', false, 'waiting', true);
    end if;

    update public.rooms
    set status = 'playing',
        phase = 'day_discussion',
        phase_started_at = now(),
        phase_ends_at = public.game_phase_end('day_discussion')
    where id = target_room_id;
    return jsonb_build_object('ok', true);
  end if;

  if target_room.phase in ('first_day', 'second_day_ready') then
    update public.rooms
    set status = 'playing',
        phase = 'day_discussion',
        phase_started_at = now(),
        phase_ends_at = public.game_phase_end('day_discussion')
    where id = target_room_id;
    return jsonb_build_object('ok', true);
  end if;

  if target_room.phase = 'day_discussion' then
    update public.room_players
    set can_vote = is_alive,
        has_voted = false,
        vote_target_id = null
    where room_id = target_room_id;

    update public.rooms
    set phase = 'day_vote',
        execution_target_id = null,
        phase_started_at = now(),
        phase_ends_at = public.game_phase_end('day_vote')
    where id = target_room_id;
    return jsonb_build_object('ok', true);
  end if;

  if target_room.phase = 'day_vote' then
    perform public.resolve_day_vote(target_room_id);
    return jsonb_build_object('ok', true);
  end if;

  if target_room.phase = 'execution_result' then
    decided_winner := public.finish_game_if_needed(target_room_id);

    if decided_winner is not null then
      return jsonb_build_object('ok', true, 'winner', decided_winner);
    end if;

    update public.room_players
    set night_action_completed = false,
        night_target_id = null,
        investigation_result = null
    where room_id = target_room_id;

    update public.rooms
    set phase = 'night_mafia',
        night_kill_target_id = null,
        night_save_target_id = null,
        last_dead_player_id = null,
        phase_started_at = now(),
        phase_ends_at = public.game_phase_end('night_mafia')
    where id = target_room_id;
    return jsonb_build_object('ok', true);
  end if;

  if target_room.phase = 'night_mafia' then
    update public.room_players
    set night_action_completed = false,
        night_target_id = null
    where room_id = target_room_id;

    update public.rooms
    set phase = 'night_police',
        phase_started_at = now(),
        phase_ends_at = public.game_phase_end('night_police')
    where id = target_room_id;
    return jsonb_build_object('ok', true);
  end if;

  if target_room.phase = 'night_police' then
    update public.room_players
    set night_action_completed = false,
        night_target_id = null
    where room_id = target_room_id;

    update public.rooms
    set phase = 'night_doctor',
        phase_started_at = now(),
        phase_ends_at = public.game_phase_end('night_doctor')
    where id = target_room_id;
    return jsonb_build_object('ok', true);
  end if;

  if target_room.phase = 'night_doctor' then
    perform public.resolve_night(target_room_id);
    return jsonb_build_object('ok', true);
  end if;

  if target_room.phase = 'night_result' then
    decided_winner := public.finish_game_if_needed(target_room_id);

    if decided_winner is not null then
      return jsonb_build_object('ok', true, 'winner', decided_winner);
    end if;

    update public.rooms
    set day_number = day_number + 1,
        phase = 'day_discussion',
        phase_started_at = now(),
        phase_ends_at = public.game_phase_end('day_discussion'),
        execution_target_id = null,
        last_dead_player_id = null
    where id = target_room_id;
    return jsonb_build_object('ok', true);
  end if;

  return jsonb_build_object('ok', true, 'ignoredPhase', target_room.phase);
end;
$$;

create or replace function public.submit_vote(
  target_room_id uuid,
  voter_player_id uuid,
  target_player_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  target_room public.rooms;
begin
  select * into target_room
  from public.rooms
  where id = target_room_id
  for update;

  if target_room.phase <> 'day_vote' then
    raise exception 'not vote phase';
  end if;

  if not exists (
    select 1 from public.room_players
    where room_id = target_room_id
      and id = voter_player_id
      and is_alive = true
      and coalesce(can_vote, true) = true
      and has_voted = false
  ) then
    raise exception 'cannot vote';
  end if;

  if not exists (
    select 1 from public.room_players
    where room_id = target_room_id
      and id = target_player_id
      and is_alive = true
  ) then
    raise exception 'invalid vote target';
  end if;

  update public.room_players
  set has_voted = true,
      vote_target_id = target_player_id
  where room_id = target_room_id
    and id = voter_player_id;

  if not exists (
    select 1 from public.room_players
    where room_id = target_room_id
      and is_alive = true
      and coalesce(can_vote, true) = true
      and has_voted = false
  ) then
    perform public.resolve_day_vote(target_room_id);
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.submit_night_action(
  target_room_id uuid,
  acting_player_id uuid,
  acting_role text,
  target_player_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  target_room public.rooms;
  target_role text;
begin
  select * into target_room
  from public.rooms
  where id = target_room_id
  for update;

  select role into target_role
  from public.room_players
  where room_id = target_room_id
    and id = acting_player_id
    and is_alive = true;

  if target_role is null or target_role <> acting_role then
    raise exception 'invalid actor';
  end if;

  if target_room.phase = 'night_mafia' and target_role = 'mafia' then
    if not exists (
      select 1 from public.room_players
      where room_id = target_room_id
        and id = target_player_id
        and is_alive = true
        and role <> 'mafia'
    ) then
      raise exception 'invalid mafia target';
    end if;

    update public.room_players
    set night_action_completed = true,
        night_target_id = target_player_id
    where room_id = target_room_id
      and id = acting_player_id;

    update public.rooms
    set night_kill_target_id = target_player_id
    where id = target_room_id;

  elsif target_room.phase = 'night_police' and target_role = 'police' then
    if not exists (
      select 1 from public.room_players
      where room_id = target_room_id
        and id = target_player_id
        and is_alive = true
        and id <> acting_player_id
    ) then
      raise exception 'invalid police target';
    end if;

    update public.room_players
    set night_action_completed = true,
        night_target_id = target_player_id,
        investigation_result = (
          select role from public.room_players
          where room_id = target_room_id and id = target_player_id
        )
    where room_id = target_room_id
      and id = acting_player_id;

  elsif target_room.phase = 'night_doctor' and target_role = 'doctor' then
    if not exists (
      select 1 from public.room_players
      where room_id = target_room_id
        and id = target_player_id
        and is_alive = true
    ) then
      raise exception 'invalid doctor target';
    end if;

    update public.room_players
    set night_action_completed = true,
        night_target_id = target_player_id
    where room_id = target_room_id
      and id = acting_player_id;

    update public.rooms
    set night_save_target_id = target_player_id
    where id = target_room_id;
  else
    raise exception 'not your night phase';
  end if;

  if target_room.phase = 'night_mafia' and not exists (
    select 1 from public.room_players
    where room_id = target_room_id
      and is_alive = true
      and role = 'mafia'
      and night_action_completed = false
  ) then
    update public.room_players
    set night_action_completed = false,
        night_target_id = null
    where room_id = target_room_id;

    update public.rooms
    set phase = 'night_police',
        phase_started_at = now(),
        phase_ends_at = public.game_phase_end('night_police')
    where id = target_room_id;
  end if;

  if target_room.phase = 'night_police' and not exists (
    select 1 from public.room_players
    where room_id = target_room_id
      and is_alive = true
      and role = 'police'
      and night_action_completed = false
  ) then
    update public.room_players
    set night_action_completed = false,
        night_target_id = null
    where room_id = target_room_id;

    update public.rooms
    set phase = 'night_doctor',
        phase_started_at = now(),
        phase_ends_at = public.game_phase_end('night_doctor')
    where id = target_room_id;
  end if;

  if target_room.phase = 'night_doctor' and not exists (
    select 1 from public.room_players
    where room_id = target_room_id
      and is_alive = true
      and role = 'doctor'
      and night_action_completed = false
  ) then
    perform public.resolve_night(target_room_id);
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.start_mafia_game(uuid, uuid, jsonb) to anon, authenticated;
grant execute on function public.mark_role_seen_and_transition(uuid, uuid) to anon, authenticated;
grant execute on function public.request_phase_transition(uuid, uuid) to anon, authenticated;
grant execute on function public.submit_vote(uuid, uuid, uuid) to anon, authenticated;
grant execute on function public.submit_night_action(uuid, uuid, text, uuid) to anon, authenticated;
grant execute on function public.get_mafia_winner(uuid) to anon, authenticated;
grant execute on function public.finish_game_if_needed(uuid) to anon, authenticated;
