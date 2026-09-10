import { db } from '../db'
import type { Job, JobStatus, OutboxEntry, SyncedTable } from '../types'

/**
 * Every mutation writes to Dexie first and appends an outbox entry in the same
 * transaction. The screen re-renders from the local row immediately; the network
 * catches up later, or does not, and either way nothing the user typed is lost.
 *
 * Ids are generated here rather than by Postgres, so a push that times out and is
 * retried inserts the same row twice and the second one is a no-op.
 */

const newId = () => crypto.randomUUID()
const now = () => new Date().toISOString()

async function enqueue(
  table: SyncedTable,
  op: OutboxEntry['op'],
  rowId: string,
  payload: Record<string, unknown>,
) {
  const at = now()
  await db.outbox.add({
    id: newId(),
    table_name: table,
    op,
    row_id: rowId,
    payload,
    client_updated_at: at,
    attempts: 0,
    last_error: null,
    state: 'pending',
    next_attempt_at: at,
    queued_at: at,
  })
}

/** Fields the server owns. Sending them back would only invite a conflict. */
function scrub(patch: Record<string, unknown>) {
  const { id, created_at, updated_at, started_at, completed_at, ...rest } = patch
  void id
  void created_at
  void updated_at
  void started_at
  void completed_at
  return rest
}

export async function createJob(
  input: Omit<Job, 'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'started_at' | 'completed_at'>,
): Promise<string> {
  const id = newId()
  const at = now()
  const row: Job = {
    ...input,
    id,
    created_at: at,
    updated_at: at,
    deleted_at: null,
    started_at: null,
    completed_at: null,
  }

  await db.transaction('rw', [db.jobs, db.outbox], async () => {
    await db.jobs.put(row)
    await enqueue('jobs', 'insert', id, { ...scrub(row), id })
  })

  return id
}

/** Manager and partner edits: title, due date, priority, assignee, and so on. */
export async function updateJob(id: string, patch: Partial<Job>) {
  await db.transaction('rw', [db.jobs, db.outbox], async () => {
    const existing = await db.jobs.get(id)
    if (!existing) throw new Error(`No local copy of job ${id}`)
    await db.jobs.put({ ...existing, ...patch, updated_at: now() })
    await enqueue('jobs', 'update', id, scrub(patch))
  })
}

/**
 * A status change is two writes: the job's own column, and an append-only history
 * row. The history row is what makes two people moving the same job offline
 * survivable — both rows land, in order, instead of one silently overwriting the
 * other, and jobs.status settles on whichever moved last.
 */
export async function changeJobStatus(
  jobId: string,
  to: JobStatus,
  changedBy: string,
  note?: string,
) {
  const at = now()

  await db.transaction('rw', [db.jobs, db.job_status_history, db.outbox], async () => {
    const job = await db.jobs.get(jobId)
    if (!job) throw new Error(`No local copy of job ${jobId}`)

    const historyId = newId()
    await db.job_status_history.put({
      id: historyId,
      job_id: jobId,
      from_status: job.status,
      to_status: to,
      changed_by: changedBy,
      changed_at: at,
      note: note ?? null,
      created_at: at,
      updated_at: at,
      deleted_at: null,
    })
    await db.jobs.put({ ...job, status: to, updated_at: at })

    await enqueue('job_status_history', 'insert', historyId, {
      id: historyId,
      job_id: jobId,
      from_status: job.status,
      to_status: to,
      changed_by: changedBy,
      changed_at: at,
      note: note ?? null,
    })
    await enqueue('jobs', 'update', jobId, { status: to })
  })
}

export async function addComment(jobId: string, authorId: string, body: string): Promise<string> {
  const id = newId()
  const at = now()

  await db.transaction('rw', [db.job_comments, db.outbox], async () => {
    await db.job_comments.put({
      id,
      job_id: jobId,
      author_id: authorId,
      body,
      created_at: at,
      updated_at: at,
      deleted_at: null,
    })
    await enqueue('job_comments', 'insert', id, { id, job_id: jobId, author_id: authorId, body })
  })

  return id
}

/** True while anything this person did is still only on this device. */
export async function pendingCount() {
  return db.outbox.where('state').equals('pending').count()
}

export async function failedCount() {
  return db.outbox.where('state').equals('failed').count()
}

/** Has a specific row reached Supabase yet? Drives the per-action indicator. */
export async function isRowPending(rowId: string) {
  return (await db.outbox.where('row_id').equals(rowId).count()) > 0
}

/** Oldest thing still waiting, for the "queued since yesterday" warning. */
export async function oldestPendingAt(): Promise<string | null> {
  const oldest = await db.outbox.where('state').equals('pending').first()
  return oldest?.queued_at ?? null
}
