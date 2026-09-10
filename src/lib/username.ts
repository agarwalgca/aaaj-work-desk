/**
 * Supabase Auth keys every account by email; it has no notion of a username. The
 * firm signs in with a username, so one maps onto the other deterministically:
 * `gaurav` resolves to `gaurav@aaaj.co.in`.
 *
 * Nothing is stored to make this work and no lookup runs before sign-in, so an
 * unknown username reveals nothing to whoever typed it. The cost is a rule that
 * has to hold everywhere: an account's auth email is always
 * `<username>@aaaj.co.in`, and the username is the local part.
 */
export const AUTH_EMAIL_DOMAIN = 'aaaj.co.in'

/** Partners are used to typing the full address, so accept either form. */
export function usernameToEmail(input: string): string {
  const value = input.trim().toLowerCase()
  return value.includes('@') ? value : `${value}@${AUTH_EMAIL_DOMAIN}`
}

export function emailToUsername(email: string): string {
  return email.split('@')[0]
}
