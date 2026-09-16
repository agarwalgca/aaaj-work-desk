import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link } from 'react-router'
import { useMe } from '../../app/useMe'
import { Button } from '../../components/Button'
import { EmptyState } from '../../components/EmptyState'
import { PageHeader } from '../../components/PageHeader'
import { SkeletonRows } from '../../components/Skeleton'
import { TextField } from '../../components/TextField'
import { db } from '../../lib/db'
import { createClient, updateClient } from '../../lib/sync/outbox'
import type { Category, Client, JobCategory } from '../../lib/types'
import { useCategories } from '../categories/useCategories'
import { countOpenBy } from '../jobs/grouping'

export function ClientsPage() {
  const me = useMe()
  const clients = useLiveQuery(() => db.clients.toArray(), [])
  const jobs = useLiveQuery(() => db.jobs.toArray(), [], [])
  const categories = useCategories()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<JobCategory | 'all'>('all')
  const [adding, setAdding] = useState(false)

  const canEdit = me?.role === 'partner' || me?.role === 'manager'
  const needle = query.trim().toLowerCase()

  const searched = (clients ?? []).filter(
    (c) =>
      !needle ||
      c.name.toLowerCase().includes(needle) ||
      c.code.toLowerCase().includes(needle) ||
      (c.gstin ?? '').toLowerCase().includes(needle),
  )

  // Counts are taken after the search and before the category filter, so each
  // chip says how many of what you are looking at fall under it.
  const countFor = (slug: JobCategory) => searched.filter((c) => (c.categories ?? []).includes(slug)).length
  const uncategorised = searched.filter((c) => !(c.categories ?? []).length).length

  const matches = searched
    .filter((c) =>
      category === 'all'
        ? true
        : category === '__none'
          ? !(c.categories ?? []).length
          : (c.categories ?? []).includes(category),
    )
    .sort((a, b) => a.code.localeCompare(b.code))

  const openByClient = countOpenBy(jobs, 'client_id')

  return (
    <section>
      <PageHeader title="Clients" count={matches.length}>
        {canEdit && <Button onClick={() => setAdding(true)}>Add client</Button>}
      </PageHeader>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name, code or GSTIN"
        className="rounded-control border-rule bg-card placeholder:text-ink-soft/50 focus:border-brass mb-3 h-10 w-full max-w-md border px-3 text-sm transition-colors duration-150 outline-none"
      />

      {categories.active.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by category">
          <Chip active={category === 'all'} onClick={() => setCategory('all')} label="All" count={searched.length} />
          {categories.active.map((c) => (
            <Chip
              key={c.slug}
              active={category === c.slug}
              onClick={() => setCategory(c.slug)}
              label={c.name}
              count={countFor(c.slug)}
            />
          ))}
          {uncategorised > 0 && (
            <Chip
              active={category === '__none'}
              onClick={() => setCategory('__none')}
              label="No category"
              count={uncategorised}
            />
          )}
        </div>
      )}

      {adding && <ClientForm categories={categories.active} onDone={() => setAdding(false)} />}

      {clients === undefined ? (
        <SkeletonRows count={5} />
      ) : matches.length === 0 ? (
        <EmptyState
          title="No clients here"
          detail={
            needle || category !== 'all' ? 'Nothing matches that search and filter.' : undefined
          }
        />
      ) : (
        <ul className="grid gap-1">
          {matches.map((client) => (
            <li key={client.id} className="border-rule bg-card border">
              <Link
                to={`/clients/${client.id}`}
                className="hover:bg-brass-wash/40 flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 transition-colors duration-150"
              >
                <span className="text-ink-soft w-16 font-mono text-xs">{client.code}</span>
                <span className="min-w-0 flex-1 text-sm font-medium">{client.name}</span>
                <span className="flex flex-wrap gap-1">
                  {(client.categories ?? []).map((slug) => (
                    <span
                      key={slug}
                      className="rounded-control border-rule text-ink-soft border px-2 py-0.5 text-[11px]"
                    >
                      {categories.nameOf(slug)}
                    </span>
                  ))}
                </span>
                {!client.is_active && (
                  <span className="rounded-control border-rule text-ink-soft border px-2 py-0.5 text-[11px]">
                    Inactive
                  </span>
                )}
                <span className="text-ink-soft w-14 text-right font-mono text-xs">{openByClient.get(client.id) ?? 0} open</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Chip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-control flex items-center gap-2 border px-3 py-1 text-xs transition-colors duration-150 ${
        active ? 'border-brass bg-brass-wash text-ink font-medium' : 'border-rule bg-card text-ink-soft hover:bg-brass-wash/50'
      }`}
    >
      {label}
      <span className="font-mono">{count}</span>
    </button>
  )
}

/** Add or edit. GSTIN and PAN are optional — plenty of clients have neither. */
export function ClientForm({
  client,
  categories,
  onDone,
}: {
  client?: Client
  categories: Category[]
  onDone: () => void
}) {
  const [name, setName] = useState(client?.name ?? '')
  const [code, setCode] = useState(client?.code ?? '')
  const [gstin, setGstin] = useState(client?.gstin ?? '')
  const [pan, setPan] = useState(client?.pan ?? '')
  const [picked, setPicked] = useState<Set<JobCategory>>(new Set(client?.categories ?? []))
  const valid = name.trim() !== '' && code.trim() !== ''

  const toggle = (slug: JobCategory) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })

  // A retired category a client already had stays visible so it is not dropped
  // just by opening and saving the form.
  const offered = [
    ...categories,
    ...(client?.categories ?? [])
      .filter((slug) => !categories.some((c) => c.slug === slug))
      .map((slug) => ({ slug, name: slug }) as Category),
  ]

  async function save() {
    const shape = {
      name: name.trim(),
      code: code.trim().toUpperCase(),
      gstin: gstin.trim() || null,
      pan: pan.trim().toUpperCase() || null,
      categories: [...picked],
    }
    if (client) await updateClient(client.id, shape)
    else await createClient({ ...shape, is_active: true })
    onDone()
  }

  return (
    <div className="rounded-card border-rule bg-card mb-4 grid gap-3 border p-4 sm:grid-cols-2">
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <TextField
        label="Code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="SUR-01"
        className="font-mono uppercase"
        hint="Short and unique — it is what appears on every job row"
      />
      <TextField label="GSTIN" value={gstin} onChange={(e) => setGstin(e.target.value)} className="font-mono" />
      <TextField label="PAN" value={pan} onChange={(e) => setPan(e.target.value)} className="font-mono uppercase" />

      <fieldset className="sm:col-span-2">
        <legend className="text-ink-soft mb-2 text-xs font-medium tracking-wide uppercase">
          Work for this client
        </legend>
        <div className="flex flex-wrap gap-2">
          {offered.map((c) => {
            const on = picked.has(c.slug)
            return (
              <label
                key={c.slug}
                className={`rounded-control flex cursor-pointer items-center gap-2 border px-3 py-1 text-sm transition-colors duration-150 ${
                  on ? 'border-brass bg-brass-wash' : 'border-rule hover:bg-brass-wash/50'
                }`}
              >
                <input type="checkbox" checked={on} onChange={() => toggle(c.slug)} className="accent-brass" />
                {c.name}
              </label>
            )
          })}
        </div>
        {offered.length === 0 && (
          <p className="text-ink-soft text-xs">No categories yet — add them on the Categories screen.</p>
        )}
      </fieldset>

      <div className="flex items-center gap-2 sm:col-span-2">
        <Button onClick={() => void save()} disabled={!valid}>
          {client ? 'Save changes' : 'Add client'}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
