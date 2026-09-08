import { Monogram } from './Monogram'

/**
 * Firm identity. `size="lg"` is the login lockup; `size="sm"` is the app bar,
 * where the firm name gives way to the product name below 768px.
 */
export function Wordmark({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  if (size === 'lg') {
    return (
      <div className="flex flex-col items-center gap-4">
        <Monogram size={64} />
        <div className="text-center">
          <div className="font-serif text-2xl font-semibold tracking-wide text-ink">
            A A A J &amp; Associates
          </div>
          <div className="mt-1 text-xs tracking-[0.14em] text-ink-soft uppercase">
            Chartered Accountants
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <Monogram size={32} />
      <div className="leading-tight">
        <div className="font-serif text-base font-semibold text-white">AAAJ Work Desk</div>
        <div className="hidden text-[11px] tracking-[0.12em] text-white/55 uppercase sm:block">
          A A A J &amp; Associates
        </div>
      </div>
    </div>
  )
}
