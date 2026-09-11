/**
 * Catches the install prompt at app start and holds it.
 *
 * Chrome fires `beforeinstallprompt` once, early, and only once. A listener that
 * mounts with the Settings screen — which is behind a sign-in — attaches long
 * after the event has come and gone, and the Install button then never appears at
 * all. So this module listens at module scope and Settings reads what it caught.
 *
 * The event is deliberately not shown to the user unprompted: installing is
 * something they choose from Settings, not something the browser nags about while
 * they are trying to read a job.
 */

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()

const announce = () => listeners.forEach((fn) => fn())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferred = event as InstallPromptEvent
    announce()
  })

  window.addEventListener('appinstalled', () => {
    deferred = null
    announce()
  })
}

export function subscribeToInstallPrompt(onChange: () => void) {
  listeners.add(onChange)
  return () => listeners.delete(onChange)
}

export const getInstallPrompt = () => deferred

/** Already running as an installed app? Then there is nothing to offer. */
export function isInstalled(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari's own flag, which predates the standard.
    (navigator as { standalone?: boolean }).standalone === true
  )
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable'
  await deferred.prompt()
  const { outcome } = await deferred.userChoice
  deferred = null
  announce()
  return outcome
}
