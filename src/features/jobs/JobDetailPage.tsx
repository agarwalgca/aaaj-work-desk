import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useMe } from '../../app/useMe'
import { Button } from '../../components/Button'
import { EmptyState } from '../../components/EmptyState'
import { SkeletonPanel } from '../../components/Skeleton'
import { SavedIndicator } from '../../components/SavedIndicator'
import { OverdueMark, PriorityMark, StatusPill } from '../../components/StatusPill'
import { db } from '../../lib/db'
import { dueLabel, formatDate, formatDateTime } from '../../lib/dates'
import { STATUS_LABEL } from '../../lib/labels'
import { useCategories } from '../categories/useCategories'
import { addComment, updateJob } from '../../lib/sync/outbox'
import type { Profile } from '../../lib/types'
import { isOverdue } from './grouping'
import { StatusSheet } from './StatusSheet'
import { approversFor } from './transitions'
import {
  personName,
  useJob,
  useJobComments,
  useJobHistory,
  useLookups,
} from './useJobData'

export function JobDetailPage() {
  const { id } = useParams()
  const me = useMe()
  const job = useJob(id)
  const history = useJobHistory(id)
  const comments = useJobComments(id)
  const { clients, profiles, clientById, profileById } = useLookups()
  const { nameOf } = useCategories()
  const [moving, setMoving] = useState(false)
  const today = new Date()

  if (job === undefined) {
    return (
      <section className="max-w-3xl">
        <SkeletonPanel lines={4} />
      </section>
    )
  }

  if (job === null) {
    return (
      <EmptyState
        title="Not available offline"
        detail="This job is not on this device. Connect to view it — jobs finished more than two financial years ago are not kept locally."
      />
    )
  }

  const client = clientById.get(job.client_id)
  const canAllocate = me?.role === 'partner' || me?.role === 'manager'

  return (
    <section className="max-w-3xl">
      <div className="rounded-card border-rule bg-card border p-4">
        <div className="flex flex-wrap items-start gap-2">
          <Link
            to={`/clients/${job.client_id}`}
            className="text-ink-soft hover:text-brass font-mono text-xs"
          >
            {client?.code ?? '—'}
          </Link>
          <StatusPill status={job.status} />
          <PriorityMark priority={job.priority} />
          {isOverdue(job, today) && <OverdueMark />}
          {canAllocate && (
            <Link to={`/jobs/${job.id}/edit`} className="ml-auto">
              <Button variant="secondary">Edit</Button>
            </Link>
          )}
        </div>

        <h1 className="font-serif mt-2 text-xl font-semibold">{job.title}</h1>
        <p className="text-ink-soft text-sm">{client?.name}</p>

        <dl className="border-rule mt-4 grid grid-cols-2 gap-x-6 gap-y-2 border-t pt-3 text-sm sm:grid-cols-3">
          <Field term="Period" value={job.period_label || '—'} mono />
          <Field term="Category" value={nameOf(job.category)} />
          <Field term="Due" value={formatDate(job.due_date)} mono note={dueLabel(job.due_date, today)} />
          <Field term="Assigned to" value={job.assigned_to ? personName(profileById.get(job.assigned_to)) : 'Unassigned'} />
          <Field term="Reviewer" value={job.reviewer_id ? personName(profileById.get(job.reviewer_id)) : '—'} />
          <Field term="Started" value={job.started_at ? formatDate(job.started_at) : '—'} mono />
          {job.status === 'completed' && (
            <Field
              term="Approved"
              value={
                job.approved_by
                  ? `${personName(profileById.get(job.approved_by))}, ${formatDate(job.approved_at)}`
                  : // Completed before approval existed, or seeded — say so rather than invent.
                    'Before approvals were recorded'
              }
            />
          )}
          {job.status === 'review' && (
            <Field
              term="Approval"
              value={
                approversFor(job.assigned_to ? profileById.get(job.assigned_to)?.role : null).includes('manager')
                  ? 'Waiting for a manager or partner'
                  : 'Waiting for a partner'
              }
            />
          )}
        </dl>

        {job.description && (
          <p className="border-rule text-ink-soft mt-3 border-t pt-3 text-sm whitespace-pre-wrap">
            {job.description}
          </p>
        )}

        <div className="border-rule mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
          <Button onClick={() => setMoving(true)} disabled={!me}>
            Change status
          </Button>
          {canAllocate && (
            <Reassign job={job} people={profiles} />
          )}
          <span className="ml-auto">
            <SavedIndicator rowId={job.id} />
          </span>
        </div>
      </div>

      <h2 className="font-serif mt-6 mb-2 text-base font-semibold">History</h2>
      {history.length === 0 ? (
        <p className="text-ink-soft text-sm">Nothing has moved yet.</p>
      ) : (
        <ol className="border-rule bg-card border">
          {history.map((entry) => (
            <li key={entry.id} className="border-rule flex flex-wrap items-center gap-2 border-b px-3 py-2 last:border-b-0">
              <span className="text-ink-soft font-mono text-xs">{formatDateTime(entry.changed_at)}</span>
              <span className="text-sm">
                {entry.from_status ? `${STATUS_LABEL[entry.from_status]} → ` : ''}
                <strong className="font-medium">{STATUS_LABEL[entry.to_status]}</strong>
              </span>
              <span className="text-ink-soft text-xs">
                {entry.changed_by ? personName(profileById.get(entry.changed_by)) : 'Unknown'}
              </span>
              {entry.note && <p className="text-ink-soft w-full text-xs">{entry.note}</p>}
            </li>
          ))}
        </ol>
      )}

      <h2 className="font-serif mt-6 mb-2 text-base font-semibold">Comments</h2>
      <ul className="grid gap-1.5">
        {comments.map((comment) => (
          <li key={comment.id} className="rounded-card border-rule bg-card border px-3 py-2">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-medium">
                {comment.author_id ? personName(profileById.get(comment.author_id)) : 'Unknown'}
              </span>
              <span className="text-ink-soft font-mono text-[11px]">
                {formatDateTime(comment.created_at)}
              </span>
              <span className="ml-auto">
                <SavedIndicator rowId={comment.id} />
              </span>
            </div>
            <p className="mt-1 text-sm whitespace-pre-wrap">{comment.body}</p>
          </li>
        ))}
      </ul>

      {me && <CommentBox jobId={job.id} authorId={me.id} />}

      {moving && me && (
        <StatusSheet job={job} role={me.role} actorId={me.id} onClose={() => setMoving(false)} />
      )}

      {clients.length === 0 && (
        <p className="text-ink-soft mt-4 text-xs">Client details have not synced to this device yet.</p>
      )}
    </section>
  )
}

function Field({
  term,
  value,
  mono,
  note,
}: {
  term: string
  value: string
  mono?: boolean
  note?: string
}) {
  return (
    <div>
      <dt className="text-ink-soft text-[11px] tracking-wide uppercase">{term}</dt>
      <dd className={mono ? 'font-mono' : ''}>
        {value}
        {note && <span className="text-ink-soft ml-2 text-xs">{note}</span>}
      </dd>
    </div>
  )
}

/** Visible to managers and partners only — staff cannot reassign, and RLS agrees. */
function Reassign({ job, people }: { job: { id: string; assigned_to: string | null }; people: Profile[] }) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="text-ink-soft">Assign to</span>
      <select
        value={job.assigned_to ?? ''}
        onChange={(e) => void updateJob(job.id, { assigned_to: e.target.value || null })}
        className="rounded-control border-rule bg-card focus:border-brass h-9 border px-2 text-sm outline-none"
      >
        <option value="">Unassigned</option>
        {people
          .filter((p) => p.is_active)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {personName(p)}
            </option>
          ))}
      </select>
    </label>
  )
}

/**
 * The draft is written to Dexie on a one-second debounce as it is typed, so
 * closing the tab mid-sentence — or the phone deciding to kill the tab — loses
 * nothing. It is only turned into a comment, and queued, when Post is pressed.
 */
function CommentBox({ jobId, authorId }: { jobId: string; authorId: string }) {
  const [body, setBody] = useState('')
  const [loaded, setLoaded] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftKey = `comment:${jobId}`

  useEffect(() => {
    let cancelled = false
    db.drafts.get(draftKey).then((draft) => {
      if (!cancelled) {
        setBody(draft?.body ?? '')
        setLoaded(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [draftKey])

  function onChange(value: string) {
    setBody(value)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      void db.drafts.put({ key: draftKey, body: value, updated_at: new Date().toISOString() })
    }, 1000)
  }

  async function post() {
    const text = body.trim()
    if (!text) return
    await addComment(jobId, authorId, text)
    setBody('')
    if (timer.current) clearTimeout(timer.current)
    await db.drafts.delete(draftKey)
  }

  return (
    <div className="mt-2">
      <textarea
        value={body}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Add a comment"
        disabled={!loaded}
        className="rounded-control border-rule bg-card placeholder:text-ink-soft/50 focus:border-brass min-h-20 w-full border px-3 py-2 text-sm outline-none"
      />
      <div className="mt-2 flex items-center gap-2">
        <Button onClick={() => void post()} disabled={!body.trim()}>
          Post
        </Button>
        {body.trim() && (
          <span className="text-ink-soft font-mono text-[11px]">Draft kept on this device</span>
        )}
      </div>
    </div>
  )
}
