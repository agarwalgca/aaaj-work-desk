/**
 * Row shapes. Deliberately identical in Postgres and in Dexie — snake_case, same
 * column names, no mapping layer. A row that came from Supabase and a row read
 * back out of IndexedDB are the same object.
 */

export type UserRole = 'partner' | 'manager' | 'staff'

export type JobCategory =
  | 'gst_return'
  | 'gst_notice'
  | 'income_tax'
  | 'tds'
  | 'audit'
  | 'roc'
  | 'accounting'
  | 'certification'
  | 'other'

export type JobStatus =
  | 'not_started'
  | 'in_progress'
  | 'on_hold'
  | 'review'
  | 'rework'
  | 'completed'
  | 'cancelled'

export type JobPriority = 'low' | 'normal' | 'high' | 'urgent'

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
export const SYNCED_TABLES = ['profiles', 'clients', 'jobs', 'job_status_history', 'job_comments'] as const
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
 * One row per synced table, holding where its incremental pull got to. The id is
 * part of the cursor, not decoration: a bulk insert gives every row the same
 * `now()`, so a timestamp alone cannot say where a page ended.
 */
export type Cursor = {
  table_name: SyncedTable
  last_pulled_at: string | null
  last_id: string | null
}
