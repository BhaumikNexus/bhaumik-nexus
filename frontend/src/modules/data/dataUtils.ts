export type Cell = string

export interface Column {
  name: string
  numeric: boolean
  /** Parsed values; null where the cell is empty or marked missing. Only meaningful for numeric columns. */
  values: (number | null)[]
  raw: Cell[]
}

export interface Table {
  columns: Column[]
  rowCount: number
}

const MISSING = new Set(['', 'na', 'n/a', 'nan', 'null', 'none', '-'])

/** Splits delimited text into rows. Handles quoted fields, doubled quotes and line breaks inside quotes. */
export function parseDelimited(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^\uFEFF/, '')
  const d = delimiter ?? detectDelimiter(src)
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
    } else if (ch === '"' && field === '') quoted = true
    else if (ch === d) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((c) => c.trim() !== '') || row.length > 1) rows.push(row)
      row = []
    } else field += ch
  }
  row.push(field)
  if (row.some((c) => c.trim() !== '') || row.length > 1) rows.push(row)
  return rows
}

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim() !== '') ?? ''
  let best = ','
  let bestCount = -1
  for (const d of ['\t', ',', ';']) {
    let count = 0
    let quoted = false
    for (const ch of firstLine) {
      if (ch === '"') quoted = !quoted
      else if (ch === d && !quoted) count++
    }
    if (count > bestCount) {
      best = d
      bestCount = count
    }
  }
  return best
}

export function toNumber(cell: string): number | null {
  const t = cell.trim()
  if (MISSING.has(t.toLowerCase())) return null
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return NaN
  return Number(t)
}

/** First row is the header. A column is numeric when every non-missing cell is a number and at least one is present. */
export function buildTable(rows: string[][]): Table {
  if (rows.length === 0) return { columns: [], rowCount: 0 }
  const header = rows[0]
  const body = rows.slice(1)
  const width = Math.max(header.length, ...body.map((r) => r.length))
  const used = new Set<string>()
  const columns: Column[] = []
  for (let c = 0; c < width; c++) {
    let name = (header[c] ?? '').trim() || `Column ${c + 1}`
    while (used.has(name)) name += '_'
    used.add(name)
    const raw = body.map((r) => (r[c] ?? '').trim())
    const parsed = raw.map(toNumber)
    const present = parsed.filter((v) => v !== null)
    const numeric = present.length > 0 && present.every((v) => !Number.isNaN(v))
    columns.push({ name, numeric, raw, values: numeric ? parsed.map((v) => (v === null || Number.isNaN(v) ? null : v)) : [] })
  }
  return { columns, rowCount: body.length }
}

export interface Summary {
  n: number
  missing: number
  mean: number
  sd: number | null
  min: number
  q1: number
  median: number
  q3: number
  max: number
}

/** Quantile with linear interpolation between order statistics (the common "type 7" definition). */
export function quantile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0]
  const h = (sorted.length - 1) * p
  const lo = Math.floor(h)
  const hi = Math.ceil(h)
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo])
}

export function summarize(values: (number | null)[]): Summary | null {
  const xs = values.filter((v): v is number => v !== null)
  if (xs.length === 0) return null
  const sorted = [...xs].sort((a, b) => a - b)
  const mean = xs.reduce((s, v) => s + v, 0) / xs.length
  const sd = xs.length > 1 ? Math.sqrt(xs.reduce((s, v) => s + (v - mean) ** 2, 0) / (xs.length - 1)) : null
  return {
    n: xs.length,
    missing: values.length - xs.length,
    mean,
    sd,
    min: sorted[0],
    q1: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    q3: quantile(sorted, 0.75),
    max: sorted[sorted.length - 1],
  }
}

export function pairs(x: (number | null)[], y: (number | null)[]): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const a = x[i]
    const b = y[i]
    if (a !== null && b !== null) out.push([a, b])
  }
  return out
}

/** Pearson correlation of complete pairs. Null when fewer than 3 pairs or when either variable has no spread. */
export function pearson(p: [number, number][]): { r: number; n: number } | null {
  const n = p.length
  if (n < 3) return null
  const mx = p.reduce((s, [a]) => s + a, 0) / n
  const my = p.reduce((s, [, b]) => s + b, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (const [a, b] of p) {
    sxy += (a - mx) * (b - my)
    sxx += (a - mx) ** 2
    syy += (b - my) ** 2
  }
  if (sxx === 0 || syy === 0) return null
  return { r: sxy / Math.sqrt(sxx * syy), n }
}

/** Ordinary least squares line y = slope * x + intercept. */
export function linearFit(p: [number, number][]): { slope: number; intercept: number; r2: number } | null {
  const c = pearson(p)
  if (!c) return null
  const n = p.length
  const mx = p.reduce((s, [a]) => s + a, 0) / n
  const my = p.reduce((s, [, b]) => s + b, 0) / n
  const sxx = p.reduce((s, [a]) => s + (a - mx) ** 2, 0)
  const sxy = p.reduce((s, [a, b]) => s + (a - mx) * (b - my), 0)
  const slope = sxy / sxx
  return { slope, intercept: my - slope * mx, r2: c.r ** 2 }
}

export function histogram(values: number[], bins?: number): { edges: number[]; counts: number[] } {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const k = bins ?? Math.max(1, Math.ceil(Math.log2(values.length) + 1))
  if (min === max) return { edges: [min - 0.5, max + 0.5], counts: [values.length] }
  const width = (max - min) / k
  const counts = new Array<number>(k).fill(0)
  for (const v of values) counts[Math.min(k - 1, Math.floor((v - min) / width))]++
  return { edges: Array.from({ length: k + 1 }, (_, i) => min + i * width), counts }
}

/** Round-number axis ticks that cover [min, max]. */
export function niceTicks(min: number, max: number, target = 6): number[] {
  if (min === max) {
    min -= 1
    max += 1
  }
  const raw = (max - min) / Math.max(1, target - 1)
  const mag = 10 ** Math.floor(Math.log10(raw))
  const f = raw / mag
  const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag
  const start = Math.floor(min / step) * step
  const ticks: number[] = []
  for (let v = start; v < max + step * 0.999; v += step) ticks.push(Number(v.toPrecision(12)))
  return ticks
}

export function fmt(v: number | null | undefined, digits = 4): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  return Number(v.toPrecision(digits)).toString()
}
