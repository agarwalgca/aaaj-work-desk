import { useState } from 'react'
import { useNavigate } from 'react-router'
import { StatusPill } from '../../components/StatusPill'
import { formatDate } from '../../lib/dates'
import { useSearch } from './useSearch'

/** In the top bar on a desktop; behind a button on a phone. */
export function GlobalSearch({ onDone }: { onDone?: () => void }) {
  const [query, setQuery] = useState('')
  // Tied to the query it was chosen for, so a new keystroke starts at the top
  // without an effect firing a second render to put it there.
  const [highlight, setHighlight] = useState({ forQuery: '', index: 0 })
  const { hits, scope, searching, online } = useSearch(query)
  const navigate = useNavigate()

  const cursor = highlight.forQuery === query ? highlight.index : 0
  const setCursor = (next: number) => setHighlight({ forQuery: query, index: next })

  const open = query.trim().length >= 2

  function go(index: number) {
    const hit = hits[index]
    if (!hit) return
    setQuery('')
    onDone?.()
    navigate(`/jobs/${hit.job.id}`)
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (!open) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setCursor(Math.min(cursor + 1, hits.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setCursor(Math.max(cursor - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      go(cursor)
    } else if (event.key === 'Escape') {
      setQuery('')
      onDone?.()
    }
  }

  return (
    <div className="relative w-full">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        autoFocus={Boolean(onDone)}
        aria-label={online ? 'Search jobs' : 'Searching saved jobs'}
        placeholder={online ? 'Search jobs, clients, codes' : 'Searching saved jobs'}
        className="rounded-control h-9 w-full border border-white/15 bg-white/5 px-3 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
      />

      {open && (
        <div className="rounded-card border-rule bg-card absolute top-11 right-0 left-0 z-30 max-h-96 overflow-y-auto border shadow-lg">
          <p className="text-ink-soft border-rule border-b px-3 py-1.5 text-[11px]">
            {searching
              ? 'Searching…'
              : scope === 'saved'
                ? `${hits.length} of the jobs saved on this device`
                : `${hits.length} found`}
          </p>

          {hits.length === 0 ? (
            <p className="text-ink-soft px-3 py-3 text-sm">
              Nothing matched{scope === 'saved' ? ' on this device' : ''}.
            </p>
          ) : (
            <ul>
              {hits.map((hit, index) => (
                <li key={hit.job.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => go(index)}
                    className={`block w-full px-3 py-2 text-left ${
                      index === cursor ? 'bg-brass-wash' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-ink-soft font-mono text-xs">{hit.clientCode}</span>
                      <span className="min-w-0 flex-1 truncate text-sm">{hit.job.title}</span>
                      <StatusPill status={hit.job.status} />
                    </div>
                    <div className="text-ink-soft mt-0.5 flex gap-3 text-xs">
                      <span className="truncate">{hit.clientName}</span>
                      {hit.job.period_label && <span className="font-mono">{hit.job.period_label}</span>}
                      <span className="font-mono">{formatDate(hit.job.due_date)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
