import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { useMe } from '../../app/useMe'
import { useAuth } from '../../app/authContext'
import { Button } from '../../components/Button'
import { PageHeader } from '../../components/PageHeader'
import { cacheStats, clearLocalData, db } from '../../lib/db'
import { formatDateTime } from '../../lib/dates'
import { syncNow, stopSync } from '../../lib/sync/engine'
import { retryFailed } from '../../lib/sync/flush'
import { useSyncState } from '../../lib/sync/state'

type InstallPrompt = Event & { prompt: () => Promise<void> }

export function SettingsPage() {
  const me = useMe()
  const { session, signOut } = useAuth()
  const { phase, online, lastSyncedAt, lastError } = useSyncState()
  const stats = useLiveQuery(() => cacheStats(), [])
  const queue = useLiveQuery(() => db.outbox.toArray(), [], [])
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null)

  // Chrome fires this instead of showing its own install bar. Held so the person
  // can install when they decide to, not when the browser decides to ask.
  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPrompt)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  const pending = queue.filter((e) => e.state === 'pending')
  const failed = queue.filter((e) => e.state === 'failed')

  async function signOutSafely() {
    if (
      queue.length > 0 &&
      !window.confirm(
        `${queue.length} change${queue.length === 1 ? '' : 's'} on this device ${queue.length === 1 ? 'has' : 'have'} not reached the server. Signing out discards them. Continue?`,
      )
    ) {
      return
    }
    stopSync()
    await clearLocalData()
    await signOut()
  }

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

      <Panel title="Install on this device">
        {installPrompt ? (
          <>
            <p className="text-ink-soft text-sm">
              Installing gives the app its own icon and keeps it working with no connection.
            </p>
            <Button className="mt-2" onClick={() => void installPrompt.prompt()}>
              Install
            </Button>
          </>
        ) : (
          <p className="text-ink-soft text-sm">
            Either it is already installed, or this browser wants you to do it from its own menu — on
            iPhone, Share then <strong>Add to Home Screen</strong>.
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

        {failed.length > 0 && (
          <ul className="mt-3 grid gap-1">
            {failed.map((entry) => (
              <li key={entry.seq} className="rounded-control border-rule border px-2 py-1">
                <div className="font-mono text-[11px]">
                  {entry.op} {entry.table_name}
                </div>
                <p className="text-ink-soft text-xs">{entry.last_error}</p>
              </li>
            ))}
          </ul>
        )}
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
        <Button variant="secondary" onClick={() => void signOutSafely()}>
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
