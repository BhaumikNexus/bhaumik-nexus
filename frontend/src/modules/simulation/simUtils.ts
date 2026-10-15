// Simulation helpers. Everything here is calculated in the browser (nothing is retrieved or predicted by AI).

/* ------------------------------------------------------------------ */
/* Random numbers                                                      */
/* ------------------------------------------------------------------ */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gaussian(rand: () => number): number {
  let u = 0
  while (u === 0) u = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand())
}

/* ------------------------------------------------------------------ */
/* Lennard-Jones molecular dynamics (reduced units)                    */
/* ------------------------------------------------------------------ */

/** Particle counts that fill a cubic fcc lattice: 4 k^3. */
export const MD_SIZES = [32, 108, 256, 500] as const

/** Values used to express reduced units for argon (illustrative scaling only). */
export const ARGON = { sigmaAngstrom: 3.405, epsilonOverKb: 119.8, tauPs: 2.156 }

export interface LJOptions {
  n: number
  density: number
  temperature: number
  dt: number
  seed?: number
}

/** Truncated and shifted Lennard-Jones potential, velocity Verlet, periodic cubic box, epsilon = sigma = mass = kB = 1. */
export class LJSystem {
  readonly n: number
  readonly L: number
  readonly rc: number
  readonly density: number
  readonly dt: number
  readonly shift: number
  x: Float64Array
  y: Float64Array
  z: Float64Array
  vx: Float64Array
  vy: Float64Array
  vz: Float64Array
  fx: Float64Array
  fy: Float64Array
  fz: Float64Array
  pe = 0
  virial = 0
  time = 0
  steps = 0
  readonly rdfBins = 100
  private rdfHist: Float64Array
  rdfSamples = 0

  constructor(o: LJOptions) {
    const k = Math.round(Math.cbrt(o.n / 4))
    if (4 * k * k * k !== o.n) throw new Error('Particle count must be 4k^3 (32, 108, 256, 500, ...)')
    if (!(o.density > 0) || !(o.temperature >= 0) || !(o.dt > 0)) throw new Error('Invalid simulation settings')
    this.n = o.n
    this.density = o.density
    this.dt = o.dt
    this.L = Math.cbrt(o.n / o.density)
    this.rc = Math.min(2.5, this.L / 2)
    const ir6 = Math.pow(1 / this.rc, 6)
    this.shift = 4 * ir6 * (ir6 - 1)
    const n = o.n
    this.x = new Float64Array(n)
    this.y = new Float64Array(n)
    this.z = new Float64Array(n)
    this.vx = new Float64Array(n)
    this.vy = new Float64Array(n)
    this.vz = new Float64Array(n)
    this.fx = new Float64Array(n)
    this.fy = new Float64Array(n)
    this.fz = new Float64Array(n)
    this.rdfHist = new Float64Array(this.rdfBins)

    const a = this.L / k
    const basis = [[0, 0, 0], [0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5]]
    let p = 0
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) for (let l = 0; l < k; l++) for (const b of basis) {
      this.x[p] = (i + b[0] + 0.25) * a
      this.y[p] = (j + b[1] + 0.25) * a
      this.z[p] = (l + b[2] + 0.25) * a
      p++
    }
    const rand = mulberry32(o.seed ?? 12345)
    const sd = Math.sqrt(o.temperature)
    let sx = 0, sy = 0, sz = 0
    for (let i = 0; i < n; i++) {
      this.vx[i] = sd * gaussian(rand)
      this.vy[i] = sd * gaussian(rand)
      this.vz[i] = sd * gaussian(rand)
      sx += this.vx[i]; sy += this.vy[i]; sz += this.vz[i]
    }
    for (let i = 0; i < n; i++) {
      this.vx[i] -= sx / n; this.vy[i] -= sy / n; this.vz[i] -= sz / n
    }
    const t = this.temperature()
    if (t > 0) {
      const s = Math.sqrt(o.temperature / t)
      for (let i = 0; i < n; i++) { this.vx[i] *= s; this.vy[i] *= s; this.vz[i] *= s }
    }
    this.computeForces()
  }

  kinetic(): number {
    let s = 0
    for (let i = 0; i < this.n; i++) s += this.vx[i] ** 2 + this.vy[i] ** 2 + this.vz[i] ** 2
    return 0.5 * s
  }

  /** Instantaneous temperature, 3N - 3 degrees of freedom (centre of mass fixed). */
  temperature(): number {
    return (2 * this.kinetic()) / (3 * this.n - 3)
  }

  /** P = (2 KE/3 + W/3) / V with W the pair virial. */
  pressure(): number {
    return ((2 * this.kinetic()) / 3 + this.virial / 3) / (this.L ** 3)
  }

  totalEnergy(): number {
    return this.kinetic() + this.pe
  }

  computeForces(): void {
    const { n, L, x, y, z, fx, fy, fz } = this
    const rc2 = this.rc * this.rc
    fx.fill(0); fy.fill(0); fz.fill(0)
    let pe = 0
    let w = 0
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = x[i] - x[j]
        let dy = y[i] - y[j]
        let dz = z[i] - z[j]
        dx -= L * Math.round(dx / L)
        dy -= L * Math.round(dy / L)
        dz -= L * Math.round(dz / L)
        const r2 = dx * dx + dy * dy + dz * dz
        if (r2 < rc2) {
          const i2 = 1 / r2
          const i6 = i2 * i2 * i2
          const ff = 48 * i6 * (i6 - 0.5) * i2
          fx[i] += ff * dx; fy[i] += ff * dy; fz[i] += ff * dz
          fx[j] -= ff * dx; fy[j] -= ff * dy; fz[j] -= ff * dz
          pe += 4 * i6 * (i6 - 1) - this.shift
          w += ff * r2
        }
      }
    }
    this.pe = pe
    this.virial = w
  }

  /** One velocity Verlet step. With `thermostat`, velocities are scaled by the Berendsen weak-coupling factor afterwards. */
  step(thermostat?: { target: number; tau: number }): void {
    const { n, dt, L } = this
    const h = 0.5 * dt
    for (let i = 0; i < n; i++) {
      this.vx[i] += h * this.fx[i]; this.vy[i] += h * this.fy[i]; this.vz[i] += h * this.fz[i]
      let a = this.x[i] + dt * this.vx[i]
      let b = this.y[i] + dt * this.vy[i]
      let c = this.z[i] + dt * this.vz[i]
      a -= L * Math.floor(a / L); b -= L * Math.floor(b / L); c -= L * Math.floor(c / L)
      this.x[i] = a; this.y[i] = b; this.z[i] = c
    }
    this.computeForces()
    for (let i = 0; i < n; i++) {
      this.vx[i] += h * this.fx[i]; this.vy[i] += h * this.fy[i]; this.vz[i] += h * this.fz[i]
    }
    if (thermostat) {
      const t = this.temperature()
      if (t > 0) {
        const lam = Math.sqrt(Math.max(0, 1 + (dt / thermostat.tau) * (thermostat.target / t - 1)))
        for (let i = 0; i < n; i++) { this.vx[i] *= lam; this.vy[i] *= lam; this.vz[i] *= lam }
      }
    }
    this.time += dt
    this.steps++
  }

  /** Add the current configuration to the radial distribution histogram. */
  accumulateRdf(): void {
    const { n, L, x, y, z } = this
    const rmax = L / 2
    const dr = rmax / this.rdfBins
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = x[i] - x[j]
        let dy = y[i] - y[j]
        let dz = z[i] - z[j]
        dx -= L * Math.round(dx / L)
        dy -= L * Math.round(dy / L)
        dz -= L * Math.round(dz / L)
        const r = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (r < rmax) this.rdfHist[Math.floor(r / dr)] += 2
      }
    }
    this.rdfSamples++
  }

  resetRdf(): void {
    this.rdfHist.fill(0)
    this.rdfSamples = 0
  }

  /** g(r) from the accumulated samples, r up to L/2. */
  rdf(): [number, number][] {
    const rmax = this.L / 2
    const dr = rmax / this.rdfBins
    const out: [number, number][] = []
    if (this.rdfSamples === 0) return out
    for (let k = 0; k < this.rdfBins; k++) {
      const r1 = k * dr
      const r2 = r1 + dr
      const shell = (4 / 3) * Math.PI * (r2 ** 3 - r1 ** 3)
      out.push([(r1 + r2) / 2, this.rdfHist[k] / (this.rdfSamples * this.n * this.density * shell)])
    }
    return out
  }
}

/** Pair potential and force for tests: u(r) of the plain 12-6 form (no cutoff). */
export function ljPair(r: number): { u: number; f: number } {
  const i6 = Math.pow(1 / r, 6)
  return { u: 4 * i6 * (i6 - 1), f: (48 * i6 * (i6 - 0.5)) / r }
}

/* ------------------------------------------------------------------ */
/* ODE integration: Dormand-Prince 5(4), adaptive step                 */
/* ------------------------------------------------------------------ */

export type Rhs = (t: number, y: number[], dy: number[]) => void

export interface OdeResult {
  t: number[]
  y: number[][]
  steps: number
  ok: boolean
  message: string
}

const A = [
  [],
  [1 / 5],
  [3 / 40, 9 / 40],
  [44 / 45, -56 / 15, 32 / 9],
  [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
  [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
  [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84],
]
const C = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1]
const B5 = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0]
const B4 = [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40]

/** Solve dy/dt = f(t, y) from t0 to t1 and return `outputs + 1` equally spaced samples. */
export function integrate(
  f: Rhs,
  y0: number[],
  t0: number,
  t1: number,
  opts: { rtol?: number; atol?: number; maxSteps?: number; outputs?: number } = {},
): OdeResult {
  const rtol = opts.rtol ?? 1e-8
  const atol = opts.atol ?? 1e-12
  const maxSteps = opts.maxSteps ?? 300000
  const outputs = opts.outputs ?? 400
  const n = y0.length
  const ts = [t0]
  const ys = [y0.slice()]
  let y = y0.slice()
  let t = t0
  let h = (t1 - t0) / 1000
  let steps = 0
  const k: number[][] = Array.from({ length: 7 }, () => new Array<number>(n).fill(0))
  const tmp = new Array<number>(n).fill(0)
  const ynew = new Array<number>(n).fill(0)
  for (let o = 1; o <= outputs; o++) {
    const target = t0 + ((t1 - t0) * o) / outputs
    while (t < target - 1e-15 * Math.abs(target)) {
      if (steps++ > maxSteps) return { t: ts, y: ys, steps, ok: false, message: 'Stopped: too many steps (the system may be very stiff). Reduce the time range or the largest rate constants.' }
      const hh = Math.min(h, target - t)
      f(t, y, k[0])
      for (let s = 1; s < 7; s++) {
        for (let i = 0; i < n; i++) {
          let acc = 0
          for (let m = 0; m < s; m++) acc += A[s][m] * k[m][i]
          tmp[i] = y[i] + hh * acc
        }
        f(t + C[s] * hh, tmp, k[s])
      }
      let errNorm = 0
      for (let i = 0; i < n; i++) {
        let s5 = 0
        let e = 0
        for (let m = 0; m < 7; m++) { s5 += B5[m] * k[m][i]; e += (B5[m] - B4[m]) * k[m][i] }
        ynew[i] = y[i] + hh * s5
        const sc = atol + rtol * Math.max(Math.abs(y[i]), Math.abs(ynew[i]))
        errNorm = Math.max(errNorm, Math.abs(hh * e) / sc)
      }
      if (!Number.isFinite(errNorm)) return { t: ts, y: ys, steps, ok: false, message: 'Stopped: the solution became non-finite.' }
      if (errNorm <= 1) {
        t += hh
        for (let i = 0; i < n; i++) y[i] = ynew[i]
        h = hh * Math.min(5, Math.max(0.2, 0.9 * Math.pow(errNorm || 1e-10, -0.2)))
        if (hh < h && target - t < 1e-12 * Math.abs(target)) t = target
      } else {
        h = hh * Math.max(0.2, 0.9 * Math.pow(errNorm, -0.2))
        if (h < 1e-14 * Math.max(1, Math.abs(t))) return { t: ts, y: ys, steps, ok: false, message: 'Stopped: step size underflow.' }
      }
    }
    t = target
    ts.push(t)
    ys.push(y.slice())
  }
  return { t: ts, y: ys, steps, ok: true, message: '' }
}

/* ------------------------------------------------------------------ */
/* Reaction kinetics models (mass action)                              */
/* ------------------------------------------------------------------ */

export interface EnzymeParams {
  k1: number
  km1: number
  kcat: number
  e0: number
  s0: number
  i0: number
  kon: number
  koff: number
  tmax: number
}

export const ENZYME_SPECIES = ['E', 'S', 'ES', 'P', 'I', 'EI']

/** E + S <-> ES -> E + P, with an optional competitive inhibitor E + I <-> EI. */
export function enzymeRhs(p: EnzymeParams): Rhs {
  return (_t, y, dy) => {
    const [e, s, es, , i, ei] = y
    const bind = p.k1 * e * s
    const unbind = p.km1 * es
    const cat = p.kcat * es
    const ib = p.kon * e * i
    const iu = p.koff * ei
    dy[0] = -bind + unbind + cat - ib + iu
    dy[1] = -bind + unbind
    dy[2] = bind - unbind - cat
    dy[3] = cat
    dy[4] = -ib + iu
    dy[5] = ib - iu
  }
}

export function simulateEnzyme(p: EnzymeParams, outputs = 400): OdeResult {
  return integrate(enzymeRhs(p), [p.e0, p.s0, 0, 0, p.i0, 0], 0, p.tmax, { outputs })
}

export interface EnzymeDerived {
  km: number
  vmax: number
  kcatOverKm: number
  ki: number | null
  kmApparent: number
  /** steady-state (quasi steady state) initial rate at S0 and I0 */
  v0Theory: number
}

export function enzymeDerived(p: EnzymeParams): EnzymeDerived {
  const km = (p.km1 + p.kcat) / p.k1
  const vmax = p.kcat * p.e0
  const ki = p.kon > 0 ? p.koff / p.kon : null
  const kmApp = ki && p.i0 > 0 ? km * (1 + p.i0 / ki) : km
  return { km, vmax, kcatOverKm: p.kcat / km, ki, kmApparent: kmApp, v0Theory: (vmax * p.s0) / (kmApp + p.s0) }
}

/** Largest violation of the two conserved totals (enzyme and substrate), as an absolute amount. */
export function enzymeConservationError(p: EnzymeParams, r: OdeResult): number {
  let worst = 0
  for (const y of r.y) {
    worst = Math.max(worst, Math.abs(y[0] + y[2] + y[5] - p.e0), Math.abs(y[1] + y[2] + y[3] - p.s0), Math.abs(y[4] + y[5] - p.i0))
  }
  return worst
}

export function reversibleRhs(kf: number, kr: number): Rhs {
  return (_t, y, dy) => {
    const flux = kf * y[0] - kr * y[1]
    dy[0] = -flux
    dy[1] = flux
  }
}

/** Analytic A <-> B solution for first order forward and reverse steps. */
export function reversibleExact(kf: number, kr: number, a0: number, b0: number, t: number): [number, number] {
  const tot = a0 + b0
  const k = kf + kr
  const aEq = (kr * tot) / k
  const a = aEq + (a0 - aEq) * Math.exp(-k * t)
  return [a, tot - a]
}

export function consecutiveRhs(k1: number, k2: number): Rhs {
  return (_t, y, dy) => {
    dy[0] = -k1 * y[0]
    dy[1] = k1 * y[0] - k2 * y[1]
    dy[2] = k2 * y[1]
  }
}

/** Analytic A -> B -> C (B = 0 and C = 0 at the start). */
export function consecutiveExact(k1: number, k2: number, a0: number, t: number): [number, number, number] {
  const a = a0 * Math.exp(-k1 * t)
  let b: number
  if (Math.abs(k1 - k2) < 1e-9 * Math.max(k1, k2)) b = a0 * k1 * t * Math.exp(-k1 * t)
  else b = (a0 * k1 / (k2 - k1)) * (Math.exp(-k1 * t) - Math.exp(-k2 * t))
  return [a, b, a0 - a - b]
}

/* ------------------------------------------------------------------ */
/* One-compartment pharmacokinetics                                    */
/* ------------------------------------------------------------------ */

export interface PkParams {
  dose: number
  f: number
  v: number
  cl: number
  /** absorption rate constant; 0 means an intravenous bolus */
  ka: number
  /** dosing interval; 0 means a single dose */
  tau: number
  doses: number
}

export function pkSingle(p: PkParams, t: number): number {
  if (t < 0) return 0
  const ke = p.cl / p.v
  const amount = p.f * p.dose
  if (p.ka <= 0) return (amount / p.v) * Math.exp(-ke * t)
  if (Math.abs(p.ka - ke) < 1e-9 * Math.max(p.ka, ke)) return (amount / p.v) * p.ka * t * Math.exp(-ke * t)
  return ((amount * p.ka) / (p.v * (p.ka - ke))) * (Math.exp(-ke * t) - Math.exp(-p.ka * t))
}

export function pkConcentration(p: PkParams, t: number): number {
  if (p.tau <= 0 || p.doses <= 1) return pkSingle(p, t)
  let c = 0
  for (let j = 0; j < p.doses; j++) {
    const s = t - j * p.tau
    if (s >= 0) c += pkSingle(p, s)
  }
  return c
}

/** Steady-state concentration at time t after the most recent dose (0 <= t <= tau), by summing the infinite series. */
export function pkSteadyState(p: PkParams, t: number): number {
  const ke = p.cl / p.v
  const amount = p.f * p.dose
  const gE = 1 / (1 - Math.exp(-ke * p.tau))
  if (p.ka <= 0) return (amount / p.v) * Math.exp(-ke * t) * gE
  if (Math.abs(p.ka - ke) < 1e-9 * Math.max(p.ka, ke)) {
    // limit ka -> ke of the series
    let c = 0
    for (let j = 0; j < 4000; j++) c += pkSingle(p, t + j * p.tau)
    return c
  }
  const gA = 1 / (1 - Math.exp(-p.ka * p.tau))
  return ((amount * p.ka) / (p.v * (p.ka - ke))) * (Math.exp(-ke * t) * gE - Math.exp(-p.ka * t) * gA)
}

export interface PkSummary {
  ke: number
  halfLife: number
  auc: number
  tmax: number
  cmax: number
  accumulation: number | null
  cavgSs: number | null
  cmaxSs: number | null
  cminSs: number | null
  timeToSteadyState: number | null
}

export function pkSummary(p: PkParams): PkSummary {
  const ke = p.cl / p.v
  const halfLife = Math.LN2 / ke
  const auc = (p.f * p.dose) / p.cl
  let tmax = 0
  if (p.ka > 0) {
    tmax = Math.abs(p.ka - ke) < 1e-9 * Math.max(p.ka, ke) ? 1 / ke : Math.log(p.ka / ke) / (p.ka - ke)
  }
  const cmax = pkSingle(p, tmax)
  const out: PkSummary = { ke, halfLife, auc, tmax, cmax, accumulation: null, cavgSs: null, cmaxSs: null, cminSs: null, timeToSteadyState: null }
  if (p.tau > 0) {
    out.accumulation = 1 / (1 - Math.exp(-ke * p.tau))
    out.cavgSs = auc / p.tau
    let hi = 0
    let lo = Infinity
    const m = 2000
    for (let i = 0; i <= m; i++) {
      const c = pkSteadyState(p, (p.tau * i) / m)
      if (c > hi) hi = c
      if (c < lo) lo = c
    }
    out.cmaxSs = hi
    out.cminSs = lo
    out.timeToSteadyState = (Math.log(10) / Math.LN2) * halfLife
  }
  return out
}
