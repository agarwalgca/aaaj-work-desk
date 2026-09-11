/**
 * Which periods a recurring job repeats over.
 *
 * Everything here is financial-year shaped, because that is how the firm counts:
 * a quarter is Apr–Jun, not Jan–Mar, and "FY 2025-26" is a single thing rather
 * than two halves of two calendar years. Getting this wrong is not a display bug,
 * it is a job filed against the wrong quarter.
 */

import type { Frequency } from '../../lib/types'

export type { Frequency }

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  half_yearly: 'Half-yearly',
  annual: 'Annual',
}

export const FREQUENCIES: Frequency[] = ['monthly', 'quarterly', 'half_yearly', 'annual']

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export type Period = {
  /** Stable identity, used to know a period has already been generated. */
  key: string
  /** What a person reads on the job: "Aug-2026", "Q2 FY 2026-27", "FY 2025-26". */
  label: string
  /** First day of the period, as a local date. */
  start: Date
  /** Last day of the period, as a local date. */
  end: Date
}

/** The financial year a date falls in, named by its starting calendar year. */
export function financialYearOf(on: Date): number {
  return on.getMonth() >= 3 ? on.getFullYear() : on.getFullYear() - 1
}

/** "2025-26" for a financial year starting in 2025. */
export function financialYearLabel(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`
}

/** 0 for Apr–Jun, 1 for Jul–Sep, 2 for Oct–Dec, 3 for Jan–Mar. */
function quarterIndex(on: Date): number {
  return Math.floor(((on.getMonth() - 3 + 12) % 12) / 3)
}

const lastDayOf = (year: number, monthIndex: number) => new Date(year, monthIndex + 1, 0)

/** The period of the given frequency that `on` falls inside. */
export function periodContaining(on: Date, frequency: Frequency): Period {
  const fy = financialYearOf(on)
  const fyLabel = financialYearLabel(fy)

  if (frequency === 'monthly') {
    const year = on.getFullYear()
    const month = on.getMonth()
    return {
      key: `M-${year}-${String(month + 1).padStart(2, '0')}`,
      label: `${MONTHS[month]}-${year}`,
      start: new Date(year, month, 1),
      end: lastDayOf(year, month),
    }
  }

  if (frequency === 'quarterly') {
    const q = quarterIndex(on)
    const startMonth = (3 + q * 3) % 12
    const startYear = q === 3 ? fy + 1 : fy
    return {
      key: `Q-${fy}-${q + 1}`,
      label: `Q${q + 1} FY ${fyLabel}`,
      start: new Date(startYear, startMonth, 1),
      end: lastDayOf(startYear, startMonth + 2),
    }
  }

  if (frequency === 'half_yearly') {
    const h = quarterIndex(on) < 2 ? 0 : 1
    const startMonth = h === 0 ? 3 : 9
    const startYear = fy
    return {
      key: `H-${fy}-${h + 1}`,
      label: `H${h + 1} FY ${fyLabel}`,
      start: new Date(startYear, startMonth, 1),
      // H2 runs Oct–Mar, so it ends in the next calendar year.
      end: h === 0 ? lastDayOf(fy, 8) : lastDayOf(fy + 1, 2),
    }
  }

  return {
    key: `A-${fy}`,
    label: `FY ${fyLabel}`,
    start: new Date(fy, 3, 1),
    end: lastDayOf(fy + 1, 2),
  }
}

/** Step back one period. Used to offer the periods somebody might still owe. */
export function previousPeriod(period: Period, frequency: Frequency): Period {
  const dayBefore = new Date(period.start)
  dayBefore.setDate(dayBefore.getDate() - 1)
  return periodContaining(dayBefore, frequency)
}

/**
 * The periods worth offering to generate: the one we are in, and the few behind
 * it. A firm catching up in the second week of the month still needs last month.
 */
export function recentPeriods(on: Date, frequency: Frequency, count = 4): Period[] {
  const periods: Period[] = [periodContaining(on, frequency)]
  while (periods.length < count) {
    periods.push(previousPeriod(periods[periods.length - 1], frequency))
  }
  return periods
}

/**
 * When the work for a finished period is due, under the firm's own rule.
 *
 * Expressed the way a deadline is actually spoken: "the 20th of the month after
 * the period", "the 31st, four months after the year ends". `monthsAfter` counts
 * from the month the period ended in, so a monthly return ending 31 August with
 * offset 1 and day 20 is due 20 September.
 *
 * This is the firm's figure, not a statutory one. Nothing here knows the law, and
 * that is deliberate: an app that quietly asserts a wrong date is worse than one
 * that asks. A manager overrides any job.
 */
export function dueDateFor(periodEnd: Date, day: number, monthsAfter: number): string {
  const target = new Date(periodEnd.getFullYear(), periodEnd.getMonth() + monthsAfter, 1)
  // "The 31st" in a 30-day month means the 30th, not the 1st of the month after.
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  const safeDay = Math.min(Math.max(day, 1), lastDay)

  const month = String(target.getMonth() + 1).padStart(2, '0')
  return `${target.getFullYear()}-${month}-${String(safeDay).padStart(2, '0')}`
}

/** The rule as a sentence, for the form: "Due on the 20th, 1 month after the period ends." */
export function describeDueRule(day: number | null, monthsAfter: number | null): string {
  if (day === null) return 'No date set automatically'
  const ordinal =
    day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th'
  const when =
    !monthsAfter ? 'in the month the period ends'
    : monthsAfter === 1 ? 'the month after the period ends'
    : `${monthsAfter} months after the period ends`
  return `The ${day}${ordinal} ${when}`
}
