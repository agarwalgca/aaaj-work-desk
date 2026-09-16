import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useMe } from '../../app/useMe'
import { Button } from '../../components/Button'
import { EmptyState } from '../../components/EmptyState'
import { Notice } from '../../components/Notice'
import { SkeletonPanel } from '../../components/Skeleton'
import { PageHeader } from '../../components/PageHeader'
import { Select } from '../../components/Select'
import { Textarea } from '../../components/Textarea'
import { TextField } from '../../components/TextField'
import { PRIORITY_OPTIONS } from '../../lib/labels'
import { createJob, createJobTemplate, updateJob } from '../../lib/sync/outbox'
import type { Category, Frequency, JobCategory, JobPriority } from '../../lib/types'
import { useCategories } from '../categories/useCategories'
import { PeriodField } from './PeriodField'
import {
  currentPeriodLabel,
  defaultPeriodType,
  detectPeriodType,
  periodForLabel,
  type PeriodType,
} from './periodTypes'
import { FREQUENCY_LABEL } from '../recurring/periods'
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
  category: '',
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
  const categories = useCategories()

  // The form picks a default period from the category the moment it first renders,
  // so it cannot open before the categories are known.
  if ((id && existing === undefined) || categories.loading) {
    return (
      <section className="max-w-2xl">
        <SkeletonPanel lines={5} />
      </section>
    )
  }

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
    : {
        ...BLANK,
        // GST return if the firm still has it, otherwise whatever comes first.
        category:
          categories.active.find((c) => c.slug === 'gst_return')?.slug ??
          categories.active[0]?.slug ??
          'other',
      }

  return (
    <JobForm
      key={id ?? 'new'}
      jobId={id}
      initial={initial}
      categories={categories.active}
      categoryBySlug={categories.bySlug}
    />
  )
}

/**
 * One form for both new and edit. "Save and add another" exists because the real
 * use is the first week of a month, when somebody sits down and allocates the same
 * return across thirty clients — and re-picking the client, category and period
 * each time would be the slowest part of it.
 */
function JobForm({
  jobId,
  initial,
  categories,
  categoryBySlug,
}: {
  jobId: string | undefined
  initial: Form
  categories: Category[]
  categoryBySlug: Map<JobCategory, Category>
}) {
  const editing = Boolean(jobId)
  const navigate = useNavigate()
  const me = useMe()
  const { clients, profiles } = useLookups()
  const periodFor = (slug: JobCategory) => defaultPeriodType(categoryBySlug.get(slug))

  const [form, setForm] = useState<Form>(() => {
    if (initial.period_label || jobId) return initial
    // A new job almost always concerns the period we are in, so start there
    // rather than with an empty select nobody asked to fill.
    return { ...initial, period_label: currentPeriodLabel(periodFor(initial.category)) }
  })
  const [busy, setBusy] = useState(false)
  const [justSaved, setJustSaved] = useState<string | null>(null)
  // Derived from the label on first render so editing a job keeps its shape, then
  // owned by the person: changing category must not silently relabel their job.
  const [periodType, setPeriodType] = useState<PeriodType>(() =>
    initial.period_label ? detectPeriodType(initial.period_label) : periodFor(initial.category),
  )
  const touchedPeriod = useRef(false)

  // Turning this on creates a standing arrangement as well as the job. It is a
  // different kind of thing from a one-off, so it is opt-in, off by default, and
  // says plainly what it will do before it does it.
  const [repeats, setRepeats] = useState(false)

  // A job that repeats monthly has to be labelled with a month — the template and
  // the scheduler both reason in whole periods, so free text cannot be linked.
  const repeatable = periodType !== 'custom'
  // Switching to free text after ticking the box would otherwise leave a standing
  // arrangement queued up that cannot be linked to any period.
  if (repeats && !repeatable) setRepeats(false)
  const frequency: Frequency = repeatable ? (periodType as Frequency) : 'monthly'

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

    if (jobId) {
      await updateJob(jobId, shape)
      navigate(`/jobs/${jobId}`, { replace: true })
      return
    }

    // The standing arrangement first, so the job can point at it. Linking the two
    // is what stops the 1st of the month producing this same period a second time.
    let templateId: string | undefined
    let periodKey: string | undefined
    if (repeats && repeatable) {
      templateId = await createJobTemplate({
        client_id: shape.client_id,
        title: shape.title,
        description: shape.description,
        category: shape.category,
        frequency,
        assigned_to: shape.assigned_to,
        reviewer_id: shape.reviewer_id,
        priority: shape.priority,
        is_active: true,
        due_day: null,
        due_months_after: 1,
      })
      periodKey = periodForLabel(shape.period_label, frequency)?.key
    }

    const created = await createJob({
      ...shape,
      assigned_by: me.id,
      status: 'not_started',
      ...(templateId && periodKey ? { template_id: templateId, period_key: periodKey } : {}),
    })
    setBusy(false)

    if (andAnother) {
      // Keep the things that repeat across a batch, clear the things that do not.
      setForm({ ...form, title: '', description: '' })
      setJustSaved(form.title.trim())
      return
    }
    navigate(`/jobs/${created}`, { replace: true })
  }

  return (
    <section className="max-w-2xl">
      <PageHeader title={editing ? 'Edit job' : 'New job'} />

      {justSaved && (
        <Notice className="mb-4">
          Saved “{justSaved}”. The client, category and period are still set — change the title and
          save the next one.
        </Notice>
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
          onChange={(e) => {
            const category = e.target.value as JobCategory
            set({ category })
            // Only steer the period while the person has not chosen one.
            if (!touchedPeriod.current) {
              const next = periodFor(category)
              setPeriodType(next)
              set({ period_label: currentPeriodLabel(next) })
            }
          }}
          options={[
            // A job filed under a category since retired keeps it rather than
            // silently jumping to another on edit.
            ...(categories.some((c) => c.slug === form.category)
              ? []
              : [{ value: form.category, label: categoryBySlug.get(form.category)?.name ?? form.category }]),
            ...categories.map((c) => ({ value: c.slug, label: c.name })),
          ]}
        />

        <div className="sm:col-span-2">
          <TextField
            label="Title"
            value={form.title}
            onChange={(e) => set({ title: e.target.value })}
            placeholder="GSTR-3B and GSTR-1 filing"
          />
        </div>

        <PeriodField
          value={form.period_label}
          type={periodType}
          onChangeValue={(period_label) => {
            touchedPeriod.current = true
            set({ period_label })
          }}
          onChangeType={(next) => {
            touchedPeriod.current = true
            setPeriodType(next)
          }}
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
          options={PRIORITY_OPTIONS}
        />
        <div />

        <div className="border-rule sm:col-span-2 sm:border-t sm:pt-4">
          <label className="flex items-start gap-2.5">
            <input
              type="checkbox"
              checked={repeats}
              disabled={editing || !repeatable}
              onChange={(e) => setRepeats(e.target.checked)}
              className="accent-brass mt-0.5 size-4 shrink-0"
            />
            <span className="text-sm">
              <span className="font-medium">This one comes round again</span>
              <span className="text-ink-soft block text-xs">
                {editing ? (
                  'Set up on the Recurring screen — a job being edited is one instance, not the arrangement behind it.'
                ) : !repeatable ? (
                  'Pick a month, quarter or financial year above first. Something that repeats has to be labelled with a whole period.'
                ) : repeats ? (
                  <>
                    A <strong>{FREQUENCY_LABEL[frequency].toLowerCase()}</strong> entry will be added
                    to Recurring as well, and later periods appear on their own on the 1st. This job
                    covers {form.period_label}.
                  </>
                ) : (
                  `Also add it to Recurring, ${FREQUENCY_LABEL[frequency].toLowerCase()}, so future periods create themselves.`
                )}
              </span>
            </span>
          </label>
        </div>

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
