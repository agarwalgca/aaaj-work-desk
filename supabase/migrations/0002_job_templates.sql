-- Recurring work.
--
-- A template says "this client has a GST return every month, Kavya does it". It
-- does not create anything on its own: there is no server here to wake up on the
-- first of the month, so a manager presses Generate and sees what is about to be
-- created before it is. That is a constraint of the architecture, and arguably the
-- better behaviour anyway — thirty jobs appearing unreviewed is how a list stops
-- being trusted.
--
-- The due date is deliberately not derived. Statutory dates move, and an app that
-- quietly asserts the wrong one is worse than an app that asks.

do $$ begin
  create type public.recurrence_frequency as enum ('monthly', 'quarterly', 'half_yearly', 'annual');
exception when duplicate_object then null; end $$;

create table if not exists public.job_templates (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients (id),
  title        text not null,
  description  text not null default '',
  category     public.job_category not null default 'other',
  frequency    public.recurrence_frequency not null,
  assigned_to  uuid references public.profiles (id),
  reviewer_id  uuid references public.profiles (id),
  priority     public.job_priority not null default 'normal',
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create index if not exists templates_client_idx     on public.job_templates (client_id);
create index if not exists templates_updated_at_idx on public.job_templates (updated_at);

-- Where a generated job came from, and which period it covers.
alter table public.jobs add column if not exists template_id uuid references public.job_templates (id);
alter table public.jobs add column if not exists period_key  text;

-- The guard against generating August twice. A local check catches the ordinary
-- case; this catches two managers pressing Generate at the same moment.
create unique index if not exists jobs_template_period_key
  on public.jobs (template_id, period_key)
  where template_id is not null and deleted_at is null;

create index if not exists jobs_template_idx on public.jobs (template_id);

drop trigger if exists templates_set_updated_at on public.job_templates;
create trigger templates_set_updated_at before insert or update on public.job_templates
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security. Templates are an allocation tool, so they belong to the
-- people who allocate. Staff never see the screen and do not sync the rows.
-- ---------------------------------------------------------------------------

alter table public.job_templates enable row level security;

drop policy if exists templates_select on public.job_templates;
create policy templates_select on public.job_templates
  for select to authenticated using (public.current_role() in ('partner', 'manager'));

drop policy if exists templates_insert on public.job_templates;
create policy templates_insert on public.job_templates
  for insert to authenticated with check (public.current_role() in ('partner', 'manager'));

drop policy if exists templates_update on public.job_templates;
create policy templates_update on public.job_templates
  for update to authenticated
  using (public.current_role() in ('partner', 'manager'))
  with check (public.current_role() in ('partner', 'manager'));

grant select, insert, update on public.job_templates to authenticated;

-- ---------------------------------------------------------------------------
-- Staff still may change nothing but status. The guard compares an explicit
-- column list, so the two new columns have to join it or they would be a way
-- around it.
-- ---------------------------------------------------------------------------

create or replace function public.jobs_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  caller text := public.current_role();
begin
  if caller = 'staff' then
    if (new.client_id, new.title, new.description, new.category, new.period_label,
        new.assigned_to, new.assigned_by, new.reviewer_id, new.priority,
        new.due_date, new.deleted_at, new.template_id, new.period_key)
       is distinct from
       (old.client_id, old.title, old.description, old.category, old.period_label,
        old.assigned_to, old.assigned_by, old.reviewer_id, old.priority,
        old.due_date, old.deleted_at, old.template_id, old.period_key)
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

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.job_templates';
  end if;
exception when duplicate_object then null;
end $$;
