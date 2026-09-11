import type { JobCategory, JobPriority, JobStatus, UserRole } from './types'

/** The firm's own words for what a job is. Ask before adding to this list. */
export const CATEGORY_LABEL: Record<JobCategory, string> = {
  gst_return: 'GST return',
  gst_notice: 'GST notice',
  income_tax: 'Income tax',
  tds: 'TDS',
  audit: 'Audit',
  roc: 'ROC',
  accounting: 'Accounting',
  certification: 'Certification',
  other: 'Other',
}

export const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABEL).map(([value, label]) => ({
  value,
  label,
}))

export const STATUS_LABEL: Record<JobStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  on_hold: 'On hold',
  review: 'Review',
  rework: 'Rework',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export const PRIORITY_LABEL: Record<JobPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
}

export const ROLE_LABEL: Record<UserRole, string> = {
  partner: 'Partner',
  manager: 'Manager',
  staff: 'Staff',
}
