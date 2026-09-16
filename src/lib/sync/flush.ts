import { db } from '../db'
import { supabase } from '../supabase'
import type { OutboxEntry } from '../types'

const MAX_BACKOFF_MS = 5 * 60 * 1000

/** Doubling, capped at five minutes. Attempt 1 waits 2s, attempt 8 waits the cap. */
export function backoffMs(attempts: number) {
  return Math.min(2 ** attempts * 1000, MAX_BACKOFF_MS)
}

/**
 * PostgREST codes that describe a moment, not a mistake.
 *
 * PGRST301 is an expired or malformed JWT — which is what every device sees for
 * the second or two around a token refresh. Treating it as permanent would take a
 * queue of perfectly good writes and bin them because the access token aged out
 * while the phone was in somebody's pocket. PGRST000 and PGRST001 are the database
 * being unreachable, which is likewise a thing that stops being true.
 */
const RECOVERABLE = new Set(['PGRST301', 'PGRST000', 'PGRST001', 'PGRST002'])

/**
 * Is this refusal worth retrying?
 *
 * A dropped connection is. An RLS rejection, a constraint violation, or a job that
 * was reassigned away while the entry sat in the queue are not — retrying those
 * forever would bury a real problem in a loop. They move to 'failed' and appear in
 * the sync panel for someone to look at.
 */
export function isPermanent(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  const code = error.code ?? ''
  if (RECOVERABLE.has(code)) return false

  // 42501 insufficient privilege, 23xxx integrity violation, 22xxx bad data,
  // P0001 a raise from one of our own triggers, PGRST* a request PostgREST refused.
  return (
    code.startsWith('42') ||
    code.startsWith('23') ||
    code.startsWith('22') ||
    code === 'P0001' ||
    code.startsWith('PGRST')
  )
}

async function push(entry: OutboxEntry) {
  const { table_name, op, row_id, payload, client_updated_at } = entry

  if (table_name === 'job_status_history' || table_name === 'job_comments') {
    // Append-only, client-generated ids: a replay is a no-op by construction.
    return supabase.from(table_name).upsert(payload, { onConflict: 'id', ignoreDuplicates: true })
  }

  if (op === 'insert') {
    return supabase.from(table_name).upsert(payload, { onConflict: 'id', ignoreDuplicates: true })
  }

  // Last write wins on updated_at, and the server wins a tie: only apply if the
  // stored row is strictly older than the edit that is being replayed.
  return supabase
    .from(table_name)
    .update(payload)
    .eq('id', row_id)
    .lt('updated_at', client_updated_at)
}

/**
 * Drain in FIFO order and stop at the first entry that could not go through for a
 * transient reason. Order is the point: a job insert followed by two status changes
 * has to arrive in that order or the later writes have nothing to land on.
 */
export async function flushOutbox(): Promise<void> {
  const at = new Date().toISOString()

  const queue = await db.outbox.where('state').equals('pending').sortBy('seq')

  for (const entry of queue) {
    // Still backing off. Everything behind it waits too, or the order is lost.
    if (entry.next_attempt_at > at) return

    let error: { code?: string; message?: string } | null = null
    try {
      const response = await push(entry)
      error = response.error
    } catch (cause) {
      // fetch itself failed: offline, DNS, TLS. Always worth another go.
      error = { message: cause instanceof Error ? cause.message : String(cause) }
    }

    if (!error) {
      await db.outbox.delete(entry.seq!)
      continue
    }

    const attempts = entry.attempts + 1

    if (isPermanent(error)) {
      await db.outbox.update(entry.seq!, {
        state: 'failed',
        attempts,
        last_error: error.message ?? 'Rejected by the server',
      })
      continue
    }

    await db.outbox.update(entry.seq!, {
      attempts,
      last_error: error.message ?? 'Could not reach the server',
      next_attempt_at: new Date(Date.now() + backoffMs(attempts)).toISOString(),
    })
    return
  }
}

/** Manual retry from the sync panel: put failed entries back at the front. */
export async function retryFailed() {
  const at = new Date().toISOString()
  const failed = await db.outbox.where('state').equals('failed').toArray()
  await Promise.all(
    failed.map((entry) =>
      db.outbox.update(entry.seq!, { state: 'pending', attempts: 0, next_attempt_at: at }),
    ),
  )
  return failed.length
}

/** Give up on an entry the server will never accept. */
export async function discardFailed(seq: number) {
  await db.outbox.delete(seq)
}
