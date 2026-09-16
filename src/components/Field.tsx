/** One term and its value in a description list. `mono` for codes and dates. */
export function Field({
  term,
  value,
  mono,
  note,
}: {
  term: string
  value: string
  mono?: boolean
  note?: string
}) {
  return (
    <div>
      <dt className="text-ink-soft text-[11px] tracking-wide uppercase">{term}</dt>
      <dd className={mono ? 'font-mono' : ''}>
        {value}
        {note && <span className="text-ink-soft ml-2 text-xs">{note}</span>}
      </dd>
    </div>
  )
}
