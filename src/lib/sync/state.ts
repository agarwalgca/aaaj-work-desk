import { create } from 'zustand'

/**
 * What the sync engine is doing right now. UI-only: counts of pending and failed
 * work come from Dexie through a live query, because those are data, not state.
 */
type SyncState = {
  phase: 'idle' | 'pulling' | 'pushing'
  online: boolean
  lastSyncedAt: string | null
  lastError: string | null
  set: (patch: Partial<Omit<SyncState, 'set'>>) => void
}

export const useSyncState = create<SyncState>((set) => ({
  phase: 'idle',
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  lastSyncedAt: null,
  lastError: null,
  set: (patch) => set(patch),
}))
