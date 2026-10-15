import { useMemo, useState } from 'react'
import SaveToProject from '../../components/common/SaveToProject.tsx'
import SimChart from './SimChart.tsx'
import type { Series } from './SimChart.tsx'
import SimField from './SimField.tsx'
import { KIN_DEFAULT, downloadCsv, mergeForm, num, sig } from './simForm.ts'
import type { KinForm } from './simForm.ts'
import {
  ENZYME_SPECIES, consecutiveExact, consecutiveRhs, enzymeConservationError, enzymeDerived, integrate,
  reversibleExact, reversibleRhs, simulateEnzyme,
} from './simUtils.ts'
import type { EnzymeParams, OdeResult } from './simUtils.ts'

interface Outcome {
  names: string[]
  result: OdeResult
  rows: [string, string][]
  checks: [string, string][]
  error: string
}

const EMPTY = (error: string): Outcome => ({ names: [], result: { t: [], y: [], steps: 0, ok: false, message: '' }, rows: [], checks: [], error })

function compute(f: KinForm): Outcome {
  if (f.model === 'enzyme') {
    const p: EnzymeParams = {
      k1: num(f.ek1), km1: num(f.ekm1), kcat: num(f.ekcat), e0: num(f.ee0), s0: num(f.es0),
      i0: num(f.ei0), kon: num(f.ekon), koff: num(f.ekoff), tmax: num(f.etmax),
    }
    const pos = [p.k1, p.km1, p.kcat, p.e0, p.s0, p.tmax]
    if (pos.some((v) => !(v > 0))) return EMPTY('Rate constants, concentrations and the time range must be positive numbers (inhibitor can be 0).')
    if (!(p.i0 >= 0) || !(p.kon >= 0) || !(p.koff >= 0)) return EMPTY('Inhibitor settings must be zero or positive.')
    const result = simulateEnzyme(p, 300)
    const d = enzymeDerived(p)
    const rows: [string, string][] = [
      ['Km = (k₋₁ + k_cat) / k₁', sig(d.km)],
      ['V_max = k_cat · [E]₀', sig(d.vmax)],
      ['k_cat / Km', sig(d.kcatOverKm)],
      ['Ki = k_off / k_on', d.ki === null ? '—' : sig(d.ki)],
      ['Apparent Km with inhibitor', sig(d.kmApparent)],
      ['Initial rate, steady-state formula', sig(d.v0Theory)],
    ]
    const checks: [string, string][] = [
      ['Conservation error (enzyme, substrate, inhibitor totals)', result.ok ? enzymeConservationError(p, result).toExponential(1) : '—'],
      ['Solver steps', String(result.steps)],
    ]
    if (p.e0 > 0.1 * (p.s0 + d.km)) checks.push(['Note', 'Enzyme is not much lower than substrate + Km, so the steady-state formula is only a rough guide. The simulated curves remain valid.'])
    return { names: ENZYME_SPECIES, result, rows, checks, error: '' }
  }
  if (f.model === 'reversible') {
    const kf = num(f.rkf), kr = num(f.rkr), a0 = num(f.ra0), b0 = num(f.rb0), tmax = num(f.rtmax)
    if (![kf, kr, tmax].every((v) => v > 0) || !(a0 >= 0) || !(b0 >= 0) || a0 + b0 <= 0) return EMPTY('Rate constants and time range must be positive; starting amounts cannot be negative or both zero.')
    const result = integrate(reversibleRhs(kf, kr), [a0, b0], 0, tmax, { outputs: 300 })
    let worst = 0
    result.t.forEach((t, i) => {
      const [a, b] = reversibleExact(kf, kr, a0, b0, t)
      worst = Math.max(worst, Math.abs(result.y[i][0] - a), Math.abs(result.y[i][1] - b))
    })
    const kEq = kf / kr
    return {
      names: ['A', 'B'],
      result,
      rows: [['Equilibrium constant K = k_f / k_r', sig(kEq)], ['Relaxation rate k_f + k_r', sig(kf + kr)], ['Half-time of relaxation', sig(Math.LN2 / (kf + kr))], ['A at equilibrium', sig(((a0 + b0) * kr) / (kf + kr))]],
      checks: [['Largest difference from the exact solution', worst.toExponential(1)], ['Solver steps', String(result.steps)]],
      error: '',
    }
  }
  const k1 = num(f.ck1), k2 = num(f.ck2), a0 = num(f.ca0), tmax = num(f.ctmax)
  if (![k1, k2, a0, tmax].every((v) => v > 0)) return EMPTY('Rate constants, starting amount and time range must be positive numbers.')
  const result = integrate(consecutiveRhs(k1, k2), [a0, 0, 0], 0, tmax, { outputs: 300 })
  let worst = 0
  result.t.forEach((t, i) => {
    const ex = consecutiveExact(k1, k2, a0, t)
    for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(result.y[i][c] - ex[c]))
  })
  const tPeak = Math.abs(k1 - k2) < 1e-9 * k1 ? 1 / k1 : Math.log(k1 / k2) / (k1 - k2)
  return {
    names: ['A', 'B', 'C'],
    result,
    rows: [['Time of maximum B', sig(tPeak)], ['Maximum B', sig(consecutiveExact(k1, k2, a0, tPeak)[1])], ['Half-life of A', sig(Math.LN2 / k1)]],
    checks: [['Largest difference from the exact solution', worst.toExponential(1)], ['Solver steps', String(result.steps)]],
    error: '',
  }
}

function KineticsTab({ saved }: { saved?: unknown }) {
  const [form, setForm] = useState<KinForm>(() => mergeForm(KIN_DEFAULT, saved))
  const set = (k: keyof KinForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }))
  const [view, setView] = useState<'sp' | 'enz'>('sp')
  const out = useMemo(() => compute(form), [form])

  const shown = out.names.map((_, i) => i).filter((i) => {
    if (form.model !== 'enzyme') return true
    const nm = out.names[i]
    if (nm === 'I' && num(form.ei0) === 0) return false
    if (nm === 'EI' && num(form.ei0) === 0) return false
    return view === 'sp' ? nm === 'S' || nm === 'P' : nm === 'E' || nm === 'ES' || nm === 'EI'
  })
  const series: Series[] = shown.map((i) => ({ name: out.names[i], points: out.result.t.map((t, k) => [t, out.result.y[k][i]] as [number, number]) }))
  const unit = form.model === 'enzyme' ? 'concentration (µM if k₁ is in µM⁻¹s⁻¹)' : 'amount'

  return (
    <>
      <div className="tool-row seq-actions">
        <button type="button" className={`chip${form.model === 'enzyme' ? ' chip-active' : ''}`} onClick={() => set('model')('enzyme')}>Enzyme (Michaelis–Menten)</button>
        <button type="button" className={`chip${form.model === 'reversible' ? ' chip-active' : ''}`} onClick={() => set('model')('reversible')}>A ⇌ B</button>
        <button type="button" className={`chip${form.model === 'consecutive' ? ' chip-active' : ''}`} onClick={() => set('model')('consecutive')}>A → B → C</button>
        <button type="button" className="chip" onClick={() => setForm((f) => ({ ...KIN_DEFAULT, model: f.model }))}>Reset values</button>
        <SaveToProject module="Simulation" kind="kinetics" data={JSON.stringify(form)} defaultName="Reaction kinetics" />
      </div>

      {form.model === 'enzyme' && (
        <>
          <p className="note">Mass-action model E + S ⇌ ES → E + P, with an optional competitive inhibitor E + I ⇌ EI. Use any one consistent set of units; the examples read as µM and seconds.</p>
          <div className="sim-grid">
            <SimField id="k-ek1" label="k₁ (binding)" value={form.ek1} onChange={set('ek1')} />
            <SimField id="k-ekm1" label="k₋₁ (unbinding)" value={form.ekm1} onChange={set('ekm1')} />
            <SimField id="k-ekcat" label="k_cat" value={form.ekcat} onChange={set('ekcat')} />
            <SimField id="k-ee0" label="[E]₀" value={form.ee0} onChange={set('ee0')} />
            <SimField id="k-es0" label="[S]₀" value={form.es0} onChange={set('es0')} />
            <SimField id="k-ei0" label="[I]₀ (inhibitor)" value={form.ei0} onChange={set('ei0')} />
            <SimField id="k-ekon" label="k_on (inhibitor)" value={form.ekon} onChange={set('ekon')} />
            <SimField id="k-ekoff" label="k_off (inhibitor)" value={form.ekoff} onChange={set('ekoff')} />
            <SimField id="k-etmax" label="Time range" value={form.etmax} onChange={set('etmax')} />
          </div>
        </>
      )}
      {form.model === 'reversible' && (
        <div className="sim-grid">
          <SimField id="k-rkf" label="k_f (A→B)" value={form.rkf} onChange={set('rkf')} />
          <SimField id="k-rkr" label="k_r (B→A)" value={form.rkr} onChange={set('rkr')} />
          <SimField id="k-ra0" label="[A]₀" value={form.ra0} onChange={set('ra0')} />
          <SimField id="k-rb0" label="[B]₀" value={form.rb0} onChange={set('rb0')} />
          <SimField id="k-rtmax" label="Time range" value={form.rtmax} onChange={set('rtmax')} />
        </div>
      )}
      {form.model === 'consecutive' && (
        <div className="sim-grid">
          <SimField id="k-ck1" label="k₁ (A→B)" value={form.ck1} onChange={set('ck1')} />
          <SimField id="k-ck2" label="k₂ (B→C)" value={form.ck2} onChange={set('ck2')} />
          <SimField id="k-ca0" label="[A]₀" value={form.ca0} onChange={set('ca0')} />
          <SimField id="k-ctmax" label="Time range" value={form.ctmax} onChange={set('ctmax')} />
        </div>
      )}

      {out.error && <p className="tool-error">{out.error}</p>}
      {!out.error && out.result.message && <p className="tool-error">{out.result.message}</p>}

      {!out.error && out.result.t.length > 0 && (
        <>
          <div className="seq-block">
            <div className="seq-block-head">
              <h4>Time course</h4>
              <div className="tool-row">
                {form.model === 'enzyme' && (
                  <>
                    <button type="button" className={`chip${view === 'sp' ? ' chip-active' : ''}`} onClick={() => setView('sp')}>Substrate and product</button>
                    <button type="button" className={`chip${view === 'enz' ? ' chip-active' : ''}`} onClick={() => setView('enz')}>Enzyme forms</button>
                  </>
                )}
                <button type="button" className="chip" onClick={() => downloadCsv('kinetics-timecourse.csv', [['time', ...out.names], ...out.result.t.map((t, i) => [t, ...out.result.y[i]])])}>Download CSV</button>
              </div>
            </div>
            <SimChart series={series} xLabel="Time" yLabel={unit} yMin={0} />
          </div>

          <div className="seq-block">
            <div className="seq-block-head"><h4>Calculated quantities</h4></div>
            <div className="orf-scroll" tabIndex={0} role="region" aria-label="Calculated quantities">
              <table className="orf-table">
                <tbody>
                  {out.rows.map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}
                </tbody>
              </table>
            </div>
            <div className="orf-scroll" tabIndex={0} role="region" aria-label="Numerical checks">
              <table className="orf-table">
                <tbody>
                  {out.checks.map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}
                </tbody>
              </table>
            </div>
            <p className="note">Calculated by numerical integration (adaptive Dormand–Prince 5(4), relative tolerance 1e-8). Model results, not measurements: they are only as good as the rate constants you enter.</p>
          </div>
        </>
      )}
    </>
  )
}

export default KineticsTab
