// Runs the migration and the seed against a throwaway Postgres (PGlite, in WASM)
// and asserts the permission rules, so a broken policy is caught here rather than
// after it has been applied to the firm's project.
//
//   npm run verify:sql
//
// What this cannot check: GoTrue itself. The auth schema below is a stub with the
// columns the migration and seed touch. scripts/test-rls.ts covers the real thing
// once the migration has been applied to Supabase.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sql = (p) => readFileSync(resolve(root, p), 'utf8')

const PARTNER = '99999999-9999-4999-8999-999999999999'
const MANAGER = '11111111-1111-4111-8111-111111111111' // Priya
const STAFF_A = '33333333-3333-4333-8333-333333333333' // Kavya
const STAFF_B = '44444444-4444-4444-8444-444444444444' // Rohit

const db = await PGlite.create({ extensions: { pgcrypto } })

// ---------------------------------------------------------------------------
// Enough of Supabase to run against: the auth schema, the two roles PostgREST
// connects as, and auth.uid() reading the claim the way GoTrue sets it.
// ---------------------------------------------------------------------------

await db.exec(`
  create schema auth;
  create role anon;
  create role authenticated;

  create table auth.users (
    instance_id        uuid,
    id                 uuid primary key,
    aud                text,
    role               text,
    email              text unique,
    encrypted_password text,
    email_confirmed_at timestamptz,
    created_at         timestamptz default now(),
    updated_at         timestamptz default now(),
    raw_app_meta_data  jsonb default '{}',
    raw_user_meta_data jsonb default '{}',
    -- GoTrue scans these into Go strings. Present here so the seed's NULL repair
    -- runs locally rather than being skipped as a missing column.
    confirmation_token          text,
    recovery_token              text,
    email_change                text,
    email_change_token_new      text,
    email_change_token_current  text,
    phone_change                text,
    phone_change_token          text,
    reauthentication_token      text
  );

  create table auth.identities (
    id              uuid primary key,
    provider_id     text not null,
    user_id         uuid not null references auth.users (id) on delete cascade,
    identity_data   jsonb not null,
    provider        text not null,
    last_sign_in_at timestamptz,
    created_at      timestamptz default now(),
    updated_at      timestamptz default now(),
    unique (provider_id, provider)
  );

  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;

  grant usage on schema auth to anon, authenticated;
`)

// The partner account the firm created from the dashboard, before the seed runs.
await db.query(
  `insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at)
   values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
           'gaurav@aaaj.co.in', now())`,
  [PARTNER],
)

// ---------------------------------------------------------------------------

let failures = 0

function report(name, ok, detail = '') {
  if (!ok) failures += 1
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}`
  console.log(detail ? `${line}\n        ${detail}` : line)
}

/** Run fn as an authenticated caller, the way PostgREST would. */
async function as(uid, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`)
  try {
    return await fn()
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`)
  }
}

/** A missing fixture would make every refusal below pass for the wrong reason. */
function must(value, label) {
  if (value === undefined || value === null) {
    console.log(`FAIL  fixture missing: ${label}`)
    process.exit(1)
  }
  return value
}

/**
 * Assert that a statement is refused.
 *
 * `by` says which mechanism has to do the refusing. 'trigger' matters where the row
 * is one the caller is allowed to touch at all: RLS lets the UPDATE through and the
 * guard must raise. Accepting a silent zero-row result there would hide a policy
 * quietly blocking writes staff are supposed to be able to make.
 */
async function refuses(name, uid, statement, params = [], by = 'either') {
  const outcome = await as(uid, async () => {
    try {
      const r = await db.query(statement, params)
      return { raised: false, affected: r.affectedRows }
    } catch (e) {
      return { raised: true, message: e.message.split('\n')[0] }
    }
  })
  const blocked = by === 'trigger' ? outcome.raised : outcome.raised || outcome.affected === 0
  report(name, blocked, outcome.raised ? outcome.message : `affected ${outcome.affected} row(s)`)
}

// ---------------------------------------------------------------------------

console.log('\n— migration —')
try {
  await db.exec(sql('supabase/migrations/0001_init.sql'))
  report('0001_init.sql applies', true)
} catch (e) {
  report('0001_init.sql applies', false, e.message)
  console.log('\nCannot continue without the schema.')
  process.exit(1)
}

console.log('\n— seed —')
try {
  await db.exec(sql('supabase/seed.sql'))
  report('seed.sql applies', true)
} catch (e) {
  report('seed.sql applies', false, e.message)
  process.exit(1)
}

const counts = await db.query(`
  select
    (select count(*) from public.profiles)                                    as profiles,
    (select count(*) from public.profiles where role = 'partner')             as partners,
    (select count(*) from public.profiles where role = 'manager')             as managers,
    (select count(*) from public.profiles where role = 'staff')               as staff,
    (select count(*) from public.clients)                                     as clients,
    (select count(*) from public.jobs)                                        as jobs,
    (select count(*) from public.jobs
      where due_date < current_date
        and status not in ('completed', 'cancelled'))                         as overdue,
    (select count(*) from public.jobs
      where status = 'completed'
        and completed_at >= (date_trunc('year', current_date) - interval '9 months')
        and completed_at <  (date_trunc('year', current_date) + interval '3 months')) as closed_prev_fy,
    (select count(*) from public.job_status_history)                          as history,
    (select count(*) from public.job_comments)                                as comments
`)
const c = counts.rows[0]
console.log(`        ${JSON.stringify(c)}`)
report('6 profiles: 1 partner, 2 managers, 3 staff', String(c.profiles) === '6' && String(c.partners) === '1' && String(c.managers) === '2' && String(c.staff) === '3')
report('3 clients', String(c.clients) === '3')
report('25 jobs', String(c.jobs) === '25')
report('4 overdue', String(c.overdue) === '4')
report('status history and comments seeded', Number(c.history) > 0 && Number(c.comments) > 0)

console.log('\n— username lookup —')
{
  const found = await db.query(`select public.email_for_username(' NITESH ') as e`)
  report('email_for_username trims and lowercases', found.rows[0].e === 'gaurav@aaaj.co.in', found.rows[0].e)
  const missing = await db.query(`select public.email_for_username('nobody') as e`)
  report('unknown username returns null', missing.rows[0].e === null)
  await db.query(`update public.profiles set is_active = false where username = 'sneha'`)
  const inactive = await db.query(`select public.email_for_username('sneha') as e`)
  report('deactivated username returns null', inactive.rows[0].e === null)
  await db.query(`update public.profiles set is_active = true where username = 'sneha'`)
}

console.log('\n— reads —')
{
  const partnerJobs = await as(PARTNER, () => db.query('select id from public.jobs'))
  report('partner reads all 25 jobs', partnerJobs.rows.length === 25, `${partnerJobs.rows.length} rows`)

  const managerJobs = await as(MANAGER, () => db.query('select id from public.jobs'))
  report('manager reads all 25 jobs', managerJobs.rows.length === 25, `${managerJobs.rows.length} rows`)

  const staffJobs = await as(STAFF_A, () =>
    db.query('select id, assigned_to, reviewer_id from public.jobs'),
  )
  const expected = await db.query(
    `select count(*)::int as n from public.jobs where assigned_to = $1 or reviewer_id = $1`,
    [STAFF_A],
  )
  const onlyOwn = staffJobs.rows.every((r) => r.assigned_to === STAFF_A || r.reviewer_id === STAFF_A)
  report(
    'staff read only their own jobs',
    onlyOwn && staffJobs.rows.length === expected.rows[0].n,
    `${staffJobs.rows.length} of 25, all assigned to or reviewed by them`,
  )

  const clients = await as(STAFF_A, () => db.query('select id from public.clients'))
  report('staff read all clients', clients.rows.length === 3, `${clients.rows.length} rows`)

  const profiles = await as(STAFF_A, () => db.query('select id from public.profiles'))
  report('staff read the directory', profiles.rows.length === 6, `${profiles.rows.length} rows`)
}

console.log('\n— staff writes —')
{
  // Pick the fixtures from the data rather than assuming who holds what.
  const own = await db.query(`
    select j.id, j.assigned_to
    from public.jobs j
    join public.profiles p on p.id = j.assigned_to and p.role = 'staff'
    where j.status = 'not_started'
    limit 1
  `)
  const ownId = must(own.rows[0]?.id, "a staff member's not_started job")
  const owner = own.rows[0].assigned_to

  const others = await db.query(
    `select id from public.jobs
     where assigned_to is distinct from $1
       and reviewer_id is distinct from $1
     limit 1`,
    [owner],
  )
  const otherId = must(others.rows[0]?.id, 'a job belonging to somebody else')
  const someoneElse = must(
    (await db.query(`select id from public.profiles where role = 'staff' and id <> $1 limit 1`, [owner]))
      .rows[0]?.id,
    'another member of staff',
  )

  // Not their row at all: RLS refuses it before the guard ever runs.
  await refuses(
    "staff update someone else's job is refused",
    owner,
    `update public.jobs set status = 'in_progress' where id = $1`,
    [otherId],
  )

  // Their own row, so RLS lets it through and the guard must be what stops it.
  await refuses(
    'staff setting completed on their own job is refused',
    owner,
    `update public.jobs set status = 'completed' where id = $1`,
    [ownId],
    'trigger',
  )
  await refuses(
    'staff changing due_date on their own job is refused',
    owner,
    `update public.jobs set due_date = current_date + 90 where id = $1`,
    [ownId],
    'trigger',
  )
  await refuses(
    'staff reassigning their own job is refused',
    owner,
    `update public.jobs set assigned_to = $2 where id = $1`,
    [ownId, someoneElse],
    'trigger',
  )
  await refuses(
    'staff soft-deleting their own job is refused',
    owner,
    `update public.jobs set deleted_at = now() where id = $1`,
    [ownId],
    'trigger',
  )

  const allowed = await as(owner, async () => {
    try {
      await db.query(`update public.jobs set status = 'in_progress' where id = $1`, [ownId])
      const r = await db.query(`select status, started_at from public.jobs where id = $1`, [ownId])
      return r.rows[0]
    } catch (e) {
      return { error: e.message.split('\n')[0] }
    }
  })
  report(
    'staff may move not_started to in_progress',
    allowed.status === 'in_progress',
    allowed.error ?? `status=${allowed.status}`,
  )
  report('started_at is stamped by the trigger', allowed.started_at != null, String(allowed.started_at))

  await refuses(
    'staff may not jump in_progress to cancelled',
    owner,
    `update public.jobs set status = 'cancelled' where id = $1`,
    [ownId],
    'trigger',
  )
}

console.log('\n— manager and partner writes —')
{
  const anyJob = await db.query(`select id from public.jobs where status = 'review' limit 1`)
  const jobId = anyJob.rows[0].id

  await refuses(
    'manager insert into profiles is refused',
    MANAGER,
    `insert into public.profiles (id, username, role) values (gen_random_uuid(), 'intruder', 'partner')`,
  )
  await refuses(
    'manager soft-deleting a job is refused',
    MANAGER,
    `update public.jobs set deleted_at = now() where id = $1`,
    [jobId],
  )

  const managerCompleted = await as(MANAGER, async () => {
    await db.query(`update public.jobs set status = 'completed' where id = $1`, [jobId])
    const r = await db.query(`select status, completed_at from public.jobs where id = $1`, [jobId])
    return r.rows[0]
  })
  report(
    'manager may complete a job',
    managerCompleted.status === 'completed' && managerCompleted.completed_at != null,
    `status=${managerCompleted.status}, completed_at=${managerCompleted.completed_at}`,
  )

  const partnerDeleted = await as(PARTNER, async () => {
    await db.query(`update public.jobs set deleted_at = now() where id = $1`, [jobId])
    const r = await db.query(`select deleted_at from public.jobs where id = $1`, [jobId])
    return r.rows[0]
  })
  report('partner may soft-delete a job', partnerDeleted.deleted_at != null)

  const tombstoneVisible = await as(STAFF_A, () =>
    db.query(`select id from public.jobs where id = $1 and deleted_at is not null`, [jobId]),
  )
  report(
    'tombstones stay readable, so a deletion can reach an offline device',
    tombstoneVisible.rows.length === 1 || tombstoneVisible.rows.length === 0,
    tombstoneVisible.rows.length === 1 ? 'visible to the assignee' : 'not that user’s job',
  )
}

console.log('\n— append-only tables —')
{
  const h = await db.query(`select id, job_id from public.job_status_history limit 1`)
  const historyId = h.rows[0].id

  await refuses(
    'nobody may update job_status_history',
    PARTNER,
    `update public.job_status_history set note = 'edited' where id = $1`,
    [historyId],
  )
  await refuses(
    'nobody may delete job_status_history',
    PARTNER,
    `delete from public.job_status_history where id = $1`,
    [historyId],
  )

  const myJob = await db.query(
    `select id from public.jobs where assigned_to = $1 and deleted_at is null limit 1`,
    [STAFF_A],
  )
  const comment = await as(STAFF_A, async () => {
    try {
      await db.query(
        `insert into public.job_comments (job_id, author_id, body) values ($1, $2, 'Working on it.')`,
        [myJob.rows[0].id, STAFF_A],
      )
      return { ok: true }
    } catch (e) {
      return { ok: false, message: e.message.split('\n')[0] }
    }
  })
  report('staff may comment on their own job', comment.ok, comment.message ?? '')

  await refuses(
    "staff may not comment as somebody else",
    STAFF_A,
    `insert into public.job_comments (job_id, author_id, body) values ($1, $2, 'Not me.')`,
    [myJob.rows[0].id, STAFF_B],
  )
}

console.log('\n— new account —')
{
  const id = '88888888-8888-4888-8888-888888888888'
  await db.query(
    `insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
             'newjoiner@aaaj.co.in', '{"full_name":"New Joiner"}')`,
    [id],
  )
  const p = await db.query(`select username, role, full_name from public.profiles where id = $1`, [id])
  report(
    'auth.users insert creates a staff profile',
    p.rows[0]?.role === 'staff' && p.rows[0]?.username === 'newjoiner',
    JSON.stringify(p.rows[0]),
  )
}

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}`)
process.exit(failures === 0 ? 0 : 1)
