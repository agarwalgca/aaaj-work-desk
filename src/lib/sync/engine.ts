import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../supabase'
import { flushOutbox } from './flush'
import { pullAll } from './pull'
import { useSyncState } from './state'

const FLUSH_INTERVAL_MS = 15_000
const REALTIME_DEBOUNCE_MS = 400

let timer: ReturnType<typeof setInterval> | null = null
let channel: RealtimeChannel | null = null
let realtimeTimer: ReturnType<typeof setTimeout> | null = null
let running = false

const state = () => useSyncState.getState()

function describe(cause: unknown): string {
  if (cause instanceof Error) return cause.message
  if (cause && typeof cause === 'object' && 'message' in cause) return String(cause.message)
  return String(cause)
}

/**
 * Push first, then pull.
 *
 * That order matters on a flaky connection: sending what this device knows before
 * asking what the server knows means a status change made offline is never
 * overwritten by a pull that arrives half a second earlier.
 */
async function cycle(reason: string) {
  if (running || !navigator.onLine) return
  running = true

  try {
    state().set({ phase: 'pushing', lastError: null })
    const flushed = await flushOutbox()

    state().set({ phase: 'pulling' })
    await pullAll()

    state().set({ phase: 'idle', lastSyncedAt: new Date().toISOString() })
    void flushed
  } catch (cause) {
    state().set({
      phase: 'idle',
      lastError: `${reason}: ${describe(cause)}`,
    })
  } finally {
    running = false
  }
}

/**
 * Flush without pulling. Used on the way out — a tab being hidden or closed has
 * seconds at best, and getting queued writes off the device is the only part that
 * cannot wait.
 */
async function flushOnly() {
  if (!navigator.onLine) return
  try {
    await flushOutbox()
  } catch {
    // The interval will try again. Nothing useful to say on the way out.
  }
}

const onOnline = () => {
  state().set({ online: true })
  void cycle('reconnected')
}

const onOffline = () => state().set({ online: false })

const onVisibility = () => {
  if (document.visibilityState === 'hidden') void flushOnly()
}

/**
 * Realtime tells us that something changed, never what. The payload is ignored on
 * purpose: applying it directly would bypass the RLS-filtered read and let a device
 * hold a row it is not entitled to. A nudge to pull keeps one source of truth.
 */
function subscribe() {
  channel = supabase
    .channel('work-desk')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, nudge)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'job_status_history' }, nudge)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'job_comments' }, nudge)
    .subscribe()
}

function nudge() {
  if (realtimeTimer) clearTimeout(realtimeTimer)
  realtimeTimer = setTimeout(() => void cycle('realtime'), REALTIME_DEBOUNCE_MS)
}

export function startSync() {
  if (timer) return

  void cycle('sign-in')
  timer = setInterval(() => void cycle('interval'), FLUSH_INTERVAL_MS)
  subscribe()

  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  document.addEventListener('visibilitychange', onVisibility)
}

export function stopSync() {
  if (timer) clearInterval(timer)
  timer = null

  if (realtimeTimer) clearTimeout(realtimeTimer)
  realtimeTimer = null

  if (channel) void supabase.removeChannel(channel)
  channel = null

  window.removeEventListener('online', onOnline)
  window.removeEventListener('offline', onOffline)
  document.removeEventListener('visibilitychange', onVisibility)

  useSyncState.setState({ phase: 'idle', lastError: null })
}

/** Manual "sync now" from the panel. */
export const syncNow = () => cycle('manual')
