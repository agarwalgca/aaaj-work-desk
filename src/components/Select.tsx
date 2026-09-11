import type { SelectHTMLAttributes } from 'react'
import { useId } from 'react'

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string
  options: Array<{ value: string; label: string }>
}

export function Select({ label, options, className = '', ...props }: Props) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-ink-soft text-xs font-medium tracking-wide uppercase">
        {label}
      </label>
      <select
        id={id}
        {...props}
        className={`rounded-control border-rule bg-card focus:border-brass h-10 border px-2 text-sm outline-none ${className}`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
