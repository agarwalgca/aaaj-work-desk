import type { ReactNode } from 'react'

export function PageHeader({
  title,
  count,
  children,
}: {
  title: string
  count?: number
  children?: ReactNode
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-serif text-xl font-semibold">
        {title}
        {count !== undefined && (
          <span className="text-ink-soft ml-2 font-mono text-sm font-normal">{count}</span>
        )}
      </h1>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}
