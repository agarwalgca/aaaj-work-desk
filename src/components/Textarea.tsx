import type { TextareaHTMLAttributes } from 'react'
import { useId } from 'react'

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }

export function Textarea({ label, hint, className = '', ...props }: Props) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-ink-soft text-xs font-medium tracking-wide uppercase">
        {label}
      </label>
      <textarea
        id={id}
        {...props}
        className={`rounded-control border-rule bg-card placeholder:text-ink-soft/50 focus:border-brass min-h-24 border px-3 py-2 text-sm outline-none ${className}`}
      />
      {hint && <p className="text-ink-soft/80 text-xs">{hint}</p>}
    </div>
  )
}
