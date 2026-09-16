import { useLiveQuery } from 'dexie-react-hooks'
import { useSyncExternalStore } from 'react'
import { useMe } from '../../app/useMe'
import { useAuth } from '../../app/authContext'
import { Button } from '../../components/Button'
import { PageHeader } from '../../components/PageHeader'
import { cacheStats, db } from '../../lib/db'
import { formatDateTime } from '../../lib/dates'
import {
  getInstallPrompt,
  isInstalled,
  promptInstall,
  subscribeToInstallPrompt,
} from '../../lib/installPrompt'
import { syncNow } from '../../lib/sync/engine'
import { retryFailed } from '../../lib/sync/flush'
import { useSyncState } from '../../lib/sync/state'
import { FailedEntries } from '../sync/FailedEntries'
import { ChangePassword } from './ChangePassword'

export function SettingsPage() {
  const me = useMe()
  const { session, signOut } = useAuth()
  const { phase, online, lastSyncedAt, lastError, missingTables } = useSyncState()
  const stats = useLiveQuery(() => cacheStats(), [])
  const queue = useLiveQuery(() => db.outbox.toArray(), [], [])
  const installable = useSyncExternalStore(
    subscribeToInstallPrompt,
    () => getInstallPrompt() !== null,
    () => false,
  )

  const pending = queue.filter((e) => e.state === 'pending')
  const failed = queue.filter((e) => e.state === 'failed')

  return (
    <section className="max-w-2xl">
      <PageHeader title="Settings" />

      <Panel title="You">
        <Row term="Name" value={me?.full_name || '—'} />
        <Row term="Username" value={me?.username ?? '—'} mono />
        <Row term="Role" value={me?.role ?? '—'} />
        <Row term="Email" value={session?.user.email ?? '—'} mono />
        <p className="text-ink-soft mt-2 text-xs">
          A partner changes any of this on the Team screen.
        </p>
      </Panel>

      <Panel title="Password">
        <ChangePassword />
      </Panel>

      <Panel title="Install on this device">
        {isInstalled() ? (
          <p className="text-ink-soft text-sm">
            Already installed. This is the installed app.
          </p>
        ) : installable ? (
          <>
            <p className="text-ink-soft text-sm">
              Installing gives Work Desk its own icon and keeps it opening with no connection.
            </p>
            <Button className="mt-2" onClick={() => void promptInstall()}>
              Install
            </Button>
          </>
        ) : (
          <p className="text-ink-soft text-sm">
            This browser wants you to install from its own menu — on iPhone, Share then{' '}
            <strong>Add to Home Screen</strong>; in Chrome, the icon at the right of the address bar.
          </p>
        )}
      </Panel>

      <Panel title="Sync">
        <Row term="Connection" value={online ? 'Online' : 'Offline'} />
        <Row term="State" value={phase === 'idle' ? 'Idle' : phase === 'pulling' ? 'Reading' : 'Sending'} />
        <Row term="Last synced" value={lastSyncedAt ? formatDateTime(lastSyncedAt) : 'Never'} mono />
        <Row term="Waiting to send" value={String(pending.length)} mono />
        <Row term="Failed" value={String(failed.length)} mono />

        {lastError && (
          <p className="rounded-control border-status-cancelled/30 text-status-cancelled mt-2 border px-2 py-1 text-xs">
            {lastError}
          </p>
        )}

        {missingTables.length > 0 && (
          <p className="rounded-control border-status-on-hold/40 text-status-on-hold mt-2 border px-2 py-1 text-xs">
            These tables are not on the server yet: <strong>{missingTables.join(', ')}</strong>.
            Everything else is syncing normally. Apply the outstanding migration in
            supabase/migrations and this clears itself.
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void syncNow()} disabled={!online || phase !== 'idle'}>
            Sync now
          </Button>
          {failed.length > 0 && (
            <Button variant="secondary" onClick={() => void retryFailed()}>
              Retry {failed.length} failed
            </Button>
          )}
        </div>

        {failed.length > 0 && <FailedEntries entries={failed} className="mt-3" />}
      </Panel>

      <Panel title="This device">
        {stats && (
          <>
            <Row term="Jobs" value={String(stats.rows.jobs)} mono />
            <Row term="Clients" value={String(stats.rows.clients)} mono />
            <Row term="People" value={String(stats.rows.profiles)} mono />
            <Row term="History and comments" value={String(stats.rows.history + stats.rows.comments)} mono />
            <Row term="Rows in total" value={String(stats.total)} mono />
            <Row
              term="Storage used"
              value={
                stats.usage === null
                  ? 'Not reported by this browser'
                  : `${(stats.usage / 1024 / 1024).toFixed(1)} MB of ${((stats.quota ?? 0) / 1024 / 1024).toFixed(0)} MB`
              }
              mono
            />
            <p className="text-ink-soft mt-2 text-xs">
              Open jobs are kept however old they are. Finished jobs are kept while they fall in this
              financial year or the one before it.
            </p>
          </>
        )}
      </Panel>

      <Panel title="Sign out">
        {queue.length > 0 && (
          <p className="rounded-control border-status-on-hold/40 text-status-on-hold mb-2 border px-2 py-1 text-xs">
            {queue.length} change{queue.length === 1 ? '' : 's'} on this device{' '}
            {queue.length === 1 ? 'has' : 'have'} not reached the server yet. Get back online before
            signing out, or they are lost.
          </p>
        )}
        <Button variant="secondary" onClick={() => void signOut()}>
          Sign out
        </Button>
      </Panel>
    </section>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border-rule bg-card mb-4 border p-4">
      <h2 className="font-serif mb-2 text-sm font-semibold">{title}</h2>
      {children}
    </div>
  )
}

function Row({ term, value, mono }: { term: string; value: string; mono?: boolean }) {
  return (
    <div className="border-rule flex justify-between border-b py-1 text-sm last:border-b-0">
      <span className="text-ink-soft">{term}</span>
      <span className={mono ? 'font-mono' : ''}>{value}</span>
    </div>
  )
}
