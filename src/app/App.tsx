import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router'
import { LoginPage } from '../features/auth/LoginPage'
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage'
import { UpdatePrompt } from '../features/pwa/UpdatePrompt'
import { ClientDetailPage } from '../features/clients/ClientDetailPage'
import { ClientsPage } from '../features/clients/ClientsPage'
import { BoardPage } from '../features/jobs/BoardPage'
import { JobDetailPage } from '../features/jobs/JobDetailPage'
import { JobFormPage } from '../features/jobs/JobFormPage'
import { MyWorkPage } from '../features/jobs/MyWorkPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { TeamPage } from '../features/team/TeamPage'
import { isConfigured } from '../lib/supabase'
import type { UserRole } from '../lib/types'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './authContext'
import { SetupRequired } from './SetupRequired'
import { Shell } from './Shell'
import { useMe } from './useMe'

function RequireAuth() {
  const { status } = useAuth()
  if (status === 'loading') {
    return <div className="text-ink-soft grid min-h-dvh place-items-center text-sm">Loading…</div>
  }
  if (status === 'signed-out') return <Navigate to="/login" replace />
  return <Shell />
}

/**
 * Role gating in the client is courtesy, not security — Postgres refuses these
 * people regardless. It exists so nobody is shown a screen that would only reject
 * them. `undefined` means the profile has not synced yet, so it waits rather than
 * bouncing a partner out of their own Board on a cold start.
 */
function RequireRole({ allow }: { allow: UserRole[] }) {
  const me = useMe()
  if (me === undefined) {
    return <p className="text-ink-soft text-sm">Loading…</p>
  }
  if (!me || !allow.includes(me.role)) {
    return (
      <div className="rounded-card border-rule bg-card border border-dashed p-8 text-center">
        <p className="font-serif text-sm font-semibold">Not yours to see</p>
        <p className="text-ink-soft mt-1 text-sm">
          This screen is for {allow.join(' and ')} accounts.
        </p>
      </div>
    )
  }
  return <Outlet />
}

export function App() {
  if (!isConfigured) return <SetupRequired />

  return (
    <AuthProvider>
      {/* Vite's BASE_URL, so the same build works at the domain root and under a
          repository path on GitHub Pages. */}
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        {/* Outside the auth gate on purpose: the worker that makes a cold launch
            work offline has to be registered before anyone signs in, not after. */}
        <UpdatePrompt />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {/* Public: the visitor arrives holding only a recovery session. */}
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          <Route element={<RequireAuth />}>
            <Route index element={<Navigate to="/my-work" replace />} />
            <Route path="my-work" element={<MyWorkPage />} />
            <Route path="jobs/:id" element={<JobDetailPage />} />
            <Route path="clients" element={<ClientsPage />} />
            <Route path="clients/:id" element={<ClientDetailPage />} />
            <Route path="settings" element={<SettingsPage />} />

            <Route element={<RequireRole allow={['partner', 'manager']} />}>
              <Route path="board" element={<BoardPage />} />
              <Route path="jobs/new" element={<JobFormPage />} />
              <Route path="jobs/:id/edit" element={<JobFormPage />} />
            </Route>

            <Route element={<RequireRole allow={['partner']} />}>
              <Route path="team" element={<TeamPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
