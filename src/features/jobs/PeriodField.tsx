import { Select } from '../../components/Select'
import { TextField } from '../../components/TextField'
import type { Frequency } from '../../lib/types'
import { recentPeriods } from '../recurring/periods'
import {
  PERIODS_OFFERED,
  PERIOD_TYPE_LABEL,
  currentPeriodLabel,
  type PeriodType,
} from './periodTypes'

/**
 * The period a job covers, picked rather than typed — with typing still there for
 * the case nobody anticipated. See periodTypes.ts for why both.
 */
export function PeriodField({
  value,
  type,
  onChangeValue,
  onChangeType,
}: {
  value: string
  type: PeriodType
  onChangeValue: (value: string) => void
  onChangeType: (type: PeriodType) => void
}) {
  const options =
    type === 'custom'
      ? []
      : recentPeriods(new Date(), type, PERIODS_OFFERED[type]).map((p) => p.label)

  return (
    <>
      <Select
        label="Period is a"
        value={type}
        onChange={(e) => {
          const next = e.target.value as PeriodType
          onChangeType(next)
          // Moving between shapes leaves the old label meaningless, so start the
          // new shape on its current period rather than on something stale.
          onChangeValue(currentPeriodLabel(next))
        }}
        options={[
          ...(Object.keys(PERIODS_OFFERED) as Frequency[]).map((f) => ({
            value: f,
            label: PERIOD_TYPE_LABEL[f],
          })),
          { value: 'custom', label: PERIOD_TYPE_LABEL.custom },
        ]}
      />

      {type === 'custom' ? (
        <TextField
          label="Period"
          value={value}
          onChange={(e) => onChangeValue(e.target.value)}
          placeholder="Whatever the firm calls it"
          hint="Free text — used on the job as written"
        />
      ) : (
        <Select
          label="Period"
          value={value}
          onChange={(e) => onChangeValue(e.target.value)}
          className="font-mono"
          options={[
            // An older label keeps its place rather than vanishing on edit.
            ...(options.includes(value) || value === '' ? [] : [{ value, label: value }]),
            ...options.map((label) => ({ value: label, label })),
          ]}
        />
      )}
    </>
  )
}
