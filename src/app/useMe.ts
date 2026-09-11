import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { useAuth } from './authContext'

/**
 * The signed-in person's own profile, read from Dexie like everything else.
 *
 * Undefined means "not known yet" — the first pull has not landed. Screens that
 * gate on role must wait for it rather than assume the least privilege, or a
 * partner would watch their own nav flicker on every cold start.
 */
export function useMe() {
  const { session } = useAuth()
  const uid = session?.user.id
  return useLiveQuery(async () => (uid ? ((await db.profiles.get(uid)) ?? null) : null), [uid])
}
