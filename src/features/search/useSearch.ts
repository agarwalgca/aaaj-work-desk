import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db } from '../../lib/db'
import { supabase } from '../../lib/supabase'
import type { Job } from '../../lib/types'
import { useSyncState } from '../../lib/sync/state'

type SearchHit = { job: Job; clientCode: string; clientName: string }

/**
 * Two searches wearing one field.
 *
 * Online it asks Postgres, which can see jobs this device never cached. Offline it
 * is a substring match over what is here: titles, client names and client codes.
 * Less clever about stems and plurals, but it works with no bars of signal, and
 * the field says "Searching saved jobs" so the narrower reach is visible rather
 * than felt as an absence of results.
 */
export function useSearch(query: string) {
  const { online } = useSyncState()
  const needle = query.trim().toLowerCase()
  const [remote, setRemote] = useState<{ forQuery: string; hits: SearchHit[] } | null>(null)

  const local = useLiveQuery(
    async () => {
      if (needle.length < 2) return []
      const clients = await db.clients.toArray()
      const byId = new Map(clients.map((c) => [c.id, c]))
      const matchingClients = new Set(
        clients
          .filter(
            (c) =>
              c.name.toLowerCase().includes(needle) || c.code.toLowerCase().includes(needle),
          )
          .map((c) => c.id),
      )

      const jobs = await db.jobs.toArray()
      return jobs
        .filter(
          (job) =>
            job.title.toLowerCase().includes(needle) ||
            job.period_label.toLowerCase().includes(needle) ||
            matchingClients.has(job.client_id),
        )
        .slice(0, 40)
        .map((job) => ({
          job,
          clientCode: byId.get(job.client_id)?.code ?? '—',
          clientName: byId.get(job.client_id)?.name ?? '',
        }))
    },
    [needle],
    [] as SearchHit[],
  )

  useEffect(() => {
    if (!online || needle.length < 2) return

    let cancelled = false
    const timer = setTimeout(async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('*, clients(code, name)')
        .is('deleted_at', null)
        .or(`title.ilike.%${needle}%,period_label.ilike.%${needle}%`)
        .order('updated_at', { ascending: false })
        .limit(40)

      if (cancelled) return
      // A failed request leaves the local answer standing rather than blanking
      // the list: fewer results is better than none.
      if (error || !data) return

      setRemote({
        forQuery: needle,
        hits: (data as Array<Job & { clients: { code: string; name: string } | null }>).map((row) => ({
          job: row,
          clientCode: row.clients?.code ?? '—',
          clientName: row.clients?.name ?? '',
        })),
      })
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [needle, online])

  // Postgres sees more than this device does, so prefer its answer — but only
  // while it still belongs to what is in the box.
  const fresh = online && remote?.forQuery === needle ? remote.hits : null
  const searching = online && needle.length >= 2 && !fresh

  return { hits: fresh ?? local, scope: fresh ? 'everything' : 'saved', searching, online }
}
