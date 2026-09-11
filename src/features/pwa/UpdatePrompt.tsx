import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from '../../components/Button'

/**
 * A new version is offered, never applied.
 *
 * `registerType: 'prompt'` plus this bar is the whole point: taking over in the
 * background reloads the tab, and the tab is where somebody is halfway through a
 * comment in a client's office. They choose the moment.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div className="rounded-card border-rule bg-card fixed inset-x-3 bottom-20 z-40 flex flex-wrap items-center gap-3 border p-3 shadow-lg md:right-4 md:bottom-4 md:left-auto md:max-w-sm">
      <p className="min-w-0 flex-1 text-sm">
        A newer version of Work Desk is ready. Nothing you have typed will be lost.
      </p>
      <Button onClick={() => void updateServiceWorker(true)}>Reload</Button>
      <Button variant="ghost" onClick={() => setNeedRefresh(false)}>
        Later
      </Button>
    </div>
  )
}
