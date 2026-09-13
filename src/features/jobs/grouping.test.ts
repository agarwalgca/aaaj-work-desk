import { describe, expect, it } from 'vitest'
import { dueLabel } from '../../lib/dates'
import type { Job } from '../../lib/types'
import { byDueThenPriority, dueGroup, groupByDue, isOverdue } from './grouping'

const today = new Date(2026, 8, 10) // 10 Sep 2026

const job = (patch: Partial<Job>): Job => ({
  id: crypto.randomUUID(),
  client_id: 'c1',
  title: 'GSTR-3B',
  description: '',
  category: 'gst_return',
  period_label: 'Aug-2026',
  assigned_to: 'u1',
  assigned_by: null,
  reviewer_id: null,
  status: 'not_started',
  priority: 'normal',
  due_date: null,
  started_at: null,
  completed_at: null,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  deleted_at: null,
  template_id: null,
  period_key: null,
  approved_by: null,
  approved_at: null,
  ...patch,
})

describe('dueGroup', () => {
  it('separates late, today and the coming week', () => {
    expect(dueGroup('2026-09-09', today)).toBe('overdue')
    expect(dueGroup('2026-09-10', today)).toBe('today')
    expect(dueGroup('2026-09-11', today)).toBe('this_week')
    expect(dueGroup('2026-09-17', today)).toBe('this_week')
    expect(dueGroup('2026-09-18', today)).toBe('later')
    expect(dueGroup(null, today)).toBe('no_date')
  })

  it('does not treat a job due in seven days as later', () => {
    expect(dueGroup('2026-09-17', today)).toBe('this_week')
  })
})

describe('isOverdue', () => {
  it('is about open jobs only — a finished job cannot be late', () => {
    expect(isOverdue({ status: 'in_progress', due_date: '2026-09-01' }, today)).toBe(true)
    expect(isOverdue({ status: 'completed', due_date: '2026-09-01' }, today)).toBe(false)
    expect(isOverdue({ status: 'cancelled', due_date: '2026-09-01' }, today)).toBe(false)
  })
})

describe('groupByDue', () => {
  it('returns groups in reading order and omits the empty ones', () => {
    const groups = groupByDue(
      [job({ due_date: '2026-12-01' }), job({ due_date: '2026-09-01' }), job({ due_date: '2026-09-10' })],
      today,
    )
    expect(groups.map((g) => g.group)).toEqual(['overdue', 'today', 'later'])
  })

  it('sorts the soonest first, and urgent above normal on the same day', () => {
    const urgent = job({ due_date: '2026-09-12', priority: 'urgent' })
    const normal = job({ due_date: '2026-09-12', priority: 'normal' })
    const sooner = job({ due_date: '2026-09-11', priority: 'low' })

    const [week] = groupByDue([normal, urgent, sooner], today)
    expect(week.jobs.map((j) => j.id)).toEqual([sooner.id, urgent.id, normal.id])
  })

  it('puts undated jobs last rather than first', () => {
    const dated = job({ due_date: '2026-09-20' })
    const undated = job({ due_date: null })
    expect([undated, dated].sort(byDueThenPriority).map((j) => j.id)).toEqual([dated.id, undated.id])
  })
})

describe('dueLabel', () => {
  it('says it the way a person would', () => {
    expect(dueLabel('2026-09-10', today)).toBe('Due today')
    expect(dueLabel('2026-09-11', today)).toBe('Due tomorrow')
    expect(dueLabel('2026-09-09', today)).toBe('1 day late')
    expect(dueLabel('2026-09-04', today)).toBe('6 days late')
    expect(dueLabel('2026-09-15', today)).toBe('In 5 days')
    expect(dueLabel(null, today)).toBe('No date')
  })
})
