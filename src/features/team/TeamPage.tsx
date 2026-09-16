import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useMe } from '../../app/useMe'
import { Button } from '../../components/Button'
import { PageHeader } from '../../components/PageHeader'
import { SavedIndicator } from '../../components/SavedIndicator'
import { TextField } from '../../components/TextField'
import { db } from '../../lib/db'
import { ROLE_LABEL } from '../../lib/labels'
import { updateProfile } from '../../lib/sync/outbox'
import type { Profile, UserRole } from '../../lib/types'
import { countOpenBy } from '../jobs/grouping'
import { personName } from '../jobs/useJobData'
import { AddEmployee } from './AddEmployee'

const ROLES: UserRole[] = ['partner', 'manager', 'staff']

export function TeamPage() {
  const me = useMe()
  const people = useLiveQuery(() => db.profiles.toArray(), [], [] as Profile[])
  const jobs = useLiveQuery(() => db.jobs.toArray(), [], [])
  const [editing, setEditing] = useState<string | null>(null)

  const openByPerson = countOpenBy(jobs, 'assigned_to')

  const ordered = [...people].sort(
    (a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || personName(a).localeCompare(personName(b)),
  )

  return (
    <section className="max-w-3xl">
      <PageHeader title="Team" count={people.filter((p) => p.is_active).length} />

      {me?.role === 'partner' && <AddEmployee />}

      <ul className="grid gap-1.5">
        {ordered.map((person) => (
          <li key={person.id} className="rounded-card border-rule bg-card border px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-brass bg-ink grid size-8 shrink-0 place-items-center rounded-full font-mono text-[11px]">
                {person.initials || person.username.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">
                  {personName(person)}
                  {person.id === me?.id && <span className="text-ink-soft ml-2 text-xs">you</span>}
                </div>
                <div className="text-ink-soft font-mono text-xs">{person.username}</div>
              </div>

              <span className="rounded-control border-rule border px-1.5 py-0.5 text-[11px]">
                {ROLE_LABEL[person.role]}
              </span>
              {!person.is_active && (
                <span className="rounded-control border-rule text-ink-soft border px-1.5 py-0.5 text-[11px]">
                  Deactivated
                </span>
              )}
              <span className="text-ink-soft font-mono text-xs">{openByPerson.get(person.id) ?? 0} open</span>
              <SavedIndicator rowId={person.id} />

              <button
                type="button"
                onClick={() => setEditing(editing === person.id ? null : person.id)}
                className="text-brass text-xs underline underline-offset-2"
              >
                {editing === person.id ? 'Close' : 'Change'}
              </button>
            </div>

            {editing === person.id && <EditPerson person={person} isMe={person.id === me?.id} />}
          </li>
        ))}
      </ul>
    </section>
  )
}

function EditPerson({ person, isMe }: { person: Profile; isMe: boolean }) {
  const [fullName, setFullName] = useState(person.full_name)
  const [initials, setInitials] = useState(person.initials)
  const [username, setUsername] = useState(person.username)

  return (
    <div className="border-rule mt-3 grid gap-3 border-t pt-3 sm:grid-cols-3">
      <TextField label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      <TextField
        label="Initials"
        value={initials}
        onChange={(e) => setInitials(e.target.value.toUpperCase().slice(0, 3))}
        className="font-mono uppercase"
      />
      <TextField
        label="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value.toLowerCase())}
        className="font-mono"
        hint="What they type to sign in"
      />

      <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
        <Button
          onClick={() =>
            void updateProfile(person.id, {
              full_name: fullName.trim(),
              initials: initials.trim(),
              username: username.trim(),
            })
          }
        >
          Save
        </Button>

        <label className="flex items-center gap-2 text-xs">
          <span className="text-ink-soft">Role</span>
          <select
            value={person.role}
            disabled={isMe}
            onChange={(e) => void updateProfile(person.id, { role: e.target.value as UserRole })}
            className="rounded-control border-rule bg-card focus:border-brass h-9 border px-2 text-sm outline-none disabled:opacity-60"
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABEL[role]}
              </option>
            ))}
          </select>
        </label>

        <Button
          variant="secondary"
          disabled={isMe}
          onClick={() => void updateProfile(person.id, { is_active: !person.is_active })}
        >
          {person.is_active ? 'Deactivate' : 'Reactivate'}
        </Button>

        {isMe && (
          <span className="text-ink-soft text-xs">
            You cannot change your own role or deactivate yourself.
          </span>
        )}
      </div>
    </div>
  )
}
