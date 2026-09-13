import { describe, expect, it } from 'vitest'
import { allowedMoves, isApproval } from './transitions'

/**
 * These must match public.jobs_guard(). If the two drift, the sheet offers a move
 * the server refuses and the person finds out through a failed outbox entry.
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
})

describe('completion is an approval', () => {
  it('is reachable only from review, for a manager and a partner alike', () => {
    for (const role of ['manager', 'partner'] as const) {
      expect(allowedMoves('review', role)).toContain('completed')
      for (const from of ['not_started', 'in_progress', 'on_hold', 'rework'] as const) {
        expect(allowedMoves(from, role)).not.toContain('completed')
      }
    }
  })

  it('still lets a manager cancel or send back from anywhere', () => {
    expect(allowedMoves('in_progress', 'manager')).toContain('cancelled')
    expect(allowedMoves('review', 'manager')).toContain('rework')
    expect(allowedMoves('completed', 'partner')).toContain('in_progress')
  })

  it('names the one move that is an approval', () => {
    expect(isApproval('review', 'completed')).toBe(true)
    expect(isApproval('in_progress', 'completed')).toBe(false)
    expect(isApproval('review', 'rework')).toBe(false)
  })
})
