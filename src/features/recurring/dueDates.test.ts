import { describe, expect, it } from 'vitest'
import { describeDueRule, dueDateFor, periodContaining } from './periods'

const endOf = (iso: string, freq: Parameters<typeof periodContaining>[1]) =>
  periodContaining(new Date(`${iso}T12:00:00`), freq).end

describe('dueDateFor', () => {
  it('puts a monthly GST return on the 20th of the following month', () => {
    expect(dueDateFor(endOf('2026-08-15', 'monthly'), 20, 1)).toBe('2026-09-20')
  })

  it('puts a quarterly TDS return on the 31st of the month after the quarter', () => {
    // Q1 is Apr-Jun, so the month after is July.
    expect(dueDateFor(endOf('2026-05-15', 'quarterly'), 31, 1)).toBe('2026-07-31')
  })

  it('handles an annual return due months after the year closes', () => {
    // FY 2025-26 ends 31 Mar 2026; four months on is July.
    expect(dueDateFor(endOf('2026-01-10', 'annual'), 31, 4)).toBe('2026-07-31')
  })

  it('clamps the 31st to the length of a short month', () => {
    // One month after 31 Aug is September, which has 30 days.
    expect(dueDateFor(endOf('2026-08-15', 'monthly'), 31, 1)).toBe('2026-09-30')
    // And February, in a leap year and out of one.
    expect(dueDateFor(endOf('2027-01-15', 'monthly'), 31, 1)).toBe('2027-02-28')
    expect(dueDateFor(endOf('2028-01-15', 'monthly'), 31, 1)).toBe('2028-02-29')
  })

  it('rolls into the next calendar year', () => {
    expect(dueDateFor(endOf('2026-12-15', 'monthly'), 20, 1)).toBe('2027-01-20')
  })

  it('allows a date inside the ending month itself', () => {
    expect(dueDateFor(endOf('2026-08-15', 'monthly'), 25, 0)).toBe('2026-08-25')
  })
})

describe('describeDueRule', () => {
  it('reads like a person would say it', () => {
    expect(describeDueRule(20, 1)).toBe('The 20th the month after the period ends')
    expect(describeDueRule(1, 2)).toBe('The 1st 2 months after the period ends')
    expect(describeDueRule(3, 0)).toBe('The 3rd in the month the period ends')
    expect(describeDueRule(22, 1)).toBe('The 22nd the month after the period ends')
    expect(describeDueRule(null, null)).toBe('No date set automatically')
  })
})
