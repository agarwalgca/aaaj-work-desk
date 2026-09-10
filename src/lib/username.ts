import { supabase } from './supabase'

/**
 * Sign-in is by username; Supabase Auth is keyed by email. `profiles.username` is
 * a field of its own — not the local part of anyone's address — so the two are
 * bridged by a SECURITY DEFINER lookup the anon role may execute:
 *
 *   create function public.email_for_username(p_username text) returns text
 *
 * It returns null for an unknown, deactivated or soft-deleted username, and the
 * login screen reports the same message either way, so the form is not a username
 * oracle. The function does hand a known username's email back to whoever asked;
 * hiding that would take a server, which Phase 1 does not have.
 */
export async function emailForUsername(username: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('email_for_username', {
    p_username: username.trim().toLowerCase(),
  })
  if (error) throw error
  return data ?? null
}
