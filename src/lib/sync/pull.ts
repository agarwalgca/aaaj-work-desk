import type { Table } from 'dexie'
import { db } from '../db'
import { supabase } from '../supabase'
import { SYNCED_TABLES, type Cursor, type Job, type SyncedTable } from '../types'
import { cacheWindowStartISO, isInCacheWindow } from './window'

const PAGE = 500

/** PostgREST's code for "no such table in the schema cache". */
const MISSING_TABLE = 'PGRST205'

class MissingTable extends Error {
  table: SyncedTable

  constructor(table: SyncedTable) {
    super(`${table} is not on the server yet`)
    this.table = table
  }
}

/** The columns the pull itself reasons about; the rest travels through untouched. */
type SyncRow = { id: string; updated_at: string; deleted_at: string | null }

// Every synced table is keyed by a string id; the specific row type does not
// matter here, and naming it would mean five near-identical branches.
const storeFor = (table: SyncedTable) => db[table] as unknown as Table<SyncRow, string>

/** Only jobs are bounded; the others are small enough to hold whole. */
const jobWindowFilter = (now: Date) =>
  `status.not.in.(completed,cancelled),completed_at.gte.${cacheWindowStartISO(now)}`

/** Does this row belong on the device? A tombstone never does; a job also has a window. */
const belongsHere = (table: SyncedTable, row: SyncRow, now: Date) =>
  row.deleted_at === null && (table !== 'jobs' || isInCacheWindow(row as unknown as Job, now))

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
    // A table the database has not got yet. This happens whenever a deploy lands
    // before its migration is run, and it must not take the other tables down
    // with it — every screen reads from Dexie, so a partial sync is worth far
    // more than none. It heals itself the moment the migration is applied.
    if (error?.code === MISSING_TABLE) throw new MissingTable(table)

    // PostgrestError is a plain object, not an Error. Thrown as-is it reaches the
    // sync panel as "[object Object]", which tells nobody anything.
    if (error) throw new Error(`${table}: ${error.message}`)
    if (!data || data.length === 0) break

    const rows = data as unknown as SyncRow[]
    const keep = rows.filter((row) => belongsHere(table, row, now))
    const drop = rows.filter((row) => !belongsHere(table, row, now)).map((row) => row.id)

    const store = storeFor(table)
    await db.transaction('rw', store, async () => {
      if (keep.length) await store.bulkPut(keep)
      if (drop.length) await store.bulkDelete(drop)
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
 * Tables the reconcile sweep covers. `optional` marks the ones that arrived in
 * later migrations: a database without them yet answers "no such table", and
 * that is skipped rather than fatal — sweeping on it would delete every local
 * row for want of a server answer.
 */
const SWEPT: Array<{ table: SyncedTable; optional: boolean }> = [
  { table: 'jobs', optional: false },
  { table: 'clients', optional: false },
  { table: 'profiles', optional: false },
  { table: 'job_templates', optional: true },
  { table: 'job_categories', optional: true },
]

/**
 * Delete local rows the server no longer offers.
 *
 * An incremental pull can only ever add or update. It cannot tell a device that a
 * row has left its view — and rows leave constantly. A manager reassigns a job away
 * from a member of staff and it simply stops matching their filtered read; nothing
 * is deleted, no tombstone is written, and without this the row would sit on their
 * phone for good. A manager demoted to staff stops seeing templates the same way.
 * One id-only query per table settles it: whatever the server does not list, this
 * device should not be holding.
 */
async function reconcile(now: Date) {
  const answers = await Promise.all(
    SWEPT.map(({ table }) => {
      const query = supabase.from(table).select('id').is('deleted_at', null)
      return table === 'jobs' ? query.or(jobWindowFilter(now)) : query
    }),
  )

  const visible = new Map<SyncedTable, Set<string>>()
  SWEPT.forEach(({ table, optional }, i) => {
    const { data, error } = answers[i]
    if (error) {
      if (optional && error.code === MISSING_TABLE) return
      throw new Error(`reconcile: ${error.message}`)
    }
    visible.set(table, new Set((data ?? []).map((row) => row.id)))
  })

  await db.transaction(
    'rw',
    [db.jobs, db.clients, db.profiles, db.job_templates, db.job_categories, db.job_status_history, db.job_comments],
    async () => {
      for (const [table, ids] of visible) {
        const store = storeFor(table)
        const stale = (await store.toCollection().primaryKeys()).filter((id) => !ids.has(id))
        if (stale.length === 0) continue

        await store.bulkDelete(stale)
        // History and comments belong to their job and go with it.
        if (table === 'jobs') {
          await db.job_status_history.where('job_id').anyOf(stale).delete()
          await db.job_comments.where('job_id').anyOf(stale).delete()
        }
      }
    },
  )
}

type PullResult = { pulled: number; missing: SyncedTable[] }

/** Everything, in dependency order, then the reconcile sweep. */
export async function pullAll(now = new Date()): Promise<PullResult> {
  let pulled = 0
  const missing: SyncedTable[] = []

  for (const table of SYNCED_TABLES) {
    try {
      pulled += await pullTable(table, now)
    } catch (cause) {
      if (cause instanceof MissingTable) missing.push(cause.table)
      else throw cause
    }
  }

  await reconcile(now)
  return { pulled, missing }
}
