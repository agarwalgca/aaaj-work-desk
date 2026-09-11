-- AAAJ Work Desk — development seed.
--
-- Fictional. Five seeded colleagues live at @seed.aaaj.co.in, a subdomain that
-- routes nowhere, so they can never be confused with real staff or receive mail.
-- Delete them before the firm goes live:
--
--   delete from auth.users where email like '%@seed.aaaj.co.in';
--
-- The one real account is the partner. It already exists in auth.users (created
-- from the dashboard) and pre-dates the on_auth_user_created trigger, so its
-- profile is backfilled here rather than created by the trigger.
--
-- The seeded colleagues are created with a random password nobody knows, so they
-- exist as assignees and reviewers but cannot be signed in as. A working manager
-- password committed to a repository is a way into the firm's data, and "it is
-- only demo data" stops being true the day real clients are in there.
--
-- To run scripts/test-rls.ts, which does need to sign in as them, choose one and
-- put the same value in .env as SEED_PASSWORD:
--
--   update auth.users
--   set encrypted_password = crypt('<a password you choose>', gen_salt('bf'))
--   where email like '%@seed.aaaj.co.in';

create extension if not exists pgcrypto;

-- Start of the current Indian financial year (1 April). Dropped at the end — the
-- client computes its own window at pull time and does not need this.
create or replace function public.seed_fy_start() returns date language sql stable as $$
  select case
    when extract(month from current_date) >= 4
      then make_date(extract(year from current_date)::int, 4, 1)
      else make_date(extract(year from current_date)::int - 1, 4, 1)
  end
$$;

-- ---------------------------------------------------------------------------
-- Seeded accounts. The trigger turns each of these into a profile.
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111',
   'authenticated', 'authenticated', 'priya@seed.aaaj.co.in',
   crypt(gen_random_uuid()::text, gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}',
   '{"username":"priya","full_name":"Priya Raman"}'),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222',
   'authenticated', 'authenticated', 'arjun@seed.aaaj.co.in',
   crypt(gen_random_uuid()::text, gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}',
   '{"username":"arjun","full_name":"Arjun Deshpande"}'),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-4333-8333-333333333333',
   'authenticated', 'authenticated', 'kavya@seed.aaaj.co.in',
   crypt(gen_random_uuid()::text, gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}',
   '{"username":"kavya","full_name":"Kavya Nair"}'),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-8444-444444444444',
   'authenticated', 'authenticated', 'rohit@seed.aaaj.co.in',
   crypt(gen_random_uuid()::text, gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}',
   '{"username":"rohit","full_name":"Rohit Bhatia"}'),
  ('00000000-0000-0000-0000-000000000000', '55555555-5555-4555-8555-555555555555',
   'authenticated', 'authenticated', 'sneha@seed.aaaj.co.in',
   crypt(gen_random_uuid()::text, gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}',
   '{"username":"sneha","full_name":"Sneha Kulkarni"}')
on conflict (id) do nothing;

-- GoTrue reads these columns into Go strings, and a NULL is not a string: leave
-- them unset and every password sign-in for these accounts fails with
-- "Database error querying schema" long before the password is even checked.
-- Inserting into auth.users by hand is what leaves them NULL, so they are coerced
-- here. Which of them exist varies by GoTrue version, hence the lookup.
do $$
declare
  col text;
begin
  foreach col in array array[
    'confirmation_token', 'recovery_token', 'email_change', 'email_change_token_new',
    'email_change_token_current', 'phone_change', 'phone_change_token',
    'reauthentication_token'
  ]
  loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'auth' and table_name = 'users' and column_name = col
    ) then
      execute format(
        'update auth.users set %I = %L where %I is null and email like %L',
        col, '', col, '%@seed.aaaj.co.in'
      );
    end if;
  end loop;
end $$;

-- GoTrue expects a matching identity row for a password account.
insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email),
       'email', now(), now(), now()
from auth.users u
where u.email like '%@seed.aaaj.co.in'
  and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email');

-- ---------------------------------------------------------------------------
-- Profiles. The trigger has already made a row per seeded account with role
-- 'staff'; this settles who is actually what.
-- ---------------------------------------------------------------------------

-- The partner's account pre-dates the trigger, so it has no profile yet.
-- full_name is a guess from the username — correct it on the Team screen.
insert into public.profiles (id, username, full_name, initials, role)
select u.id, 'nitesh', 'Nitesh', 'N', 'partner'
from auth.users u
where u.email = 'gaurav@aaaj.co.in'
on conflict (id) do update
  set username = excluded.username,
      role     = excluded.role;

do $$
begin
  if not exists (select 1 from public.profiles where role = 'partner') then
    raise exception
      'No partner account found. Create gaurav@aaaj.co.in in Authentication -> Users first.';
  end if;
end $$;

update public.profiles p set
  role       = v.role::public.user_role,
  full_name  = v.full_name,
  initials   = v.initials,
  reports_to = v.reports_to::uuid
from (values
  ('11111111-1111-4111-8111-111111111111', 'manager', 'Priya Raman',     'PR', null),
  ('22222222-2222-4222-8222-222222222222', 'manager', 'Arjun Deshpande', 'AD', null),
  ('33333333-3333-4333-8333-333333333333', 'staff',   'Kavya Nair',      'KN', '11111111-1111-4111-8111-111111111111'),
  ('44444444-4444-4444-8444-444444444444', 'staff',   'Rohit Bhatia',    'RB', '22222222-2222-4222-8222-222222222222'),
  ('55555555-5555-4555-8555-555555555555', 'staff',   'Sneha Kulkarni',  'SK', '11111111-1111-4111-8111-111111111111')
) as v(id, role, full_name, initials, reports_to)
where p.id = v.id::uuid;

-- ---------------------------------------------------------------------------
-- Clients. Fictional until the firm supplies real ones.
-- ---------------------------------------------------------------------------

insert into public.clients (id, name, code, gstin, pan) values
  ('10000000-0000-4000-8000-000000000001', 'Suryodaya Textiles Private Limited', 'SUR-01', '27AABCS1429B1ZX', 'AABCS1429B'),
  ('10000000-0000-4000-8000-000000000002', 'Meghna Foods LLP',                   'MEG-01', '27AAFFM8821K1ZP', 'AAFFM8821K'),
  ('10000000-0000-4000-8000-000000000003', 'Ravi Kirana Stores',                 'RAV-01', '27AKPPR6612D1ZQ', 'AKPPR6612D')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 25 jobs.
--
-- Dates are relative so the spread stays true whenever this runs:
--   4 overdue (open, due date past)
--   3 completed inside the previous financial year  -> inside the cache window
--   1 completed three financial years ago           -> outside it
--   1 open job created two years ago                -> inside it anyway, because
--                                                      open jobs are never aged out
-- ---------------------------------------------------------------------------

insert into public.jobs (
  id, client_id, title, description, category, period_label,
  assigned_to, assigned_by, reviewer_id, status, priority,
  due_date, started_at, completed_at, created_at
) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
   'GSTR-3B and GSTR-1 filing', '', 'gst_return', 'Aug-2026',
   '33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111',
   'in_progress', 'normal', current_date + 5, now() - interval '2 days', null, now() - interval '6 days'),

  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
   'GSTR-3B and GSTR-1 filing', '', 'gst_return', 'Jul-2026',
   '33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111',
   'completed', 'normal', current_date - 35, now() - interval '40 days', now() - interval '30 days', now() - interval '45 days'),

  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
   'TDS return 26Q', '', 'tds', 'Q1 FY 2026-27',
   '44444444-4444-4444-8444-444444444444', '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222',
   'not_started', 'high', current_date + 2, null, null, now() - interval '3 days'),

  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001',
   'Statutory audit', 'Branch visits pending.', 'audit', 'FY 2025-26',
   '11111111-1111-4111-8111-111111111111', null, null,
   'in_progress', 'high', current_date + 40, now() - interval '20 days', null, now() - interval '25 days'),

  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001',
   'Reply to GST notice ASMT-10', 'Awaiting reconciliation from the client.', 'gst_notice', 'FY 2024-25',
   '55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111',
   'on_hold', 'urgent', current_date - 3, now() - interval '10 days', null, now() - interval '14 days'),

  ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000002',
   'GSTR-3B and GSTR-1 filing', '', 'gst_return', 'Aug-2026',
   '44444444-4444-4444-8444-444444444444', '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222',
   'in_progress', 'normal', current_date + 5, now() - interval '1 day', null, now() - interval '6 days'),

  ('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000002',
   'Income tax return ITR-5', '', 'income_tax', 'FY 2025-26',
   '33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111',
   'review', 'high', current_date - 1, now() - interval '12 days', null, now() - interval '18 days'),

  ('20000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000002',
   'Monthly accounting write-up', '', 'accounting', 'Aug-2026',
   '55555555-5555-4555-8555-555555555555', '22222222-2222-4222-8222-222222222222', null,
   'not_started', 'normal', current_date + 8, null, null, now() - interval '4 days'),

  ('20000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000002',
   'ROC annual filing AOC-4 and MGT-7', '', 'roc', 'FY 2025-26',
   '11111111-1111-4111-8111-111111111111', null, null,
   'not_started', 'normal', current_date + 60, null, null, now() - interval '2 days'),

  ('20000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000002',
   'Net worth certificate', 'Figures did not tie to the audited balance sheet.', 'certification', 'FY 2025-26',
   '44444444-4444-4444-8444-444444444444', '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222',
   'rework', 'high', current_date - 6, now() - interval '15 days', null, now() - interval '20 days'),

  ('20000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000003',
   'GSTR-3B and GSTR-1 filing', '', 'gst_return', 'Aug-2026',
   '55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111',
   'in_progress', 'normal', current_date + 5, now() - interval '1 day', null, now() - interval '6 days'),

  ('20000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000003',
   'TDS return 24Q', '', 'tds', 'Q1 FY 2026-27',
   '33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222',
   'completed', 'normal', current_date - 20, now() - interval '25 days', now() - interval '15 days', now() - interval '30 days'),

  ('20000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000003',
   'Bookkeeping and bank reconciliation', '', 'accounting', 'Jul-2026',
   '55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111',
   'review', 'low', current_date - 9, now() - interval '20 days', null, now() - interval '28 days'),

  ('20000000-0000-4000-8000-000000000014', '10000000-0000-4000-8000-000000000003',
   'Income tax return ITR-3', '', 'income_tax', 'FY 2025-26',
   '44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111', null,
   'not_started', 'normal', current_date + 25, null, null, now() - interval '5 days'),

  ('20000000-0000-4000-8000-000000000015', '10000000-0000-4000-8000-000000000001',
   'GST annual return GSTR-9 and 9C', 'Client yet to confirm the ITC reversal.', 'gst_return', 'FY 2024-25',
   '33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222',
   'on_hold', 'normal', current_date + 90, now() - interval '30 days', null, now() - interval '35 days'),

  -- Unassigned: the Board's first bucket needs something in it.
  ('20000000-0000-4000-8000-000000000016', '10000000-0000-4000-8000-000000000002',
   'Transfer pricing documentation', '', 'other', 'FY 2025-26',
   null, null, null,
   'not_started', 'normal', current_date + 45, null, null, now() - interval '1 day'),

  ('20000000-0000-4000-8000-000000000017', '10000000-0000-4000-8000-000000000003',
   'Shop and establishment licence renewal', 'Client renewed it directly.', 'other', '2026',
   null, null, null,
   'cancelled', 'low', current_date + 30, null, null, now() - interval '12 days'),

  ('20000000-0000-4000-8000-000000000018', '10000000-0000-4000-8000-000000000001',
   'Bank stock audit', '', 'audit', 'Sep-2026',
   '22222222-2222-4222-8222-222222222222', null, null,
   'in_progress', 'normal', current_date + 14, now() - interval '3 days', null, now() - interval '7 days'),

  ('20000000-0000-4000-8000-000000000019', '10000000-0000-4000-8000-000000000002',
   'Reply to GST notice DRC-01', 'Annexure needs redoing.', 'gst_notice', 'FY 2023-24',
   '33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111',
   'rework', 'urgent', current_date + 7, now() - interval '9 days', null, now() - interval '16 days'),

  -- Open, and two years old. It stays cached: the window is state-shaped, not
  -- age-shaped, and an open job is the working set by definition.
  ('20000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000001',
   'Inter-company reconciliation', 'Long-running. No fixed date.', 'accounting', 'FY 2024-25',
   '44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111', null,
   'in_progress', 'low', null, now() - interval '2 years', null, now() - interval '2 years'),

  -- Three closed inside the previous financial year: cached.
  ('20000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000002',
   'GSTR-3B and GSTR-1 filing', '', 'gst_return', 'Mar-2026',
   '55555555-5555-4555-8555-555555555555', '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222',
   'completed', 'normal', public.seed_fy_start() - 40, public.seed_fy_start() - 50, public.seed_fy_start() - 60, public.seed_fy_start() - 80),

  ('20000000-0000-4000-8000-000000000022', '10000000-0000-4000-8000-000000000001',
   'Income tax return ITR-6', '', 'income_tax', 'FY 2024-25',
   '33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111',
   'completed', 'normal', public.seed_fy_start() - 150, public.seed_fy_start() - 170, public.seed_fy_start() - 150, public.seed_fy_start() - 200),

  ('20000000-0000-4000-8000-000000000023', '10000000-0000-4000-8000-000000000003',
   'TDS return 24Q', '', 'tds', 'Q4 FY 2025-26',
   '44444444-4444-4444-8444-444444444444', '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222',
   'completed', 'normal', public.seed_fy_start() - 25, public.seed_fy_start() - 35, public.seed_fy_start() - 30, public.seed_fy_start() - 50),

  -- Closed three financial years ago: outside the window, must not be cached.
  ('20000000-0000-4000-8000-000000000024', '10000000-0000-4000-8000-000000000001',
   'Assessment support u/s 143(2)', '', 'income_tax', 'FY 2022-23',
   '33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111',
   'completed', 'normal', public.seed_fy_start() - 900, public.seed_fy_start() - 950, public.seed_fy_start() - 900, public.seed_fy_start() - 1000),

  ('20000000-0000-4000-8000-000000000025', '10000000-0000-4000-8000-000000000002',
   'Duplicate GST registration application', 'Raised twice.', 'other', 'Aug-2026',
   '55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111', null,
   'cancelled', 'low', current_date + 20, null, null, now() - interval '8 days')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Status history. jobs.status reflects the latest row here, so anything that has
-- moved off not_started needs a trail.
-- ---------------------------------------------------------------------------

insert into public.job_status_history (job_id, from_status, to_status, changed_by, changed_at, note)
select j.id, 'not_started', 'in_progress',
       coalesce(j.assigned_to, j.assigned_by),
       coalesce(j.started_at, j.created_at), null
from public.jobs j
where j.status <> 'not_started'
  and coalesce(j.assigned_to, j.assigned_by) is not null
  and not exists (select 1 from public.job_status_history h where h.job_id = j.id);

insert into public.job_status_history (job_id, from_status, to_status, changed_by, changed_at, note)
select j.id, 'in_progress', j.status,
       coalesce(j.reviewer_id, j.assigned_by, j.assigned_to),
       coalesce(j.completed_at, j.updated_at),
       case when j.status = 'rework' then 'Returned by reviewer.' else null end
from public.jobs j
where j.status in ('on_hold', 'review', 'rework', 'completed', 'cancelled')
  and coalesce(j.reviewer_id, j.assigned_by, j.assigned_to) is not null
  and (select count(*) from public.job_status_history h where h.job_id = j.id) < 2;

-- ---------------------------------------------------------------------------
-- A couple of comments, so the thread on job detail is not empty in step 3.
-- ---------------------------------------------------------------------------

insert into public.job_comments (job_id, author_id, body)
select '20000000-0000-4000-8000-000000000005', '55555555-5555-4555-8555-555555555555',
       'Client has been asked for the 2B reconciliation. Nothing received yet.'
where not exists (
  select 1 from public.job_comments where job_id = '20000000-0000-4000-8000-000000000005'
);

insert into public.job_comments (job_id, author_id, body)
select '20000000-0000-4000-8000-000000000010', '22222222-2222-4222-8222-222222222222',
       'Net worth does not agree with the audited balance sheet. Please redo the working.'
where not exists (
  select 1 from public.job_comments where job_id = '20000000-0000-4000-8000-000000000010'
);

drop function public.seed_fy_start();
