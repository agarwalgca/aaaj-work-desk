import { useState } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { SkeletonRows } from '../../components/Skeleton'
import { PageHeader } from '../../components/PageHeader'
import { useMe } from '../../app/useMe'
import type { Job } from '../../lib/types'
import { DUE_GROUP_LABEL, groupByDue, isOpen } from './grouping'
import { JobRow } from './JobRow'
import { StatusSheet } from './StatusSheet'
import { useLookups, useMyJobs } from './useJobData'

/**
 * The default screen for staff, and the one most people live in. Only their own
 * work, stacked by how late it is, because that is the order the day gets worked.
 */
export function MyWorkPage() {
  const me = useMe()
  const jobs = useMyJobs(me?.id)
  const { clientById } = useLookups()
  const [showClosed, setShowClosed] = useState(false)
  const [moving, setMoving] = useState<Job | null>(null)

  const today = new Date()
  const loading = jobs === undefined
  const open = (jobs ?? []).filter(isOpen)
  const closed = (jobs ?? []).filter((job) => !isOpen(job))
  const groups = groupByDue(open, today)

  return (
    <section>
      <PageHeader title="My Work" count={open.length}>
        <button
          type="button"
          onClick={() => setShowClosed((v) => !v)}
          className="rounded-control border-rule text-ink-soft hover:bg-brass-wash border px-2 py-1 text-xs"
        >
          {showClosed ? 'Hide' : 'Show'} finished ({closed.length})
        </button>
      </PageHeader>

      {loading && <SkeletonRows count={4} />}

      {!loading && open.length === 0 && (
        <EmptyState
          title="Nothing assigned to you"
          detail="When a partner or manager allocates a job it will appear here."
        />
      )}

      {groups.map(({ group, jobs: inGroup }) => (
        <div key={group} className="mb-6">
          <h2 className="text-ink-soft mb-2 text-xs font-semibold tracking-wide uppercase">
            {DUE_GROUP_LABEL[group]}
            <span className="ml-2 font-mono font-normal">{inGroup.length}</span>
          </h2>
          <ul className="grid gap-1.5">
            {inGroup.map((job) => (
              <JobRow
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

      {showClosed && closed.length > 0 && (
        <div className="mb-6">
          <h2 className="text-ink-soft mb-2 text-xs font-semibold tracking-wide uppercase">
            Finished<span className="ml-2 font-mono font-normal">{closed.length}</span>
          </h2>
          <ul className="grid gap-1.5">
            {closed.map((job) => (
              <JobRow key={job.id} job={job} client={clientById.get(job.client_id)} today={today} />
            ))}
          </ul>
        </div>
      )}

      {moving && me && (
        <StatusSheet job={moving} role={me.role} actorId={me.id} onClose={() => setMoving(null)} />
      )}
    </section>
  )
}
