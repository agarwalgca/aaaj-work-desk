import { Wordmark } from '../components/Wordmark'

export function SetupRequired() {
  return (
    <main className="bg-paper flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Wordmark size="lg" />
        <div className="rounded-card border-rule bg-card mt-8 border p-6">
          <h1 className="font-serif text-lg font-semibold">Supabase is not configured</h1>
          <p className="text-ink-soft mt-2 text-sm">
            Copy <code className="font-mono text-xs">.env.example</code> to{' '}
            <code className="font-mono text-xs">.env</code>, fill in{' '}
            <code className="font-mono text-xs">VITE_SUPABASE_URL</code> and{' '}
            <code className="font-mono text-xs">VITE_SUPABASE_ANON_KEY</code> from the project’s API
            settings, then restart the dev server.
          </p>
        </div>
      </div>
    </main>
  )
}
