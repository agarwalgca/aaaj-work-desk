import { PRIORITY_LABEL, STATUS_LABEL } from '../lib/labels'
import type { JobPriority, JobStatus } from '../lib/types'
import { STATUS_PILL } from './statusStyles'

export function StatusPill({ status }: { status: JobStatus }) {
  return (
    <span
      className={`rounded-control inline-flex shrink-0 items-center border px-1.5 py-0.5 text-[11px] font-medium ${STATUS_PILL[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}

/** Only the two priorities that change what somebody does today are worth ink. */
export function PriorityMark({ priority }: { priority: JobPriority }) {
  if (priority !== 'high' && priority !== 'urgent') return null
  return (
    <span
      className={`rounded-control shrink-0 border px-1.5 py-0.5 text-[11px] font-medium ${
        priority === 'urgent'
          ? 'border-status-cancelled/40 text-status-cancelled'
          : 'border-status-on-hold/40 text-status-on-hold'
      }`}
    >
      {PRIORITY_LABEL[priority]}
    </span>
  )
}

/** Outline, not fill: an overdue row is already carrying a status colour. */
export function OverdueMark() {
  return (
    <span className="rounded-control border-status-overdue text-status-overdue shrink-0 border px-1.5 py-0.5 text-[11px] font-medium">
      Overdue
    </span>
  )
}
