import { useEffect, useRef, useState } from 'react'
import SaveToProject from '../../components/common/SaveToProject.tsx'
import SimChart from './SimChart.tsx'
import SimField from './SimField.tsx'
import { MD_DEFAULT, downloadCsv, mergeForm, num, sig } from './simForm.ts'
import type { MdForm } from './simForm.ts'
import { EQUIL_STEPS, makeMdRun } from './mdRun.ts'
import { ARGON, MD_SIZES } from './simUtils.ts'

function MdTab({ saved }: { saved?: unknown }) {
  const [form, setForm] = useState<MdForm>(() => mergeForm(MD_DEFAULT, saved))
  const set = (k: keyof MdForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }))
  const [made, setMade] = useState(() => makeMdRun(mergeForm(MD_DEFAULT, saved)))
  const [running, setRunning] = useState(false)
  const [speed, setSpeed] = useState('10')
  const [, setTick] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const run = made.run
  const error = made.error

  function reset() {
    setRunning(false)
    setMade(makeMdRun(form))
  }

  useEffect(() => {
    if (run && canvasRef.current) run.draw(canvasRef.current)
  }, [run])

  const thermoOn = form.thermo === 'on'
  const target = num(form.target)
  const steps = Number(speed) || 10
  useEffect(() => {
    if (!running || !run) return
    let id = 0
    let frame = 0
    const loop = () => {
      run.advance(steps, thermoOn ? { target, tau: 0.2 } : null)
      if (canvasRef.current) run.draw(canvasRef.current)
      if (++frame % 6 === 0) setTick((t) => t + 1)
      id = requestAnimationFrame(loop)
    }
    id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  }, [running, run, steps, thermoOn, target])

  const s = run ? run.sys : null
  const hist = run ? run.hist : []
  const stride = Math.max(1, Math.ceil(hist.length / 300))
  const thin = hist.filter((_, i) => i % stride === 0 || i === hist.length - 1)
  const rdf = s ? s.rdf() : []
  const last = hist[hist.length - 1]
  const drift = run ? run.drift() : null
  const warnDt = num(form.dt) > 0.008
  const reducedCut = s ? s.rc < 2.5 : false

  return (
    <>
      <div className="sim-grid">
        <div className="sim-field">
          <label htmlFor="md-n">Particles</label>
          <select id="md-n" value={form.n} onChange={(e) => set('n')(e.target.value)}>
            {MD_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <SimField id="md-rho" label="Density ρ*" value={form.density} onChange={set('density')} />
        <SimField id="md-t" label="Start temperature T*" value={form.temp} onChange={set('temp')} />
        <SimField id="md-dt" label="Time step Δt*" value={form.dt} onChange={set('dt')} />
        <div className="sim-field">
          <label htmlFor="md-th">Thermostat</label>
          <select id="md-th" value={form.thermo} onChange={(e) => set('thermo')(e.target.value)}>
            <option value="off">Off (constant energy, NVE)</option>
            <option value="on">Berendsen (weak coupling)</option>
          </select>
        </div>
        {form.thermo === 'on' && <SimField id="md-tt" label="Target T*" value={form.target} onChange={set('target')} />}
        <div className="sim-field">
          <label htmlFor="md-sp">Speed (steps per frame)</label>
          <select id="md-sp" value={speed} onChange={(e) => setSpeed(e.target.value)}>
            <option value="2">2</option><option value="5">5</option><option value="10">10</option><option value="25">25</option>
          </select>
        </div>
      </div>

      <div className="tool-row seq-actions">
        <button type="button" className="chip chip-active" onClick={() => setRunning((r) => !r)} disabled={!run}>{running ? 'Pause' : 'Run'}</button>
        <button type="button" className="chip" onClick={reset}>Reset with these settings</button>
        <button type="button" className="chip" disabled={hist.length < 2} onClick={() => downloadCsv('md-timeseries.csv', [['time*', 'T*', 'KE/N', 'PE/N', 'E/N', 'P*'], ...hist.map((h) => [h.t, h.T, h.ke, h.pe, h.ke + h.pe, h.p])])}>Download time series (CSV)</button>
        <SaveToProject module="Simulation" kind="md" data={JSON.stringify(form)} defaultName="Molecular dynamics settings" />
      </div>
      {error && <p className="tool-error">{error}</p>}
      {warnDt && <p className="sim-warn">Time steps above 0.008 usually make the total energy drift.</p>}
      {reducedCut && <p className="sim-warn">This small box forces the cut-off down to half the box length ({s ? sig(s.rc, 3) : ''} σ instead of 2.5 σ), so the potential differs from the standard one. Use 108 or more particles for standard results.</p>}

      <div className="sim-layout">
        <div>
          <canvas ref={canvasRef} className="sim-canvas" width={440} height={440} role="img" aria-label="Particles in the simulation box, projected onto the x–y plane" />
          <p className="note">Projection on x–y; brighter, larger particles are nearer the front. The box repeats in every direction (periodic boundaries).</p>
        </div>
        <div>
          <dl className="sim-readouts">
            <div><dt>Steps</dt><dd>{s ? s.steps : 0}</dd></div>
            <div><dt>Time t*</dt><dd>{s ? sig(s.time, 4) : '—'}</dd></div>
            <div><dt>T* (now)</dt><dd>{last ? sig(last.T) : '—'}</dd></div>
            <div><dt>PE / N</dt><dd>{last ? sig(last.pe) : '—'}</dd></div>
            <div><dt>E / N</dt><dd>{last ? sig(last.ke + last.pe) : '—'}</dd></div>
            <div><dt>Pressure P*</dt><dd>{last ? sig(last.p) : '—'}</dd></div>
            <div><dt>Box side L*</dt><dd>{s ? sig(s.L) : '—'}</dd></div>
            <div><dt>Energy drift</dt><dd>{drift === null ? 'n/a (thermostat)' : drift.toExponential(1)}</dd></div>
          </dl>
          <p className="note">
            Calculated values in reduced Lennard-Jones units (ε = σ = mass = k<sub>B</sub> = 1). They fluctuate noticeably in a system this small.
            {last && <> Scaled to argon (σ = {ARGON.sigmaAngstrom} Å, ε/k<sub>B</sub> = {ARGON.epsilonOverKb} K, unit time {ARGON.tauPs} ps): T ≈ {sig(last.T * ARGON.epsilonOverKb, 4)} K after {sig((s?.time ?? 0) * ARGON.tauPs, 3)} ps. The argon scaling is illustrative only.</>}
          </p>
        </div>
      </div>

      <div className="seq-block">
        <div className="seq-block-head"><h4>Temperature</h4></div>
        <SimChart series={[{ name: 'T*', points: thin.map((h) => [h.t, h.T]) }]} xLabel="Time t*" yLabel="T*" yMin={0} refY={form.thermo === 'on' ? num(form.target) : undefined} />
      </div>
      <div className="seq-block">
        <div className="seq-block-head"><h4>Energy per particle</h4></div>
        <SimChart
          series={[
            { name: 'Kinetic', points: thin.map((h) => [h.t, h.ke]) },
            { name: 'Potential', points: thin.map((h) => [h.t, h.pe]) },
            { name: 'Total', points: thin.map((h) => [h.t, h.ke + h.pe]) },
          ]}
          xLabel="Time t*"
          yLabel="Energy / N (ε)"
        />
        <p className="note">Without a thermostat the total should stay flat; kinetic and potential energy trade off.</p>
      </div>
      <div className="seq-block">
        <div className="seq-block-head"><h4>Radial distribution function g(r)</h4></div>
        {rdf.length > 0 ? (
          <>
            <SimChart series={[{ name: 'g(r)', points: rdf }]} xLabel="Distance r (σ)" yLabel="g(r)" yMin={0} refY={1} />
            <p className="note">Averaged over {s?.rdfSamples} snapshots taken after the first {EQUIL_STEPS} steps. Dense liquids show a first peak near 1.1 σ; g(r) tends to 1 at long range. Only distances up to half the box are shown.</p>
          </>
        ) : (
          <p className="note">Run for more than {EQUIL_STEPS} steps to start collecting g(r).</p>
        )}
      </div>
      <p className="note">Teaching-scale simulation: truncated and shifted Lennard-Jones potential, velocity Verlet integration, periodic boundaries, no long-range tail correction. Results for 32–500 particles are noisy and not a substitute for production MD software.</p>
    </>
  )
}

export default MdTab
