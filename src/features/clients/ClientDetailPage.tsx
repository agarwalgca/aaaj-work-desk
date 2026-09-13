import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useParams } from 'react-router'
import { useMe } from '../../app/useMe'
import { Button } from '../../components/Button'
import { EmptyState } from '../../components/EmptyState'
import { SkeletonPanel } from '../../components/Skeleton'
import { PageHeader } from '../../components/PageHeader'
import { db } from '../../lib/db'
import { updateClient } from '../../lib/sync/outbox'
import { byDueThenPriority, isOpen } from '../jobs/grouping'
import { JobRow } from '../jobs/JobRow'
import { ClientForm } from './ClientsPage'
import { useCategories } from '../categories/useCategories'

export function ClientDetailPage() {
  const { id } = useParams()
  const me = useMe()
  const client = useLiveQuery(async () => (id ? ((await db.clients.get(id)) ?? null) : null), [id])
  const jobs = useLiveQuery(
    async () => (id ? await db.jobs.where('client_id').equals(id).toArray() : []),
    [id],
    [],
  )
  const [editing, setEditing] = useState(false)
  const categories = useCategories()
  const today = new Date()

  if (client === undefined) {
    return (
      <section className="max-w-3xl">
        <SkeletonPanel lines={2} />
      </section>
    )
  }
  if (client === null) {
    return (
      <EmptyState
        title="Not available offline"
        detail="This client is not on this device. Connect to view it."
      />
    )
  }

  const canEdit = me?.role === 'partner' || me?.role === 'manager'
  const open = jobs.filter(isOpen).sort(byDueThenPriority)
  const closed = jobs.filter((job) => !isOpen(job))

  return (
    <section className="max-w-3xl">
      <PageHeader title={client.name}>
        {canEdit && !editing && (
          <>
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button
              variant="secondary"
              onClick={() => void updateClient(client.id, { is_active: !client.is_active })}
            >
              {client.is_active ? 'Deactivate' : 'Reactivate'}
            </Button>
          </>
        )}
      </PageHeader>

      {editing ? (
        <ClientForm client={client} categories={categories.active} onDone={() => setEditing(false)} />
      ) : (
        <dl className="rounded-card border-rule bg-card mb-6 grid grid-cols-2 gap-x-6 gap-y-2 border p-4 text-sm sm:grid-cols-4">
          <Field term="Code" value={client.code} mono />
          <Field term="GSTIN" value={client.gstin ?? '—'} mono />
          <Field term="PAN" value={client.pan ?? '—'} mono />
          <Field term="Status" value={client.is_active ? 'Active' : 'Inactive'} />
          <div className="col-span-2 sm:col-span-4">
            <dt className="text-ink-soft text-[11px] tracking-wide uppercase">Work</dt>
            <dd className="mt-1 flex flex-wrap gap-1">
              {(client.categories ?? []).length === 0 ? (
                <span className="text-ink-soft text-sm">None set</span>
              ) : (
                client.categories.map((slug) => (
                  <span key={slug} className="rounded-control border-rule border px-2 py-0.5 text-xs">
                    {categories.nameOf(slug)}
                  </span>
                ))
              )}
            </dd>
          </div>
        </dl>
      )}

      <h2 className="font-serif mb-2 text-base font-semibold">
        Open jobs<span className="text-ink-soft ml-2 font-mono text-sm font-normal">{open.length}</span>
      </h2>
      {open.length === 0 ? (
        <EmptyState title="Nothing open for this client" />
      ) : (
        <ul className="grid gap-1.5">
          {open.map((job) => (
            <JobRow key={job.id} job={job} client={client} today={today} />
          ))}
        </ul>
      )}

      {closed.length > 0 && (
        <>
          <h2 className="font-serif mt-6 mb-2 text-base font-semibold">
            Finished
            <span className="text-ink-soft ml-2 font-mono text-sm font-normal">{closed.length}</span>
          </h2>
          <ul className="grid gap-1.5">
            {closed.map((job) => (
              <JobRow key={job.id} job={job} client={client} today={today} />
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function Field({ term, value, mono }: { term: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-ink-soft text-[11px] tracking-wide uppercase">{term}</dt>
      <dd className={mono ? 'font-mono' : ''}>{value}</dd>
    </div>
  )
}
