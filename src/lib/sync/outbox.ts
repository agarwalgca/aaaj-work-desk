import { dueDateFor } from '../../features/recurring/periods'
import { db } from '../db'
import type {
  Category,
  Client,
  Job,
  JobStatus,
  JobTemplate,
  OutboxEntry,
  Profile,
  SyncedTable,
} from '../types'

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
  // approved_by and approved_at belong to the jobs_guard trigger. A client sending
  // them would be ignored at best, and is exactly the forgery the trigger refuses.
  const { id, created_at, updated_at, started_at, completed_at, approved_by, approved_at, ...rest } = patch
  void id
  void created_at
  void updated_at
  void started_at
  void completed_at
  void approved_by
  void approved_at
  return rest
}

type NewJob = Omit<
  Job,
  | 'id'
  | 'created_at'
  | 'updated_at'
  | 'deleted_at'
  | 'started_at'
  | 'completed_at'
  | 'template_id'
  | 'period_key'
  | 'approved_by'
  | 'approved_at'
> &
  // Only the generator fills these in; every other caller is making a one-off job.
  Partial<Pick<Job, 'template_id' | 'period_key'>>

export async function createJob(input: NewJob): Promise<string> {
  const id = newId()
  const at = now()
  const row: Job = {
    ...input,
    template_id: input.template_id ?? null,
    period_key: input.period_key ?? null,
    approved_by: null,
    approved_at: null,
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

// ---------------------------------------------------------------------------
// Clients and people. Same pattern: local first, queue second. Whether the caller
// is actually allowed to do any of this is Postgres's decision, not this file's —
// a refusal comes back through the outbox as a failed entry.
// ---------------------------------------------------------------------------

export async function createClient(
  input: Pick<Client, 'name' | 'code' | 'gstin' | 'pan' | 'is_active'> & Partial<Pick<Client, 'categories'>>,
): Promise<string> {
  const id = newId()
  const at = now()
  const row: Client = {
    ...input,
    categories: input.categories ?? [],
    id,
    created_at: at,
    updated_at: at,
    deleted_at: null,
  }

  await db.transaction('rw', [db.clients, db.outbox], async () => {
    await db.clients.put(row)
    await enqueue('clients', 'insert', id, { ...scrub(row), id })
  })

  return id
}

export async function updateClient(id: string, patch: Partial<Client>) {
  await db.transaction('rw', [db.clients, db.outbox], async () => {
    const existing = await db.clients.get(id)
    if (!existing) throw new Error(`No local copy of client ${id}`)
    await db.clients.put({ ...existing, ...patch, updated_at: now() })
    await enqueue('clients', 'update', id, scrub(patch))
  })
}

export async function updateProfile(id: string, patch: Partial<Profile>) {
  await db.transaction('rw', [db.profiles, db.outbox], async () => {
    const existing = await db.profiles.get(id)
    if (!existing) throw new Error(`No local copy of profile ${id}`)
    await db.profiles.put({ ...existing, ...patch, updated_at: now() })
    await enqueue('profiles', 'update', id, scrub(patch))
  })
}

// ---------------------------------------------------------------------------
// Recurring work
// ---------------------------------------------------------------------------

export async function createJobTemplate(
  input: Omit<JobTemplate, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>,
): Promise<string> {
  const id = newId()
  const at = now()
  const row: JobTemplate = { ...input, id, created_at: at, updated_at: at, deleted_at: null }

  await db.transaction('rw', [db.job_templates, db.outbox], async () => {
    await db.job_templates.put(row)
    await enqueue('job_templates', 'insert', id, { ...scrub(row), id })
  })

  return id
}

export async function updateJobTemplate(id: string, patch: Partial<JobTemplate>) {
  await db.transaction('rw', [db.job_templates, db.outbox], async () => {
    const existing = await db.job_templates.get(id)
    if (!existing) throw new Error(`No local copy of template ${id}`)
    await db.job_templates.put({ ...existing, ...patch, updated_at: now() })
    await enqueue('job_templates', 'update', id, scrub(patch))
  })
}

export type Generated = { created: number; skipped: number }

/**
 * Turn templates into jobs for one period.
 *
 * The skip is the important part. Pressing Generate twice for August must not
 * produce two sets of August returns, and somebody will press it twice — so this
 * checks what already exists for each template and period before writing. A
 * unique index in Postgres catches the case this cannot see: two managers
 * generating the same period at the same moment from different devices.
 */
export async function generateJobsForPeriod(
  templates: JobTemplate[],
  period: { key: string; label: string; end: Date },
  createdBy: string,
  /** One date for the whole batch. Null means use each template's own rule. */
  dueDateOverride: string | null,
): Promise<Generated> {
  let created = 0
  let skipped = 0

  for (const template of templates) {
    const already = await db.jobs
      .where('[template_id+period_key]')
      .equals([template.id, period.key])
      .count()

    if (already > 0) {
      skipped += 1
      continue
    }

    await createJob({
      client_id: template.client_id,
      title: template.title,
      description: template.description,
      category: template.category,
      period_label: period.label,
      assigned_to: template.assigned_to,
      assigned_by: createdBy,
      reviewer_id: template.reviewer_id,
      status: 'not_started',
      priority: template.priority,
      due_date:
        dueDateOverride ??
        (template.due_day === null
          ? null
          : dueDateFor(period.end, template.due_day, template.due_months_after)),
      template_id: template.id,
      period_key: period.key,
    })
    created += 1
  }

  return { created, skipped }
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

/**
 * A stable key from a name: "Professional Tax" becomes "professional_tax".
 *
 * Made once and never changed, because jobs and clients refer to a category by it.
 * Renaming the category changes only its name, so nothing that points at it has
 * to be rewritten.
 */
export function slugFor(name: string, taken: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 36) || 'category'

  let slug = base.length >= 2 ? base : `${base}_x`
  let n = 2
  while (taken.has(slug)) slug = `${base}_${n++}`
  return slug
}

export async function createCategory(
  input: Pick<Category, 'name' | 'default_period'>,
): Promise<string> {
  const id = newId()
  const at = now()

  await db.transaction('rw', [db.job_categories, db.outbox], async () => {
    const existing = await db.job_categories.toArray()
    const slug = slugFor(input.name, new Set(existing.map((c) => c.slug)))
    const sort_order = Math.max(0, ...existing.map((c) => c.sort_order)) + 10

    const row: Category = {
      id,
      slug,
      name: input.name.trim(),
      default_period: input.default_period,
      sort_order,
      is_active: true,
      created_at: at,
      updated_at: at,
      deleted_at: null,
    }
    await db.job_categories.put(row)
    await enqueue('job_categories', 'insert', id, { ...scrub(row), id })
  })

  return id
}

export async function updateCategory(id: string, patch: Partial<Pick<Category, 'name' | 'default_period' | 'is_active'>>) {
  await db.transaction('rw', [db.job_categories, db.outbox], async () => {
    const existing = await db.job_categories.get(id)
    if (!existing) throw new Error(`No local copy of category ${id}`)
    await db.job_categories.put({ ...existing, ...patch, updated_at: now() })
    // The slug is deliberately not patchable: everything refers to it.
    await enqueue('job_categories', 'update', id, scrub(patch))
  })
}
