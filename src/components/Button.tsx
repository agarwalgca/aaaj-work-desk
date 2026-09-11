import type { ButtonHTMLAttributes } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost'
}

const variants = {
  primary: 'bg-brass text-white border-brass hover:bg-brass/90 disabled:bg-brass/50',
  secondary: 'bg-card text-ink border-rule hover:bg-brass-wash',
  ghost: 'bg-transparent text-ink-soft border-transparent hover:text-ink',
} as const

export function Button({ variant = 'primary', className = '', ...props }: Props) {
  return (
    <button
      {...props}
      className={`rounded-control inline-flex h-10 items-center justify-center gap-2 border px-4 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-70 ${variants[variant]} ${className}`}
    />
  )
}
