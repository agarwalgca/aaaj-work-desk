import { useState } from 'react'
import { Button } from '../../components/Button'
import { StatusPill } from '../../components/StatusPill'
import { STATUS_LABEL } from '../../lib/labels'
import { changeJobStatus } from '../../lib/sync/outbox'
import type { Job, JobStatus, UserRole } from '../../lib/types'
import { allowedMoves } from './transitions'

/**
 * Bottom sheet on a phone, centred panel on a desktop. One of the two places a
 * shadow is allowed, because it genuinely floats above the list.
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
  const moves = allowedMoves(job.status, role)

  async function move(to: JobStatus) {
    setBusy(true)
    await changeJobStatus(job.id, to, actorId, note.trim() || undefined)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-label={`Change status of ${job.title}`}
        onClick={(event) => event.stopPropagation()}
        className="rounded-card border-rule bg-card w-full border p-4 shadow-xl sm:max-w-sm"
      >
        <p className="text-ink-soft text-xs">{job.title}</p>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-ink-soft text-xs">Now</span>
          <StatusPill status={job.status} />
        </div>

        {moves.length === 0 ? (
          <p className="text-ink-soft mt-4 text-sm">
            There is nothing you can move this to. A manager takes it from here.
          </p>
        ) : (
          <>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (optional)"
              className="rounded-control border-rule placeholder:text-ink-soft/50 focus:border-brass mt-3 h-9 w-full border px-2 text-sm outline-none"
            />
            <div className="mt-3 grid gap-1.5">
              {moves.map((status) => (
                <button
                  key={status}
                  type="button"
                  disabled={busy}
                  onClick={() => void move(status)}
                  className="rounded-control border-rule hover:bg-brass-wash flex items-center justify-between border px-3 py-2 text-sm disabled:opacity-60"
                >
                  <span>Move to {STATUS_LABEL[status].toLowerCase()}</span>
                  <StatusPill status={status} />
                </button>
              ))}
            </div>
          </>
        )}

        <Button variant="secondary" onClick={onClose} className="mt-3 w-full">
          Cancel
        </Button>
      </div>
    </div>
  )
}
