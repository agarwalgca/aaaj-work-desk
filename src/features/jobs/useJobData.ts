import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db'
import type { Client, Job, Profile } from '../../lib/types'

/** Lookup maps, so a row can name its client without a query per row. */
export function useClients() {
  return useLiveQuery(() => db.clients.toArray(), [], [] as Client[])
}

export function useProfiles() {
  return useLiveQuery(() => db.profiles.toArray(), [], [] as Profile[])
}

export function useLookups() {
  const clients = useClients()
  const profiles = useProfiles()
  return {
    clients,
    profiles,
    clientById: new Map(clients.map((c) => [c.id, c])),
    profileById: new Map(profiles.map((p) => [p.id, p])),
  }
}

export function useAllJobs() {
  return useLiveQuery(() => db.jobs.toArray(), [], [] as Job[])
}

/** Everything assigned to me or waiting on my review. */
export function useMyJobs(uid: string | undefined) {
  return useLiveQuery(
    async () => {
      if (!uid) return []
      const mine = await db.jobs.where('assigned_to').equals(uid).toArray()
      const reviewing = await db.jobs.where('reviewer_id').equals(uid).toArray()
      const seen = new Set(mine.map((j) => j.id))
      return [...mine, ...reviewing.filter((j) => !seen.has(j.id))]
    },
    [uid],
    [] as Job[],
  )
}

/**
 * A job and everything hanging off it. `undefined` means Dexie has not answered
 * yet; `null` means it answered and there is no such job here — which is not the
 * same thing as the job not existing, and the screen says so.
 */
export function useJob(id: string | undefined) {
  return useLiveQuery(async () => (id ? ((await db.jobs.get(id)) ?? null) : null), [id])
}

export function useJobHistory(jobId: string | undefined) {
  return useLiveQuery(
    async () =>
      jobId
        ? (await db.job_status_history.where('job_id').equals(jobId).toArray()).sort((a, b) =>
            a.changed_at < b.changed_at ? -1 : 1,
          )
        : [],
    [jobId],
    [],
  )
}

export function useJobComments(jobId: string | undefined) {
  return useLiveQuery(
    async () =>
      jobId
        ? (await db.job_comments.where('job_id').equals(jobId).toArray()).sort((a, b) =>
            a.created_at < b.created_at ? -1 : 1,
          )
        : [],
    [jobId],
    [],
  )
}

export const personName = (profile: Profile | undefined) =>
  profile?.full_name || profile?.username || 'Unassigned'
