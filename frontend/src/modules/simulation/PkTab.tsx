import { useMemo, useState } from 'react'
import SaveToProject from '../../components/common/SaveToProject.tsx'
import SimChart from './SimChart.tsx'
import SimField from './SimField.tsx'
import { PK_DEFAULT, downloadCsv, mergeForm, num, sig } from './simForm.ts'
import type { PkForm } from './simForm.ts'
import { pkConcentration, pkSummary } from './simUtils.ts'
import type { PkParams } from './simUtils.ts'

function PkTab({ saved }: { saved?: unknown }) {
  const [form, setForm] = useState<PkForm>(() => mergeForm(PK_DEFAULT, saved))
  const set = (k: keyof PkForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }))

  const out = useMemo(() => {
    const ka = form.ka.trim() === '' ? 0 : num(form.ka)
    const tau = form.tau.trim() === '' ? 0 : num(form.tau)
    const p: PkParams = { dose: num(form.dose), f: num(form.f), v: num(form.v), cl: num(form.cl), ka, tau, doses: Math.round(num(form.doses)) }
    if (![p.dose, p.v, p.cl].every((x) => x > 0)) return { error: 'Dose, volume of distribution and clearance must be positive numbers.' }
    if (!(p.f > 0 && p.f <= 1)) return { error: 'Bioavailability F must be above 0 and at most 1 (use 1 for an intravenous dose).' }
    if (!(p.ka >= 0) || !(p.tau >= 0)) return { error: 'Absorption rate and dosing interval cannot be negative (leave blank or 0 for none).' }
    if (p.tau > 0 && !(p.doses >= 1 && p.doses <= 1000)) return { error: 'Number of doses must be between 1 and 1000.' }
    const sum = pkSummary(p)
    const multi = p.tau > 0 && p.doses > 1
    const tEnd = multi ? (p.doses - 1) * p.tau + Math.max(p.tau, 4 * sum.halfLife) : 6 * sum.halfLife + (p.ka > 0 ? 2 * sum.tmax : 0)
    const pts: [number, number][] = []
    const m = 400
    for (let i = 0; i <= m; i++) {
      const t = (tEnd * i) / m
      pts.push([t, pkConcentration(p, t)])
    }
    return { error: '', p, sum, pts, multi, tEnd }
  }, [form])

  return (
    <>
      <p className="note">One-compartment model with first-order elimination (CL/V) and, for oral doses, first-order absorption. Units: dose in mg, volume in L, clearance in L/h, rates per hour, concentration in mg/L.</p>
      <div className="sim-grid">
        <SimField id="pk-dose" label="Dose" unit="mg" value={form.dose} onChange={set('dose')} />
        <SimField id="pk-f" label="Bioavailability F" unit="0–1" value={form.f} onChange={set('f')} />
        <SimField id="pk-v" label="Volume V" unit="L" value={form.v} onChange={set('v')} />
        <SimField id="pk-cl" label="Clearance CL" unit="L/h" value={form.cl} onChange={set('cl')} />
        <SimField id="pk-ka" label="Absorption k_a (blank = IV bolus)" unit="1/h" value={form.ka} onChange={set('ka')} />
        <SimField id="pk-tau" label="Dosing interval (blank = single dose)" unit="h" value={form.tau} onChange={set('tau')} />
        {num(form.tau) > 0 && <SimField id="pk-n" label="Number of doses" value={form.doses} onChange={set('doses')} />}
      </div>
      <div className="tool-row seq-actions">
        <button type="button" className="chip" onClick={() => setForm(PK_DEFAULT)}>Reset values</button>
        <button type="button" className="chip" disabled={!!out.error} onClick={() => out.pts && downloadCsv('pk-profile.csv', [['time_h', 'concentration_mg_per_L'], ...out.pts])}>Download CSV</button>
        <SaveToProject module="Simulation" kind="pk" data={JSON.stringify(form)} defaultName="Pharmacokinetics" />
      </div>
      {out.error && <p className="tool-error">{out.error}</p>}
      {!out.error && out.pts && out.sum && out.p && (
        <>
          <div className="seq-block">
            <div className="seq-block-head"><h4>Plasma concentration</h4></div>
            <SimChart series={[{ name: 'Concentration', points: out.pts }]} xLabel="Time (h)" yLabel="Concentration (mg/L)" yMin={0} refY={out.multi ? out.sum.cavgSs ?? undefined : undefined} />
            {out.multi && <p className="note">Dotted line: average concentration at steady state.</p>}
          </div>
          <div className="seq-block">
            <div className="seq-block-head"><h4>Calculated parameters</h4></div>
            <div className="orf-scroll" tabIndex={0} role="region" aria-label="Pharmacokinetic parameters">
              <table className="orf-table">
                <tbody>
                  <tr><td>Elimination rate constant k_e = CL / V</td><td>{sig(out.sum.ke)} 1/h</td></tr>
                  <tr><td>Elimination half-life</td><td>{sig(out.sum.halfLife)} h</td></tr>
                  <tr><td>AUC (0 to ∞, one dose) = F · dose / CL</td><td>{sig(out.sum.auc)} mg·h/L</td></tr>
                  {out.p.ka > 0 ? (
                    <>
                      <tr><td>t_max (one dose)</td><td>{sig(out.sum.tmax)} h</td></tr>
                      <tr><td>C_max (one dose)</td><td>{sig(out.sum.cmax)} mg/L</td></tr>
                    </>
                  ) : (
                    <tr><td>C₀ (IV bolus) = F · dose / V</td><td>{sig(out.sum.cmax)} mg/L</td></tr>
                  )}
                  {out.p.tau > 0 && out.sum.accumulation !== null && (
                    <>
                      <tr><td>Accumulation ratio 1 / (1 − e^(−k_e τ))</td><td>{sig(out.sum.accumulation)}</td></tr>
                      <tr><td>Average steady-state concentration</td><td>{sig(out.sum.cavgSs ?? NaN)} mg/L</td></tr>
                      <tr><td>Steady-state peak / trough</td><td>{sig(out.sum.cmaxSs ?? NaN)} / {sig(out.sum.cminSs ?? NaN)} mg/L</td></tr>
                      <tr><td>Time to about 90% of steady state</td><td>{sig(out.sum.timeToSteadyState ?? NaN)} h</td></tr>
                      {out.multi && <tr><td>Highest concentration in this regimen</td><td>{sig(Math.max(...out.pts.map((q) => q[1])))} mg/L</td></tr>}
                    </>
                  )}
                </tbody>
              </table>
            </div>
            <p className="note">Calculated from the closed-form one-compartment equations (checked against numerical integration). A teaching model with no inter-patient variability: not for deciding real doses.</p>
          </div>
        </>
      )}
    </>
  )
}

export default PkTab
