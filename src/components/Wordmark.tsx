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

  // Below 640px only the monogram survives: the header also has to hold a search
  // control, the sync chip and the avatar, and on a 375px screen the words are the
  // one part nobody needs in order to know where they are.
  return (
    <div className="flex shrink-0 items-center gap-3">
      <Monogram size={40} />
      <div className="hidden leading-tight sm:block">
        <div className="font-serif text-base font-semibold whitespace-nowrap text-white">
          AAAJ Work Desk
        </div>
        <div className="hidden text-[11px] tracking-[0.12em] whitespace-nowrap text-white/55 uppercase md:block">
          A A A J &amp; Associates
        </div>
      </div>
    </div>
  )
}
