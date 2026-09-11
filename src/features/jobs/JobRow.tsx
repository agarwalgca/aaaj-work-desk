import { useRef } from 'react'
import { Link } from 'react-router'
import { SavedIndicator } from '../../components/SavedIndicator'
import { StatusPill } from '../../components/StatusPill'
import { STATUS_EDGE } from '../../components/statusStyles'
import { dueLabel, formatDate } from '../../lib/dates'
import type { Client, Job } from '../../lib/types'
import { isOverdue } from './grouping'

/**
 * One line of the working list.
 *
 * Laid out as a table rather than a paragraph: fixed columns from `md` up, so
 * dates sit under dates and statuses under statuses all the way down the list.
 *
 * Every column except the title is a fixed width, and that is not fussiness. Each
 * row is its own grid, so an `auto` column sizes to its own content — a row
 * reading "In progress" would push its dates to a different place from one
 * reading "On hold", and the list would only look aligned by accident.
 * That alignment is what makes fifty rows scannable, and it is also what stops
 * the row opening a hole in the middle on a wide screen — the space between
 * title and status is a column boundary, not a gap.
 *
 * Below `md` the cells are placed explicitly into two lines, because six columns
 * on a phone is not a table, it is a mess — and left to auto-placement a
 * single-column grid gives six lines and a 142px row, which is worse than either.
 * The absolute date is dropped there: it says the same thing as "4 days late" and
 * the phrase is the more useful half on a small screen.
 */
export function JobRow({
  job,
  client,
  today,
  assignee,
  onQuickStatus,
  index,
}: {
  job: Job
  client: Client | undefined
  today: Date
  assignee?: string
  onQuickStatus?: (job: Job) => void
  /** Position in a keyboard-navigable list. Omitted, the row is an ordinary tab stop. */
  index?: number
}) {
  const late = isOverdue(job, today)

  // Long-press opens the status sheet instead of following the link. Half a
  // second is long enough not to fire while somebody scrolls a list on a train.
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
    <li className={`border-rule bg-card relative border border-l-[3px] ${STATUS_EDGE[job.status]}`}>
      <Link
        to={`/jobs/${job.id}`}
        {...(index === undefined ? {} : { 'data-row': true, tabIndex: index === 0 ? 0 : -1 })}
        onPointerDown={startHold}
        onPointerUp={endHold}
        onPointerLeave={endHold}
        onClick={(event) => {
          if (held.current) event.preventDefault()
        }}
        title={client ? `${client.code} — ${client.name}` : undefined}
        className="hover:bg-brass-wash/40 focus-visible:bg-brass-wash grid grid-cols-[4.5rem_minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-3 py-2 transition-colors duration-150 focus:outline-none md:grid-cols-[4.5rem_minmax(0,1fr)_6rem_6.5rem_6.5rem_10.5rem] md:items-center md:gap-x-4 lg:grid-cols-[4.5rem_minmax(0,1fr)_6rem_6.5rem_6.5rem_16rem]"
      >
        <span className="text-ink-soft col-start-1 row-start-1 truncate font-mono text-xs md:col-auto md:row-auto">
          {client?.code ?? '—'}
        </span>

        <span className="col-start-2 row-start-1 flex min-w-0 items-center gap-2 md:col-auto md:row-auto">
          {(job.priority === 'urgent' || job.priority === 'high') && (
            <span
              aria-label={`${job.priority} priority`}
              className={`size-1.5 shrink-0 rounded-full ${
                job.priority === 'urgent' ? 'bg-status-cancelled' : 'bg-status-on-hold'
              }`}
            />
          )}
          <span className="truncate text-sm font-medium">{job.title}</span>
        </span>

        <span className="text-ink-soft/80 col-start-1 row-start-2 truncate font-mono text-xs md:col-auto md:row-auto">
          {job.period_label}
        </span>

        {/* Redundant with the phrase beside it on a phone, so it only appears once there is room. */}
        <span className="text-ink-soft hidden font-mono text-xs md:block">{formatDate(job.due_date)}</span>

        <span
          className={`col-span-2 col-start-2 row-start-2 text-xs md:col-span-1 md:col-auto md:row-auto ${
            late ? 'text-status-overdue font-medium' : 'text-ink-soft'
          }`}
        >
          {dueLabel(job.due_date, today)}
        </span>

        <span className="col-start-3 row-start-1 flex items-center justify-end gap-2 md:col-auto md:row-auto">
          {assignee && <span className="text-ink-soft hidden truncate text-xs lg:inline">{assignee}</span>}
          <SavedIndicator rowId={job.id} />
          <StatusPill status={job.status} />
          {onQuickStatus && (
            <button
              type="button"
              title="Change status"
              onClick={(event) => {
                event.preventDefault()
                onQuickStatus(job)
              }}
              className="rounded-control border-rule text-ink-soft hover:bg-brass-wash hover:text-ink shrink-0 border px-1.5 py-0.5 text-[11px] transition-colors duration-150"
            >
              Move
            </button>
          )}
        </span>
      </Link>
    </li>
  )
}
