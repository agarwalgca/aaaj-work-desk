// The verification cases that need two real people and a real database: the cache
// window, a reassignment leaving somebody's view, and two devices editing the same
// job while offline.
//
//   node scripts/verify-live.mjs
//
// It mutates seed data and puts back what it moved. Do not point it at real work.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)

const SEED_PASSWORD = env.SEED_PASSWORD ?? ''
let failures = 0

function report(name, ok, detail = '') {
  if (!ok) failures += 1
  console.log(detail ? `${ok ? 'PASS' : 'FAIL'}  ${name}\n        ${detail}` : `${ok ? 'PASS' : 'FAIL'}  ${name}`)
}

async function signIn(username) {
  const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  })
  const { data: email } = await client.rpc('email_for_username', { p_username: username })
  const { error } = await client.auth.signInWithPassword({ email, password: SEED_PASSWORD })
  if (error) throw new Error(`${username}: ${error.message}`)
  const { data } = await client.auth.getUser()
  return { client, id: data.user.id }
}

/** 1 April of the previous financial year — what the pruner keeps back to. */
function cacheWindowStartISO(on = new Date()) {
  const fyStart = on.getMonth() >= 3 ? on.getFullYear() : on.getFullYear() - 1
  return `${fyStart - 1}-04-01`
}

const priya = await signIn('priya') // manager
const kavya = await signIn('kavya') // staff
const rohit = await signIn('rohit') // staff

console.log(`\nProject: ${env.VITE_SUPABASE_URL}\n`)

// ---------------------------------------------------------------------------
console.log('— cache window —')
{
  const windowStart = cacheWindowStartISO()
  const filter = `status.not.in.(completed,cancelled),completed_at.gte.${windowStart}`

  const { data: inWindow, error } = await priya.client
    .from('jobs')
    .select('id, title, status, completed_at, created_at')
    .is('deleted_at', null)
    .or(filter)

  if (error) {
    report('the pull filter is accepted by PostgREST', false, error.message)
  } else {
    report('the pull filter is accepted by PostgREST', true, `window starts ${windowStart}`)

    const { data: all } = await priya.client
      .from('jobs')
      .select('id, title, status, completed_at, created_at')
      .is('deleted_at', null)

    const kept = new Set(inWindow.map((j) => j.id))
    const oldOpen = all.find((j) => j.title === 'Inter-company reconciliation')
    const oldClosed = all.find((j) => j.title === 'Assessment support u/s 143(2)')

    report(
      'an open job created two years ago is still cached',
      oldOpen ? kept.has(oldOpen.id) : false,
      oldOpen ? `${oldOpen.status}, created ${oldOpen.created_at.slice(0, 10)}` : 'fixture missing',
    )
    report(
      'a job completed three financial years ago is not',
      oldClosed ? !kept.has(oldClosed.id) : false,
      oldClosed ? `completed ${oldClosed.completed_at?.slice(0, 10)}` : 'fixture missing',
    )
    console.log(`        ${inWindow.length} of ${all.length} jobs fall inside the window`)
  }
}

// ---------------------------------------------------------------------------
console.log('\n— a job reassigned away —')
{
  const { data: before } = await kavya.client.from('jobs').select('id, title, assigned_to, reviewer_id')
  const moving = before.find((j) => j.assigned_to === kavya.id && j.reviewer_id !== kavya.id)

  if (!moving) {
    report('reassignment', false, 'no job assigned to Kavya without her as reviewer')
  } else {
    const { error } = await priya.client
      .from('jobs')
      .update({ assigned_to: rohit.id })
      .eq('id', moving.id)
    report('a manager may reassign', !error, error?.message ?? `"${moving.title}" moved to Rohit`)

    const { data: after } = await kavya.client.from('jobs').select('id')
    const stillVisible = after.some((j) => j.id === moving.id)
    report(
      'it leaves the staff member’s filtered read entirely',
      !stillVisible,
      `Kavya saw ${before.length} jobs, now ${after.length}`,
    )

    // The reconcile sweep is exactly this query: whatever is not listed is deleted
    // locally. Nothing is tombstoned, so an incremental pull alone would never know.
    const { data: sweep } = await kavya.client.from('jobs').select('id').is('deleted_at', null)
    report(
      'the reconcile sweep would drop it from her device',
      !sweep.some((j) => j.id === moving.id),
      `sweep lists ${sweep.length} ids for Kavya`,
    )

    await priya.client.from('jobs').update({ assigned_to: kavya.id }).eq('id', moving.id)
    console.log('        (put back)')
  }
}

// ---------------------------------------------------------------------------
console.log('\n— two devices, same job, both offline —')
{
  const { data: jobs } = await priya.client
    .from('jobs')
    .select('id, title, status')
    .eq('status', 'in_progress')
    .limit(1)
  const job = jobs?.[0]

  if (!job) {
    report('conflict path', false, 'no in_progress job to work with')
  } else {
    const deviceA = new Date(Date.now() - 60_000).toISOString() // queued a minute ago
    const deviceB = new Date().toISOString() // queued just now

    const historyA = crypto.randomUUID()
    const historyB = crypto.randomUUID()

    // Both devices append their own history row, client-generated ids, no conflict.
    const pushA = await priya.client.from('job_status_history').upsert(
      { id: historyA, job_id: job.id, from_status: job.status, to_status: 'on_hold', changed_by: priya.id, changed_at: deviceA },
      { onConflict: 'id', ignoreDuplicates: true },
    )
    const pushB = await priya.client.from('job_status_history').upsert(
      { id: historyB, job_id: job.id, from_status: job.status, to_status: 'review', changed_by: priya.id, changed_at: deviceB },
      { onConflict: 'id', ignoreDuplicates: true },
    )
    report('both history rows survive', !pushA.error && !pushB.error, pushA.error?.message ?? pushB.error?.message ?? '')

    // Then each pushes the scalar status. Last write wins on the client stamp.
    await priya.client.from('jobs').update({ status: 'on_hold' }).eq('id', job.id).lt('updated_at', deviceA)
    await priya.client.from('jobs').update({ status: 'review' }).eq('id', job.id).lt('updated_at', deviceB)

    const { data: settled } = await priya.client.from('jobs').select('status').eq('id', job.id).single()
    const { data: trail } = await priya.client
      .from('job_status_history')
      .select('to_status, changed_at')
      .eq('job_id', job.id)
      .order('changed_at')

    const bothPresent = trail.some((h) => h.to_status === 'on_hold') && trail.some((h) => h.to_status === 'review')
    report('the trail keeps both moves in order', bothPresent, trail.map((h) => h.to_status).join(' -> '))
    report(
      'jobs.status reflects the later of the two',
      settled.status === 'review',
      `status is "${settled.status}", later device said "review"`,
    )

    await priya.client.from('jobs').update({ status: job.status }).eq('id', job.id)
    await priya.client.from('job_status_history').delete().in('id', [historyA, historyB])
    console.log('        (put back)')
  }
}

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}`)
process.exit(failures === 0 ? 0 : 1)
