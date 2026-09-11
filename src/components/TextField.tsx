import type { InputHTMLAttributes } from 'react'
import { useId } from 'react'

type Props = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }

export function TextField({ label, hint, className = '', ...props }: Props) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium tracking-wide text-ink-soft uppercase">
        {label}
      </label>
      <input
        id={id}
        {...props}
        className={`rounded-control border-rule bg-card placeholder:text-ink-soft/50 focus:border-brass h-10 border px-3 text-sm outline-none transition-colors duration-150 ${className}`}
      />
      {hint && <p className="text-ink-soft/80 font-mono text-xs">{hint}</p>}
    </div>
  )
}
