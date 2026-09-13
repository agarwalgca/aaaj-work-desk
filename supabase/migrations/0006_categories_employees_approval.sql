-- Three changes the firm asked for, in one file so it is run once.
--
--   A. Job categories the firm manages itself, instead of a fixed list in code.
--   B. Partners add employees from the app.
--   C. A job is completed only by a manager or partner approving it from Review.
--
-- Re-runnable: every step checks before it acts.

-- ===========================================================================
-- A. Job categories
--
-- Until now a category was a Postgres enum, so adding "Professional tax" meant a
-- migration and a deploy. It is now a table. Each category keeps a stable `slug`
-- — the old enum strings, so every existing job and template stays valid without
-- being rewritten — and a `name` the firm is free to change.
--
-- `default_period` moves here too. It was a map in code that guessed a GST return
-- is measured in months; now the firm sets it, per category, and the job form
-- follows.
-- ===========================================================================

create table if not exists public.job_categories (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique check (slug ~ '^[a-z0-9_]{2,40}$'),
  name           text not null check (length(trim(name)) > 0),
  default_period text not null default 'custom'
                   check (default_period in ('monthly', 'quarterly', 'half_yearly', 'annual', 'custom')),
  sort_order     integer not null default 100,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create index if not exists categories_updated_at_idx on public.job_categories (updated_at);

drop trigger if exists categories_set_updated_at on public.job_categories;
create trigger categories_set_updated_at before insert or update on public.job_categories
  for each row execute function public.set_updated_at();

-- The nine that existed as an enum, carried across with the same slugs.
insert into public.job_categories (slug, name, default_period, sort_order) values
  ('gst_return',    'GST return',    'monthly',   10),
  ('gst_notice',    'GST notice',    'custom',    20),
  ('income_tax',    'Income tax',    'annual',    30),
  ('tds',           'TDS',           'quarterly', 40),
  ('audit',         'Audit',         'annual',    50),
  ('roc',           'ROC',           'annual',    60),
  ('accounting',    'Accounting',    'monthly',   70),
  ('certification', 'Certification', 'annual',    80),
  ('other',         'Other',         'custom',    90)
on conflict (slug) do nothing;

-- Convert the two enum columns to text, only if they are still enums.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'jobs'
      and column_name = 'category' and udt_name = 'job_category'
  ) then
    alter table public.jobs alter column category drop default;
    alter table public.jobs alter column category type text using category::text;
    alter table public.jobs alter column category set default 'other';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'job_templates'
      and column_name = 'category' and udt_name = 'job_category'
  ) then
    alter table public.job_templates alter column category drop default;
    alter table public.job_templates alter column category type text using category::text;
    alter table public.job_templates alter column category set default 'other';
  end if;
end $$;

-- A category in use cannot vanish from under a job. Retiring one is `is_active`.
do $$ begin
  alter table public.jobs
    add constraint jobs_category_fkey foreign key (category) references public.job_categories (slug);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.job_templates
    add constraint job_templates_category_fkey foreign key (category) references public.job_categories (slug);
exception when duplicate_object then null; end $$;

-- Nothing depends on the enum any more.
drop type if exists public.job_category;

-- Which kinds of work a client has. An array rather than a join table: a client
-- carries a handful of these, and a join table would be a sixth synced table and
-- a second write path to keep in step for what is, in practice, a tag list.
alter table public.clients add column if not exists categories text[] not null default '{}';
create index if not exists clients_categories_idx on public.clients using gin (categories);

alter table public.job_categories enable row level security;

drop policy if exists categories_select on public.job_categories;
create policy categories_select on public.job_categories
  for select to authenticated using (true);

drop policy if exists categories_insert on public.job_categories;
create policy categories_insert on public.job_categories
  for insert to authenticated with check (public.current_role() in ('partner', 'manager'));

drop policy if exists categories_update on public.job_categories;
create policy categories_update on public.job_categories
  for update to authenticated
  using (public.current_role() in ('partner', 'manager'))
  with check (public.current_role() in ('partner', 'manager'));

grant select, insert, update on public.job_categories to authenticated;

-- ===========================================================================
-- B. Adding an employee
--
-- A partner creates the login from the app: name, username, email, role and a
-- starting password the employee changes after signing in.
--
-- This writes to Supabase's own auth tables, which Supabase does not officially
-- support — a future GoTrue upgrade could change them. The supported route is an
-- invite via an Edge Function, which needs a server and SMTP; the firm chose this
-- instead, knowingly. If sign-ins for new employees ever start failing after a
-- Supabase upgrade, this function is the first place to look.
--
-- The password never touches the outbox or IndexedDB. It goes straight to this
-- function over HTTPS and is stored only as a bcrypt hash.
-- ===========================================================================

create or replace function public.create_employee(
  p_email     text,
  p_username  text,
  p_full_name text,
  p_role      public.user_role,
  p_password  text
)
returns uuid
language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  -- Prefixed, because "username", "email" and "full_name" are all column names
  -- too, and plpgsql resolves an unqualified clash as an error at run time.
  v_id        uuid := gen_random_uuid();
  v_username  text := lower(trim(coalesce(p_username, '')));
  v_email     text := lower(trim(coalesce(p_email, '')));
  v_full_name text := trim(coalesce(p_full_name, ''));
  v_col       text;
begin
  if public.current_role() is distinct from 'partner' then
    raise exception 'only a partner may add an employee' using errcode = 'insufficient_privilege';
  end if;

  if v_username !~ '^[a-z0-9._-]{2,32}$' then
    raise exception 'username must be 2–32 characters: letters, numbers, dot, dash or underscore'
      using errcode = 'check_violation';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'that does not look like an email address' using errcode = 'check_violation';
  end if;
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'the starting password must be at least 8 characters' using errcode = 'check_violation';
  end if;
  if v_full_name = '' then
    raise exception 'a name is needed' using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.profiles p where p.username = v_username) then
    raise exception 'the username % is already taken', v_username using errcode = 'unique_violation';
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    raise exception 'an account already uses %', v_email using errcode = 'unique_violation';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    crypt(p_password, gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('username', v_username, 'full_name', v_full_name)
  );

  -- GoTrue reads these into Go strings; a NULL fails every sign-in for the account.
  -- Which exist varies by version, so only those present are touched.
  foreach v_col in array array[
    'confirmation_token', 'recovery_token', 'email_change', 'email_change_token_new',
    'email_change_token_current', 'phone_change', 'phone_change_token', 'reauthentication_token'
  ]
  loop
    if exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'auth' and c.table_name = 'users' and c.column_name = v_col
    ) then
      execute format('update auth.users set %I = %L where id = %L and %I is null', v_col, '', v_id, v_col);
    end if;
  end loop;

  insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), v_id::text, v_id,
    jsonb_build_object('sub', v_id::text, 'email', v_email),
    'email', now(), now(), now()
  );

  -- The on_auth_user_created trigger has made the profile as staff; settle it.
  update public.profiles p set
    role      = p_role,
    full_name = v_full_name,
    initials  = upper(
      left(split_part(v_full_name, ' ', 1), 1) ||
      coalesce(left(nullif(split_part(v_full_name, ' ', 2), ''), 1), '')
    )
  where p.id = v_id;

  return v_id;
end $$;

revoke all on function public.create_employee(text, text, text, public.user_role, text) from public;
grant execute on function public.create_employee(text, text, text, public.user_role, text) to authenticated;

-- ===========================================================================
-- C. Completion is an approval
--
-- A job reaches Completed only from Review, only at the hands of a manager or a
-- partner, and the app records who approved it and when. Before this a manager
-- could move any job straight to Completed from anywhere, which made "reviewed"
-- a courtesy rather than a step.
--
-- approved_by and approved_at belong to the trigger. Nobody writes them directly:
-- they are set on approval, cleared if the job is reopened, and otherwise held.
-- ===========================================================================

alter table public.jobs add column if not exists approved_by uuid references public.profiles (id);
alter table public.jobs add column if not exists approved_at timestamptz;

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

  -- Approval. `caller is not null` leaves room for maintenance run directly in the
  -- SQL editor, which has no signed-in user and is not the app.
  if new.status = 'completed' and old.status is distinct from 'completed' then
    if caller is not null and caller not in ('partner', 'manager') then
      raise exception 'only a manager or partner can approve a job as completed'
        using errcode = 'check_violation';
    end if;
    if caller is not null and old.status is distinct from 'review' then
      raise exception 'a job is completed by approving it from review — send it for review first'
        using errcode = 'check_violation';
    end if;
    -- A manager approves staff work. Work done by a manager — their own or another
    -- manager's — and anything assigned to a partner is approved by a partner.
    -- Both the old and new assignee are checked, so reassigning a job to someone
    -- junior in the same update as approving it does not get round this.
    if caller = 'manager' and exists (
      select 1 from public.profiles p
      where p.id in (old.assigned_to, new.assigned_to)
        and (p.id = auth.uid() or p.role in ('manager', 'partner'))
    ) then
      raise exception 'a job done by a manager is approved by a partner'
        using errcode = 'check_violation';
    end if;
    new.approved_by := auth.uid();
    new.approved_at := now();
  elsif old.status = 'completed' and new.status is distinct from 'completed' then
    -- Reopened: whatever was approved is no longer what is there.
    new.approved_by := null;
    new.approved_at := null;
  else
    new.approved_by := old.approved_by;
    new.approved_at := old.approved_at;
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

-- An insert must not be a way round the approval: nobody in the app creates a job
-- that is already complete. Seed data, run with no signed-in user, is exempt.
create or replace function public.jobs_insert_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.current_role() is not null and new.status = 'completed' then
    raise exception 'a job cannot be created already completed — it has to be approved from review'
      using errcode = 'check_violation';
  end if;
  new.approved_by := null;
  new.approved_at := null;
  return new;
end $$;

drop trigger if exists jobs_insert_guard on public.jobs;
create trigger jobs_insert_guard
  before insert on public.jobs
  for each row execute function public.jobs_insert_guard();
