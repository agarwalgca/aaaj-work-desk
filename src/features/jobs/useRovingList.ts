import { useCallback, useRef } from 'react'

/**
 * Arrow-key movement through a list of rows.
 *
 * A manager working the Board on a desktop is comparing dates down a column, and
 * reaching for the mouse on every row is the slowest way to do it. Up and down
 * move, Home and End jump, Enter opens — Enter needs no handling at all, because
 * each row is a link and that is what links do.
 *
 * Roving tabindex rather than a tab stop per row: one Tab enters the list, one
 * more leaves it, and the arrows do the work in between. Fifty jobs would
 * otherwise be fifty presses to get past.
 */
export function useRovingList() {
  const container = useRef<HTMLUListElement>(null)

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLUListElement>) => {
    const rows = Array.from(
      container.current?.querySelectorAll<HTMLElement>('[data-row]') ?? [],
    )
    if (rows.length === 0) return

    const current = rows.findIndex((row) => row.contains(document.activeElement))

    const move = (to: number) => {
      event.preventDefault()
      const next = Math.max(0, Math.min(to, rows.length - 1))
      rows.forEach((row, i) => row.setAttribute('tabindex', i === next ? '0' : '-1'))
      rows[next].focus()
    }

    if (event.key === 'ArrowDown') move(current + 1)
    else if (event.key === 'ArrowUp') move(current - 1)
    else if (event.key === 'Home') move(0)
    else if (event.key === 'End') move(rows.length - 1)
  }, [])

  // Returned as one props bag rather than a loose ref, so the call site spreads it
  // onto the list and never touches the ref itself.
  return { listProps: { ref: container, onKeyDown } }
}
