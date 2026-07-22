create extension if not exists pgcrypto with schema extensions;

create table if not exists public.mafia_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_salt text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.mafia_sessions (
  token text primary key,
  user_id uuid not null references public.mafia_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);

alter table public.rooms
add column if not exists host_user_id uuid;

alter table public.room_players
add column if not exists user_id uuid;

create index if not exists mafia_sessions_user_id_idx
on public.mafia_sessions(user_id);

create index if not exists rooms_host_user_id_idx
on public.rooms(host_user_id);

create index if not exists room_players_user_id_idx
on public.room_players(user_id);

alter table public.mafia_users enable row level security;
alter table public.mafia_sessions enable row level security;

create or replace function public.mafia_hash_password(raw_password text, salt text)
returns text
language sql
stable
security definer
set search_path = public, extensions
as $$
  select encode(extensions.digest(raw_password || ':' || salt, 'sha256'), 'hex');
$$;

create or replace function public.mafia_user_json(target_user public.mafia_users)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', target_user.id,
    'username', target_user.username,
    'createdAt', target_user.created_at
  );
$$;

create or replace function public.mafia_user_from_token(session_token text)
returns public.mafia_users
language sql
stable
security definer
set search_path = public
as $$
  select u
  from public.mafia_sessions s
  join public.mafia_users u on u.id = s.user_id
  where s.token = session_token
    and s.expires_at > now();
$$;

create or replace function public.signup_user(user_name text, raw_password text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  clean_name text := trim(user_name);
  salt text;
  new_token text;
  created_user public.mafia_users;
begin
  if clean_name = '' or raw_password = '' then
    raise exception 'username and password required';
  end if;

  if length(clean_name) < 2 or length(clean_name) > 20 then
    raise exception 'username must be between 2 and 20 characters';
  end if;

  if clean_name ~ '[\r\n]' then
    raise exception 'invalid username';
  end if;

  if length(raw_password) < 6 then
    raise exception 'password must be at least 6 characters';
  end if;

  salt := encode(extensions.gen_random_bytes(16), 'hex');

  insert into public.mafia_users (username, password_salt, password_hash)
  values (clean_name, salt, public.mafia_hash_password(raw_password, salt))
  returning * into created_user;

  new_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.mafia_sessions (token, user_id)
  values (new_token, created_user.id);

  return jsonb_build_object('token', new_token, 'user', public.mafia_user_json(created_user));
exception
  when unique_violation then
    raise exception 'username already exists';
end;
$$;

create or replace function public.login_user(user_name text, raw_password text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  found_user public.mafia_users;
  new_token text;
begin
  select * into found_user
  from public.mafia_users
  where username = trim(user_name);

  if found_user.id is null then
    raise exception 'invalid login';
  end if;

  if found_user.password_hash <> public.mafia_hash_password(raw_password, found_user.password_salt) then
    raise exception 'invalid login';
  end if;

  delete from public.mafia_sessions
  where user_id = found_user.id
    and expires_at <= now();

  new_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.mafia_sessions (token, user_id)
  values (new_token, found_user.id);

  return jsonb_build_object('token', new_token, 'user', public.mafia_user_json(found_user));
end;
$$;

create or replace function public.get_me(session_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  active_user public.mafia_users;
begin
  active_user := public.mafia_user_from_token(session_token);

  if active_user.id is null then
    raise exception 'login required';
  end if;

  return public.mafia_user_json(active_user);
end;
$$;

create or replace function public.logout_user(session_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  delete from public.mafia_sessions
  where token = session_token;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.signup_user(text, text) to anon, authenticated;
grant execute on function public.login_user(text, text) to anon, authenticated;
grant execute on function public.get_me(text) to anon, authenticated;
grant execute on function public.logout_user(text) to anon, authenticated;
