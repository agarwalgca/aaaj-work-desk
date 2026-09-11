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
 */
export function allowedMoves(from: JobStatus, role: UserRole): JobStatus[] {
  if (role === 'staff') return STAFF_TRANSITIONS[from]
  return ALL_STATUSES.filter((status) => status !== from)
}
