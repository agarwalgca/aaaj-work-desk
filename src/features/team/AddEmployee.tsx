import { useState } from 'react'
import { Button } from '../../components/Button'
import { Select } from '../../components/Select'
import { TextField } from '../../components/TextField'
import { ROLE_LABEL } from '../../lib/labels'
import { supabase } from '../../lib/supabase'
import { syncNow } from '../../lib/sync/engine'
import { useSyncState } from '../../lib/sync/state'
import type { UserRole } from '../../lib/types'

/**
 * A partner adds a colleague: name, username, email, role and a starting password.
 *
 * This is the one write in the app that does not go through the outbox, and on
 * purpose. The outbox persists to IndexedDB so a write survives a closed tab — and
 * a password must not survive anything. It goes straight to create_employee() over
 * HTTPS and is stored only as a hash, which means adding someone needs a
 * connection. The form says so rather than queueing something it must not keep.
 */
export function AddEmployee() {
  const { online } = useSyncState()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    full_name: '',
    username: '',
    email: '',
    role: 'staff' as UserRole,
    password: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState<{ name: string; username: string } | null>(null)

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))
  const valid =
    form.full_name.trim() !== '' &&
    form.username.trim().length >= 2 &&
    form.email.includes('@') &&
    form.password.length >= 8

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const { error } = await supabase.rpc('create_employee', {
        p_email: form.email,
        p_username: form.username,
        p_full_name: form.full_name,
        p_role: form.role,
        p_password: form.password,
      })
      if (error) {
        setError(error.message)
        return
      }
      setAdded({ name: form.full_name.trim(), username: form.username.trim().toLowerCase() })
      // Clear the password out of memory as soon as it has done its job.
      setForm({ full_name: '', username: '', email: '', role: 'staff', password: '' })
      void syncNow()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <div className="mb-4">
        <Button onClick={() => setOpen(true)}>Add employee</Button>
        {added && (
          <p className="text-status-completed mt-2 text-sm">
            {added.name} can now sign in as <strong className="font-mono">{added.username}</strong>. Tell
            them their starting password — they change it under Settings.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-card border-rule bg-card mb-6 border p-4">
      <h2 className="font-serif text-base font-semibold">Add employee</h2>
      <p className="text-ink-soft mt-1 text-xs">
        They can sign in straight away with the username and starting password you set here.
      </p>

      {!online && (
        <p className="rounded-control border-status-on-hold/40 text-status-on-hold mt-3 border px-3 py-2 text-xs">
          Adding someone needs a connection. Unlike other changes this is not saved to the device
          first, because a password must never be stored on it.
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <TextField
          label="Full name"
          value={form.full_name}
          onChange={(e) => set({ full_name: e.target.value })}
          placeholder="Meera Iyer"
          autoFocus
        />
        <Select
          label="Role"
          value={form.role}
          onChange={(e) => set({ role: e.target.value as UserRole })}
          options={(['staff', 'manager', 'partner'] as UserRole[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
        />
        <TextField
          label="Username"
          value={form.username}
          onChange={(e) => set({ username: e.target.value.toLowerCase().replace(/\s/g, '') })}
          placeholder="meera"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="font-mono"
          hint="What they type to sign in. Not case-sensitive."
        />
        <TextField
          label="Email"
          type="email"
          value={form.email}
          onChange={(e) => set({ email: e.target.value })}
          placeholder="meera@aaaj.co.in"
          autoCapitalize="none"
          hint="Used only for resetting a forgotten password"
        />
        <TextField
          label="Starting password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={(e) => set({ password: e.target.value })}
          hint="At least 8 characters. They should change it after signing in."
        />
      </div>

      {error && (
        <p className="rounded-control border-status-cancelled/30 bg-status-cancelled/5 text-status-cancelled mt-3 border px-3 py-2 text-sm">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={() => void submit()} disabled={!valid || busy || !online}>
          {busy ? 'Adding…' : 'Add employee'}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setOpen(false)
            setError(null)
            setForm((f) => ({ ...f, password: '' }))
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
