import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link } from 'react-router'
import { useMe } from '../../app/useMe'
import { Button } from '../../components/Button'
import { EmptyState } from '../../components/EmptyState'
import { PageHeader } from '../../components/PageHeader'
import { TextField } from '../../components/TextField'
import { db } from '../../lib/db'
import { createClient, updateClient } from '../../lib/sync/outbox'
import type { Client } from '../../lib/types'
import { isOpen } from '../jobs/grouping'

export function ClientsPage() {
  const me = useMe()
  const clients = useLiveQuery(() => db.clients.toArray(), [], [] as Client[])
  const jobs = useLiveQuery(() => db.jobs.toArray(), [], [])
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)

  const canEdit = me?.role === 'partner' || me?.role === 'manager'
  const needle = query.trim().toLowerCase()
  const matches = clients
    .filter(
      (c) =>
        !needle ||
        c.name.toLowerCase().includes(needle) ||
        c.code.toLowerCase().includes(needle) ||
        (c.gstin ?? '').toLowerCase().includes(needle),
    )
    .sort((a, b) => a.code.localeCompare(b.code))

  const openCount = (clientId: string) =>
    jobs.filter((job) => job.client_id === clientId && isOpen(job)).length

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
        className="rounded-control border-rule bg-card placeholder:text-ink-soft/50 focus:border-brass mb-4 h-10 w-full max-w-md border px-3 text-sm outline-none"
      />

      {adding && <ClientForm onDone={() => setAdding(false)} />}

      {matches.length === 0 ? (
        <EmptyState title="No clients here" detail={needle ? 'Nothing matches that search.' : undefined} />
      ) : (
        <ul className="grid gap-1.5">
          {matches.map((client) => (
            <li key={client.id} className="border-rule bg-card border">
              <Link
                to={`/clients/${client.id}`}
                className="hover:bg-brass-wash/40 flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5"
              >
                <span className="text-ink-soft font-mono text-xs">{client.code}</span>
                <span className="flex-1 text-sm font-medium">{client.name}</span>
                {!client.is_active && (
                  <span className="rounded-control border-rule text-ink-soft border px-1.5 py-0.5 text-[11px]">
                    Inactive
                  </span>
                )}
                <span className="text-ink-soft font-mono text-xs">{openCount(client.id)} open</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Add or edit. GSTIN and PAN are optional — plenty of clients have neither. */
export function ClientForm({ client, onDone }: { client?: Client; onDone: () => void }) {
  const [name, setName] = useState(client?.name ?? '')
  const [code, setCode] = useState(client?.code ?? '')
  const [gstin, setGstin] = useState(client?.gstin ?? '')
  const [pan, setPan] = useState(client?.pan ?? '')
  const valid = name.trim() !== '' && code.trim() !== ''

  async function save() {
    const shape = {
      name: name.trim(),
      code: code.trim().toUpperCase(),
      gstin: gstin.trim() || null,
      pan: pan.trim().toUpperCase() || null,
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
