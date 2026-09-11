import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db } from '../../lib/db'
import { syncNow } from '../../lib/sync/engine'
import { useSyncState } from '../../lib/sync/state'

const A_DAY = 24 * 60 * 60 * 1000

/**
 * The one warning that earns a banner.
 *
 * iOS evicts site storage after roughly a week without a visit, and a write that
 * has sat in the queue since yesterday is a write that may not survive to be sent.
 * Saying so is the only mitigation available from inside the browser.
 */
export function StaleWritesBanner() {
  const { online } = useSyncState()
  const oldest = useLiveQuery(
    async () => (await db.outbox.where('state').equals('pending').sortBy('seq'))[0] ?? null,
    [],
  )

  // Dexie re-runs the query when the data changes, but nothing changes when a
  // write merely gets older. The clock is the external system here.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5 * 60 * 1000)
    return () => clearInterval(timer)
  }, [])

  if (!oldest) return null
  const age = now - new Date(oldest.queued_at).getTime()
  if (age < A_DAY) return null

  const days = Math.floor(age / A_DAY)

  return (
    <div className="rounded-card border-status-on-hold/50 bg-status-on-hold/5 mb-4 flex flex-wrap items-center gap-3 border p-3">
      <p className="min-w-0 flex-1 text-sm">
        Changes made on this device have been waiting {days === 1 ? 'a day' : `${days} days`} to
        reach the server. Get online and send them before they are lost.
      </p>
      <button
        type="button"
        onClick={() => void syncNow()}
        disabled={!online}
        className="text-brass shrink-0 text-xs underline underline-offset-2 disabled:opacity-50"
      >
        {online ? 'Send now' : 'Waiting for a connection'}
      </button>
    </div>
  )
}
