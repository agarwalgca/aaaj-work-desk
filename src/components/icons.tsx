type IconProps = { className?: string }

/** 20px stroke icons, drawn here rather than pulled from a pack — the app needs five. */
function Icon({ children, className = 'size-5' }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  )
}

export const MyWorkIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 4.5h13v11h-13z" />
    <path d="M6.5 8.5h7M6.5 11.5h4" />
  </Icon>
)

export const BoardIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 3.5h4v13h-4zM8.5 3.5h4v8h-4zM13.5 3.5h3v11h-3z" />
  </Icon>
)

export const ClientsIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 16.5v-9l5-4 5 4v9" />
    <path d="M2.5 16.5h15M6.5 16.5v-4h4v4" />
  </Icon>
)

export const TeamIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="7.5" cy="7" r="2.5" />
    <path d="M3 16.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" />
    <path d="M13 5.2a2.5 2.5 0 0 1 0 4.6M14 12.9c1.8.5 3 1.8 3 3.6" />
  </Icon>
)

export const RecurringIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 10a6.5 6.5 0 0 1 11-4.7M16.5 10a6.5 6.5 0 0 1-11 4.7" />
    <path d="M14.5 2.5v3h-3M5.5 17.5v-3h3" />
  </Icon>
)

export const SettingsIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="10" r="2.5" />
    <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4" />
  </Icon>
)

export const MoreIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="4.5" cy="10" r="1" fill="currentColor" />
    <circle cx="10" cy="10" r="1" fill="currentColor" />
    <circle cx="15.5" cy="10" r="1" fill="currentColor" />
  </Icon>
)
