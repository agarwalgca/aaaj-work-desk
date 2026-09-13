import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db'
import type { Category, JobCategory } from '../../lib/types'

/**
 * The firm's categories, ordered the way it set them.
 *
 * `active` is what a form offers. `bySlug` includes retired ones too, because a job
 * filed under a category that has since been retired still needs a name to show.
 */
export function useCategories() {
  const all = useLiveQuery(() => db.job_categories.toArray(), [])

  const sorted = (all ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
  const bySlug = new Map<JobCategory, Category>(sorted.map((c) => [c.slug, c]))

  return {
    loading: all === undefined,
    all: sorted,
    active: sorted.filter((c) => c.is_active),
    bySlug,
    /** A name for a slug — falls back to the slug itself rather than to nothing. */
    nameOf: (slug: JobCategory) => bySlug.get(slug)?.name ?? slug,
  }
}
