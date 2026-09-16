import { financialYearOf } from '../../features/recurring/periods'
import { CLOSED_STATUSES, type Job } from '../types'

/**
 * The cache window, bounded by the state of a job rather than its age.
 *
 * Open jobs are cached however old they are: an open job is the working set by
 * definition. Closed jobs are cached only if they finished inside the current or
 * previous Indian financial year, because how this firm looks backwards is
 * FY-shaped, not a rolling number of months.
 *
 * Computed at pull time, never at build time. On 1 April the window moves and the
 * pruner drops what has become the third year back on the next successful pull.
 */

/** 1 April of the financial year `on` falls in. */
export function financialYearStart(on: Date): Date {
  return new Date(financialYearOf(on), 3, 1)
}

/** Earliest completion date still worth keeping: 1 April of the previous FY. */
export function cacheWindowStart(on: Date): Date {
  const current = financialYearStart(on)
  return new Date(current.getFullYear() - 1, 3, 1)
}

/** As a plain date for Postgres, in local terms — an Indian FY is not a UTC concept. */
export function cacheWindowStartISO(on: Date): string {
  const start = cacheWindowStart(on)
  const month = String(start.getMonth() + 1).padStart(2, '0')
  return `${start.getFullYear()}-${month}-01`
}

/** Does this job belong on the device? */
export function isInCacheWindow(job: Pick<Job, 'status' | 'completed_at'>, on: Date): boolean {
  if (!CLOSED_STATUSES.includes(job.status)) return true
  if (!job.completed_at) return true
  return new Date(job.completed_at) >= cacheWindowStart(on)
}
