/** The firm mark: AAAJ in brass on an ink tile. Mirrors brand/monogram.svg. */
export function Monogram({ size = 36 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-grid shrink-0 place-items-center overflow-hidden bg-ink text-brass font-serif font-semibold select-none"
      style={{
        width: size,
        height: size,
        borderRadius: size <= 24 ? 6 : 12,
        // Ratio matches brand/monogram.svg: four tracked capitals span ~70% of the tile.
        // 0.18em tracking adds a trailing gap; textIndent pulls the mark back to centre.
        fontSize: size * 0.22,
        letterSpacing: '0.18em',
        textIndent: '0.18em',
      }}
    >
      AAAJ
    </span>
  )
}
