import type { Session } from '@supabase/supabase-js'
import { createContext, use, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'

type AuthState = {
  /** 'loading' only until the persisted session has been read from storage. */
  status: 'loading' | 'signed-in' | 'signed-out'
  session: Session | null
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

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

export function useAuth() {
  const ctx = use(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
