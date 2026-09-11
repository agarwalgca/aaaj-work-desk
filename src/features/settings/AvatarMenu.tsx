import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ROLE_LABEL } from '../../lib/labels'
import type { Profile } from '../../lib/types'

/**
 * Who you are, and the way out.
 *
 * Sign-out lives here rather than loose in the bar because it is the one control
 * that can lose work — the confirmation when the outbox is not empty is the whole
 * reason it is not a one-tap affordance sitting next to Search.
 */
export function AvatarMenu({
  me,
  email,
  pending,
  onSignOut,
}: {
  me: Profile | null | undefined
  email: string
  pending: number
  onSignOut: () => void
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const initials = me?.initials || me?.username.slice(0, 2).toUpperCase() || '··'

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={me ? `${me.full_name || me.username} — account menu` : 'Account menu'}
        className="text-brass grid size-8 shrink-0 place-items-center rounded-full border border-white/20 font-mono text-[11px] hover:bg-white/10"
      >
        {initials}
      </button>

      {open && (
        <div
          role="menu"
          className="rounded-card border-rule bg-card absolute top-10 right-0 z-40 w-60 border p-1 shadow-lg"
        >
          <div className="border-rule border-b px-3 py-2">
            <p className="text-sm font-medium">{me?.full_name || me?.username || 'Signed in'}</p>
            <p className="text-ink-soft font-mono text-[11px]">{email}</p>
            {me && (
              <span className="rounded-control border-rule mt-1 inline-block border px-1.5 py-0.5 text-[11px]">
                {ROLE_LABEL[me.role]}
              </span>
            )}
          </div>

          <Link
            to="/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="hover:bg-brass-wash rounded-control block px-3 py-2 text-sm"
          >
            Settings
          </Link>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onSignOut()
            }}
            className="hover:bg-brass-wash rounded-control block w-full px-3 py-2 text-left text-sm"
          >
            Sign out
            {pending > 0 && (
              <span className="text-status-on-hold ml-2 font-mono text-[11px]">
                {pending} unsent
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
