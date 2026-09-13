import type { JobPriority, JobStatus, UserRole } from './types'


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
