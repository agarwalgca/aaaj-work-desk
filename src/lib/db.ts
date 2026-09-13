import Dexie, { type EntityTable } from 'dexie'
import type {
  Category,
  Client,
  Cursor,
  Draft,
  Job,
  JobTemplate,
  JobComment,
  JobStatusHistory,
  OutboxEntry,
  Profile,
} from './types'

/**
 * The local store. Every screen reads from here, online included — the UI never
 * waits on the network to paint. The failure that actually happens at a client's
 * premises is not a clean offline but two bars of signal where requests hang, and
 * a network-first read is at its worst on exactly that connection.
 */
class WorkDeskDB extends Dexie {
  profiles!: EntityTable<Profile, 'id'>
  clients!: EntityTable<Client, 'id'>
  job_categories!: EntityTable<Category, 'id'>
  jobs!: EntityTable<Job, 'id'>
  job_templates!: EntityTable<JobTemplate, 'id'>
  job_status_history!: EntityTable<JobStatusHistory, 'id'>
  job_comments!: EntityTable<JobComment, 'id'>
  outbox!: EntityTable<OutboxEntry, 'seq'>
  cursors!: EntityTable<Cursor, 'table_name'>
  drafts!: EntityTable<Draft, 'key'>

  constructor() {
    super('aaaj-work-desk')

    this.version(1).stores({
      profiles: 'id, username, role, is_active, updated_at',
      clients: 'id, code, is_active, updated_at',
      jobs: 'id, assigned_to, reviewer_id, client_id, status, due_date, completed_at, updated_at, [assigned_to+status]',
      job_status_history: 'id, job_id, changed_at, updated_at, [job_id+changed_at]',
      job_comments: 'id, job_id, created_at, updated_at',
      outbox: '++seq, id, state, table_name, row_id, next_attempt_at',
      cursors: 'table_name',
    })

    // Free-text that has been typed but not sent. Local only, never pushed.
    this.version(2).stores({ drafts: 'key, updated_at' })

    // Categories the firm manages, and which of them each client has. `*categories`
    // is a multi-entry index, so "every client with TDS work" is a lookup rather
    // than a scan of every client.
    this.version(4).stores({
      job_categories: 'id, slug, is_active, updated_at',
      clients: 'id, code, is_active, updated_at, *categories',
    })

    // Recurring work. Only partners and managers ever sync these.
    this.version(3).stores({
      job_templates: 'id, client_id, frequency, is_active, updated_at',
      jobs: 'id, assigned_to, reviewer_id, client_id, status, due_date, completed_at, updated_at, template_id, [assigned_to+status], [template_id+period_key]',
    })
  }
}

export const db = new WorkDeskDB()

/**
 * Everything this device holds, dropped. Used on sign-out: the next person to use
 * the phone must not find the last one's client list sitting in it.
 */
export async function clearLocalData() {
  await db.transaction(
    'rw',
    [
      db.profiles,
      db.clients,
      db.jobs,
      db.job_templates,
      db.job_categories,
      db.job_status_history,
      db.job_comments,
      db.outbox,
      db.cursors,
      db.drafts,
    ],
    async () => {
      await Promise.all([
        db.profiles.clear(),
        db.clients.clear(),
        db.jobs.clear(),
        db.job_templates.clear(),
        db.job_categories.clear(),
        db.job_status_history.clear(),
        db.job_comments.clear(),
        db.outbox.clear(),
        db.cursors.clear(),
        db.drafts.clear(),
      ])
    },
  )
}

/** Row counts plus whatever the browser will admit about its storage budget. */
export async function cacheStats() {
  const [profiles, clients, jobs, history, comments, pending, failed] = await Promise.all([
    db.profiles.count(),
    db.clients.count(),
    db.jobs.count(),
    db.job_status_history.count(),
    db.job_comments.count(),
    db.outbox.where('state').equals('pending').count(),
    db.outbox.where('state').equals('failed').count(),
  ])

  const estimate = await navigator.storage?.estimate?.().catch(() => undefined)

  return {
    rows: { profiles, clients, jobs, history, comments },
    total: profiles + clients + jobs + history + comments,
    outbox: { pending, failed },
    usage: estimate?.usage ?? null,
    quota: estimate?.quota ?? null,
  }
}
