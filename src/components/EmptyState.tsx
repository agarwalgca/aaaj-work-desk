export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="rounded-card border-rule bg-card border border-dashed p-8 text-center">
      <p className="font-serif text-sm font-semibold">{title}</p>
      {detail && <p className="text-ink-soft mx-auto mt-1 max-w-sm text-sm">{detail}</p>}
    </div>
  )
}
