import { Link } from 'react-router'
import { EmptyState } from '../../components/EmptyState'
import { PageHeader } from '../../components/PageHeader'
import { Button } from '../../components/Button'
import { StatusPill } from '../../components/StatusPill'
import { CATEGORY_LABEL, STATUS_LABEL } from '../../lib/labels'
import type { Job, JobStatus } from '../../lib/types'
import { activeFilterCount, useBoardFilters } from './boardFilters'
import { byDueThenPriority, isOpen, isOverdue } from './grouping'
import { JobRow } from './JobRow'
import { useRovingList } from './useRovingList'
import { personName, useAllJobs, useLookups } from './useJobData'

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'open', label: 'Open (anything unfinished)' },
  { value: 'all', label: 'Every status' },
  ...(Object.keys(STATUS_LABEL) as JobStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] })),
]

/**
 * Everything the firm has on, for the people who allocate it. Two ways to look at
 * the same set: down the list when you are chasing a deadline, across the columns
 * when you are deciding who can take the next thing on.
 */
export function BoardPage() {
  const jobs = useAllJobs()
  const { clients, profiles, clientById, profileById } = useLookups()
  const f = useBoardFilters()
  const { listProps } = useRovingList()
  const today = new Date()

  const filtered = jobs
    .filter((job) => {
      if (f.status === 'open' && !isOpen(job)) return false
      if (f.status !== 'open' && f.status !== 'all' && job.status !== f.status) return false
      if (f.assignee === 'unassigned' && job.assigned_to !== null) return false
      if (f.assignee !== 'all' && f.assignee !== 'unassigned' && job.assigned_to !== f.assignee)
        return false
      if (f.client !== 'all' && job.client_id !== f.client) return false
      if (f.category !== 'all' && job.category !== f.category) return false
      if (f.priority !== 'all' && job.priority !== f.priority) return false
      if (f.dueFrom && (!job.due_date || job.due_date < f.dueFrom)) return false
      if (f.dueTo && (!job.due_date || job.due_date > f.dueTo)) return false
      return true
    })
    .sort(byDueThenPriority)

  const active = activeFilterCount(f)

  return (
    <section>
      <PageHeader title="Board" count={filtered.length}>
        <div className="rounded-control border-rule flex overflow-hidden border">
          {(['list', 'workload'] as const).map((view) => (
            <button
              key={view}
              type="button"
              onClick={() => f.set({ view })}
              aria-pressed={f.view === view}
              className={`px-2.5 py-1 text-xs ${
                f.view === view ? 'bg-brass-wash text-ink font-medium' : 'text-ink-soft'
              }`}
            >
              {view === 'list' ? 'List' : 'Workload'}
            </button>
          ))}
        </div>
        <Link to="/jobs/new">
          <Button>New job</Button>
        </Link>
      </PageHeader>

      <div className="rounded-card border-rule bg-card mb-4 grid gap-2 border p-3 sm:grid-cols-2 lg:grid-cols-4">
        <Filter label="Status" value={f.status} onChange={(v) => f.set({ status: v as JobStatus })} options={STATUS_OPTIONS} />
        <Filter
          label="Assignee"
          value={f.assignee}
          onChange={(v) => f.set({ assignee: v })}
          options={[
            { value: 'all', label: 'Anyone' },
            { value: 'unassigned', label: 'Unassigned' },
            ...profiles.filter((p) => p.is_active).map((p) => ({ value: p.id, label: personName(p) })),
          ]}
        />
        <Filter
          label="Client"
          value={f.client}
          onChange={(v) => f.set({ client: v })}
          options={[
            { value: 'all', label: 'All clients' },
            ...clients.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })),
          ]}
        />
        <Filter
          label="Category"
          value={f.category}
          onChange={(v) => f.set({ category: v as never })}
          options={[
            { value: 'all', label: 'All categories' },
            ...Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label })),
          ]}
        />
        <Filter
          label="Priority"
          value={f.priority}
          onChange={(v) => f.set({ priority: v as never })}
          options={[
            { value: 'all', label: 'Any priority' },
            { value: 'urgent', label: 'Urgent' },
            { value: 'high', label: 'High' },
            { value: 'normal', label: 'Normal' },
            { value: 'low', label: 'Low' },
          ]}
        />
        <DateFilter label="Due from" value={f.dueFrom} onChange={(v) => f.set({ dueFrom: v })} />
        <DateFilter label="Due to" value={f.dueTo} onChange={(v) => f.set({ dueTo: v })} />
        <div className="flex items-end">
          <button
            type="button"
            onClick={f.reset}
            disabled={active === 0}
            className="text-brass text-xs underline underline-offset-2 disabled:opacity-40"
          >
            Clear {active > 0 ? `${active} filter${active === 1 ? '' : 's'}` : 'filters'}
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No jobs match these filters"
          detail={active > 0 ? 'Clear a filter or two and try again.' : undefined}
        />
      ) : f.view === 'list' ? (
        <ul
          {...listProps}
          aria-label="Jobs. Use the up and down arrows to move between rows."
          className="grid gap-1.5"
        >
          {filtered.map((job, index) => (
            <JobRow
              key={job.id}
              index={index}
              job={job}
              client={clientById.get(job.client_id)}
              today={today}
              assignee={job.assigned_to ? personName(profileById.get(job.assigned_to)) : 'Unassigned'}
            />
          ))}
        </ul>
      ) : (
        <Workload jobs={filtered} today={today} />
      )}
    </section>
  )
}

function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-ink-soft text-[11px] font-medium tracking-wide uppercase">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-control border-rule bg-card focus:border-brass h-9 border px-2 text-sm outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function DateFilter({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-ink-soft text-[11px] font-medium tracking-wide uppercase">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-control border-rule bg-card focus:border-brass h-9 border px-2 font-mono text-sm outline-none"
      />
    </label>
  )
}

/**
 * Who is carrying what. Unassigned sits first because it is the only column that
 * is anybody's job to empty.
 */
function Workload({ jobs, today }: { jobs: Job[]; today: Date }) {
  const { profileById, clientById } = useLookups()

  const columns = new Map<string, Job[]>([['unassigned', []]])
  for (const job of jobs) {
    const key = job.assigned_to ?? 'unassigned'
    const column = columns.get(key)
    if (column) column.push(job)
    else columns.set(key, [job])
  }

  const ordered = [...columns.entries()].filter(([key, list]) => key === 'unassigned' || list.length > 0)

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {ordered.map(([key, list]) => {
        const open = list.filter(isOpen).length
        const late = list.filter((job) => isOverdue(job, today)).length
        return (
          <div key={key} className="rounded-card border-rule bg-card border p-3">
            <div className="border-rule flex items-baseline justify-between border-b pb-2">
              <h3 className="text-sm font-medium">
                {key === 'unassigned' ? 'Unassigned' : personName(profileById.get(key))}
              </h3>
              <span className="text-ink-soft font-mono text-xs">
                {open} open{late > 0 && <span className="text-status-overdue"> · {late} late</span>}
              </span>
            </div>
            {list.length === 0 ? (
              <p className="text-ink-soft py-3 text-center text-xs">Nothing waiting</p>
            ) : (
              <ul className="mt-2 grid gap-1">
                {list.map((job) => (
                  <li key={job.id}>
                    <Link
                      to={`/jobs/${job.id}`}
                      className="hover:bg-brass-wash/40 rounded-control block px-1.5 py-1"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-ink-soft font-mono text-[11px]">
                          {clientById.get(job.client_id)?.code ?? '—'}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs">{job.title}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <StatusPill status={job.status} />
                        {isOverdue(job, today) && (
                          <span className="text-status-overdue font-mono text-[11px]">late</span>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}
