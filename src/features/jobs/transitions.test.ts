import { describe, expect, it } from 'vitest'
import { allowedMoves } from './transitions'

/**
 * These must match public.jobs_guard() in supabase/migrations/0001_init.sql. If
 * the two ever drift, the sheet offers a move the server refuses and the person
 * finds out ten seconds later through a failed outbox entry.
 */
describe('what staff may do', () => {
  it('lets work start, pause, resume and go for review', () => {
    expect(allowedMoves('not_started', 'staff')).toEqual(['in_progress'])
    expect(allowedMoves('in_progress', 'staff')).toEqual(['on_hold', 'review'])
    expect(allowedMoves('on_hold', 'staff')).toEqual(['in_progress', 'review'])
    expect(allowedMoves('rework', 'staff')).toEqual(['in_progress'])
  })

  it('never offers completed or cancelled', () => {
    for (const from of ['not_started', 'in_progress', 'on_hold', 'rework'] as const) {
      expect(allowedMoves(from, 'staff')).not.toContain('completed')
      expect(allowedMoves(from, 'staff')).not.toContain('cancelled')
    }
  })

  it('leaves a job in review alone — the reviewer takes it from there', () => {
    expect(allowedMoves('review', 'staff')).toEqual([])
  })

  it('does not reopen something already closed', () => {
    expect(allowedMoves('completed', 'staff')).toEqual([])
    expect(allowedMoves('cancelled', 'staff')).toEqual([])
  })
})

describe('what managers and partners may do', () => {
  it('is anything except a move to where it already is', () => {
    expect(allowedMoves('review', 'manager')).toContain('completed')
    expect(allowedMoves('review', 'manager')).toContain('rework')
    expect(allowedMoves('review', 'manager')).not.toContain('review')
    expect(allowedMoves('completed', 'partner')).toContain('in_progress')
  })
})
