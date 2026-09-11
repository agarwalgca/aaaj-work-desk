-- Can the app see its own schedule?
--
-- "Recurring jobs appear on the 1st" is a promise made in the interface, and
-- until now nothing checked it was true. The schedule is only created if pg_cron
-- happens to be enabled when 0003 runs — enable the extension afterwards and
-- everything looks fine while nothing is actually scheduled. That failure is
-- silent for a month, and then a partner notices the returns never appeared.
--
-- So the app asks. The `cron` schema is not reachable through the API, hence a
-- SECURITY DEFINER function that reports just this one row and nothing else.

create or replace function public.recurring_schedule()
returns table (jobname text, schedule text, active boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;

  -- Dynamic, so this file still applies on a database without pg_cron: a direct
  -- reference to cron.job would fail to parse at creation time.
  return query execute $q$
    select jobname::text, schedule::text, active
    from cron.job
    where jobname = 'aaaj-generate-recurring'
  $q$;
exception
  -- No rights to read cron.job, or no such table. Either way: nothing to report,
  -- which the interface states as "not scheduled" rather than guessing.
  when others then return;
end $$;

revoke all on function public.recurring_schedule() from public;
grant execute on function public.recurring_schedule() to authenticated;

-- Re-assert the schedule, for the common case of pg_cron being enabled after
-- 0003 was run. Safe to repeat: the job is replaced, not duplicated.
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
    raise notice 'aaaj-generate-recurring is scheduled for 00:20 UTC on the 1st.';
  else
    raise notice 'pg_cron is still not enabled; nothing scheduled.';
  end if;
end $$;
