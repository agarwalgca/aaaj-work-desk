import { NavLink, Outlet } from 'react-router'
import { Wordmark } from '../components/Wordmark'
import {
  BoardIcon,
  ClientsIcon,
  MoreIcon,
  MyWorkIcon,
  SettingsIcon,
  TeamIcon,
} from '../components/icons'
import { useAuth } from './authContext'

/** Role gating lands in step 3, once profiles exist and roles are known. */
const NAV = [
  { to: '/my-work', label: 'My Work', Icon: MyWorkIcon, mobile: true },
  { to: '/board', label: 'Board', Icon: BoardIcon, mobile: true },
  { to: '/clients', label: 'Clients', Icon: ClientsIcon, mobile: true },
  { to: '/team', label: 'Team', Icon: TeamIcon, mobile: false },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon, mobile: false },
]

export function Shell() {
  const { session, signOut } = useAuth()
  // Becomes profiles.initials once step 2 lands the table.
  const email = session?.user.email ?? ''

  return (
    <div className="min-h-dvh">
      <header className="bg-ink sticky top-0 z-20 flex h-14 items-center gap-3 px-3 md:gap-4 md:px-4">
        <Wordmark />

        <label className="ml-auto hidden max-w-md flex-1 md:block">
          <span className="sr-only">Search jobs</span>
          <input
            type="search"
            placeholder="Search jobs, clients, codes"
            className="rounded-control h-9 w-full border border-white/15 bg-white/5 px-3 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
          />
        </label>

        {/* Sync chip is wired to the outbox in step 2. */}
        <span className="rounded-control ml-auto border border-white/15 px-2 py-1 font-mono text-[11px] whitespace-nowrap text-white/60 md:ml-0">
          Not synced
        </span>

        {/* Becomes a proper menu in step 3, once profiles give us a real name and role. */}
        <button
          type="button"
          onClick={signOut}
          title={`${email} — sign out`}
          className="text-brass grid size-8 shrink-0 place-items-center rounded-full border border-white/20 font-mono text-[11px] hover:bg-white/10"
        >
          {email.slice(0, 2).toUpperCase() || '??'}
        </button>
      </header>

      <div className="flex">
        <nav className="border-rule bg-card sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-52 shrink-0 border-r p-3 md:block">
          <ul className="flex flex-col gap-0.5">
            {NAV.map(({ to, label, Icon }) => (
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
          <Outlet />
        </main>
      </div>

      <nav className="border-rule bg-card fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t pb-[env(safe-area-inset-bottom)] md:hidden">
        {NAV.filter((item) => item.mobile).map(({ to, label, Icon }) => (
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
