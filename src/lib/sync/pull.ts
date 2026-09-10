import type { Table } from 'dexie'
import { db } from '../db'
import { supabase } from '../supabase'
import { SYNCED_TABLES, type Cursor, type Job, type SyncedTable } from '../types'
import { cacheWindowStartISO, isInCacheWindow } from './window'

const PAGE = 500

/** The columns the pull itself reasons about; the rest travels through untouched. */
type SyncRow = { id: string; updated_at: string; deleted_at: string | null }

/** Only jobs are bounded; the others are small enough to hold whole. */
const jobWindowFilter = (now: Date) =>
  `status.not.in.(completed,cancelled),completed_at.gte.${cacheWindowStartISO(now)}`

async function readCursor(table: SyncedTable): Promise<Cursor> {
  return (
    (await db.cursors.get(table)) ?? { table_name: table, last_pulled_at: null, last_id: null }
  )
}

/**
 * Pull one table forward from its cursor.
 *
 * The first pull is bounded server-side by the cache window; later pulls are not.
 * That is deliberate rather than lazy: PostgREST needs the window and the cursor
 * as two separate or-groups, and an incremental delta is small enough to filter
 * once it lands. Anything outside the window is dropped locally a few lines below.
 */
async function pullTable(table: SyncedTable, now: Date): Promise<number> {
  const cursor = await readCursor(table)
  let { last_pulled_at: since, last_id: sinceId } = cursor
  let pulled = 0

  for (;;) {
    let query = supabase.from(table).select('*').order('updated_at').order('id').limit(PAGE)

    if (since) {
      // Everything strictly after (updated_at, id), so a page boundary inside a
      // group of rows sharing one timestamp does not swallow the rest of them.
      query = query.or(`updated_at.gt.${since},and(updated_at.eq.${since},id.gt.${sinceId})`)
    } else if (table === 'jobs') {
      query = query.or(jobWindowFilter(now))
    }

    const { data, error } = await query
    // PostgrestError is a plain object, not an Error. Thrown as-is it reaches the
    // sync panel as "[object Object]", which tells nobody anything.
    if (error) throw new Error(`${table}: ${error.message}`)
    if (!data || data.length === 0) break

    const rows = data as unknown as SyncRow[]

    const live = rows.filter((row) => row.deleted_at === null)
    const gone = rows.filter((row) => row.deleted_at !== null).map((row) => row.id)

    const keep =
      table === 'jobs'
        ? live.filter((row) => isInCacheWindow(row as unknown as Job, now))
        : live
    const aged =
      table === 'jobs'
        ? live.filter((row) => !isInCacheWindow(row as unknown as Job, now)).map((row) => row.id)
        : []

    // Every synced table is keyed by a string id; the specific row type does not
    // matter here, and naming it would mean five near-identical branches.
    const store = db[table] as unknown as Table<SyncRow, string>
    await db.transaction('rw', store, async () => {
      if (keep.length) await store.bulkPut(keep)
      if (gone.length || aged.length) await store.bulkDelete([...gone, ...aged])
    })

    pulled += rows.length
    since = rows[rows.length - 1].updated_at
    sinceId = rows[rows.length - 1].id
    await db.cursors.put({ table_name: table, last_pulled_at: since, last_id: sinceId })

    if (rows.length < PAGE) break
  }

  return pulled
}

/**
 * Delete local rows the server no longer offers.
 *
 * An incremental pull can only ever add or update. It cannot tell a device that a
 * row has left its view — and rows leave constantly. A manager reassigns a job away
 * from a member of staff and it simply stops matching their filtered read; nothing
 * is deleted, no tombstone is written, and without this the row would sit on their
 * phone for good. One id-only query per table settles it: whatever the server does
 * not list, this device should not be holding.
 */
async function reconcile(now: Date) {
  const [jobIds, clientIds, profileIds] = await Promise.all([
    supabase.from('jobs').select('id').is('deleted_at', null).or(jobWindowFilter(now)),
    supabase.from('clients').select('id').is('deleted_at', null),
    supabase.from('profiles').select('id').is('deleted_at', null),
  ])

  for (const result of [jobIds, clientIds, profileIds]) {
    if (result.error) throw new Error(`reconcile: ${result.error.message}`)
  }

  const visibleJobs = new Set((jobIds.data ?? []).map((r) => r.id))
  const visibleClients = new Set((clientIds.data ?? []).map((r) => r.id))
  const visibleProfiles = new Set((profileIds.data ?? []).map((r) => r.id))

  await db.transaction(
    'rw',
    [db.jobs, db.clients, db.profiles, db.job_status_history, db.job_comments],
    async () => {
      const staleJobs = (await db.jobs.toArray())
        .filter((j) => !visibleJobs.has(j.id))
        .map((j) => j.id)
      if (staleJobs.length) {
        await db.jobs.bulkDelete(staleJobs)
        // History and comments belong to their job and go with it.
        await db.job_status_history.where('job_id').anyOf(staleJobs).delete()
        await db.job_comments.where('job_id').anyOf(staleJobs).delete()
      }

      const staleClients = (await db.clients.toArray())
        .filter((c) => !visibleClients.has(c.id))
        .map((c) => c.id)
      if (staleClients.length) await db.clients.bulkDelete(staleClients)

      const staleProfiles = (await db.profiles.toArray())
        .filter((p) => !visibleProfiles.has(p.id))
        .map((p) => p.id)
      if (staleProfiles.length) await db.profiles.bulkDelete(staleProfiles)
    },
  )
}

/** Everything, in dependency order, then the reconcile sweep. */
export async function pullAll(now = new Date()): Promise<number> {
  let total = 0
  for (const table of SYNCED_TABLES) {
    total += await pullTable(table, now)
  }
  await reconcile(now)
  return total
}
