import { useState } from 'react'
import { Button } from '../../components/Button'
import { TextField } from '../../components/TextField'
import { supabase } from '../../lib/supabase'
import { useSyncState } from '../../lib/sync/state'

/**
 * Where a new employee replaces the starting password a partner set for them.
 *
 * Online only, like adding an employee, and for the same reason: a password is
 * never written to the device, so there is nothing to queue.
 */
export function ChangePassword() {
  const { online } = useSyncState()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const mismatch = confirm !== '' && password !== confirm
  const valid = password.length >= 8 && password === confirm

  async function save() {
    setBusy(true)
    setError(null)
    setDone(false)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    setPassword('')
    setConfirm('')
    setDone(true)
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            setDone(false)
          }}
          hint="At least 8 characters"
        />
        <TextField
          label="Type it again"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value)
            setDone(false)
          }}
          hint={mismatch ? 'These do not match yet' : undefined}
        />
      </div>

      {error && (
        <p className="rounded-control border-status-cancelled/30 bg-status-cancelled/5 text-status-cancelled mt-3 border px-3 py-2 text-sm">
          {error}
        </p>
      )}
      {done && <p className="text-status-completed mt-3 text-sm">Password changed. Use it next time you sign in.</p>}
      {!online && <p className="text-ink-soft mt-3 text-xs">Changing your password needs a connection.</p>}

      <Button className="mt-3" onClick={() => void save()} disabled={!valid || busy || !online}>
        {busy ? 'Saving…' : 'Change password'}
      </Button>
    </>
  )
}
