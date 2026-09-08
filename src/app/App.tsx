import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { LoginPage } from '../features/auth/LoginPage'
import { isConfigured } from '../lib/supabase'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './authContext'
import { Placeholder } from './Placeholder'
import { SetupRequired } from './SetupRequired'
import { Shell } from './Shell'

function RequireAuth() {
  const { status } = useAuth()
  if (status === 'loading') {
    return <div className="text-ink-soft grid min-h-dvh place-items-center text-sm">Loading…</div>
  }
  if (status === 'signed-out') return <Navigate to="/login" replace />
  return <Shell />
}

export function App() {
  if (!isConfigured) return <SetupRequired />

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route index element={<Navigate to="/my-work" replace />} />
            <Route path="my-work" element={<Placeholder title="My Work" step={3} />} />
            <Route path="board" element={<Placeholder title="Board" step={3} />} />
            <Route path="clients" element={<Placeholder title="Clients" step={3} />} />
            <Route path="team" element={<Placeholder title="Team" step={3} />} />
            <Route path="settings" element={<Placeholder title="Settings" step={3} />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
