import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { GlobalSearch } from '../features/search/GlobalSearch'
import { AvatarMenu } from '../features/settings/AvatarMenu'
import { StaleWritesBanner } from '../features/sync/StaleWritesBanner'
import { SyncChip } from '../features/sync/SyncChip'
import { Wordmark } from '../components/Wordmark'
import {
  BoardIcon,
  CategoriesIcon,
  ClientsIcon,
  MoreIcon,
  MyWorkIcon,
  RecurringIcon,
  SettingsIcon,
  TeamIcon,
} from '../components/icons'
import { db } from '../lib/db'
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
  {
    to: '/recurring',
    label: 'Recurring',
    Icon: RecurringIcon,
    mobile: false,
    roles: ['partner', 'manager'],
  },
  {
    to: '/categories',
    label: 'Categories',
    Icon: CategoriesIcon,
    mobile: false,
    roles: ['partner', 'manager'],
  },
  { to: '/team', label: 'Team', Icon: TeamIcon, mobile: false, roles: ['partner'] },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon, mobile: false, roles: null },
]

export function Shell() {
  const { session, signOut } = useAuth()
  const me = useMe()
  const pending = useLiveQuery(() => db.outbox.count(), [], 0)
  const [searchOpen, setSearchOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const { pathname } = useLocation()

  // The engine belongs to a signed-in session and nothing else: mounted here, it
  // starts when the shell does and is torn down the moment the session ends.
  useEffect(() => {
    startSync()
    return stopSync
  }, [])

  const visible = NAV.filter((item) => !item.roles || (me && item.roles.includes(me.role)))
  // The phone bar holds three; everything else this person may see is behind More,
  // which is a menu and not a shortcut to Settings — Team and Categories were
  // unreachable on a phone while it was one.
  const inBar = visible.filter((item) => item.mobile).slice(0, 3)
  const behindMore = visible.filter((item) => !inBar.includes(item))

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
          className="rounded-control ml-auto shrink-0 border border-white/15 px-2 py-1 font-mono text-[11px] text-white/60 md:hidden"
        >
          Search
        </button>

        <div className="min-w-0 shrink md:ml-0">
          <SyncChip />
        </div>

        <AvatarMenu
          me={me}
          email={session?.user.email ?? ''}
          pending={pending}
          onSignOut={() => void signOut()}
        />
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

      {moreOpen && (
        <div
          className="animate-fade fixed inset-0 z-30 flex items-end bg-black/30 md:hidden"
          onClick={() => setMoreOpen(false)}
          role="presentation"
        >
          <nav
            aria-label="More"
            onClick={(event) => event.stopPropagation()}
            className="border-rule bg-card animate-rise w-full border-t p-3 pb-[calc(env(safe-area-inset-bottom)+4.5rem)] shadow-xl"
          >
            <ul className="grid gap-1">
              {behindMore.map(({ to, label, Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    onClick={() => setMoreOpen(false)}
                    className={({ isActive }) =>
                      `rounded-control flex items-center gap-3 px-3 py-3 text-sm ${
                        isActive ? 'bg-brass-wash text-ink font-medium' : 'text-ink-soft'
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
        </div>
      )}

      <nav className="border-rule bg-card fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t pb-[env(safe-area-inset-bottom)] md:hidden">
        {inBar.map(({ to, label, Icon }) => (
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
        <button
          type="button"
          onClick={() => setMoreOpen((open) => !open)}
          aria-expanded={moreOpen}
          className={`flex flex-col items-center gap-1 py-2 text-[11px] ${
            moreOpen || behindMore.some((item) => item.to === pathname) ? 'text-brass font-medium' : 'text-ink-soft'
          }`}
        >
          <MoreIcon />
          More
        </button>
      </nav>
    </div>
  )
}
