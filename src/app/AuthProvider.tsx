import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { clearLocalData, db } from '../lib/db'
import { supabase } from '../lib/supabase'
import { stopSync } from '../lib/sync/engine'
import { AuthContext } from './authContext'
import type { AuthState } from './authContext'

/**
 * Sign out, but not past unsent work without asking. Then drop everything this
 * device holds: the next person to pick up the phone must not find the last
 * one's client list sitting in it.
 */
async function signOut() {
  const pending = await db.outbox.count()
  if (
    pending > 0 &&
    !window.confirm(
      `${pending} change${pending === 1 ? '' : 's'} on this device ${pending === 1 ? 'has' : 'have'} not reached the server yet. ` +
        'Signing out now discards them. Continue?',
    )
  ) {
    return
  }
  stopSync()
  await clearLocalData()
  await supabase.auth.signOut()
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setReady(true)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  const value: AuthState = {
    status: !ready ? 'loading' : session ? 'signed-in' : 'signed-out',
    session,
    signOut,
  }

  return <AuthContext value={value}>{children}</AuthContext>
}
