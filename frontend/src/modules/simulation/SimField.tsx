interface FieldProps {
  id: string
  label: string
  unit?: string
  value: string
  onChange: (v: string) => void
  invalid?: boolean
}

function SimField({ id, label, unit, value, onChange, invalid }: FieldProps) {
  return (
    <div className="sim-field">
      <label htmlFor={id}>{label}{unit ? ` (${unit})` : ''}</label>
      <input id={id} value={value} inputMode="decimal" spellCheck={false} aria-invalid={invalid || undefined} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

export default SimField
