/** Parse a typed number; returns NaN for anything that is not a plain number. */
export function num(s: string): number {
  const t = s.trim().replace(',', '.')
  return t === '' ? NaN : Number(t)
}

/** Keep only known string keys from saved data, falling back to the defaults. */
export function mergeForm<T extends Record<string, string>>(defaults: T, saved: unknown): T {
  const out: Record<string, string> = { ...defaults }
  if (saved && typeof saved === 'object') {
    for (const key of Object.keys(defaults)) {
      const v = (saved as Record<string, unknown>)[key]
      if (typeof v === 'string' && v.length < 40) out[key] = v
    }
  }
  return out as T
}

export function downloadCsv(filename: string, rows: (string | number)[][]): void {
  const csv = rows.map((r) => r.map((c) => (typeof c === 'string' && /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : String(c))).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function sig(v: number, digits = 4): string {
  if (!Number.isFinite(v)) return '—'
  if (v === 0) return '0'
  const a = Math.abs(v)
  return a >= 1e5 || a < 1e-3 ? v.toExponential(digits - 1) : String(Number(v.toPrecision(digits)))
}

export const MD_DEFAULT = { n: '108', density: '0.8442', temp: '1.0', dt: '0.004', thermo: 'off', target: '1.0' }
export type MdForm = typeof MD_DEFAULT

export const KIN_DEFAULT = {
  model: 'enzyme',
  ek1: '1', ekm1: '1', ekcat: '0.5', ee0: '0.01', es0: '10', ei0: '0', ekon: '1', ekoff: '2', etmax: '1000',
  rkf: '0.8', rkr: '0.3', ra0: '2', rb0: '0', rtmax: '10',
  ck1: '0.9', ck2: '0.35', ca0: '4', ctmax: '12',
}
export type KinForm = typeof KIN_DEFAULT

export const PK_DEFAULT = { dose: '500', f: '0.8', v: '40', cl: '5', ka: '1.2', tau: '12', doses: '6' }
export type PkForm = typeof PK_DEFAULT
