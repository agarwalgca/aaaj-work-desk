import { describe, expect, it } from 'vitest'
import {
  currentPeriodLabel,
  defaultPeriodType,
  detectPeriodType,
  periodForLabel,
} from './periodTypes'

const on = new Date(2026, 8, 12) // 12 Sep 2026

describe('what a category is usually measured in', () => {
  it('matches how the work actually recurs', () => {
    expect(defaultPeriodType('gst_return')).toBe('monthly')
    expect(defaultPeriodType('accounting')).toBe('monthly')
    expect(defaultPeriodType('tds')).toBe('quarterly')
    expect(defaultPeriodType('income_tax')).toBe('annual')
    expect(defaultPeriodType('audit')).toBe('annual')
    expect(defaultPeriodType('roc')).toBe('annual')
  })

  it('leaves the open-ended ones to a person', () => {
    expect(defaultPeriodType('gst_notice')).toBe('custom')
    expect(defaultPeriodType('other')).toBe('custom')
  })
})

describe('currentPeriodLabel', () => {
  it('gives the period we are in, in the firm’s own terms', () => {
    expect(currentPeriodLabel('monthly', on)).toBe('Sep-2026')
    expect(currentPeriodLabel('quarterly', on)).toBe('Q2 FY 2026-27')
    expect(currentPeriodLabel('half_yearly', on)).toBe('H1 FY 2026-27')
    expect(currentPeriodLabel('annual', on)).toBe('FY 2026-27')
  })

  it('has nothing to offer for free text', () => {
    expect(currentPeriodLabel('custom', on)).toBe('')
  })
})

describe('detectPeriodType', () => {
  it('recognises a label it produced, so editing keeps its shape', () => {
    expect(detectPeriodType('Sep-2026', on)).toBe('monthly')
    expect(detectPeriodType('Q1 FY 2026-27', on)).toBe('quarterly')
    expect(detectPeriodType('H1 FY 2026-27', on)).toBe('half_yearly')
    expect(detectPeriodType('FY 2025-26', on)).toBe('annual')
  })

  it('reaches back far enough for a job someone is catching up on', () => {
    expect(detectPeriodType('Aug-2025', on)).toBe('monthly')
  })

  it('falls back to free text for anything hand-written', () => {
    expect(detectPeriodType('August 2026', on)).toBe('custom')
    expect(detectPeriodType('FY 2025-2026', on)).toBe('custom')
    expect(detectPeriodType('', on)).toBe('custom')
  })
})

describe('periodForLabel', () => {
  it('recovers the key a job needs to be linked to its template', () => {
    expect(periodForLabel('Sep-2026', 'monthly', on)?.key).toBe('M-2026-09')
    expect(periodForLabel('Q1 FY 2026-27', 'quarterly', on)?.key).toBe('Q-2026-1')
    expect(periodForLabel('FY 2025-26', 'annual', on)?.key).toBe('A-2025')
  })

  it('returns nothing for a label that shape never produced', () => {
    // Without this the job would be linked to a period the scheduler does not
    // recognise, and the 1st would create it all over again.
    expect(periodForLabel('August 2026', 'monthly', on)).toBeUndefined()
    expect(periodForLabel('Sep-2026', 'annual', on)).toBeUndefined()
  })
})
