/**
 * Placeholders while Dexie answers.
 *
 * Returning null instead flashes an empty screen, which reads as "there is
 * nothing here" — the one thing it must not say while it is still looking. These
 * mirror the shape of what is coming so the layout does not jump when it lands.
 */
export function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <ul className="grid gap-1.5" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="border-rule bg-card border border-l-[3px] px-3 py-2">
          <div className="flex items-center gap-4">
            <Bar className="w-14" />
            <Bar className="max-w-64 flex-1" />
            <Bar className="hidden w-16 md:block" />
            <Bar className="hidden w-20 md:block" />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function SkeletonPanel({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-card border-rule bg-card border p-4" aria-busy="true" aria-label="Loading">
      <Bar className="w-24" />
      <div className="mt-3 h-6 w-2/3 animate-pulse rounded bg-current opacity-10" />
      <div className="mt-4 grid gap-2">
        {Array.from({ length: lines }, (_, i) => (
          <Bar key={i} className={i === lines - 1 ? 'w-1/3' : 'w-1/2'} />
        ))}
      </div>
    </div>
  )
}

function Bar({ className = '' }: { className?: string }) {
  return <div className={`h-3 animate-pulse rounded bg-current opacity-10 ${className}`} />
}
