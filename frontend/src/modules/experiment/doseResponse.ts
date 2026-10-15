// Four-parameter logistic (4PL) dose-response fit by Levenberg-Marquardt least squares.
//   y = bottom + (top - bottom) / (1 + (x / EC50) ^ hill),   with EC50 > 0 and hill > 0
// Dose x = 0 is allowed (the response there is "top"). With hill > 0 the curve runs from "top" at low dose to "bottom"
// at high dose, so for a response that rises with dose "top" simply comes out lower than "bottom".
import { tCritical } from './statsUtils.ts'

export interface Fit4pl {
  bottom: number
  top: number
  ec50: number
  hill: number
  /** Approximate standard errors from the fit's curvature (asymptotic). Null when there are no residual degrees of freedom. */
  se: { bottom: number; top: number; lnEc50: number; lnHill: number } | null
  ec50Ci: [number, number] | null
  rss: number
  r2: number
  n: number
  df: number
  converged: boolean
  warnings: string[]
}

type P = [number, number, number, number]

function model(x: number, p: P): number {
  const [b, t, pe, ph] = p
  if (x === 0) return t
  return b + (t - b) / (1 + Math.exp(Math.exp(ph) * (Math.log(x) - pe)))
}

function jac(x: number, p: P): P {
  const [b, t, pe, ph] = p
  if (x === 0) return [0, 1, 0, 0]
  const h = Math.exp(ph)
  const lx = Math.log(x) - pe
  const u = Math.exp(h * lx)
  const d = 1 + u
  return [1 - 1 / d, 1 / d, ((t - b) * h * u) / (d * d), (-(t - b) * u * lx * h) / (d * d)]
}

function rssOf(x: number[], y: number[], p: P): number {
  let s = 0
  for (let i = 0; i < x.length; i++) s += (y[i] - model(x[i], p)) ** 2
  return s
}

/** Solves A z = b for a small dense system by Gaussian elimination with partial pivoting; null if singular. */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let c = 0; c < n; c++) {
    let piv = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r
    if (Math.abs(M[piv][c]) < 1e-300) return null
    ;[M[c], M[piv]] = [M[piv], M[c]]
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c]
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]
    }
  }
  const z = new Array<number>(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n]
    for (let k = r + 1; k < n; k++) s -= M[r][k] * z[k]
    z[r] = s / M[r][r]
  }
  return z
}

function invert(A: number[][]): number[][] | null {
  const n = A.length
  const cols: number[][] = []
  for (let c = 0; c < n; c++) {
    const e = new Array<number>(n).fill(0)
    e[c] = 1
    const z = solve(A, e)
    if (!z) return null
    cols.push(z)
  }
  return A.map((_, r) => cols.map((col) => col[r]))
}

export function fit4pl(x: number[], y: number[]): Fit4pl | null {
  const n = Math.min(x.length, y.length)
  if (n < 5) return null
  if (x.some((v) => v < 0 || !Number.isFinite(v)) || y.some((v) => !Number.isFinite(v))) return null
  const pos = x.filter((v) => v > 0)
  if (pos.length < 4 || new Set(x).size < 4) return null

  // starting values
  const order = x.map((_, i) => i).sort((a, b) => x[a] - x[b])
  const k = Math.max(1, Math.round(n * 0.2))
  const mean = (idx: number[]) => idx.reduce((s, i) => s + y[i], 0) / idx.length
  const top0 = mean(order.slice(0, k))
  const bottom0 = mean(order.slice(n - k))
  const mid = (top0 + bottom0) / 2
  let best = order.filter((i) => x[i] > 0)[0]
  for (const i of order) if (x[i] > 0 && Math.abs(y[i] - mid) < Math.abs(y[best] - mid)) best = i
  let p: P = [bottom0, top0, Math.log(x[best]), 0]

  let rss = rssOf(x, y, p)
  let lambda = 1e-3
  let converged = false
  for (let iter = 0; iter < 500; iter++) {
    const JtJ: number[][] = [0, 1, 2, 3].map(() => [0, 0, 0, 0])
    const Jtr = [0, 0, 0, 0]
    for (let i = 0; i < n; i++) {
      const j = jac(x[i], p)
      const r = y[i] - model(x[i], p)
      for (let a = 0; a < 4; a++) {
        Jtr[a] += j[a] * r
        for (let b = 0; b < 4; b++) JtJ[a][b] += j[a] * j[b]
      }
    }
    let improved = false
    for (let tries = 0; tries < 40; tries++) {
      const A = JtJ.map((row, a) => row.map((v, b) => (a === b ? v + lambda * (v || 1) : v)))
      const d = solve(A, Jtr)
      if (d) {
        const cand: P = [p[0] + d[0], p[1] + d[1], p[2] + d[2], Math.max(-12, Math.min(12, p[3] + d[3]))]
        const cr = rssOf(x, y, cand)
        if (Number.isFinite(cr) && cr <= rss) {
          const rel = rss === 0 ? 0 : (rss - cr) / rss
          const step = Math.max(...d.map((v) => Math.abs(v)))
          p = cand
          rss = cr
          lambda = Math.max(lambda / 10, 1e-12)
          improved = true
          if (rel < 1e-14 || step < 1e-12) converged = true
          break
        }
      }
      lambda *= 10
    }
    if (!improved) {
      converged = true // no downhill step left: at a (local) minimum within numerical precision
      break
    }
    if (converged) break
  }

  const df = n - 4
  const ybar = y.reduce((s, v) => s + v, 0) / n
  const tss = y.reduce((s, v) => s + (v - ybar) ** 2, 0)
  const warnings: string[] = []
  const hill = Math.exp(p[3])
  const ec50 = Math.exp(p[2])

  let se: Fit4pl['se'] = null
  let ec50Ci: [number, number] | null = null
  if (df >= 1) {
    const JtJ: number[][] = [0, 1, 2, 3].map(() => [0, 0, 0, 0])
    for (let i = 0; i < n; i++) {
      const j = jac(x[i], p)
      for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) JtJ[a][b] += j[a] * j[b]
    }
    const inv = invert(JtJ)
    if (inv) {
      const s2 = rss / df
      const sd = (i: number) => Math.sqrt(Math.max(0, inv[i][i] * s2))
      se = { bottom: sd(0), top: sd(1), lnEc50: sd(2), lnHill: sd(3) }
      const tc = tCritical(df)
      ec50Ci = [Math.exp(p[2] - tc * se.lnEc50), Math.exp(p[2] + tc * se.lnEc50)]
    } else warnings.push('The fit is poorly determined (the curvature matrix is singular), so no uncertainty could be calculated.')
  }
  if (ec50 < Math.min(...pos) || ec50 > Math.max(...pos)) warnings.push('The fitted EC50 lies outside the doses you tested, so it is an extrapolation.')
  if (hill > 20) warnings.push('The fitted Hill slope is extremely steep, which usually means too few points near the transition.')
  if (!converged) warnings.push('The fit did not fully converge; treat the numbers with caution.')
  if (n < 7) warnings.push('Few data points for four parameters; the uncertainty is large.')

  return { bottom: p[0], top: p[1], ec50, hill, se, ec50Ci, rss, r2: tss === 0 ? 0 : 1 - rss / tss, n, df, converged, warnings }
}

/** Fitted response at dose x. */
export function predict4pl(f: Pick<Fit4pl, 'bottom' | 'top' | 'ec50' | 'hill'>, x: number): number {
  return model(x, [f.bottom, f.top, Math.log(f.ec50), Math.log(f.hill)])
}
