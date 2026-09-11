-- A due-date rule the firm sets on its own templates.
--
-- Read the distinction carefully, because it is the whole point. This is NOT a
-- statutory calendar. Nothing here knows the law, ships a list of deadlines, or
-- claims any authority. A partner says "our GST returns are due on the 20th of
-- the following month", and the app stops making somebody type that thirty times.
--
-- If the date is wrong, the firm set it wrong and can change it in one place. The
-- app never asserts a date on its own account, and a manager overrides any job.

alter table public.job_templates
  add column if not exists due_day         integer,
  add column if not exists due_months_after integer not null default 1;

do $$ begin
  alter table public.job_templates
    add constraint job_templates_due_day_range check (due_day is null or due_day between 1 and 31);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.job_templates
    add constraint job_templates_due_months_range check (due_months_after between 0 and 12);
exception when duplicate_object then null; end $$;

comment on column public.job_templates.due_day is
  'Day of month the work is due, under the firm''s own rule. Null means no automatic date.';
comment on column public.job_templates.due_months_after is
  'How many months after the period ENDS that day falls. 1 = the following month.';

-- ---------------------------------------------------------------------------
-- The same arithmetic as dueDateFor() in src/features/recurring/periods.ts.
-- verify-sql.mjs compares the two rather than trusting they look alike.
-- ---------------------------------------------------------------------------

create or replace function public.due_date_for(ends_on date, due_day integer, months_after integer)
returns date language sql immutable as $$
  select case
    when due_day is null then null
    else make_date(
      extract(year  from target)::int,
      extract(month from target)::int,
      -- "The 31st" of a 30-day month means the 30th, not the 1st of the next.
      least(greatest(due_day, 1), extract(day from (target + interval '1 month - 1 day'))::int)
    )
  end
  from (
    select date_trunc('month', ends_on)::date + (coalesce(months_after, 0) || ' months')::interval as target
  ) t;
$$;

-- ---------------------------------------------------------------------------
-- The generator now fills the date in from the rule. Everything else about it is
-- unchanged: only finished periods, never a duplicate.
-- ---------------------------------------------------------------------------

create or replace function public.generate_recurring_jobs(on_date date default current_date)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  t    record;
  p    record;
  made integer := 0;
begin
  for t in
    select * from public.job_templates where is_active and deleted_at is null
  loop
    select * into p from public.period_for(on_date - 1, t.frequency);

    -- Has the period actually ended? On 1 Aug a quarter is still running.
    continue when p.ends_on >= on_date;

    -- Already there, whether from the schedule or a manager pressing Generate.
    continue when exists (
      select 1 from public.jobs
      where template_id = t.id and period_key = p.period_key and deleted_at is null
    );

    insert into public.jobs (
      client_id, title, description, category, period_label,
      assigned_to, assigned_by, reviewer_id, status, priority, due_date,
      template_id, period_key
    )
    values (
      t.client_id, t.title, t.description, t.category, p.period_label,
      t.assigned_to, null, t.reviewer_id, 'not_started', t.priority,
      public.due_date_for(p.ends_on, t.due_day, t.due_months_after),
      t.id, p.period_key
    );

    made := made + 1;
  end loop;

  return made;
end $$;
