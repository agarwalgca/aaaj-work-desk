/** Dates the way the firm reads them: 12 Sep 2026, never 09/12/2026. */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Midnight local, which is what a `date` column means to a person. */
export function startOfDay(on: Date): Date {
  return new Date(on.getFullYear(), on.getMonth(), on.getDate())
}

/** Parse a Postgres `date` (YYYY-MM-DD) as a local day, not as UTC midnight. */
export function parseDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function formatDate(value: string | null): string {
  if (!value) return '—'
  const d = value.length === 10 ? parseDate(value) : new Date(value)
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function formatDateTime(value: string): string {
  const d = new Date(value)
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  return `${formatDate(value)}, ${time}`
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000)
}

/** "3 days late", "due today", "in 5 days" — the phrase a person would use. */
export function dueLabel(dueDate: string | null, today: Date): string {
  if (!dueDate) return 'No date'
  const days = daysBetween(today, parseDate(dueDate))
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  if (days === -1) return '1 day late'
  if (days < 0) return `${-days} days late`
  return `In ${days} days`
}

export function todayISO(on = new Date()): string {
  const d = startOfDay(on)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
