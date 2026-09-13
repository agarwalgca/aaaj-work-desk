/**
 * Row shapes. Deliberately identical in Postgres and in Dexie — snake_case, same
 * column names, no mapping layer. A row that came from Supabase and a row read
 * back out of IndexedDB are the same object.
 */

export type UserRole = 'partner' | 'manager' | 'staff'

/**
 * A category's slug. It was a fixed union when categories were a Postgres enum;
 * the firm now creates its own, so it is a string that names a row in
 * job_categories. The slug never changes once made — the name is what gets edited.
 */
export type JobCategory = string

export type JobStatus =
  | 'not_started'
  | 'in_progress'
  | 'on_hold'
  | 'review'
  | 'rework'
  | 'completed'
  | 'cancelled'

export type JobPriority = 'low' | 'normal' | 'high' | 'urgent'

export type Frequency = 'monthly' | 'quarterly' | 'half_yearly' | 'annual'

/** A job in one of these is finished; everything else is the working set. */
export const CLOSED_STATUSES: JobStatus[] = ['completed', 'cancelled']

/**
 * The moves a member of staff may make, mirroring public.jobs_guard(). Postgres is
 * the authority; this copy exists so the UI can grey out a control instead of
 * offering a move the server will reject.
 */
export const STAFF_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  not_started: ['in_progress'],
  in_progress: ['on_hold', 'review'],
  on_hold: ['in_progress', 'review'],
  review: [],
  rework: ['in_progress'],
  completed: [],
  cancelled: [],
}

type Row = {
  id: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type Profile = Row & {
  username: string
  full_name: string
  initials: string
  role: UserRole
  is_active: boolean
  reports_to: string | null
}

export type Client = Row & {
  name: string
  code: string
  gstin: string | null
  pan: string | null
  is_active: boolean
  /** Slugs of the kinds of work this client has. Several, usually. */
  categories: JobCategory[]
}

export type Category = Row & {
  slug: JobCategory
  name: string
  /** What a job of this kind is usually measured in. The firm sets it. */
  default_period: Frequency | 'custom'
  sort_order: number
  is_active: boolean
}

export type Job = Row & {
  client_id: string
  title: string
  description: string
  category: JobCategory
  period_label: string
  assigned_to: string | null
  assigned_by: string | null
  reviewer_id: string | null
  status: JobStatus
  priority: JobPriority
  due_date: string | null
  started_at: string | null
  completed_at: string | null
  /** Set when the job was generated from a recurring template. */
  template_id: string | null
  /** Which period of that template this job covers, e.g. "M-2026-08". */
  period_key: string | null
  /** Set by the database when a manager or partner approves it from review. */
  approved_by: string | null
  approved_at: string | null
}

/**
 * A standing arrangement: this client has this job every month, and this person
 * does it. Generates nothing by itself — a manager presses Generate.
 */
export type JobTemplate = Row & {
  client_id: string
  title: string
  description: string
  category: JobCategory
  frequency: Frequency
  assigned_to: string | null
  reviewer_id: string | null
  priority: JobPriority
  is_active: boolean
  /** The firm's own rule, not a statutory one. Null means no automatic date. */
  due_day: number | null
  /** How many months after the period ends that day falls. 1 = the month after. */
  due_months_after: number
}

export type JobStatusHistory = Row & {
  job_id: string
  from_status: JobStatus | null
  to_status: JobStatus
  changed_by: string | null
  changed_at: string
  note: string | null
}

export type JobComment = Row & {
  job_id: string
  author_id: string | null
  body: string
}

/** Tables that sync. Order matters on pull: a job needs its client to exist first. */
export const SYNCED_TABLES = [
  'profiles',
  'job_categories',
  'clients',
  'job_templates',
  'jobs',
  'job_status_history',
  'job_comments',
] as const
export type SyncedTable = (typeof SYNCED_TABLES)[number]

export type OutboxEntry = {
  /** Auto-incremented by Dexie. The flusher drains in this order, and only this order. */
  seq?: number
  id: string
  table_name: SyncedTable
  op: 'insert' | 'update'
  row_id: string
  payload: Record<string, unknown>
  client_updated_at: string
  attempts: number
  last_error: string | null
  /** 'failed' means the server refused it for a reason retrying will not fix. */
  state: 'pending' | 'failed'
  next_attempt_at: string
  queued_at: string
}

/**
 * An unsent piece of writing, kept on this device only. Never synced: a half-typed
 * comment is nobody else's business until it is posted.
 */
export type Draft = {
  key: string
  body: string
  updated_at: string
}

/**
 * One row per synced table, holding where its incremental pull got to. The id is
 * part of the cursor, not decoration: a bulk insert gives every row the same
 * `now()`, so a timestamp alone cannot say where a page ended.
 */
export type Cursor = {
  table_name: SyncedTable
  last_pulled_at: string | null
  last_id: string | null
}
