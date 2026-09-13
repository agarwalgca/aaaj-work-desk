import { STAFF_TRANSITIONS, type JobStatus, type UserRole } from '../../lib/types'

export const ALL_STATUSES: JobStatus[] = [
  'not_started',
  'in_progress',
  'on_hold',
  'review',
  'rework',
  'completed',
  'cancelled',
]

/**
 * What this person may do to this job from here.
 *
 * public.jobs_guard() decides for real. This mirror only keeps the sheet from
 * offering a move that would come back as a failed outbox entry ten seconds later.
 *
 * Completed is an approval, not a status like the others: it is reachable only
 * from Review, and only by a manager or partner. A manager can still cancel or send
 * back from anywhere — it is only the finish line that has one gate.
 */
export function allowedMoves(from: JobStatus, role: UserRole): JobStatus[] {
  if (role === 'staff') return STAFF_TRANSITIONS[from]

  return ALL_STATUSES.filter((to) => {
    if (to === from) return false
    if (to === 'completed') return from === 'review'
    return true
  })
}

/** The one move that is an approval, so the sheet can present it as one. */
export const isApproval = (from: JobStatus, to: JobStatus) => from === 'review' && to === 'completed'
