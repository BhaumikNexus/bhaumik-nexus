// Assumption checks, rank-based tests and Tukey's post-hoc test.
import { chiSqUpperP, describe, logGamma, normCdf, oneWayAnova } from './statsUtils.ts'

function poly(c: number[], x: number): number {
  let r = 0
  for (let i = c.length - 1; i >= 0; i--) r = r * x + c[i]
  return r
}

/** Inverse of the standard normal CDF, by bisection and Newton polishing. */
export function normQuantile(p: number): number {
  if (p <= 0) return -Infinity
  if (p >= 1) return Infinity
  let lo = -40
  let hi = 40
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (normCdf(mid) < p) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

// ---- Shapiro-Wilk (Royston 1992, algorithm AS R94) ----------------------------------------------------------------

export interface Shapiro {
  w: number
  p: number
}

/** Shapiro-Wilk normality test for 3 to 5000 values. Null when outside that range or when all values are equal. */
export function shapiroWilk(values: number[]): Shapiro | null {
  const n = values.length
  if (n < 3 || n > 5000) return null
  const x = [...values].sort((a, b) => a - b)
  if (x[n - 1] - x[0] === 0) return null
  const nn2 = Math.floor(n / 2)
  const a = new Array<number>(nn2 + 1).fill(0)
  if (n === 3) {
    a[1] = Math.SQRT1_2
  } else {
    const c1 = [0, 0.221157, -0.147981, -2.07119, 4.434685, -2.706056]
    const c2 = [0, 0.042981, -0.293762, -1.752461, 5.682633, -3.582633]
    const an25 = n + 0.25
    const m = new Array<number>(nn2 + 1).fill(0)
    let summ2 = 0
    for (let i = 1; i <= nn2; i++) {
      m[i] = normQuantile((i - 0.375) / an25)
      summ2 += m[i] * m[i]
    }
    summ2 *= 2
    const ssumm2 = Math.sqrt(summ2)
    const rsn = 1 / Math.sqrt(n)
    const a1 = poly(c1, rsn) - m[1] / ssumm2
    let i1: number
    let fac: number
    if (n > 5) {
      i1 = 3
      const a2 = -m[2] / ssumm2 + poly(c2, rsn)
      fac = Math.sqrt((summ2 - 2 * m[1] * m[1] - 2 * m[2] * m[2]) / (1 - 2 * a1 * a1 - 2 * a2 * a2))
      a[2] = a2
    } else {
      i1 = 2
      fac = Math.sqrt((summ2 - 2 * m[1] * m[1]) / (1 - 2 * a1 * a1))
    }
    a[1] = a1
    for (let i = i1; i <= nn2; i++) a[i] = -m[i] / fac
  }
  let num = 0
  for (let i = 1; i <= nn2; i++) num += a[i] * (x[n - i] - x[i - 1])
  const mean = x.reduce((s, v) => s + v, 0) / n
  const ss = x.reduce((s, v) => s + (v - mean) ** 2, 0)
  let w = (num * num) / ss
  if (w > 1) w = 1

  let p: number
  if (n === 3) {
    p = (6 / Math.PI) * (Math.asin(Math.sqrt(w)) - Math.PI / 3)
    if (p < 0) p = 0
  } else {
    let y = Math.log(1 - w)
    let mu: number
    let sigma: number
    if (n <= 11) {
      const gamma = -2.273 + 0.459 * n
      if (y >= gamma) return { w, p: 1e-99 }
      y = -Math.log(gamma - y)
      mu = poly([0.544, -0.39978, 0.025054, -6.714e-4], n)
      sigma = Math.exp(poly([1.3822, -0.77857, 0.062767, -0.0020322], n))
    } else {
      const xx = Math.log(n)
      mu = poly([-1.5861, -0.31082, -0.083751, 0.0038915], xx)
      sigma = Math.exp(poly([-0.4803, -0.082676, 0.0030302], xx))
    }
    p = 1 - normCdf((y - mu) / sigma)
  }
  return { w, p }
}

// ---- Brown-Forsythe (Levene with the median) ----------------------------------------------------------------------

export function brownForsythe(groups: number[][]): { f: number; df1: number; df2: number; p: number } | null {
  const devs = groups.map((g) => {
    const d = describe(g)
    return d ? g.map((v) => Math.abs(v - d.median)) : []
  })
  const r = oneWayAnova(devs)
  return r ? { f: r.f, df1: r.df1, df2: r.df2, p: r.p } : null
}

// ---- ranks, Mann-Whitney, Kruskal-Wallis -----------------------------------------------------------------------------

/** Average ranks (ties share the mean rank) and the tie-group sizes. */
export function rankWithTies(values: number[]): { ranks: number[]; ties: number[] } {
  const idx = values.map((v, i) => [v, i] as const).sort((p, q) => p[0] - q[0])
  const ranks = new Array<number>(values.length)
  const ties: number[] = []
  let i = 0
  while (i < idx.length) {
    let j = i
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++
    const r = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) ranks[idx[k][1]] = r
    if (j > i) ties.push(j - i + 1)
    i = j + 1
  }
  return { ranks, ties }
}

export interface MannWhitney {
  u1: number
  u2: number
  p: number
  method: 'exact' | 'normal approximation'
}

/** Counts of each Mann-Whitney U value for sample sizes n1, n2 when there are no ties. */
function uCounts(n1: number, n2: number): number[] {
  // f[i][j] = distribution for sizes (i, j) built by the recurrence f(i, j, u) = f(i-1, j, u-j) + f(i, j-1, u)
  const memo = new Map<string, number[]>()
  const get = (i: number, j: number): number[] => {
    if (i === 0 || j === 0) return [1]
    const key = i + ',' + j
    const hit = memo.get(key)
    if (hit) return hit
    const a = get(i - 1, j)
    const b = get(i, j - 1)
    const out = new Array<number>(i * j + 1).fill(0)
    for (let u = 0; u < a.length; u++) out[u + j] += a[u]
    for (let u = 0; u < b.length; u++) out[u] += b[u]
    memo.set(key, out)
    return out
  }
  return get(n1, n2)
}

/** Two-sided Mann-Whitney U test. Exact for small samples without ties, otherwise a tie-corrected normal approximation. */
export function mannWhitney(a: number[], b: number[]): MannWhitney | null {
  const n1 = a.length
  const n2 = b.length
  if (n1 < 1 || n2 < 1) return null
  const all = [...a, ...b]
  const { ranks, ties } = rankWithTies(all)
  const r1 = ranks.slice(0, n1).reduce((s, v) => s + v, 0)
  const u1 = r1 - (n1 * (n1 + 1)) / 2
  const u2 = n1 * n2 - u1
  const u = Math.max(u1, u2)
  if (ties.length === 0 && n1 <= 30 && n2 <= 30) {
    const counts = uCounts(n1, n2)
    const total = counts.reduce((s, v) => s + v, 0)
    let tail = 0
    for (let k = Math.ceil(u); k < counts.length; k++) tail += counts[k]
    return { u1, u2, p: Math.min(1, (2 * tail) / total), method: 'exact' }
  }
  const N = n1 + n2
  const tieTerm = ties.reduce((s, t) => s + (t ** 3 - t), 0)
  const sigma = Math.sqrt(((n1 * n2) / 12) * (N + 1 - tieTerm / (N * (N - 1))))
  if (sigma === 0) return null
  const z = (u - (n1 * n2) / 2 - 0.5) / sigma
  return { u1, u2, p: Math.min(1, 2 * (1 - normCdf(z))), method: 'normal approximation' }
}

export interface KruskalWallis {
  h: number
  df: number
  p: number
}

export function kruskalWallis(groups: number[][]): KruskalWallis | null {
  const k = groups.length
  const N = groups.reduce((s, g) => s + g.length, 0)
  if (k < 2 || groups.some((g) => g.length === 0)) return null
  const { ranks, ties } = rankWithTies(groups.flat())
  let pos = 0
  let h = 0
  for (const g of groups) {
    const r = ranks.slice(pos, pos + g.length).reduce((s, v) => s + v, 0)
    h += (r * r) / g.length
    pos += g.length
  }
  h = (12 / (N * (N + 1))) * h - 3 * (N + 1)
  const corr = 1 - ties.reduce((s, t) => s + (t ** 3 - t), 0) / (N ** 3 - N)
  if (corr === 0) return null
  h /= corr
  return { h, df: k - 1, p: chiSqUpperP(h, k - 1) }
}

// ---- Tukey HSD -------------------------------------------------------------------------------------------------------

// Gauss-Legendre nodes and weights on [-1, 1] (16 points)
const GL_X = [
  -0.9894009349916499, -0.9445750230732326, -0.8656312023878318, -0.755404408355003, -0.6178762444026438, -0.4580167776572274,
  -0.2816035507792589, -0.0950125098376374, 0.0950125098376374, 0.2816035507792589, 0.4580167776572274, 0.6178762444026438,
  0.755404408355003, 0.8656312023878318, 0.9445750230732326, 0.9894009349916499,
]
const GL_W = [
  0.027152459411754096, 0.06225352393864789, 0.09515851168249279, 0.12462897125553388, 0.14959598881657674, 0.16915651939500254,
  0.18260341504492358, 0.1894506104550685, 0.1894506104550685, 0.18260341504492358, 0.16915651939500254, 0.14959598881657674,
  0.12462897125553388, 0.09515851168249279, 0.06225352393864789, 0.027152459411754096,
]

function integrate(f: (x: number) => number, a: number, b: number, panels: number): number {
  const h = (b - a) / panels
  let s = 0
  for (let p = 0; p < panels; p++) {
    const mid = a + (p + 0.5) * h
    for (let i = 0; i < 16; i++) s += GL_W[i] * f(mid + (h / 2) * GL_X[i])
  }
  return (s * h) / 2
}

const INV_SQRT_2PI = 1 / Math.sqrt(2 * Math.PI)

/** CDF of the studentised range for k means and df error degrees of freedom, by numerical integration. */
export function studentizedRangeCdf(q: number, k: number, df: number): number {
  if (q <= 0) return 0
  const wRange = (w: number): number =>
    k *
    integrate((z) => INV_SQRT_2PI * Math.exp(-0.5 * z * z) * Math.pow(Math.max(0, normCdf(z) - normCdf(z - w)), k - 1), -9, 9 + w, 8)
  const logConst = (df / 2) * Math.log(df) - logGamma(df / 2) - (df / 2 - 1) * Math.LN2
  const upper = 3 + 10 / Math.sqrt(df)
  const dens = (s: number) => Math.exp(logConst + (df - 1) * Math.log(s) - (df * s * s) / 2)
  const value = integrate((s) => (s <= 0 ? 0 : dens(s) * wRange(q * s)), 0, upper, 16)
  return Math.min(1, Math.max(0, value))
}

export interface TukeyRow {
  a: string
  b: string
  diff: number
  q: number
  p: number
}

/** Tukey HSD (Tukey-Kramer when group sizes differ) for every pair of groups. */
export function tukeyHsd(names: string[], groups: number[][]): TukeyRow[] | null {
  const k = groups.length
  const N = groups.reduce((s, g) => s + g.length, 0)
  const df = N - k
  if (k < 2 || df < 1 || groups.some((g) => g.length < 1)) return null
  const anova = oneWayAnova(groups)
  if (!anova) return null
  const mse = anova.ssWithin / df
  const means = groups.map((g) => g.reduce((s, v) => s + v, 0) / g.length)
  const out: TukeyRow[] = []
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      const diff = means[i] - means[j]
      const q = Math.abs(diff) / Math.sqrt((mse / 2) * (1 / groups[i].length + 1 / groups[j].length))
      out.push({ a: names[i], b: names[j], diff, q, p: 1 - studentizedRangeCdf(q, k, df) })
    }
  }
  return out
}
