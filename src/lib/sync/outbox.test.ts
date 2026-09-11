import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db'
import type { Job } from '../types'
import { backoffMs, isPermanent } from './flush'
import { addComment, changeJobStatus, createJob, pendingCount, updateJob } from './outbox'

const JOB: Job = {
  id: 'job-1',
  client_id: 'client-1',
  title: 'GSTR-3B and GSTR-1 filing',
  description: '',
  category: 'gst_return',
  period_label: 'Aug-2026',
  assigned_to: 'staff-1',
  assigned_by: 'manager-1',
  reviewer_id: 'manager-1',
  status: 'not_started',
  priority: 'normal',
  due_date: '2026-09-20',
  started_at: null,
  completed_at: null,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
  deleted_at: null,
}

beforeEach(async () => {
  await Promise.all([db.jobs.clear(), db.job_status_history.clear(), db.job_comments.clear(), db.outbox.clear()])
})

describe('writing offline', () => {
  it('applies a status change locally and queues both writes', async () => {
    await db.jobs.put(JOB)
    await changeJobStatus('job-1', 'in_progress', 'staff-1')

    expect((await db.jobs.get('job-1'))?.status).toBe('in_progress')

    const history = await db.job_status_history.where('job_id').equals('job-1').toArray()
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({ from_status: 'not_started', to_status: 'in_progress' })

    const queue = await db.outbox.orderBy('seq').toArray()
    expect(queue.map((e) => `${e.op} ${e.table_name}`)).toEqual([
      'insert job_status_history',
      'update jobs',
    ])
  })

  it('keeps the queue in the order the writes happened', async () => {
    const id = await createJob({
      client_id: 'client-1',
      title: 'TDS return 26Q',
      description: '',
      category: 'tds',
      period_label: 'Q1 FY 2026-27',
      assigned_to: 'staff-1',
      assigned_by: 'manager-1',
      reviewer_id: null,
      status: 'not_started',
      priority: 'high',
      due_date: '2026-09-30',
    })
    await changeJobStatus(id, 'in_progress', 'staff-1')
    await changeJobStatus(id, 'review', 'staff-1')
    await addComment(id, 'staff-1', 'Filed, awaiting review.')

    const queue = await db.outbox.orderBy('seq').toArray()
    expect(queue.map((e) => `${e.op} ${e.table_name}`)).toEqual([
      'insert jobs',
      'insert job_status_history',
      'update jobs',
      'insert job_status_history',
      'update jobs',
      'insert job_comments',
    ])
    expect(await pendingCount()).toBe(6)
  })

  it('never sends back a column the server owns', async () => {
    await db.jobs.put(JOB)
    await updateJob('job-1', { priority: 'urgent', updated_at: 'nonsense', completed_at: 'nonsense' })

    const entry = (await db.outbox.orderBy('seq').toArray())[0]
    expect(entry.payload).toEqual({ priority: 'urgent' })
  })

  it('records a comment against the job before it has been sent', async () => {
    const id = await addComment('job-1', 'staff-1', 'Client has not sent the 2B yet.')
    expect((await db.job_comments.get(id))?.body).toBe('Client has not sent the 2B yet.')
    expect(await pendingCount()).toBe(1)
  })
})

describe('deciding whether to retry', () => {
  it('gives up on a refusal the server will repeat', () => {
    expect(isPermanent({ code: '42501', message: 'new row violates row-level security policy' })).toBe(true)
    expect(isPermanent({ code: '23503', message: 'foreign key violation' })).toBe(true)
    expect(isPermanent({ code: 'P0001', message: 'staff may change only the status of a job' })).toBe(true)
  })

  it('retries anything that looks like a bad connection', () => {
    expect(isPermanent({ message: 'Failed to fetch' })).toBe(false)
    expect(isPermanent(null)).toBe(false)
  })

  it('retries an expired token rather than binning the queue behind it', () => {
    // What every device sees for a second or two around a token refresh.
    expect(isPermanent({ code: 'PGRST301', message: 'Expected 3 parts in JWT; got 1' })).toBe(false)
    expect(isPermanent({ code: 'PGRST000', message: 'could not connect to the database' })).toBe(false)
  })

  it('still gives up on a request PostgREST will always refuse', () => {
    expect(isPermanent({ code: 'PGRST204', message: "column 'nonsense' does not exist" })).toBe(true)
  })

  it('backs off by doubling, and stops doubling at five minutes', () => {
    expect(backoffMs(1)).toBe(2_000)
    expect(backoffMs(4)).toBe(16_000)
    expect(backoffMs(20)).toBe(300_000)
  })
})
