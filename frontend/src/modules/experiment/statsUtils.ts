// Basic statistics for experimental replicates. Everything here is calculated from the numbers given.

export interface Describe {
  n: number
  mean: number
  /** Sample standard deviation (divides by n - 1). Null when n < 2. */
  sd: number | null
  /** Population standard deviation (divides by n). */
  sdPop: number
  variance: number | null
  sem: number | null
  /** Coefficient of variation in percent, from the sample SD. Null when the mean is 0 or n < 2. */
  cv: number | null
  median: number
  min: number
  max: number
  ci95: [number, number] | null
  outliers: number[]
}

function quantile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0]
  const h = (sorted.length - 1) * p
  const lo = Math.floor(h)
  const hi = Math.ceil(h)
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo])
}

// ---- distributions -------------------------------------------------------------------------------------------

function logGamma(x: number): number {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]
  let y = x
  let tmp = x + 5.5
  tmp -= (x + 0.5) * Math.log(tmp)
  let ser = 1.000000000190015
  for (const cj of c) ser += cj / ++y
  return -tmp + Math.log((2.5066282746310005 * ser) / x)
}

function betaCf(x: number, a: number, b: number): number {
  const tiny = 1e-300
  let c = 1
  let d = 1 - ((a + b) * x) / (a + 1)
  if (Math.abs(d) < tiny) d = tiny
  d = 1 / d
  let h = d
  for (let m = 1; m <= 500; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < tiny) d = tiny
    c = 1 + aa / c
    if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    h *= d * c
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1))
    d = 1 + aa * d
    if (Math.abs(d) < tiny) d = tiny
    c = 1 + aa / c
    if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-15) break
  }
  return h
}

/** Regularised incomplete beta function I_x(a, b). */
export function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x))
  return x < (a + 1) / (a + b + 2) ? (bt * betaCf(x, a, b)) / a : 1 - (bt * betaCf(1 - x, b, a)) / b
}

/** Two-sided p-value for a t statistic with df degrees of freedom. */
export function tTwoSidedP(t: number, df: number): number {
  return incompleteBeta(df / (df + t * t), df / 2, 0.5)
}

/** Upper-tail p-value of the F distribution. */
export function fUpperP(f: number, d1: number, d2: number): number {
  if (f <= 0) return 1
  return incompleteBeta(d2 / (d2 + d1 * f), d2 / 2, d1 / 2)
}

/** Positive t value with a given two-sided tail probability (for example 0.05 gives the 97.5th percentile). */
export function tCritical(df: number, twoSidedAlpha = 0.05): number {
  let lo = 0
  let hi = 1000
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (tTwoSidedP(mid, df) > twoSidedAlpha) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

// ---- descriptive statistics ------------------------------------------------------------------------------------

export function describe(values: number[]): Describe | null {
  const n = values.length
  if (n === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mean = values.reduce((s, v) => s + v, 0) / n
  const ss = values.reduce((s, v) => s + (v - mean) ** 2, 0)
  const variance = n > 1 ? ss / (n - 1) : null
  const sd = variance === null ? null : Math.sqrt(variance)
  const sem = sd === null ? null : sd / Math.sqrt(n)
  const q1 = quantile(sorted, 0.25)
  const q3 = quantile(sorted, 0.75)
  const lowFence = q1 - 1.5 * (q3 - q1)
  const highFence = q3 + 1.5 * (q3 - q1)
  return {
    n,
    mean,
    sd,
    sdPop: Math.sqrt(ss / n),
    variance,
    sem,
    cv: sd === null || mean === 0 ? null : (sd / Math.abs(mean)) * 100,
    median: quantile(sorted, 0.5),
    min: sorted[0],
    max: sorted[n - 1],
    ci95: sem === null ? null : [mean - tCritical(n - 1) * sem, mean + tCritical(n - 1) * sem],
    outliers: n >= 4 ? values.filter((v) => v < lowFence || v > highFence) : [],
  }
}

// ---- tests -----------------------------------------------------------------------------------------------------

export interface TTest {
  kind: 'Welch' | 'paired'
  t: number
  df: number
  p: number
  meanDiff: number
}

/** Welch's unequal-variance t-test (two-sided) on the difference mean(a) - mean(b). */
export function welchTTest(a: number[], b: number[]): TTest | null {
  const da = describe(a)
  const db = describe(b)
  if (!da || !db || da.variance === null || db.variance === null) return null
  const va = da.variance / da.n
  const vb = db.variance / db.n
  if (va + vb === 0) return null
  const t = (da.mean - db.mean) / Math.sqrt(va + vb)
  const df = (va + vb) ** 2 / (va ** 2 / (da.n - 1) + vb ** 2 / (db.n - 1))
  return { kind: 'Welch', t, df, p: tTwoSidedP(t, df), meanDiff: da.mean - db.mean }
}

/** Paired t-test (two-sided) on equal-length samples, using differences a - b. */
export function pairedTTest(a: number[], b: number[]): TTest | null {
  if (a.length !== b.length || a.length < 2) return null
  const diffs = a.map((v, i) => v - b[i])
  const d = describe(diffs)
  if (!d || d.sem === null || d.sem === 0) return null
  const t = d.mean / d.sem
  const df = a.length - 1
  return { kind: 'paired', t, df, p: tTwoSidedP(t, df), meanDiff: d.mean }
}

export interface Anova {
  f: number
  df1: number
  df2: number
  p: number
  ssBetween: number
  ssWithin: number
}

/** One-way ANOVA across groups (assumes independent groups, roughly normal, similar variances). */
export function oneWayAnova(groups: number[][]): Anova | null {
  const k = groups.length
  const N = groups.reduce((s, g) => s + g.length, 0)
  if (k < 2 || groups.some((g) => g.length < 1) || N - k < 1) return null
  const grand = groups.flat().reduce((s, v) => s + v, 0) / N
  let ssb = 0
  let ssw = 0
  for (const g of groups) {
    const m = g.reduce((s, v) => s + v, 0) / g.length
    ssb += g.length * (m - grand) ** 2
    ssw += g.reduce((s, v) => s + (v - m) ** 2, 0)
  }
  if (ssw === 0) return null
  const df1 = k - 1
  const df2 = N - k
  const f = ssb / df1 / (ssw / df2)
  return { f, df1, df2, p: fUpperP(f, df1, df2), ssBetween: ssb, ssWithin: ssw }
}

export function fmt(v: number | null | undefined, digits = 4): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  if (v !== 0 && Math.abs(v) < 1e-4) return v.toExponential(2)
  return Number(v.toPrecision(digits)).toString()
}

export function fmtP(p: number): string {
  if (!Number.isFinite(p)) return '—'
  return p < 0.0001 ? '< 0.0001' : p.toFixed(4)
}
