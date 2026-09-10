import { useState } from 'react'
import { Navigate } from 'react-router'
import { Button } from '../../components/Button'
import { TextField } from '../../components/TextField'
import { Wordmark } from '../../components/Wordmark'
import { supabase } from '../../lib/supabase'
import { emailForUsername } from '../../lib/username'
import { useAuth } from '../../app/authContext'

/** Wrong username and wrong password read the same, so the form is not an oracle. */
const REJECTED = 'Username or password is incorrect.'

/** Said whether or not the username exists, for the same reason. */
const RESET_SENT =
  'If that username has an account, a reset link is on its way to the address on file.'

export function LoginPage() {
  const { status } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (status === 'signed-in') return <Navigate to="/my-work" replace />

  async function signIn(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const email = await emailForUsername(username)
      if (!email) {
        setError(REJECTED)
        return
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message === 'Invalid login credentials' ? REJECTED : error.message)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  async function sendReset() {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const email = await emailForUsername(username)
      if (email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        })
        if (error) {
          setError(error.message)
          return
        }
      }
      setNotice(RESET_SENT)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="bg-paper flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Wordmark size="lg" />

        <form
          onSubmit={signIn}
          className="rounded-card border-rule bg-card mt-8 flex flex-col gap-4 border p-6"
        >
          <h1 className="font-serif text-lg font-semibold">Sign in</h1>

          <TextField
            label="Username"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && (
            <p className="rounded-control border-status-cancelled/30 bg-status-cancelled/5 text-status-cancelled border px-3 py-2 text-sm">
              {error}
            </p>
          )}
          {notice && (
            <p className="rounded-control border-rule bg-brass-wash text-ink-soft border px-3 py-2 text-sm">
              {notice}
            </p>
          )}

          <Button type="submit" disabled={busy}>
            {busy ? 'Working…' : 'Sign in'}
          </Button>

          <div className="border-rule flex items-center gap-3 border-t pt-4">
            <span className="text-ink-soft text-xs">Forgotten your password?</span>
            <button
              type="button"
              onClick={sendReset}
              disabled={busy || !username}
              className="text-brass text-xs font-medium underline underline-offset-2 disabled:opacity-60"
            >
              Email me a reset link
            </button>
          </div>
        </form>

        <p className="text-ink-soft/80 mt-6 text-center text-xs">
          Access is by invitation from a partner. There is no public sign-up.
        </p>
      </div>
    </main>
  )
}
