import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router'
import { GlobalSearch } from '../features/search/GlobalSearch'
import { StaleWritesBanner } from '../features/sync/StaleWritesBanner'
import { SyncChip } from '../features/sync/SyncChip'
import { Wordmark } from '../components/Wordmark'
import {
  BoardIcon,
  ClientsIcon,
  MoreIcon,
  MyWorkIcon,
  SettingsIcon,
  TeamIcon,
} from '../components/icons'
import { clearLocalData, db } from '../lib/db'
import { startSync, stopSync } from '../lib/sync/engine'
import type { UserRole } from '../lib/types'
import { useAuth } from './authContext'
import { useMe } from './useMe'

/** `roles: null` means everyone. Postgres refuses the rest regardless; this only
 *  keeps people from being shown a door that will not open for them. */
const NAV: Array<{
  to: string
  label: string
  Icon: (props: { className?: string }) => React.ReactNode
  mobile: boolean
  roles: UserRole[] | null
}> = [
  { to: '/my-work', label: 'My Work', Icon: MyWorkIcon, mobile: true, roles: null },
  { to: '/board', label: 'Board', Icon: BoardIcon, mobile: true, roles: ['partner', 'manager'] },
  { to: '/clients', label: 'Clients', Icon: ClientsIcon, mobile: true, roles: null },
  { to: '/team', label: 'Team', Icon: TeamIcon, mobile: false, roles: ['partner'] },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon, mobile: false, roles: null },
]

export function Shell() {
  const { signOut } = useAuth()
  const me = useMe()
  const pending = useLiveQuery(() => db.outbox.count(), [], 0)
  const [searchOpen, setSearchOpen] = useState(false)

  // The engine belongs to a signed-in session and nothing else: mounted here, it
  // starts when the shell does and is torn down the moment the session ends.
  useEffect(() => {
    startSync()
    return stopSync
  }, [])

  const visible = NAV.filter((item) => !item.roles || (me && item.roles.includes(me.role)))
  const initials = me?.initials || me?.username.slice(0, 2).toUpperCase() || '··'

  async function signOutSafely() {
    if (
      pending > 0 &&
      !window.confirm(
        `${pending} change${pending === 1 ? '' : 's'} on this device ${pending === 1 ? 'has' : 'have'} not reached the server yet. ` +
          'Signing out now discards them. Continue?',
      )
    ) {
      return
    }
    stopSync()
    await clearLocalData()
    await signOut()
  }

  return (
    <div className="min-h-dvh">
      <header className="bg-ink sticky top-0 z-20 flex h-14 items-center gap-3 px-3 md:gap-4 md:px-4">
        <Wordmark />

        <div className="ml-auto hidden max-w-md flex-1 md:block">
          <GlobalSearch />
        </div>

        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label="Search"
          className="rounded-control ml-auto border border-white/15 px-2 py-1 font-mono text-[11px] text-white/60 md:hidden"
        >
          Search
        </button>

        <div className="md:ml-0">
          <SyncChip />
        </div>

        <Link
          to="/settings"
          title={me ? `${me.full_name || me.username} — settings` : 'Settings'}
          className="text-brass grid size-8 shrink-0 place-items-center rounded-full border border-white/20 font-mono text-[11px] hover:bg-white/10"
        >
          {initials}
        </Link>

        <button
          type="button"
          onClick={() => void signOutSafely()}
          className="hidden font-mono text-[11px] text-white/50 hover:text-white md:block"
        >
          Sign out
        </button>
      </header>

      {searchOpen && (
        <div className="bg-ink fixed inset-x-0 top-0 z-40 flex items-center gap-2 p-3 md:hidden">
          <GlobalSearch onDone={() => setSearchOpen(false)} />
          <button
            type="button"
            onClick={() => setSearchOpen(false)}
            className="shrink-0 font-mono text-[11px] text-white/60"
          >
            Close
          </button>
        </div>
      )}

      <div className="flex">
        <nav className="border-rule bg-card sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-52 shrink-0 border-r p-3 md:block">
          <ul className="flex flex-col gap-0.5">
            {visible.map(({ to, label, Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  className={({ isActive }) =>
                    `rounded-control flex items-center gap-3 px-3 py-2 text-sm ${
                      isActive
                        ? 'bg-brass-wash text-ink border-brass border-l-2 font-medium'
                        : 'text-ink-soft hover:bg-brass-wash/50 border-l-2 border-transparent'
                    }`
                  }
                >
                  <Icon />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0 flex-1 p-4 pb-20 md:p-6 md:pb-6">
          <StaleWritesBanner />
          <Outlet />
        </main>
      </div>

      <nav className="border-rule bg-card fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t pb-[env(safe-area-inset-bottom)] md:hidden">
        {visible
          .filter((item) => item.mobile)
          .slice(0, 3)
          .map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-2 text-[11px] ${
                  isActive ? 'text-brass font-medium' : 'text-ink-soft'
                }`
              }
            >
              <Icon />
              {label}
            </NavLink>
          ))}
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 py-2 text-[11px] ${
              isActive ? 'text-brass font-medium' : 'text-ink-soft'
            }`
          }
        >
          <MoreIcon />
          More
        </NavLink>
      </nav>
    </div>
  )
}
