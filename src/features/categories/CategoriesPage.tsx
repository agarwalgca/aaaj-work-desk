import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Button } from '../../components/Button'
import { PageHeader } from '../../components/PageHeader'
import { SavedIndicator } from '../../components/SavedIndicator'
import { Select } from '../../components/Select'
import { SkeletonRows } from '../../components/Skeleton'
import { TextField } from '../../components/TextField'
import { db } from '../../lib/db'
import { createCategory, updateCategory } from '../../lib/sync/outbox'
import type { Category } from '../../lib/types'
import { PERIOD_TYPE_LABEL, type PeriodType } from '../jobs/periodTypes'
import { useCategories } from './useCategories'

const PERIOD_OPTIONS = (Object.keys(PERIOD_TYPE_LABEL) as PeriodType[]).map((value) => ({
  value,
  label: PERIOD_TYPE_LABEL[value],
}))

/**
 * The kinds of work the firm does.
 *
 * Adding one is immediate and needs no deploy. Removing one is not offered —
 * jobs and clients are filed under it — so a category is retired instead: it
 * stops appearing in forms, and everything already filed under it keeps its name.
 */
export function CategoriesPage() {
  const { loading, all } = useCategories()
  const [adding, setAdding] = useState(false)

  // How much each category is used, so retiring a busy one is a visible decision.
  const usage = useLiveQuery(async () => {
    const counts = new Map<string, { jobs: number; clients: number }>()
    for (const job of await db.jobs.toArray()) {
      const c = counts.get(job.category) ?? { jobs: 0, clients: 0 }
      c.jobs += 1
      counts.set(job.category, c)
    }
    for (const client of await db.clients.toArray()) {
      for (const slug of client.categories ?? []) {
        const c = counts.get(slug) ?? { jobs: 0, clients: 0 }
        c.clients += 1
        counts.set(slug, c)
      }
    }
    return counts
  }, [])

  return (
    <section className="max-w-3xl">
      <PageHeader title="Categories" count={all.filter((c) => c.is_active).length}>
        {!adding && <Button onClick={() => setAdding(true)}>Add category</Button>}
      </PageHeader>

      <p className="text-ink-soft mb-4 text-sm">
        The kinds of work the firm does. <strong>Usually measured in</strong> decides the period a
        new job starts on — a GST return opens on this month, an audit on this financial year.
      </p>

      {adding && <CategoryForm onDone={() => setAdding(false)} />}

      {loading ? (
        <SkeletonRows count={6} />
      ) : (
        <ul className="grid gap-2">
          {all.map((category) => (
            <CategoryRow
              key={category.id}
              category={category}
              jobs={usage?.get(category.slug)?.jobs ?? 0}
              clients={usage?.get(category.slug)?.clients ?? 0}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function CategoryRow({ category, jobs, clients }: { category: Category; jobs: number; clients: number }) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <li>
        <CategoryForm category={category} onDone={() => setEditing(false)} />
      </li>
    )
  }

  return (
    <li className="border-rule bg-card border px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className={`min-w-0 flex-1 text-sm font-medium ${category.is_active ? '' : 'text-ink-soft line-through'}`}>
          {category.name}
        </span>
        <span className="text-ink-soft text-xs">{PERIOD_TYPE_LABEL[category.default_period]}</span>
        <span className="text-ink-soft w-32 text-right font-mono text-xs">
          {jobs} job{jobs === 1 ? '' : 's'} · {clients} client{clients === 1 ? '' : 's'}
        </span>
        <SavedIndicator rowId={category.id} />
        {!category.is_active && (
          <span className="rounded-control border-rule text-ink-soft border px-2 py-0.5 text-[11px]">Retired</span>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-brass text-xs underline underline-offset-2"
        >
          Change
        </button>
      </div>
    </li>
  )
}

function CategoryForm({ category, onDone }: { category?: Category; onDone: () => void }) {
  const [name, setName] = useState(category?.name ?? '')
  const [period, setPeriod] = useState<PeriodType>(category?.default_period ?? 'custom')
  const valid = name.trim() !== ''

  async function save() {
    if (category) await updateCategory(category.id, { name: name.trim(), default_period: period })
    else await createCategory({ name: name.trim(), default_period: period })
    onDone()
  }

  return (
    <div className="rounded-card border-rule bg-card mb-4 grid gap-4 border p-4 sm:grid-cols-2">
      <TextField
        label="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Professional tax"
        autoFocus
      />
      <Select
        label="Usually measured in"
        value={period}
        onChange={(e) => setPeriod(e.target.value as PeriodType)}
        options={PERIOD_OPTIONS}
      />
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        <Button onClick={() => void save()} disabled={!valid}>
          {category ? 'Save changes' : 'Add category'}
        </Button>
        {category && (
          <Button
            variant="secondary"
            onClick={() => void updateCategory(category.id, { is_active: !category.is_active }).then(onDone)}
          >
            {category.is_active ? 'Retire' : 'Bring back'}
          </Button>
        )}
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        {category?.is_active && (
          <span className="text-ink-soft text-xs">
            Retiring hides it from forms. Jobs and clients already under it keep it.
          </span>
        )}
      </div>
    </div>
  )
}
