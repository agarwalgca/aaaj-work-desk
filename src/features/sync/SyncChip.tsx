import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { cacheStats, db } from '../../lib/db'
import { syncNow } from '../../lib/sync/engine'
import { discardFailed, retryFailed } from '../../lib/sync/flush'
import { useSyncState } from '../../lib/sync/state'

/**
 * Aggregate state of the outbox, in the header. The per-action indicators on job
 * rows answer "did that save"; this answers "is anything of mine still stuck on
 * this phone", which is the question someone asks before leaving a client's office.
 */
export function SyncChip() {
  const [open, setOpen] = useState(false)
  const { phase, online, lastSyncedAt, lastError } = useSyncState()

  const queue = useLiveQuery(() => db.outbox.toArray(), [], [])
  const pending = queue.filter((e) => e.state === 'pending')
  const failed = queue.filter((e) => e.state === 'failed')

  // A last-cycle error outranks a quiet queue: "Synced" while nothing can reach the
  // server is the one thing this chip must never say.
  const label = failed.length
    ? `${failed.length} failed`
    : !online
      ? pending.length
        ? `Offline — ${pending.length} pending`
        : 'Offline'
      : phase !== 'idle'
        ? 'Syncing…'
        : lastError
          ? 'Sync failed'
          : pending.length
            ? `${pending.length} pending`
            : 'Synced'

  const tone =
    failed.length || (online && lastError && phase === 'idle')
      ? 'border-status-cancelled/60 text-status-cancelled'
      : !online
        ? 'border-status-on-hold/60 text-status-on-hold'
        : 'border-white/15 text-white/60'

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`rounded-control border px-2 py-1 font-mono text-[11px] whitespace-nowrap hover:bg-white/10 ${tone}`}
      >
        {label}
      </button>

      {open && (
        <div className="rounded-card border-rule bg-card absolute top-9 right-0 z-30 w-80 border p-3 shadow-lg">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-sm font-semibold">Sync</h2>
            <button
              type="button"
              onClick={() => void syncNow()}
              disabled={!online || phase !== 'idle'}
              className="text-brass text-xs underline underline-offset-2 disabled:opacity-50"
            >
              Sync now
            </button>
          </div>

          <dl className="text-ink-soft mt-2 space-y-1 text-xs">
            <Row term="Last synced" value={lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString() : 'never'} />
            <Row term="Waiting to send" value={String(pending.length)} />
            <Row term="Failed" value={String(failed.length)} />
          </dl>

          {lastError && (
            <p className="rounded-control border-status-cancelled/30 text-status-cancelled mt-2 border px-2 py-1 text-xs">
              {lastError}
            </p>
          )}

          {failed.length > 0 && (
            <div className="border-rule mt-3 border-t pt-2">
              <div className="flex items-center justify-between">
                <span className="text-ink-soft text-xs">Rejected by the server</span>
                <button
                  type="button"
                  onClick={() => void retryFailed()}
                  className="text-brass text-xs underline underline-offset-2"
                >
                  Retry all
                </button>
              </div>
              <ul className="mt-1 space-y-1">
                {failed.map((entry) => (
                  <li key={entry.seq} className="rounded-control border-rule border px-2 py-1">
                    <div className="font-mono text-[11px]">
                      {entry.op} {entry.table_name}
                    </div>
                    <p className="text-ink-soft text-xs">{entry.last_error}</p>
                    <button
                      type="button"
                      onClick={() => void discardFailed(entry.seq!)}
                      className="text-ink-soft mt-1 text-[11px] underline underline-offset-2"
                    >
                      Discard
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <CacheStats />
        </div>
      )}
    </div>
  )
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt>{term}</dt>
      <dd className="text-ink font-mono">{value}</dd>
    </div>
  )
}

/**
 * Row counts and the browser's storage estimate. Logged where someone can see it so
 * that if the cache window ever does need tightening, the decision is made against
 * real usage rather than a guess.
 */
function CacheStats() {
  const stats = useLiveQuery(() => cacheStats(), [])
  if (!stats) return null

  const mb = (n: number | null) => (n === null ? '—' : `${(n / 1024 / 1024).toFixed(1)} MB`)

  return (
    <div className="border-rule text-ink-soft mt-3 space-y-1 border-t pt-2 text-xs">
      <Row term="Rows on this device" value={String(stats.total)} />
      <Row
        term="Jobs / clients / people"
        value={`${stats.rows.jobs} / ${stats.rows.clients} / ${stats.rows.profiles}`}
      />
      <Row term="Storage used" value={`${mb(stats.usage)} of ${mb(stats.quota)}`} />
    </div>
  )
}
