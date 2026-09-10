import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../../components/Button'
import { TextField } from '../../components/TextField'
import { Wordmark } from '../../components/Wordmark'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../app/authContext'

/**
 * Where the emailed reset link lands. Supabase puts the recovery tokens in the URL
 * fragment and the client is configured with detectSessionInUrl, so by the time
 * this renders the visitor already holds a short-lived session — enough to set a
 * password and nothing else they could not do anyway.
 */
export function ResetPasswordPage() {
  const { status } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (password !== confirm) {
      setError('The two passwords do not match.')
      return
    }
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setBusy(false)
      return
    }
    navigate('/my-work', { replace: true })
  }

  return (
    <main className="bg-paper flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Wordmark size="lg" />

        <div className="rounded-card border-rule bg-card mt-8 border p-6">
          <h1 className="font-serif text-lg font-semibold">Set a new password</h1>

          {status === 'loading' && (
            <p className="text-ink-soft mt-3 text-sm">Checking your link…</p>
          )}

          {status === 'signed-out' && (
            <p className="text-ink-soft mt-3 text-sm">
              This link has expired or has already been used. Go back to{' '}
              <a href="/login" className="text-brass underline underline-offset-2">
                sign in
              </a>{' '}
              and request another, or ask a partner to set a password for you.
            </p>
          )}

          {status === 'signed-in' && (
            <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
              <TextField
                label="New password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                hint="At least 8 characters"
              />
              <TextField
                label="Confirm password"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />

              {error && (
                <p className="rounded-control border-status-cancelled/30 bg-status-cancelled/5 text-status-cancelled border px-3 py-2 text-sm">
                  {error}
                </p>
              )}

              <Button type="submit" disabled={busy}>
                {busy ? 'Saving…' : 'Save password'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}
