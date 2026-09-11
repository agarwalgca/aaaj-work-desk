import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Button } from '../../components/Button'
import { TextField } from '../../components/TextField'
import { db } from '../../lib/db'
import { generateJobsForPeriod } from '../../lib/sync/outbox'
import type { Frequency, JobTemplate } from '../../lib/types'
import { useLookups } from '../jobs/useJobData'
import { FREQUENCIES, FREQUENCY_LABEL, recentPeriods } from './periods'

/**
 * Pick a frequency and a period, see exactly what is about to be created, then
 * create it.
 *
 * Showing the list first is the point. Thirty jobs appearing unannounced is how a
 * list stops being trusted, and what has already been generated is called out
 * rather than silently skipped — a manager wondering why August produced nothing
 * deserves to be told it was done last week.
 */
export function GeneratePanel({
  templates,
  actorId,
  onDone,
}: {
  templates: JobTemplate[]
  actorId: string
  onDone: () => void
}) {
  const { clientById } = useLookups()
  const [frequency, setFrequency] = useState<Frequency>('monthly')
  const [periodKey, setPeriodKey] = useState<string | null>(null)
  const [dueDate, setDueDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null)

  const periods = recentPeriods(new Date(), frequency, 4)
  const period = periods.find((p) => p.key === periodKey) ?? periods[0]
  const forFrequency = templates.filter((t) => t.frequency === frequency)

  // Which of these already exist for this period, read straight from the local
  // store so the answer is the same offline.
  const existing = useLiveQuery(
    async () => {
      const keys = await Promise.all(
        forFrequency.map(async (t) =>
          (await db.jobs.where('[template_id+period_key]').equals([t.id, period.key]).count()) > 0
            ? t.id
            : null,
        ),
      )
      return new Set(keys.filter((k): k is string => k !== null))
    },
    [forFrequency.map((t) => t.id).join(','), period.key],
    new Set<string>(),
  )

  const toCreate = forFrequency.filter((t) => !existing.has(t.id))

  async function generate() {
    setBusy(true)
    const outcome = await generateJobsForPeriod(forFrequency, period, actorId, dueDate || null)
    setResult(outcome)
    setBusy(false)
  }

  return (
    <div className="rounded-card border-rule bg-card mb-6 border p-4">
      <h2 className="font-serif text-base font-semibold">Generate jobs</h2>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-ink-soft text-[11px] font-medium tracking-wide uppercase">How often</span>
          <select
            value={frequency}
            onChange={(e) => {
              setFrequency(e.target.value as Frequency)
              setPeriodKey(null)
              setResult(null)
            }}
            className="rounded-control border-rule bg-card focus:border-brass h-9 border px-2 text-sm outline-none"
          >
            {FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {FREQUENCY_LABEL[f]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-ink-soft text-[11px] font-medium tracking-wide uppercase">Period</span>
          <select
            value={period.key}
            onChange={(e) => {
              setPeriodKey(e.target.value)
              setResult(null)
            }}
            className="rounded-control border-rule bg-card focus:border-brass h-9 border px-2 font-mono text-sm outline-none"
          >
            {periods.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <TextField
          label="Due date"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="font-mono"
          hint="Applied to every job created now"
        />
      </div>

      {result ? (
        <div className="rounded-control border-rule bg-brass-wash mt-4 border px-3 py-2 text-sm">
          Created {result.created} job{result.created === 1 ? '' : 's'} for {period.label}
          {result.skipped > 0 && `, and left ${result.skipped} alone that already existed`}.
          <Button variant="ghost" onClick={onDone} className="ml-2">
            Done
          </Button>
        </div>
      ) : (
        <>
          <div className="border-rule mt-4 border-t pt-3">
            {forFrequency.length === 0 ? (
              <p className="text-ink-soft text-sm">
                Nothing recurring is set to {FREQUENCY_LABEL[frequency].toLowerCase()}.
              </p>
            ) : (
              <>
                <p className="text-ink-soft mb-2 text-xs">
                  {toCreate.length} to create for <strong>{period.label}</strong>
                  {existing.size > 0 && `, ${existing.size} already generated`}
                </p>
                <ul className="grid gap-1">
                  {forFrequency.map((t) => {
                    const done = existing.has(t.id)
                    return (
                      <li
                        key={t.id}
                        className={`rounded-control flex items-center gap-2 px-2 py-1 text-sm ${
                          done ? 'text-ink-soft/60' : ''
                        }`}
                      >
                        <span className="font-mono text-xs">
                          {clientById.get(t.client_id)?.code ?? '—'}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{t.title}</span>
                        {done && <span className="font-mono text-[11px]">already generated</span>}
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button onClick={() => void generate()} disabled={busy || toCreate.length === 0}>
              {busy
                ? 'Creating…'
                : `Create ${toCreate.length} job${toCreate.length === 1 ? '' : 's'}`}
            </Button>
            <Button variant="ghost" onClick={onDone}>
              Cancel
            </Button>
            {!dueDate && toCreate.length > 0 && (
              <span className="text-ink-soft text-xs">
                Without a due date these are created undated — you can set one per job later.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
