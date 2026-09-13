import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Button } from '../../components/Button'
import { StatusPill } from '../../components/StatusPill'
import { STATUS_LABEL } from '../../lib/labels'
import { db } from '../../lib/db'
import { changeJobStatus } from '../../lib/sync/outbox'
import type { Job, JobStatus, UserRole } from '../../lib/types'
import { allowedMoves, isApproval } from './transitions'

/**
 * Bottom sheet on a phone, centred panel on a desktop. One of the two places a
 * shadow is allowed, because it genuinely floats above the list.
 *
 * Completing a job is an approval, so it is not offered as one more status among
 * seven. When a job is in review and the person can approve it, approving leads,
 * and sending it back sits right beside it — those are the two real answers.
 */
export function StatusSheet({
  job,
  role,
  actorId,
  onClose,
}: {
  job: Job
  role: UserRole
  actorId: string
  onClose: () => void
}) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const assignee = useLiveQuery(
    () => (job.assigned_to ? db.profiles.get(job.assigned_to) : undefined),
    [job.assigned_to],
  )
  const assigneeRole = job.assigned_to ? assignee?.role : null
  const moves = allowedMoves(job.status, role, assigneeRole)

  const canApprove = moves.some((to) => isApproval(job.status, to))
  const others = moves.filter((to) => !isApproval(job.status, to) && !(canApprove && to === 'rework'))

  async function move(to: JobStatus) {
    setBusy(true)
    await changeJobStatus(job.id, to, actorId, note.trim() || undefined)
    onClose()
  }

  // What staff see once their part is done, instead of an unexplained empty sheet.
  const waitingOnApproval = role === 'staff' && job.status === 'review'

  return (
    <div
      className="animate-fade fixed inset-0 z-40 flex items-end justify-center bg-black/30 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-label={`Change status of ${job.title}`}
        onClick={(event) => event.stopPropagation()}
        className="rounded-card border-rule bg-card animate-rise w-full border p-4 shadow-xl sm:max-w-sm"
      >
        <p className="text-ink-soft text-xs">{job.title}</p>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-ink-soft text-xs">Now</span>
          <StatusPill status={job.status} />
        </div>

        {waitingOnApproval ? (
          <p className="text-ink-soft mt-4 text-sm">
            <strong className="text-ink">Waiting for approval.</strong> A manager or partner reviews
            it and either approves it as completed or sends it back to you.
          </p>
        ) : moves.length === 0 ? (
          <p className="text-ink-soft mt-4 text-sm">
            There is nothing you can move this to. A manager takes it from here.
          </p>
        ) : (
          <>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={canApprove ? 'Note — say why, if sending back' : 'Note (optional)'}
              className="rounded-control border-rule placeholder:text-ink-soft/50 focus:border-brass mt-3 h-9 w-full border px-2 text-sm transition-colors duration-150 outline-none"
            />

            {canApprove && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button disabled={busy} onClick={() => void move('completed')}>
                  Approve
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => void move('rework')}>
                  Send back
                </Button>
              </div>
            )}

            {others.length > 0 && (
              <div className={`grid gap-1 ${canApprove ? 'border-rule mt-4 border-t pt-3' : 'mt-3'}`}>
                {canApprove && <p className="text-ink-soft mb-1 text-xs">Or move it to</p>}
                {others.map((status) => (
                  <button
                    key={status}
                    type="button"
                    disabled={busy}
                    onClick={() => void move(status)}
                    className="rounded-control border-rule hover:bg-brass-wash flex items-center justify-between border px-3 py-2 text-sm transition-colors duration-150 disabled:opacity-60"
                  >
                    <span>Move to {STATUS_LABEL[status].toLowerCase()}</span>
                    <StatusPill status={status} />
                  </button>
                ))}
              </div>
            )}

            {!canApprove && role !== 'staff' && job.status === 'review' && (
              <p className="text-ink-soft mt-3 text-xs">
                <strong className="text-ink">Waiting for a partner.</strong> A job done by a manager
                is approved by a partner.
              </p>
            )}
            {!canApprove && role !== 'staff' && job.status !== 'completed' && job.status !== 'review' && (
              <p className="text-ink-soft mt-3 text-xs">
                To complete this job, move it to review first — completing is an approval.
              </p>
            )}
          </>
        )}

        <Button variant="secondary" onClick={onClose} className="mt-3 w-full">
          Cancel
        </Button>
      </div>
    </div>
  )
}
