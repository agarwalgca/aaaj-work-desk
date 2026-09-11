import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'

/**
 * Per-action, not the header chip. After changing a status or leaving a comment a
 * person needs to know whether what they just did has left the building — the
 * aggregate "3 pending" in the corner does not answer that about *this* row.
 */
export function SavedIndicator({ rowId }: { rowId: string }) {
  const queued = useLiveQuery(
    () => db.outbox.where('row_id').equals(rowId).toArray(),
    [rowId],
    undefined,
  )

  if (queued === undefined) return null

  if (queued.length === 0) {
    return <span className="text-status-completed font-mono text-[11px]">Saved</span>
  }

  if (queued.some((entry) => entry.state === 'failed')) {
    return <span className="text-status-cancelled font-mono text-[11px]">Not saved — see sync</span>
  }

  return <span className="text-ink-soft font-mono text-[11px]">Saved on this device</span>
}
