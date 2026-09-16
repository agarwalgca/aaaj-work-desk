import type { ReactNode } from 'react'

const TONE = {
  error: 'border-status-cancelled/30 bg-status-cancelled/5 text-status-cancelled',
  info: 'border-rule bg-brass-wash text-ink-soft',
} as const

/** A sentence a form says back: what went wrong, or what just happened. */
export function Notice({
  tone = 'info',
  className = '',
  children,
}: {
  tone?: keyof typeof TONE
  className?: string
  children: ReactNode
}) {
  return (
    <p className={`rounded-control border px-3 py-2 text-sm ${TONE[tone]} ${className}`}>{children}</p>
  )
}
