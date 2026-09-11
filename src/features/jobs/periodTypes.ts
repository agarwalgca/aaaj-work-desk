import type { Frequency, JobCategory } from '../../lib/types'
import { recentPeriods } from '../recurring/periods'

/**
 * Which shape of period a job is measured in.
 *
 * `period_label` stays free text in the database — the firm will eventually want
 * something this does not anticipate, and a job that cannot be labelled is worse
 * than an inconsistent label. But free text as the *only* option produces
 * "Aug 26", "Aug-2026" and "August 2026" across three people in a week, and then
 * nothing groups or sorts.
 */
export type PeriodType = Frequency | 'custom'

/**
 * What a job of this kind is usually measured in. Defaults only, overridable on
 * every job — a GST notice might concern one month or a whole year.
 *
 * These are a guess at the firm's practice and should be corrected against it.
 */
const DEFAULT_PERIOD: Record<JobCategory, PeriodType> = {
  gst_return: 'monthly',
  gst_notice: 'custom',
  income_tax: 'annual',
  tds: 'quarterly',
  audit: 'annual',
  roc: 'annual',
  accounting: 'monthly',
  certification: 'annual',
  other: 'custom',
}

/** How far back to offer, by shape. Just over a year of months, two of quarters. */
export const PERIODS_OFFERED: Record<Frequency, number> = {
  monthly: 14,
  quarterly: 8,
  half_yearly: 5,
  annual: 4,
}

export const defaultPeriodType = (category: JobCategory): PeriodType => DEFAULT_PERIOD[category]

/** The period of that shape we are in now — what a new job almost always means. */
export function currentPeriodLabel(type: PeriodType, on = new Date()): string {
  return type === 'custom' ? '' : recentPeriods(on, type, 1)[0].label
}

/**
 * Work out which shape an existing label came from, so editing a job does not drop
 * it into "Something else" and make the person choose again.
 */
export function detectPeriodType(label: string, on = new Date()): PeriodType {
  if (!label.trim()) return 'custom'
  for (const frequency of Object.keys(PERIODS_OFFERED) as Frequency[]) {
    const known = recentPeriods(on, frequency, PERIODS_OFFERED[frequency] + 6)
    if (known.some((period) => period.label === label)) return frequency
  }
  return 'custom'
}

/**
 * The period behind a label, so a job created from the form can be linked to the
 * template that will go on producing them. Without the key the scheduler has no
 * way to know this period is already done and would create it again on the 1st.
 */
export function periodForLabel(label: string, frequency: Frequency, on = new Date()) {
  return recentPeriods(on, frequency, PERIODS_OFFERED[frequency] + 6).find(
    (period) => period.label === label,
  )
}

/** "Month", "Quarter", "Half-year", "Financial year" — how a person says it. */
export const PERIOD_TYPE_LABEL: Record<PeriodType, string> = {
  monthly: 'Month',
  quarterly: 'Quarter',
  half_yearly: 'Half-year',
  annual: 'Financial year',
  custom: 'Something else',
}
