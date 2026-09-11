import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useMe } from '../../app/useMe'
import { Button } from '../../components/Button'
import { EmptyState } from '../../components/EmptyState'
import { PageHeader } from '../../components/PageHeader'
import { Select } from '../../components/Select'
import { TextField } from '../../components/TextField'
import { Textarea } from '../../components/Textarea'
import { db } from '../../lib/db'
import { CATEGORY_LABEL, CATEGORY_OPTIONS } from '../../lib/labels'
import { createJobTemplate, updateJobTemplate } from '../../lib/sync/outbox'
import type { Frequency, JobCategory, JobPriority, JobTemplate } from '../../lib/types'
import { personName, useLookups } from '../jobs/useJobData'
import { GeneratePanel } from './GeneratePanel'
import { ScheduleStatus } from './ScheduleStatus'
import { formatDate } from '../../lib/dates'
import { FREQUENCIES, FREQUENCY_LABEL, dueDateFor, periodContaining } from './periods'

/**
 * Standing arrangements: this client has this job every month, and this person
 * does it. Postgres creates the jobs on the 1st; Generate is here for catching up
 * a period that was missed, or starting one early.
 */
export function RecurringPage() {
  const me = useMe()
  const templates = useLiveQuery(() => db.job_templates.toArray(), [], [] as JobTemplate[])
  const { clients, profiles, clientById, profileById } = useLookups()
  const [editing, setEditing] = useState<JobTemplate | 'new' | null>(null)
  const [generating, setGenerating] = useState(false)

  const active = templates.filter((t) => t.is_active)
  const byFrequency = FREQUENCIES.map((frequency) => ({
    frequency,
    items: templates
      .filter((t) => t.frequency === frequency)
      .sort((a, b) => (clientById.get(a.client_id)?.code ?? '').localeCompare(clientById.get(b.client_id)?.code ?? '')),
  })).filter((group) => group.items.length > 0)

  return (
    <section className="max-w-4xl">
      <PageHeader title="Recurring" count={active.length}>
        <Button variant="secondary" onClick={() => setGenerating((v) => !v)} disabled={active.length === 0}>
          {generating ? 'Close' : 'Generate jobs'}
        </Button>
        <Button onClick={() => setEditing('new')}>Add recurring job</Button>
      </PageHeader>

      <ScheduleStatus />

      {generating && me && (
        <GeneratePanel templates={active} actorId={me.id} onDone={() => setGenerating(false)} />
      )}

      {editing && (
        <TemplateForm
          key={editing === 'new' ? 'new' : editing.id}
          template={editing === 'new' ? undefined : editing}
          clients={clients.filter((c) => c.is_active)}
          people={profiles.filter((p) => p.is_active)}
          onDone={() => setEditing(null)}
        />
      )}

      {templates.length === 0 ? (
        <EmptyState
          title="Nothing recurring yet"
          detail="Set up the jobs that come round every month or quarter — a GST return per client, a quarterly TDS filing — and generate them in one go when the period starts."
        />
      ) : (
        byFrequency.map(({ frequency, items }) => (
          <div key={frequency} className="mb-6">
            <h2 className="text-ink-soft mb-2 text-xs font-semibold tracking-wide uppercase">
              {FREQUENCY_LABEL[frequency]}
              <span className="ml-2 font-mono font-normal">{items.length}</span>
            </h2>
            <ul className="grid gap-1.5">
              {items.map((template) => (
                <li key={template.id} className="border-rule bg-card border px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-ink-soft shrink-0 font-mono text-xs">
                      {clientById.get(template.client_id)?.code ?? '—'}
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-medium">{template.title}</span>
                    <span className="text-ink-soft text-xs">{CATEGORY_LABEL[template.category]}</span>
                    <span className="text-ink-soft text-xs">
                      {template.assigned_to ? personName(profileById.get(template.assigned_to)) : 'Unassigned'}
                    </span>
                    {!template.is_active && (
                      <span className="rounded-control border-rule text-ink-soft border px-1.5 py-0.5 text-[11px]">
                        Paused
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditing(template)}
                      className="text-brass shrink-0 text-xs underline underline-offset-2"
                    >
                      Change
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  )
}

type ClientOption = { id: string; code: string; name: string }
type PersonOption = { id: string; full_name: string; username: string }

function TemplateForm({
  template,
  clients,
  people,
  onDone,
}: {
  template?: JobTemplate
  clients: ClientOption[]
  people: PersonOption[]
  onDone: () => void
}) {
  const [form, setForm] = useState({
    client_id: template?.client_id ?? '',
    title: template?.title ?? '',
    category: (template?.category ?? 'gst_return') as JobCategory,
    frequency: (template?.frequency ?? 'monthly') as Frequency,
    assigned_to: template?.assigned_to ?? '',
    reviewer_id: template?.reviewer_id ?? '',
    priority: (template?.priority ?? 'normal') as JobPriority,
    description: template?.description ?? '',
    due_day: template?.due_day === null || template?.due_day === undefined ? '' : String(template.due_day),
    due_months_after: String(template?.due_months_after ?? 1),
  })

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))
  const valid = form.client_id !== '' && form.title.trim() !== ''

  async function save() {
    const shape = {
      client_id: form.client_id,
      title: form.title.trim(),
      description: form.description,
      category: form.category,
      frequency: form.frequency,
      assigned_to: form.assigned_to || null,
      reviewer_id: form.reviewer_id || null,
      priority: form.priority,
      due_day: form.due_day === '' ? null : Number(form.due_day),
      due_months_after: Number(form.due_months_after) || 0,
    }
    if (template) await updateJobTemplate(template.id, shape)
    else await createJobTemplate({ ...shape, is_active: true })
    onDone()
  }

  return (
    <div className="rounded-card border-rule bg-card mb-6 grid gap-4 border p-4 sm:grid-cols-2">
      <Select
        label="Client"
        value={form.client_id}
        onChange={(e) => set({ client_id: e.target.value })}
        options={[
          { value: '', label: 'Choose a client' },
          ...clients.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })),
        ]}
      />
      <Select
        label="How often"
        value={form.frequency}
        onChange={(e) => set({ frequency: e.target.value as Frequency })}
        options={FREQUENCIES.map((f) => ({ value: f, label: FREQUENCY_LABEL[f] }))}
      />

      <div className="sm:col-span-2">
        <TextField
          label="Title"
          value={form.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="GSTR-3B and GSTR-1 filing"
          hint="The period is added when the job is generated, so leave it out of the title"
        />
      </div>

      <Select
        label="Category"
        value={form.category}
        onChange={(e) => set({ category: e.target.value as JobCategory })}
        options={CATEGORY_OPTIONS}
      />
      <Select
        label="Priority"
        value={form.priority}
        onChange={(e) => set({ priority: e.target.value as JobPriority })}
        options={[
          { value: 'low', label: 'Low' },
          { value: 'normal', label: 'Normal' },
          { value: 'high', label: 'High' },
          { value: 'urgent', label: 'Urgent' },
        ]}
      />

      <Select
        label="Usually done by"
        value={form.assigned_to}
        onChange={(e) => set({ assigned_to: e.target.value })}
        options={[
          { value: '', label: 'Unassigned' },
          ...people.map((p) => ({ value: p.id, label: p.full_name || p.username })),
        ]}
      />
      <Select
        label="Reviewer"
        value={form.reviewer_id}
        onChange={(e) => set({ reviewer_id: e.target.value })}
        options={[
          { value: '', label: 'None' },
          ...people.map((p) => ({ value: p.id, label: p.full_name || p.username })),
        ]}
      />

      <div className="border-rule sm:col-span-2 sm:border-t sm:pt-4">
        <p className="text-ink-soft text-xs">
          <strong className="text-ink">When it is due.</strong> The firm&rsquo;s own rule, not a
          statutory one — nothing here knows the law. Leave the day blank and generated jobs
          arrive undated. A manager can change any individual job.
        </p>
      </div>

      <Select
        label="Due on the"
        value={form.due_day}
        onChange={(e) => set({ due_day: e.target.value })}
        options={[
          { value: '', label: 'No automatic date' },
          ...Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: dayLabel(i + 1) })),
        ]}
      />
      <Select
        label="Of the month"
        value={form.due_months_after}
        onChange={(e) => set({ due_months_after: e.target.value })}
        disabled={form.due_day === ''}
        options={[
          { value: '0', label: 'the period ends in' },
          { value: '1', label: 'after the period ends' },
          ...[2, 3, 4, 5, 6, 9, 12].map((n) => ({ value: String(n), label: `${n} months after` })),
        ]}
      />

      <div className="sm:col-span-2">
        <DueRulePreview
          frequency={form.frequency}
          day={form.due_day === '' ? null : Number(form.due_day)}
          monthsAfter={Number(form.due_months_after) || 0}
        />
      </div>

      <div className="sm:col-span-2">
        <Textarea
          label="Description"
          value={form.description}
          onChange={(e) => set({ description: e.target.value })}
          placeholder="Copied onto every job generated from this"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        <Button onClick={() => void save()} disabled={!valid}>
          {template ? 'Save changes' : 'Add recurring job'}
        </Button>
        {template && (
          <Button
            variant="secondary"
            onClick={() => void updateJobTemplate(template.id, { is_active: !template.is_active })}
          >
            {template.is_active ? 'Pause' : 'Resume'}
          </Button>
        )}
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        {!valid && <span className="text-ink-soft text-xs">A client and a title are the minimum.</span>}
      </div>
    </div>
  )
}

function dayLabel(day: number): string {
  const suffix =
    day % 10 === 1 && day !== 11
      ? 'st'
      : day % 10 === 2 && day !== 12
        ? 'nd'
        : day % 10 === 3 && day !== 13
          ? 'rd'
          : 'th'
  return `${day}${suffix}`
}

/**
 * The rule, worked through on a real period.
 *
 * An abstract "20th, 1 month after" is easy to set wrong and hard to check. Seeing
 * "Aug-2026 → due 20 Sep 2026" written out is what catches an off-by-one before
 * thirty jobs carry it.
 */
function DueRulePreview({
  frequency,
  day,
  monthsAfter,
}: {
  frequency: Frequency
  day: number | null
  monthsAfter: number
}) {
  if (day === null) {
    return (
      <p className="rounded-control border-rule text-ink-soft border border-dashed px-3 py-2 text-xs">
        Jobs will be created without a due date.
      </p>
    )
  }

  // The two periods before this one, so the rule is shown against real dates.
  const now = new Date()
  const examples = [periodContaining(now, frequency)]
  const earlier = new Date(examples[0].start)
  earlier.setDate(earlier.getDate() - 1)
  examples.push(periodContaining(earlier, frequency))

  return (
    <div className="rounded-control border-rule bg-brass-wash border px-3 py-2">
      <p className="text-ink-soft text-xs">For example</p>
      <ul className="mt-1 grid gap-0.5">
        {examples.reverse().map((p) => (
          <li key={p.key} className="font-mono text-xs">
            {p.label} → due {formatDate(dueDateFor(p.end, day, monthsAfter))}
          </li>
        ))}
      </ul>
    </div>
  )
}
