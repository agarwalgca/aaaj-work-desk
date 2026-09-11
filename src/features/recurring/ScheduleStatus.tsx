import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useSyncState } from '../../lib/sync/state'

type Schedule = { jobname: string; schedule: string; active: boolean }
type State = { status: 'checking' | 'scheduled' | 'not-scheduled' | 'unknown'; schedule?: Schedule }

/**
 * Does the schedule the screen promises actually exist?
 *
 * "These are created automatically on the 1st" is a claim, and it is only true if
 * pg_cron happened to be enabled when the migration ran. Enable the extension
 * afterwards and everything looks right while nothing is scheduled — a failure
 * that stays quiet for a month and then surfaces as returns nobody filed.
 *
 * Checked once on mount rather than polled: it changes when somebody runs a
 * migration, which is not something worth watching for.
 */
export function ScheduleStatus() {
  const { online } = useSyncState()
  const [state, setState] = useState<State>({ status: 'checking' })

  useEffect(() => {
    if (!online) return

    let cancelled = false
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('recurring_schedule')
        if (cancelled) return
        // An older database without the function: say nothing rather than claim a
        // fault that may not exist.
        if (error) setState({ status: 'unknown' })
        else if (data?.length) setState({ status: 'scheduled', schedule: data[0] as Schedule })
        else setState({ status: 'not-scheduled' })
      } catch {
        if (!cancelled) setState({ status: 'unknown' })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [online])

  // Offline there is nothing to ask, and a guess either way would be worse than
  // silence.
  if (!online || state.status === 'checking' || state.status === 'unknown') return null

  if (state.status === 'not-scheduled') {
    return (
      <div className="rounded-card border-status-cancelled/50 bg-status-cancelled/5 mb-4 border p-3">
        <p className="text-sm">
          <strong>Nothing is scheduled.</strong> Jobs will not appear on the 1st — somebody has to
          press <strong>Generate jobs</strong> each period.
        </p>
        <p className="text-ink-soft mt-1 text-xs">
          The schedule is only created if <code className="font-mono">pg_cron</code> is enabled at
          the moment the migration runs. Enable it under Database → Extensions, then re-run{' '}
          <code className="font-mono">supabase/migrations/0005_schedule_status.sql</code>.
        </p>
      </div>
    )
  }

  return (
    <p className="rounded-card border-rule bg-brass-wash text-ink-soft mb-4 border px-3 py-2 text-sm">
      Created automatically at the start of each month, for the period that has just finished —
      October the 1st produces September&rsquo;s returns.{' '}
      <span className="font-mono text-xs">
        ({state.schedule?.schedule} UTC{state.schedule?.active === false && ', paused'})
      </span>{' '}
      Use <strong>Generate jobs</strong> to catch up a period that was missed, or to create one
      early.
    </p>
  )
}
