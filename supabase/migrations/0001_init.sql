-- AAAJ Work Desk — schema, permissions and the rules Postgres has to own.
--
-- Run this once against the project (SQL editor, or `supabase db push`). It is
-- written to be re-runnable: every object is created only if absent.
--
-- Two rules cannot be expressed as row-level security and live in triggers instead:
-- which columns a member of staff may change, and which status transitions they may
-- make. RLS decides whether a row is visible or writable at all; it cannot see which
-- columns moved.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.user_role as enum ('partner', 'manager', 'staff');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.job_category as enum (
    'gst_return', 'gst_notice', 'income_tax', 'tds', 'audit',
    'roc', 'accounting', 'certification', 'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.job_status as enum (
    'not_started', 'in_progress', 'on_hold', 'review', 'rework', 'completed', 'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.job_priority as enum ('low', 'normal', 'high', 'urgent');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Shared updated_at
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  -- Sign-in name. Deliberately unrelated to the account's email address.
  username    text not null unique
                check (username = lower(username) and username ~ '^[a-z0-9._-]{2,32}$'),
  full_name   text not null default '',
  initials    text not null default '',
  role        public.user_role not null default 'staff',
  is_active   boolean not null default true,
  reports_to  uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table if not exists public.clients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  code        text not null unique,
  gstin       text,
  pan         text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table if not exists public.jobs (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients (id),
  title         text not null,
  description   text not null default '',
  category      public.job_category not null default 'other',
  period_label  text not null default '',
  assigned_to   uuid references public.profiles (id),
  assigned_by   uuid references public.profiles (id),
  reviewer_id   uuid references public.profiles (id),
  status        public.job_status not null default 'not_started',
  priority      public.job_priority not null default 'normal',
  due_date      date,
  started_at    timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

-- Append-only. Never updated, never deleted. Ids come from the client so a
-- retried push is idempotent and two people working offline both keep their row.
create table if not exists public.job_status_history (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs (id) on delete cascade,
  from_status public.job_status,
  to_status   public.job_status not null,
  changed_by  uuid references public.profiles (id),
  changed_at  timestamptz not null default now(),
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- Append-only, same reasoning.
create table if not exists public.job_comments (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs (id) on delete cascade,
  author_id   uuid references public.profiles (id),
  body        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- ---------------------------------------------------------------------------
-- Indexes. updated_at on every table because that is what the pull cursor walks.
-- ---------------------------------------------------------------------------

create index if not exists profiles_updated_at_idx  on public.profiles (updated_at);
create index if not exists clients_updated_at_idx   on public.clients (updated_at);
create index if not exists jobs_assigned_status_idx on public.jobs (assigned_to, status);
create index if not exists jobs_client_idx          on public.jobs (client_id);
create index if not exists jobs_due_date_idx        on public.jobs (due_date);
create index if not exists jobs_updated_at_idx      on public.jobs (updated_at);
create index if not exists jobs_completed_at_idx    on public.jobs (completed_at);
create index if not exists jobs_reviewer_idx        on public.jobs (reviewer_id);
create index if not exists history_job_changed_idx  on public.job_status_history (job_id, changed_at);
create index if not exists history_updated_at_idx   on public.job_status_history (updated_at);
create index if not exists comments_job_created_idx on public.job_comments (job_id, created_at);
create index if not exists comments_updated_at_idx  on public.job_comments (updated_at);

-- ---------------------------------------------------------------------------
-- Role lookup
--
-- SECURITY DEFINER so that policies on jobs can ask "what is the caller?" without
-- selecting from profiles as the caller — which would re-enter profiles' own
-- policies and recurse. Always call it schema-qualified: unqualified current_role
-- is a Postgres built-in.
-- ---------------------------------------------------------------------------

create or replace function public.current_role()
returns text language sql stable security definer set search_path = public as $$
  select role::text from public.profiles
  where id = auth.uid() and is_active and deleted_at is null
$$;

-- Username to email, for the login screen. Executable by anon because it has to
-- run before anyone is signed in. Returns null for an unknown, deactivated or
-- soft-deleted username; the form reports the same message either way.
create or replace function public.email_for_username(p_username text)
returns text language sql stable security definer set search_path = public, auth as $$
  select u.email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.username = lower(trim(p_username))
    and p.is_active
    and p.deleted_at is null
$$;

revoke all on function public.email_for_username(text) from public;
grant execute on function public.email_for_username(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- New account -> profile
--
-- Access is invite-only, so this fires when a partner creates the account from
-- the dashboard. Username defaults to the email local part purely as a starting
-- value; a partner edits it afterwards, and it carries no meaning.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base      text;
  candidate text;
begin
  base := lower(regexp_replace(
    coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), split_part(new.email, '@', 1)),
    '[^a-z0-9._-]', '', 'g'));
  if length(base) < 2 then
    base := 'user';
  end if;

  candidate := base;
  if exists (select 1 from public.profiles where username = candidate) then
    candidate := base || '-' || left(new.id::text, 4);
  end if;

  insert into public.profiles (id, username, full_name)
  values (new.id, candidate, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Column-level and transition-level rules for jobs
--
-- Staff may move a job's status along a fixed path and change nothing else.
-- Managers may edit jobs but may not soft-delete one — that is a partner's call.
-- started_at and completed_at are maintained here rather than by the client, so
-- they cannot drift and staff are not blamed for changing them.
-- ---------------------------------------------------------------------------

create or replace function public.jobs_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  caller text := public.current_role();
begin
  if caller = 'staff' then
    if (new.client_id, new.title, new.description, new.category, new.period_label,
        new.assigned_to, new.assigned_by, new.reviewer_id, new.priority,
        new.due_date, new.deleted_at)
       is distinct from
       (old.client_id, old.title, old.description, old.category, old.period_label,
        old.assigned_to, old.assigned_by, old.reviewer_id, old.priority,
        old.due_date, old.deleted_at)
    then
      raise exception 'staff may change only the status of a job'
        using errcode = 'check_violation';
    end if;

    if new.status is distinct from old.status
       and (old.status::text, new.status::text) not in (
         ('not_started', 'in_progress'),
         ('in_progress', 'on_hold'),
         ('on_hold',     'in_progress'),
         ('on_hold',     'review'),
         ('in_progress', 'review'),
         ('rework',      'in_progress')
       )
    then
      raise exception 'staff may not move a job from % to %', old.status, new.status
        using errcode = 'check_violation';
    end if;
  end if;

  if caller = 'manager' and new.deleted_at is distinct from old.deleted_at then
    raise exception 'only a partner may delete a job' using errcode = 'check_violation';
  end if;

  if new.status = 'in_progress' and new.started_at is null then
    new.started_at := now();
  end if;

  if new.status = 'completed' then
    new.completed_at := coalesce(old.completed_at, now());
  elsif old.status = 'completed' then
    new.completed_at := null;
  end if;

  return new;
end $$;

drop trigger if exists jobs_guard on public.jobs;
create trigger jobs_guard
  before update on public.jobs
  for each row execute function public.jobs_guard();

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before insert or update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at before insert or update on public.clients
  for each row execute function public.set_updated_at();

-- Named to sort after jobs_guard, which has to see the row the caller sent.
drop trigger if exists jobs_set_updated_at on public.jobs;
create trigger jobs_set_updated_at before insert or update on public.jobs
  for each row execute function public.set_updated_at();

drop trigger if exists history_set_updated_at on public.job_status_history;
create trigger history_set_updated_at before insert or update on public.job_status_history
  for each row execute function public.set_updated_at();

drop trigger if exists comments_set_updated_at on public.job_comments;
create trigger comments_set_updated_at before insert or update on public.job_comments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security
--
-- Note what the select policies do NOT do: they never hide soft-deleted rows. A
-- device learns that a row is gone by pulling its tombstone; filter tombstones out
-- here and deletions would never reach anyone who is offline at the time.
-- ---------------------------------------------------------------------------

alter table public.profiles           enable row level security;
alter table public.clients            enable row level security;
alter table public.jobs               enable row level security;
alter table public.job_status_history enable row level security;
alter table public.job_comments       enable row level security;

-- profiles: everyone signed in reads the directory; only partners write it.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated with check (public.current_role() = 'partner');

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (public.current_role() = 'partner')
  with check (public.current_role() = 'partner');

-- clients: everyone signed in reads them — a job is unreadable without its client.
-- Managers and partners write; staff do not.
drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients
  for select to authenticated using (true);

drop policy if exists clients_insert on public.clients;
create policy clients_insert on public.clients
  for insert to authenticated
  with check (public.current_role() in ('partner', 'manager'));

drop policy if exists clients_update on public.clients;
create policy clients_update on public.clients
  for update to authenticated
  using (public.current_role() in ('partner', 'manager'))
  with check (public.current_role() in ('partner', 'manager'));

-- jobs: partners and managers see everything; staff see only what is theirs to
-- do or to review.
drop policy if exists jobs_select on public.jobs;
create policy jobs_select on public.jobs
  for select to authenticated
  using (
    public.current_role() in ('partner', 'manager')
    or assigned_to = auth.uid()
    or reviewer_id = auth.uid()
  );

drop policy if exists jobs_insert on public.jobs;
create policy jobs_insert on public.jobs
  for insert to authenticated
  with check (public.current_role() in ('partner', 'manager'));

drop policy if exists jobs_update on public.jobs;
create policy jobs_update on public.jobs
  for update to authenticated
  using (
    public.current_role() in ('partner', 'manager')
    or assigned_to = auth.uid()
    or reviewer_id = auth.uid()
  )
  with check (
    public.current_role() in ('partner', 'manager')
    or assigned_to = auth.uid()
    or reviewer_id = auth.uid()
  );

-- History and comments follow their job. No update or delete policy exists, so
-- append-only is enforced by the absence of a way to do anything else.
drop policy if exists history_select on public.job_status_history;
create policy history_select on public.job_status_history
  for select to authenticated
  using (exists (select 1 from public.jobs j where j.id = job_id));

drop policy if exists history_insert on public.job_status_history;
create policy history_insert on public.job_status_history
  for insert to authenticated
  with check (changed_by = auth.uid() and exists (select 1 from public.jobs j where j.id = job_id));

drop policy if exists comments_select on public.job_comments;
create policy comments_select on public.job_comments
  for select to authenticated
  using (exists (select 1 from public.jobs j where j.id = job_id));

drop policy if exists comments_insert on public.job_comments;
create policy comments_insert on public.job_comments
  for insert to authenticated
  with check (author_id = auth.uid() and exists (select 1 from public.jobs j where j.id = job_id));

-- ---------------------------------------------------------------------------
-- Grants. RLS decides the rows; these decide the verbs. No update or delete on
-- the append-only tables, and no delete anywhere — removal is a soft delete.
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.profiles           to authenticated;
grant select, insert, update on public.clients            to authenticated;
grant select, insert, update on public.jobs               to authenticated;
grant select, insert         on public.job_status_history to authenticated;
grant select, insert         on public.job_comments       to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime. Subscriptions trigger an incremental pull rather than applying the
-- payload, so the RLS-filtered read stays the only source of truth.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.jobs';
    execute 'alter publication supabase_realtime add table public.job_status_history';
    execute 'alter publication supabase_realtime add table public.job_comments';
  end if;
exception when duplicate_object then null;
end $$;
