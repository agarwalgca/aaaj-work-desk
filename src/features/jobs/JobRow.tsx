import { useRef } from 'react'
import { Link } from 'react-router'
import { OverdueMark, PriorityMark, StatusPill } from '../../components/StatusPill'
import { STATUS_EDGE } from '../../components/statusStyles'
import { SavedIndicator } from '../../components/SavedIndicator'
import { dueLabel, formatDate } from '../../lib/dates'
import type { Client, Job } from '../../lib/types'
import { isOverdue } from './grouping'

/**
 * One line of the working list. Dense on purpose: a manager scanning fifty of
 * these is comparing dates down a column, which is why every date and code is set
 * in the mono face with tabular figures.
 */
export function JobRow({
  job,
  client,
  today,
  assignee,
  onQuickStatus,
}: {
  job: Job
  client: Client | undefined
  today: Date
  assignee?: string
  onQuickStatus?: (job: Job) => void
}) {
  const late = isOverdue(job, today)

  // Long-press opens the status sheet instead of following the link. Half a second
  // is long enough not to fire while someone is scrolling a list on a train.
  const held = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const startHold = () => {
    if (!onQuickStatus) return
    held.current = false
    timer.current = setTimeout(() => {
      held.current = true
      onQuickStatus(job)
    }, 500)
  }

  const endHold = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }

  return (
    <li className={`border-rule bg-card relative border border-l-2 ${STATUS_EDGE[job.status]}`}>
      <Link
        to={`/jobs/${job.id}`}
        onPointerDown={startHold}
        onPointerUp={endHold}
        onPointerLeave={endHold}
        onClick={(event) => {
          if (held.current) event.preventDefault()
        }}
        className="hover:bg-brass-wash/40 block px-3 py-2.5">
        <div className="flex items-start gap-2">
          <span className="text-ink-soft shrink-0 font-mono text-xs">{client?.code ?? '—'}</span>
          <span className="min-w-0 flex-1 text-sm font-medium">{job.title}</span>
          <StatusPill status={job.status} />
          {onQuickStatus && (
            <button
              type="button"
              title="Change status"
              onClick={(event) => {
                event.preventDefault()
                onQuickStatus(job)
              }}
              className="rounded-control border-rule text-ink-soft hover:bg-brass-wash -my-0.5 shrink-0 border px-1.5 py-0.5 text-[11px]"
            >
              Move
            </button>
          )}
        </div>

        <div className="text-ink-soft mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {job.period_label && <span className="font-mono">{job.period_label}</span>}
          <span className="font-mono">{formatDate(job.due_date)}</span>
          <span className={late ? 'text-status-overdue' : ''}>{dueLabel(job.due_date, today)}</span>
          {assignee && <span>{assignee}</span>}
          <PriorityMark priority={job.priority} />
          {late && <OverdueMark />}
          <span className="ml-auto">
            <SavedIndicator rowId={job.id} />
          </span>
        </div>
      </Link>
    </li>
  )
}
