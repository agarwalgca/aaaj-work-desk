import { useState } from 'react'
import { Navigate } from 'react-router'
import { Button } from '../../components/Button'
import { TextField } from '../../components/TextField'
import { Wordmark } from '../../components/Wordmark'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../app/authContext'

export function LoginPage() {
  const { status } = useAuth()
  const [email, setEmail] = useState('')
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
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setBusy(false)
  }

  async function sendMagicLink() {
    if (!email) {
      setError('Enter your firm email address first.')
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    // shouldCreateUser: false keeps this invite-only — an unknown address gets
    // no link and no account.
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: window.location.origin },
    })
    if (error) setError(error.message)
    else setNotice(`Sign-in link sent to ${email}. It expires in an hour.`)
    setBusy(false)
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
            label="Email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
              onClick={sendMagicLink}
              disabled={busy}
              className="text-brass text-xs font-medium underline underline-offset-2 disabled:opacity-60"
            >
              Email me a sign-in link
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
