import { create } from 'zustand'
import type { JobCategory, JobPriority, JobStatus } from '../../lib/types'

/**
 * Board filters live here rather than in the URL or in component state, so that
 * walking into a job and coming back does not throw away the view someone spent
 * four clicks building. UI-only: nothing here is ever persisted or synced.
 */
export type BoardFilters = {
  status: JobStatus | 'all' | 'open'
  assignee: string | 'all' | 'unassigned'
  client: string | 'all'
  category: JobCategory | 'all'
  priority: JobPriority | 'all'
  dueFrom: string
  dueTo: string
  view: 'list' | 'workload'
}

const EMPTY: BoardFilters = {
  status: 'open',
  assignee: 'all',
  client: 'all',
  category: 'all',
  priority: 'all',
  dueFrom: '',
  dueTo: '',
  view: 'list',
}

type Store = BoardFilters & {
  set: (patch: Partial<BoardFilters>) => void
  reset: () => void
}

export const useBoardFilters = create<Store>((set) => ({
  ...EMPTY,
  set: (patch) => set(patch),
  reset: () => set(EMPTY),
}))

/** How many filters are actually narrowing anything, for the "Clear" affordance. */
export function activeFilterCount(f: BoardFilters): number {
  return [
    f.status !== 'open',
    f.assignee !== 'all',
    f.client !== 'all',
    f.category !== 'all',
    f.priority !== 'all',
    f.dueFrom !== '',
    f.dueTo !== '',
  ].filter(Boolean).length
}
