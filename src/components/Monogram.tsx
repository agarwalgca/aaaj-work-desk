/** The firm mark: AAAJ in brass on an ink tile. Mirrors brand/monogram.svg. */
export function Monogram({ size = 36 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-grid shrink-0 place-items-center bg-ink text-brass font-serif font-semibold select-none"
      style={{
        width: size,
        height: size,
        borderRadius: size <= 24 ? 6 : 12,
        // 0.18em tracking adds a trailing gap; pull it back so the mark reads centred.
        fontSize: size * 0.3,
        letterSpacing: '0.18em',
        textIndent: '0.18em',
      }}
    >
      AAAJ
    </span>
  )
}
