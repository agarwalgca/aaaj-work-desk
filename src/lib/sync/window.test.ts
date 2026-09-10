import { describe, expect, it } from 'vitest'
import { cacheWindowStart, cacheWindowStartISO, financialYearStart, isInCacheWindow } from './window'

const on = (iso: string) => new Date(`${iso}T12:00:00`)

describe('financialYearStart', () => {
  it('starts the year on 1 April', () => {
    expect(financialYearStart(on('2026-09-10'))).toEqual(new Date(2026, 3, 1))
  })

  it('treats January to March as the year before', () => {
    expect(financialYearStart(on('2026-03-31'))).toEqual(new Date(2025, 3, 1))
  })

  it('turns over on 1 April, not 1 January', () => {
    expect(financialYearStart(on('2026-04-01'))).toEqual(new Date(2026, 3, 1))
  })
})

describe('cacheWindowStart', () => {
  it('reaches back to 1 April of the previous financial year', () => {
    expect(cacheWindowStart(on('2026-09-10'))).toEqual(new Date(2025, 3, 1))
    expect(cacheWindowStartISO(on('2026-09-10'))).toBe('2025-04-01')
  })

  it('shifts a whole year the moment the new FY begins', () => {
    expect(cacheWindowStartISO(on('2026-03-31'))).toBe('2024-04-01')
    expect(cacheWindowStartISO(on('2026-04-01'))).toBe('2025-04-01')
  })
})

describe('isInCacheWindow', () => {
  const today = on('2026-09-10')

  it('keeps an open job however old it is', () => {
    expect(isInCacheWindow({ status: 'in_progress', completed_at: null }, today)).toBe(true)
    expect(isInCacheWindow({ status: 'on_hold', completed_at: null }, today)).toBe(true)
  })

  it('keeps a job closed inside the previous financial year', () => {
    expect(isInCacheWindow({ status: 'completed', completed_at: '2026-02-14T10:00:00Z' }, today)).toBe(true)
  })

  it('keeps a job closed inside the current financial year', () => {
    expect(isInCacheWindow({ status: 'completed', completed_at: '2026-08-11T10:00:00Z' }, today)).toBe(true)
  })

  it('drops a job closed three financial years ago', () => {
    expect(isInCacheWindow({ status: 'completed', completed_at: '2023-08-20T10:00:00Z' }, today)).toBe(false)
  })

  it('drops a cancelled job that is equally out of range', () => {
    expect(isInCacheWindow({ status: 'cancelled', completed_at: '2024-01-05T10:00:00Z' }, today)).toBe(false)
  })

  it('holds the boundary on 1 April itself', () => {
    expect(isInCacheWindow({ status: 'completed', completed_at: '2025-04-01T00:00:00' }, today)).toBe(true)
    expect(isInCacheWindow({ status: 'completed', completed_at: '2025-03-31T23:59:59' }, today)).toBe(false)
  })
})
