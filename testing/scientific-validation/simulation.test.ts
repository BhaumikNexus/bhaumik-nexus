import {
  LJSystem, ljPair, integrate, simulateEnzyme, enzymeDerived, enzymeConservationError,
  reversibleRhs, reversibleExact, consecutiveRhs, consecutiveExact,
  pkSingle, pkConcentration, pkSteadyState, pkSummary,
} from '../../frontend/src/modules/simulation/simUtils.ts'
import type { PkParams } from '../../frontend/src/modules/simulation/simUtils.ts'

let failed = 0
function near(name: string, got: number, want: number, rel: number, abs = 0) {
  const ok = Math.abs(got - want) <= Math.max(abs, rel * Math.abs(want))
  if (!ok) failed++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: got ${got}, want ${want}`)
}
function truth(name: string, cond: boolean, info = '') {
  if (!cond) failed++
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name} ${info}`)
}

// ---- Lennard-Jones pair potential
const m = ljPair(Math.pow(2, 1 / 6))
near('LJ minimum energy = -1 at r = 2^(1/6)', m.u, -1, 1e-12)
near('LJ force zero at minimum', m.f, 0, 0, 1e-10)
near('LJ u(sigma) = 0', ljPair(1).u, 0, 0, 1e-12)
const h = 1e-6
const fd = -(ljPair(1.3 + h).u - ljPair(1.3 - h).u) / (2 * h)
near('LJ force = -du/dr', ljPair(1.3).f, fd, 1e-6)

// ---- independent brute-force energy and force for a perturbed configuration
{
  const s = new LJSystem({ n: 108, density: 0.8442, temperature: 1, dt: 0.004, seed: 7 })
  for (let i = 0; i < 200; i++) s.step()
  const { n, L, rc } = s
  const sh = 4 * (Math.pow(1 / rc, 12) - Math.pow(1 / rc, 6))
  let u = 0
  const f = new Array<number>(n * 3).fill(0)
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const d = [s.x[i] - s.x[j], s.y[i] - s.y[j], s.z[i] - s.z[j]].map((v) => v - L * Math.round(v / L))
    const r = Math.hypot(d[0], d[1], d[2])
    if (r < rc) {
      u += 4 * (Math.pow(r, -12) - Math.pow(r, -6)) - sh
      const mag = (24 * (2 * Math.pow(r, -12) - Math.pow(r, -6))) / r
      for (let c = 0; c < 3; c++) { f[3 * i + c] += (mag * d[c]) / r; f[3 * j + c] -= (mag * d[c]) / r }
    }
  }
  near('MD potential energy matches brute force', s.pe, u, 1e-12)
  near('MD force x on particle 5', s.fx[5], f[15], 1e-9, 1e-9)
  near('MD force z on particle 50', s.fz[50], f[152], 1e-9, 1e-9)
  let px = 0, py = 0, pz = 0
  for (let i = 0; i < n; i++) { px += s.vx[i]; py += s.vy[i]; pz += s.vz[i] }
  near('MD total momentum stays zero', Math.hypot(px, py, pz), 0, 0, 1e-10)
}

// ---- energy conservation in NVE
{
  const s = new LJSystem({ n: 108, density: 0.8442, temperature: 1.0, dt: 0.004, seed: 3 })
  for (let i = 0; i < 300; i++) s.step()
  const e0 = s.totalEnergy()
  let worst = 0
  for (let i = 0; i < 1500; i++) {
    s.step()
    worst = Math.max(worst, Math.abs(s.totalEnergy() - e0))
  }
  truth('MD energy drift small (NVE, 1500 steps)', worst / Math.abs(e0) < 2e-4, `relative drift ${(worst / Math.abs(e0)).toExponential(2)}`)
  near('MD initial temperature honoured', new LJSystem({ n: 108, density: 0.8, temperature: 1.3, dt: 0.004 }).temperature(), 1.3, 1e-12)
}

// ---- thermostat reaches the target; g(r) basics
{
  const s = new LJSystem({ n: 108, density: 0.7, temperature: 2.5, dt: 0.004, seed: 5 })
  for (let i = 0; i < 2500; i++) s.step({ target: 1.0, tau: 0.2 })
  let acc = 0
  for (let i = 0; i < 500; i++) { s.step({ target: 1.0, tau: 0.2 }); acc += s.temperature() }
  near('Berendsen thermostat reaches target T', acc / 500, 1.0, 0.03)
  for (let i = 0; i < 40; i++) { for (let k = 0; k < 10; k++) s.step({ target: 1.0, tau: 0.2 }); s.accumulateRdf() }
  const g = s.rdf()
  const near1 = g.filter((p) => p[0] < 0.8).reduce((a, p) => a + p[1], 0)
  const peak = Math.max(...g.map((p) => p[1]))
  truth('g(r) ~ 0 inside the core', near1 < 0.05, `sum ${near1.toFixed(3)}`)
  truth('g(r) has a first-shell peak above 1.5', peak > 1.5, `peak ${peak.toFixed(2)}`)
}

// ---- dilute gas pressure close to ideal
{
  const s = new LJSystem({ n: 256, density: 0.01, temperature: 2.0, dt: 0.004, seed: 11 })
  let acc = 0
  for (let i = 0; i < 400; i++) { s.step(); acc += s.pressure() }
  near('dilute gas P ~ rho T', acc / 400, 0.01 * 2.0, 0.03)
}

// ---- ODE solver against analytic solutions
{
  const kf = 0.8, kr = 0.3
  const r = integrate(reversibleRhs(kf, kr), [2, 0.5], 0, 10, { outputs: 20 })
  const [a, b] = reversibleExact(kf, kr, 2, 0.5, 10)
  near('A<->B, A at t=10', r.y[20][0], a, 1e-7)
  near('A<->B, B at t=10', r.y[20][1], b, 1e-7)
  const c = integrate(consecutiveRhs(0.9, 0.35), [4, 0, 0], 0, 12, { outputs: 12 })
  const ex = consecutiveExact(0.9, 0.35, 4, 12)
  near('A->B->C, B at t=12', c.y[12][1], ex[1], 1e-6)
  near('A->B->C, C at t=12', c.y[12][2], ex[2], 1e-6)
  const eq = integrate(consecutiveRhs(0.5, 0.5), [1, 0, 0], 0, 4, { outputs: 4 })
  near('A->B->C with k1 = k2 (limit case)', eq.y[4][1], consecutiveExact(0.5, 0.5, 1, 4)[1], 1e-6)
}

// ---- enzyme network against scipy Radau (rtol 1e-11)
{
  const p = { k1: 1, km1: 1, kcat: 0.5, e0: 0.01, s0: 10, i0: 5, kon: 1, koff: 2, tmax: 1000 }
  const r = simulateEnzyme(p)
  const y = r.y[r.y.length - 1]
  const want = [0.0012325189888803554, 6.9221276698604814, 0.005688440524881679, 3.0721838896146174, 4.996920959513762, 0.003079040486237968]
  const names = ['E', 'S', 'ES', 'P', 'I', 'EI']
  names.forEach((nm, i) => near(`enzyme ${nm} at t=1000`, y[i], want[i], 1e-5, 1e-9))
  truth('enzyme solver finished', r.ok, `${r.steps} steps`)
  truth('enzyme conserves totals', enzymeConservationError(p, r) < 1e-9, `${enzymeConservationError(p, r).toExponential(2)}`)
  const d = enzymeDerived(p)
  near('Km = (k-1 + kcat)/k1', d.km, 1.5, 1e-12)
  near('Ki = koff/kon', d.ki ?? NaN, 2, 1e-12)
  near('apparent Km = Km (1 + I/Ki)', d.kmApparent, 1.5 * (1 + 5 / 2), 1e-12)
  const r2 = simulateEnzyme({ ...p, tmax: 100 })
  const y2 = r2.y[r2.y.length - 1]
  near('enzyme P at t=100 (scipy)', y2[3], 0.32563607011377704, 1e-5)
}

// ---- pharmacokinetics
{
  const p: PkParams = { dose: 500, f: 0.8, v: 40, cl: 5, ka: 1.2, tau: 0, doses: 1 }
  const ke = 5 / 40
  // numerical two-state ODE as an independent check
  const r = integrate((_t, y, dy) => { dy[0] = -p.ka * y[0]; dy[1] = p.ka * y[0] - ke * y[1] }, [p.f * p.dose, 0], 0, 24, { outputs: 24 })
  near('PK oral C(6 h) vs ODE', pkSingle(p, 6), r.y[6][1] / p.v, 1e-6)
  near('PK oral C(24 h) vs ODE', pkSingle(p, 24), r.y[24][1] / p.v, 1e-6)
  const s = pkSummary(p)
  near('PK half-life', s.halfLife, Math.LN2 / ke, 1e-12)
  near('PK AUC = F D / CL', s.auc, 80, 1e-12)
  near('PK Cmax equals C(tmax)', s.cmax, pkSingle(p, s.tmax), 1e-12)
  let best = 0
  for (let t = 0; t <= 24; t += 0.001) best = Math.max(best, pkSingle(p, t))
  near('PK tmax gives the numerical maximum', s.cmax, best, 1e-6)
  // trapezoid AUC out to 400 h
  let auc = 0, prev = 0
  for (let t = 0.01; t <= 400; t += 0.01) { const c = pkSingle(p, t); auc += 0.005 * (prev + c) * 2 / 2; prev = c }
  near('PK AUC by trapezoid', auc, 80, 1e-3)
  const iv: PkParams = { ...p, ka: 0 }
  near('PK IV C0 = F D / V', pkSingle(iv, 0), 10, 1e-12)
  const flip: PkParams = { ...p, ka: ke }
  near('PK ka = ke limit is continuous', pkSingle(flip, 6), pkSingle({ ...p, ka: ke * (1 + 1e-6) }, 6), 1e-4)
  // multiple dosing
  const md: PkParams = { ...p, tau: 12, doses: 40 }
  const ss = pkSummary(md)
  near('PK steady-state series equals long dosing', pkSteadyState(md, 5), pkConcentration({ ...md, doses: 400 }, 399 * 12 + 5), 1e-9)
  near('PK Cavg,ss = AUC / tau', ss.cavgSs ?? NaN, 80 / 12, 1e-12)
  near('PK accumulation ratio', ss.accumulation ?? NaN, 1 / (1 - Math.exp(-ke * 12)), 1e-12)
  let areaSs = 0
  for (let i = 0; i < 12000; i++) areaSs += pkSteadyState(md, (i + 0.5) * 0.001)
  near('PK mean over a steady-state interval = Cavg,ss', (areaSs * 0.001) / 12, 80 / 12, 1e-6)
  const ivSs = pkSummary({ ...iv, tau: 12, doses: 10 })
  near('PK IV Cmax,ss = C0/(1-e^(-ke tau))', ivSs.cmaxSs ?? NaN, 10 / (1 - Math.exp(-ke * 12)), 1e-6)
}

console.log(failed === 0 ? 'simulation: ALL PASSED' : `simulation: ${failed} FAILED`)
if (failed) process.exitCode = 1
