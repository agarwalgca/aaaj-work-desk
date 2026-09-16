import { discardFailed } from '../../lib/sync/flush'
import type { OutboxEntry } from '../../lib/types'

/** The writes the server refused, each with the reason it gave. */
export function FailedEntries({
  entries,
  discardable = false,
  className = '',
}: {
  entries: OutboxEntry[]
  /** Offer to give up on an entry. Only the sync panel does; Settings just lists. */
  discardable?: boolean
  className?: string
}) {
  return (
    <ul className={`grid gap-1 ${className}`}>
      {entries.map((entry) => (
        <li key={entry.seq} className="rounded-control border-rule border px-2 py-1">
          <div className="font-mono text-[11px]">
            {entry.op} {entry.table_name}
          </div>
          <p className="text-ink-soft text-xs">{entry.last_error}</p>
          {discardable && (
            <button
              type="button"
              onClick={() => void discardFailed(entry.seq!)}
              className="text-ink-soft mt-1 text-[11px] underline underline-offset-2"
            >
              Discard
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
