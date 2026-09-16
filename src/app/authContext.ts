import type { Session } from '@supabase/supabase-js'
import { createContext, use } from 'react'

export type AuthState = {
  /** 'loading' only until the persisted session has been read from storage. */
  status: 'loading' | 'signed-in' | 'signed-out'
  session: Session | null
  /** Asks first while the outbox is not empty, and clears the device on the way out. */
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth() {
  const ctx = use(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
