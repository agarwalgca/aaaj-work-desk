// Permission assertions against the real project, through the anon key, exactly as
// the browser sees it. scripts/verify-sql.mjs proves the same rules against a
// throwaway Postgres; this proves they survived the trip through PostgREST.
//
//   node --experimental-strip-types scripts/test-rls.ts
//
// Needs the migration and the seed applied. The partner cases are skipped unless
// PARTNER_USERNAME and PARTNER_PASSWORD are set, since that account's password is
// the firm's and does not belong in a file.

import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const env: Record<string, string> = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
    .map((line) => {
      const at = line.indexOf('=')
      return [line.slice(0, at).trim(), line.slice(at + 1).trim()]
    }),
)

const URL_ = env.VITE_SUPABASE_URL
const ANON = env.VITE_SUPABASE_ANON_KEY
const SEED_PASSWORD = 'WorkDesk#2026seed'

let failures = 0
let skipped = 0

function report(name: string, ok: boolean, detail = '') {
  if (!ok) failures += 1
  console.log(detail ? `${ok ? 'PASS' : 'FAIL'}  ${name}\n        ${detail}` : `${ok ? 'PASS' : 'FAIL'}  ${name}`)
}

function skip(name: string, why: string) {
  skipped += 1
  console.log(`SKIP  ${name}\n        ${why}`)
}

/** Sign in the way the login screen does: username first, then password. */
async function signIn(username: string, password: string): Promise<SupabaseClient | null> {
  const client = createClient(URL_, ANON, { auth: { persistSession: false } })
  const { data: email, error: lookupError } = await client.rpc('email_for_username', {
    p_username: username,
  })
  if (lookupError || !email) return null

  const { error } = await client.auth.signInWithPassword({ email, password })
  return error ? null : client
}

console.log(`\nProject: ${URL_}\n`)

const kavya = await signIn('kavya', SEED_PASSWORD)
const priya = await signIn('priya', SEED_PASSWORD)

if (!kavya || !priya) {
  console.log('FAIL  cannot sign in as the seeded accounts')
  console.log('        Apply supabase/migrations/0001_init.sql and supabase/seed.sql first.')
  process.exit(1)
}

const { data: me } = await kavya.auth.getUser()
const kavyaId = me.user!.id

console.log('— staff —')
{
  const { data: jobs, error } = await kavya.from('jobs').select('id, assigned_to, reviewer_id')
  const rows = jobs ?? []
  const onlyOwn = rows.every((j) => j.assigned_to === kavyaId || j.reviewer_id === kavyaId)
  report(
    'staff read only jobs they are assigned or reviewing',
    !error && rows.length > 0 && onlyOwn,
    error?.message ?? `${rows.length} rows, all their own`,
  )

  const { data: theirs } = await kavya
    .from('jobs')
    .select('id, status')
    .eq('assigned_to', kavyaId)
    .limit(1)
  const own = theirs?.[0]

  const { data: everyone } = await priya
    .from('jobs')
    .select('id')
    .not('assigned_to', 'is', null)
    .neq('assigned_to', kavyaId)
    .limit(1)
  const someoneElses = everyone?.[0]

  if (!own || !someoneElses) {
    skip('staff write assertions', 'seed did not provide the jobs these need')
  } else {
    const other = await kavya.from('jobs').update({ status: 'in_progress' }).eq('id', someoneElses.id).select()
    report(
      "staff update on another person's job is refused",
      other.error !== null || (other.data ?? []).length === 0,
      other.error?.message ?? 'no rows matched',
    )

    const complete = await kavya.from('jobs').update({ status: 'completed' }).eq('id', own.id).select()
    report(
      'staff setting completed on their own job is refused',
      complete.error !== null,
      complete.error?.message ?? 'the update went through',
    )

    const due = await kavya.from('jobs').update({ due_date: '2027-03-31' }).eq('id', own.id).select()
    report(
      'staff changing due_date on their own job is refused',
      due.error !== null,
      due.error?.message ?? 'the update went through',
    )
  }

  const clients = await kavya.from('clients').select('id')
  report('staff read all clients', !clients.error && (clients.data ?? []).length > 0,
    clients.error?.message ?? `${clients.data?.length} rows`)
}

console.log('\n— manager —')
{
  const jobs = await priya.from('jobs').select('id')
  report('manager reads every job', !jobs.error && (jobs.data ?? []).length >= 25,
    jobs.error?.message ?? `${jobs.data?.length} rows`)

  const insert = await priya
    .from('profiles')
    .insert({ id: crypto.randomUUID(), username: 'intruder', role: 'partner' })
    .select()
  report('manager insert into profiles is refused', insert.error !== null,
    insert.error?.message ?? 'the insert went through')
}

console.log('\n— partner —')
if (env.PARTNER_USERNAME && env.PARTNER_PASSWORD) {
  const partner = await signIn(env.PARTNER_USERNAME, env.PARTNER_PASSWORD)
  if (!partner) {
    report('partner signs in', false, 'username or password rejected')
  } else {
    const jobs = await partner.from('jobs').select('id')
    report('partner reads all 25 jobs', !jobs.error && (jobs.data ?? []).length === 25,
      jobs.error?.message ?? `${jobs.data?.length} rows`)
  }
} else {
  skip('partner reads all 25 jobs', 'set PARTNER_USERNAME and PARTNER_PASSWORD in .env to run this')
}

console.log(
  `\n${failures === 0 ? 'All checks passed' : `${failures} check(s) failed`}${skipped ? `, ${skipped} skipped` : ''}.`,
)
process.exit(failures === 0 ? 0 : 1)
