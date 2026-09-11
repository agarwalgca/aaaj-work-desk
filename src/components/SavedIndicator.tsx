import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { db } from '../lib/db'

/**
 * Per-action, not the header chip.
 *
 * After changing a status or leaving a comment a person needs to know whether
 * what they just did has left the building — the aggregate "3 pending" in the
 * corner does not answer that about *this* row.
 *
 * It is silent when there is nothing to report. A word on every row that means
 * "fine" 99% of the time is not reassurance, it is clutter, and it makes the one
 * row that does need attention harder to spot. So: quiet when synced, spoken
 * while queued, and a brief "Saved" on the way past so the confirmation is seen.
 */
export function SavedIndicator({ rowId }: { rowId: string }) {
  const queued = useLiveQuery(() => db.outbox.where('row_id').equals(rowId).toArray(), [rowId])

  const pending = queued !== undefined && queued.length > 0
  const failed = queued?.some((entry) => entry.state === 'failed') ?? false

  // Catch the moment it stops being pending, and say so for a few seconds.
  const wasPending = useRef(false)
  const [justSaved, setJustSaved] = useState(false)

  useEffect(() => {
    if (pending) {
      wasPending.current = true
      return
    }
    if (!wasPending.current) return

    wasPending.current = false
    setJustSaved(true)
    const timer = setTimeout(() => setJustSaved(false), 4000)
    return () => clearTimeout(timer)
  }, [pending])

  if (queued === undefined) return null

  if (failed) {
    return <span className="text-status-cancelled font-mono text-[11px]">Not saved</span>
  }

  if (pending) {
    return <span className="text-ink-soft font-mono text-[11px]">Saved on this device</span>
  }

  if (justSaved) {
    return <span className="text-status-completed font-mono text-[11px]">Saved</span>
  }

  return null
}
