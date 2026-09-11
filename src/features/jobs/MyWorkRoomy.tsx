import { useState } from 'react'
import { Link } from 'react-router'
import { useMe } from '../../app/useMe'
import { EmptyState } from '../../components/EmptyState'
import { dueLabel, formatDate } from '../../lib/dates'
import { STATUS_LABEL } from '../../lib/labels'
import type { Client, Job, JobStatus } from '../../lib/types'
import { DUE_GROUP_LABEL, groupByDue, isOpen, isOverdue } from './grouping'
import { StatusSheet } from './StatusSheet'
import { useLookups, useMyJobs } from './useJobData'

/**
 * A second take on My Work, for comparison only.
 *
 * Same palette, same faces, same information — only the density and the weight
 * change. Borders give way to a soft shadow, the status becomes a tinted block
 * rather than an outline, radii go from 6px to 12px, and every row gets room to
 * breathe. Comparing this against a shadcn-shaped app would tell us nothing; the
 * only useful question is whether *this firm's* style wants more air.
 *
 * Delete this file, its route and the link on My Work to be rid of it.
 */

// Tinted rather than outlined. Written out in full because Tailwind reads source.
const STATUS_SOFT: Record<JobStatus, string> = {
  not_started: 'bg-status-not-started/10 text-status-not-started',
  in_progress: 'bg-status-in-progress/10 text-status-in-progress',
  on_hold: 'bg-status-on-hold/10 text-status-on-hold',
  review: 'bg-status-review/10 text-status-review',
  rework: 'bg-status-rework/15 text-status-rework',
  completed: 'bg-status-completed/10 text-status-completed',
  cancelled: 'bg-status-cancelled/10 text-status-cancelled',
}

const STATUS_DOT: Record<JobStatus, string> = {
  not_started: 'bg-status-not-started',
  in_progress: 'bg-status-in-progress',
  on_hold: 'bg-status-on-hold',
  review: 'bg-status-review',
  rework: 'bg-status-rework',
  completed: 'bg-status-completed',
  cancelled: 'bg-status-cancelled',
}

export function MyWorkRoomy() {
  const me = useMe()
  const jobs = useMyJobs(me?.id)
  const { clientById } = useLookups()
  const [moving, setMoving] = useState<Job | null>(null)

  const today = new Date()
  const open = jobs.filter(isOpen)
  const groups = groupByDue(open, today)

  return (
    <section className="max-w-3xl">
      <div className="rounded-card border-rule bg-card mb-6 flex flex-wrap items-center gap-3 border border-dashed px-4 py-3">
        <p className="text-ink-soft min-w-0 flex-1 text-sm">
          <strong className="text-ink">Roomier draft.</strong> Same data and the same palette —
          only the spacing, the radii and the weight differ.
        </p>
        <Link to="/my-work" className="text-brass shrink-0 text-sm underline underline-offset-2">
          Back to the current one
        </Link>
      </div>

      <h1 className="font-serif mb-6 text-2xl font-semibold">My Work</h1>

      {open.length === 0 && (
        <EmptyState
          title="Nothing assigned to you"
          detail="When a partner or manager allocates a job it will appear here."
        />
      )}

      {groups.map(({ group, jobs: inGroup }) => (
        <div key={group} className="mb-8">
          <div className="mb-3 flex items-center gap-2.5">
            <h2 className="text-ink text-sm font-semibold">{DUE_GROUP_LABEL[group]}</h2>
            <span className="bg-ink/5 text-ink-soft rounded-full px-2 py-0.5 font-mono text-xs">
              {inGroup.length}
            </span>
          </div>

          <ul className="grid gap-3">
            {inGroup.map((job) => (
              <RoomyRow
                key={job.id}
                job={job}
                client={clientById.get(job.client_id)}
                today={today}
                onQuickStatus={me ? setMoving : undefined}
              />
            ))}
          </ul>
        </div>
      ))}

      {moving && me && (
        <StatusSheet job={moving} role={me.role} actorId={me.id} onClose={() => setMoving(null)} />
      )}
    </section>
  )
}

function RoomyRow({
  job,
  client,
  today,
  onQuickStatus,
}: {
  job: Job
  client: Client | undefined
  today: Date
  onQuickStatus?: (job: Job) => void
}) {
  const late = isOverdue(job, today)

  return (
    <li
      className={`bg-card rounded-xl shadow-sm transition-shadow hover:shadow-md ${
        late ? 'ring-status-overdue/25 ring-1' : 'ring-rule ring-1'
      }`}
    >
      <Link to={`/jobs/${job.id}`} className="block px-5 py-4">
        <div className="flex items-start gap-4">
          <span className={`mt-1.5 size-2 shrink-0 rounded-full ${STATUS_DOT[job.status]}`} />

          <div className="min-w-0 flex-1">
            <p className="text-ink-soft truncate text-xs">
              <span className="font-mono">{client?.code ?? '—'}</span>
              {client && <span className="mx-1.5">·</span>}
              {client?.name}
            </p>

            <h3 className="mt-0.5 text-base font-medium">{job.title}</h3>

            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span
                className={`text-sm font-medium ${late ? 'text-status-overdue' : 'text-ink-soft'}`}
              >
                {dueLabel(job.due_date, today)}
              </span>
              <span className="text-ink-soft/70 font-mono text-xs">{formatDate(job.due_date)}</span>
              {job.period_label && (
                <span className="text-ink-soft/70 font-mono text-xs">{job.period_label}</span>
              )}
              {(job.priority === 'urgent' || job.priority === 'high') && (
                <span className="text-ink-soft/70 text-xs capitalize">{job.priority} priority</span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_SOFT[job.status]}`}
            >
              {STATUS_LABEL[job.status]}
            </span>
            {onQuickStatus && (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault()
                  onQuickStatus(job)
                }}
                className="text-ink-soft hover:bg-ink/5 hover:text-ink rounded-lg px-2.5 py-1 text-xs transition-colors"
              >
                Move
              </button>
            )}
          </div>
        </div>
      </Link>
    </li>
  )
}
