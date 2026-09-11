import { daysBetween, parseDate } from '../../lib/dates'
import { CLOSED_STATUSES, type Job } from '../../lib/types'

/**
 * How My Work is stacked. Overdue first because that is the only group anyone
 * needs to be told about; the rest is just how far away the deadline is.
 */
export type DueGroup = 'overdue' | 'today' | 'this_week' | 'later' | 'no_date'

export const DUE_GROUP_ORDER: DueGroup[] = ['overdue', 'today', 'this_week', 'later', 'no_date']

export const DUE_GROUP_LABEL: Record<DueGroup, string> = {
  overdue: 'Overdue',
  today: 'Today',
  this_week: 'This week',
  later: 'Later',
  no_date: 'No date',
}

/** "This week" is the next seven days, not the calendar week — a Friday job is
 *  not suddenly "later" because Monday happens to fall in between. */
export function dueGroup(dueDate: string | null, today: Date): DueGroup {
  if (!dueDate) return 'no_date'
  const days = daysBetween(today, parseDate(dueDate))
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  if (days <= 7) return 'this_week'
  return 'later'
}

export const isOpen = (job: Pick<Job, 'status'>) => !CLOSED_STATUSES.includes(job.status)

export function isOverdue(job: Pick<Job, 'status' | 'due_date'>, today: Date): boolean {
  return isOpen(job) && dueGroup(job.due_date, today) === 'overdue'
}

/**
 * Group jobs for My Work, each group sorted by how soon it is due. Jobs without a
 * date sort last inside their group rather than first, which is what a null would
 * do if it were left to the default comparison.
 */
export function groupByDue(jobs: Job[], today: Date): Array<{ group: DueGroup; jobs: Job[] }> {
  const buckets = new Map<DueGroup, Job[]>()
  for (const job of jobs) {
    const group = dueGroup(job.due_date, today)
    const bucket = buckets.get(group)
    if (bucket) bucket.push(job)
    else buckets.set(group, [job])
  }

  return DUE_GROUP_ORDER.filter((group) => buckets.has(group)).map((group) => ({
    group,
    jobs: buckets.get(group)!.sort(byDueThenPriority),
  }))
}

const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2, low: 3 } as const

export function byDueThenPriority(a: Job, b: Job): number {
  if (a.due_date !== b.due_date) {
    if (!a.due_date) return 1
    if (!b.due_date) return -1
    return a.due_date < b.due_date ? -1 : 1
  }
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
}
