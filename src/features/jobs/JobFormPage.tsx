import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useMe } from '../../app/useMe'
import { Button } from '../../components/Button'
import { EmptyState } from '../../components/EmptyState'
import { PageHeader } from '../../components/PageHeader'
import { Select } from '../../components/Select'
import { Textarea } from '../../components/Textarea'
import { TextField } from '../../components/TextField'
import { CATEGORY_OPTIONS } from '../../lib/labels'
import { createJob, updateJob } from '../../lib/sync/outbox'
import type { JobCategory, JobPriority } from '../../lib/types'
import { personName, useJob, useLookups } from './useJobData'

type Form = {
  client_id: string
  title: string
  category: JobCategory
  period_label: string
  assigned_to: string
  reviewer_id: string
  due_date: string
  priority: JobPriority
  description: string
}

const BLANK: Form = {
  client_id: '',
  title: '',
  category: 'gst_return',
  period_label: '',
  assigned_to: '',
  reviewer_id: '',
  due_date: '',
  priority: 'normal',
  description: '',
}

/**
 * Resolves the job first, then hands its values to the form as initial state.
 *
 * The alternative — one component copying the loaded row into state inside an
 * effect — renders twice on every open and races the user if they start typing
 * before Dexie answers. Keying on the id makes React build a fresh form instead.
 */
export function JobFormPage() {
  const { id } = useParams()
  const existing = useJob(id)

  if (id && existing === undefined) return null

  if (id && existing === null) {
    return (
      <EmptyState
        title="Not available offline"
        detail="This job is not on this device, so it cannot be edited here. Connect and try again."
      />
    )
  }

  const initial: Form = existing
    ? {
        client_id: existing.client_id,
        title: existing.title,
        category: existing.category,
        period_label: existing.period_label,
        assigned_to: existing.assigned_to ?? '',
        reviewer_id: existing.reviewer_id ?? '',
        due_date: existing.due_date ?? '',
        priority: existing.priority,
        description: existing.description,
      }
    : BLANK

  return <JobForm key={id ?? 'new'} jobId={id} initial={initial} />
}

/**
 * One form for both new and edit. "Save and add another" exists because the real
 * use is the first week of a month, when somebody sits down and allocates the same
 * return across thirty clients — and re-picking the client, category and period
 * each time would be the slowest part of it.
 */
function JobForm({ jobId, initial }: { jobId: string | undefined; initial: Form }) {
  const editing = Boolean(jobId)
  const navigate = useNavigate()
  const me = useMe()
  const { clients, profiles } = useLookups()

  const [form, setForm] = useState<Form>(initial)
  const [busy, setBusy] = useState(false)
  const [justSaved, setJustSaved] = useState<string | null>(null)

  const activeClients = clients.filter((c) => c.is_active)
  const people = profiles.filter((p) => p.is_active)
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }))
  const valid = form.client_id !== '' && form.title.trim() !== ''

  async function save(andAnother: boolean) {
    if (!me || !valid) return
    setBusy(true)

    const shape = {
      client_id: form.client_id,
      title: form.title.trim(),
      description: form.description,
      category: form.category,
      period_label: form.period_label.trim(),
      assigned_to: form.assigned_to || null,
      reviewer_id: form.reviewer_id || null,
      priority: form.priority,
      due_date: form.due_date || null,
    }

    if (editing && jobId) {
      await updateJob(jobId, shape)
      navigate(`/jobs/${jobId}`, { replace: true })
      return
    }

    const created = await createJob({ ...shape, assigned_by: me.id, status: 'not_started' })
    setBusy(false)

    if (andAnother) {
      // Keep the things that repeat across a batch, clear the things that do not.
      setForm({ ...form, title: '', description: '', assigned_to: form.assigned_to })
      setJustSaved(form.title.trim())
      return
    }
    navigate(`/jobs/${created}`, { replace: true })
  }

  return (
    <section className="max-w-2xl">
      <PageHeader title={editing ? 'Edit job' : 'New job'} />

      {justSaved && (
        <p className="rounded-control border-rule bg-brass-wash text-ink-soft mb-4 border px-3 py-2 text-sm">
          Saved “{justSaved}”. The client, category and period are still set — change the title and
          save the next one.
        </p>
      )}

      <div className="rounded-card border-rule bg-card grid gap-4 border p-4 sm:grid-cols-2">
        <Select
          label="Client"
          value={form.client_id}
          onChange={(e) => set({ client_id: e.target.value })}
          options={[
            { value: '', label: 'Choose a client' },
            ...activeClients.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })),
          ]}
        />
        <Select
          label="Category"
          value={form.category}
          onChange={(e) => set({ category: e.target.value as JobCategory })}
          options={CATEGORY_OPTIONS}
        />

        <div className="sm:col-span-2">
          <TextField
            label="Title"
            value={form.title}
            onChange={(e) => set({ title: e.target.value })}
            placeholder="GSTR-3B and GSTR-1 filing"
          />
        </div>

        <TextField
          label="Period"
          value={form.period_label}
          onChange={(e) => set({ period_label: e.target.value })}
          placeholder="Aug-2026 or FY 2025-26"
          hint="Free text — whatever the firm calls it"
        />
        <TextField
          label="Due date"
          type="date"
          value={form.due_date}
          onChange={(e) => set({ due_date: e.target.value })}
          className="font-mono"
        />

        <Select
          label="Assigned to"
          value={form.assigned_to}
          onChange={(e) => set({ assigned_to: e.target.value })}
          options={[
            { value: '', label: 'Unassigned' },
            ...people.map((p) => ({ value: p.id, label: personName(p) })),
          ]}
        />
        <Select
          label="Reviewer"
          value={form.reviewer_id}
          onChange={(e) => set({ reviewer_id: e.target.value })}
          options={[
            { value: '', label: 'None' },
            ...people.map((p) => ({ value: p.id, label: personName(p) })),
          ]}
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
        <div />

        <div className="sm:col-span-2">
          <Textarea
            label="Description"
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="Anything the person doing this needs to know"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={() => void save(false)} disabled={!valid || busy}>
          {editing ? 'Save changes' : 'Save job'}
        </Button>
        {!editing && (
          <Button variant="secondary" onClick={() => void save(true)} disabled={!valid || busy}>
            Save and add another
          </Button>
        )}
        <Button variant="ghost" onClick={() => navigate(-1)}>
          Cancel
        </Button>
        {!valid && (
          <span className="text-ink-soft text-xs">A client and a title are the minimum.</span>
        )}
      </div>
    </section>
  )
}
