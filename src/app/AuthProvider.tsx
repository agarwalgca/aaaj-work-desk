import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { AuthContext } from './authContext'
import type { AuthState } from './authContext'

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
    // Step 4 blocks this while the outbox is non-empty.
    signOut: async () => {
      await supabase.auth.signOut()
    },
  }

  return <AuthContext value={value}>{children}</AuthContext>
}
