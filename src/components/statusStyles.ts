import type { JobStatus } from '../lib/types'

/**
 * Written out in full rather than composed. Tailwind reads source text, so a class
 * assembled at runtime — `border-status-${status}` — is a class that never gets
 * generated and a pill that renders with no colour.
 */
export const STATUS_PILL: Record<JobStatus, string> = {
  not_started: 'border-status-not-started/40 text-status-not-started',
  in_progress: 'border-status-in-progress/40 text-status-in-progress',
  on_hold: 'border-status-on-hold/40 text-status-on-hold',
  review: 'border-status-review/40 text-status-review',
  rework: 'border-status-rework/40 text-status-rework',
  completed: 'border-status-completed/40 text-status-completed',
  cancelled: 'border-status-cancelled/40 text-status-cancelled',
}

/** The left-edge marker that lets someone scan a list by colour alone. */
export const STATUS_EDGE: Record<JobStatus, string> = {
  not_started: 'border-l-status-not-started',
  in_progress: 'border-l-status-in-progress',
  on_hold: 'border-l-status-on-hold',
  review: 'border-l-status-review',
  rework: 'border-l-status-rework',
  completed: 'border-l-status-completed',
  cancelled: 'border-l-status-cancelled',
}
