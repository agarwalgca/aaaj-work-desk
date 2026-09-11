import { describe, expect, it } from 'vitest'
import {
  financialYearLabel,
  financialYearOf,
  periodContaining,
  previousPeriod,
  recentPeriods,
} from './periods'

const on = (iso: string) => new Date(`${iso}T12:00:00`)
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

describe('the financial year', () => {
  it('starts in April, not January', () => {
    expect(financialYearOf(on('2026-03-31'))).toBe(2025)
    expect(financialYearOf(on('2026-04-01'))).toBe(2026)
  })

  it('is named across two years', () => {
    expect(financialYearLabel(2025)).toBe('2025-26')
    expect(financialYearLabel(2026)).toBe('2026-27')
    // The one that catches people out.
    expect(financialYearLabel(2099)).toBe('2099-00')
  })
})

describe('monthly', () => {
  it('is a calendar month', () => {
    const p = periodContaining(on('2026-08-14'), 'monthly')
    expect(p.label).toBe('Aug-2026')
    expect(ymd(p.start)).toBe('2026-08-01')
    expect(ymd(p.end)).toBe('2026-08-31')
  })

  it('gets February right in a leap year', () => {
    expect(ymd(periodContaining(on('2028-02-10'), 'monthly').end)).toBe('2028-02-29')
  })

  it('steps back across a year boundary', () => {
    const jan = periodContaining(on('2026-01-15'), 'monthly')
    expect(previousPeriod(jan, 'monthly').label).toBe('Dec-2025')
  })
})

describe('quarterly', () => {
  it('counts quarters from April', () => {
    expect(periodContaining(on('2026-05-02'), 'quarterly').label).toBe('Q1 FY 2026-27')
    expect(periodContaining(on('2026-08-02'), 'quarterly').label).toBe('Q2 FY 2026-27')
    expect(periodContaining(on('2026-11-02'), 'quarterly').label).toBe('Q3 FY 2026-27')
    expect(periodContaining(on('2027-02-02'), 'quarterly').label).toBe('Q4 FY 2026-27')
  })

  it('keeps Q4 inside the financial year it belongs to', () => {
    const q4 = periodContaining(on('2027-02-02'), 'quarterly')
    expect(ymd(q4.start)).toBe('2027-01-01')
    expect(ymd(q4.end)).toBe('2027-03-31')
    expect(q4.key).toBe('Q-2026-4')
  })

  it('steps from Q1 back into the previous financial year', () => {
    const q1 = periodContaining(on('2026-05-02'), 'quarterly')
    expect(previousPeriod(q1, 'quarterly').label).toBe('Q4 FY 2025-26')
  })
})

describe('half-yearly', () => {
  it('splits the financial year at October', () => {
    const h1 = periodContaining(on('2026-06-01'), 'half_yearly')
    expect(h1.label).toBe('H1 FY 2026-27')
    expect(ymd(h1.start)).toBe('2026-04-01')
    expect(ymd(h1.end)).toBe('2026-09-30')

    const h2 = periodContaining(on('2026-11-01'), 'half_yearly')
    expect(h2.label).toBe('H2 FY 2026-27')
    expect(ymd(h2.start)).toBe('2026-10-01')
    expect(ymd(h2.end)).toBe('2027-03-31')
  })

  it('puts February in H2 of the year that began the previous April', () => {
    expect(periodContaining(on('2027-02-01'), 'half_yearly').label).toBe('H2 FY 2026-27')
  })
})

describe('annual', () => {
  it('runs April to March', () => {
    const fy = periodContaining(on('2026-01-20'), 'annual')
    expect(fy.label).toBe('FY 2025-26')
    expect(ymd(fy.start)).toBe('2025-04-01')
    expect(ymd(fy.end)).toBe('2026-03-31')
  })
})

describe('recentPeriods', () => {
  it('offers the current period and the ones behind it', () => {
    expect(recentPeriods(on('2026-09-11'), 'monthly', 3).map((p) => p.label)).toEqual([
      'Sep-2026',
      'Aug-2026',
      'Jul-2026',
    ])
  })

  it('never repeats a key', () => {
    const keys = recentPeriods(on('2026-09-11'), 'quarterly', 6).map((p) => p.key)
    expect(new Set(keys).size).toBe(6)
  })
})
