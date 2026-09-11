-- Recurring jobs appear by themselves on the 1st.
--
-- This is scheduled inside Postgres with pg_cron, not by a server. It is the one
-- piece of the app that runs with nobody present, so it is written to be dull:
-- it inserts what is missing and nothing else, and running it twice is a no-op.
--
-- The period it generates is the one that has just ENDED. A GST return created on
-- 1 October is September's return — compliance work is always for a completed
-- period, and labelling it October would put the wrong month on every job.

-- ---------------------------------------------------------------------------
-- The same financial-year arithmetic as src/features/recurring/periods.ts, in
-- SQL. Two implementations of one rule is a risk, so verify-sql.mjs compares
-- them date by date rather than trusting that they look similar.
-- ---------------------------------------------------------------------------

create or replace function public.period_for(on_date date, freq public.recurrence_frequency)
returns table (period_key text, period_label text, starts_on date, ends_on date)
language sql immutable as $$
  with base as (
    select
      extract(month from on_date)::int as m,
      extract(year from on_date)::int  as y
  ),
  fy as (
    select case when m >= 4 then y else y - 1 end as start_year from base
  ),
  named as (
    select
      start_year,
      start_year || '-' || lpad(((start_year + 1) % 100)::text, 2, '0') as fy_label,
      -- 0 = Apr-Jun, 1 = Jul-Sep, 2 = Oct-Dec, 3 = Jan-Mar
      ((select m from base) - 4 + 12) % 12 / 3 as q
    from fy
  )
  select
    case freq
      when 'monthly'     then 'M-' || to_char(on_date, 'YYYY-MM')
      when 'quarterly'   then 'Q-' || start_year || '-' || (q + 1)
      when 'half_yearly' then 'H-' || start_year || '-' || (case when q < 2 then 1 else 2 end)
      else                    'A-' || start_year
    end,
    case freq
      when 'monthly'     then to_char(on_date, 'Mon-YYYY')
      when 'quarterly'   then 'Q' || (q + 1) || ' FY ' || fy_label
      when 'half_yearly' then 'H' || (case when q < 2 then 1 else 2 end) || ' FY ' || fy_label
      else                    'FY ' || fy_label
    end,
    case freq
      when 'monthly'     then date_trunc('month', on_date)::date
      when 'quarterly'   then make_date(case when q = 3 then start_year + 1 else start_year end,
                                        ((3 + q * 3) % 12) + 1, 1)
      when 'half_yearly' then make_date(start_year, case when q < 2 then 4 else 10 end, 1)
      else                    make_date(start_year, 4, 1)
    end,
    case freq
      when 'monthly'     then (date_trunc('month', on_date) + interval '1 month - 1 day')::date
      when 'quarterly'   then (make_date(case when q = 3 then start_year + 1 else start_year end,
                                         ((3 + q * 3) % 12) + 1, 1)
                               + interval '3 months - 1 day')::date
      when 'half_yearly' then (make_date(start_year, case when q < 2 then 4 else 10 end, 1)
                               + interval '6 months - 1 day')::date
      else                    make_date(start_year + 1, 3, 31)
    end
  from named;
$$;

-- ---------------------------------------------------------------------------
-- The generator.
--
-- Only periods that have finished are created, which is what lets one monthly
-- schedule serve every frequency: on 1 August a quarterly template's current
-- quarter has not ended, so nothing happens; on 1 October it has, so it does.
--
-- No due date is set. A date nobody chose is worse than a blank one, and the
-- firm's rule is that a manager enters it.
-- ---------------------------------------------------------------------------

create or replace function public.generate_recurring_jobs(on_date date default current_date)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  t      record;
  p      record;
  made   integer := 0;
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
      assigned_to, assigned_by, reviewer_id, status, priority,
      template_id, period_key
    )
    values (
      t.client_id, t.title, t.description, t.category, p.period_label,
      t.assigned_to, null, t.reviewer_id, 'not_started', t.priority,
      t.id, p.period_key
    );

    made := made + 1;
  end loop;

  return made;
end $$;

revoke all on function public.generate_recurring_jobs(date) from public;

-- ---------------------------------------------------------------------------
-- The schedule. 00:20 UTC on the 1st is just before 06:00 in India, so the work
-- is waiting before anybody opens the app.
--
-- Guarded: if pg_cron is not enabled the migration still applies, and a manager
-- can press Generate by hand until it is.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('aaaj-generate-recurring')
    where exists (select 1 from cron.job where jobname = 'aaaj-generate-recurring');

    perform cron.schedule(
      'aaaj-generate-recurring',
      '20 0 1 * *',
      $cron$select public.generate_recurring_jobs();$cron$
    );
    raise notice 'Scheduled aaaj-generate-recurring for 00:20 UTC on the 1st.';
  else
    raise notice
      'pg_cron is not enabled, so nothing is scheduled. Enable it under Database -> Extensions and re-run this file.';
  end if;
end $$;
