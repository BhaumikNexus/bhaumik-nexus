import { num } from './simForm.ts'
import type { MdForm } from './simForm.ts'
import { LJSystem } from './simUtils.ts'

export interface MdSample { t: number; T: number; ke: number; pe: number; p: number }

export const EQUIL_STEPS = 500

/** A running molecular dynamics experiment: the system plus its recorded history. Mutable on purpose. */
export class MdRun {
  readonly sys: LJSystem
  hist: MdSample[] = []
  private every = 10
  private e0: number
  usedThermostat = false

  constructor(sys: LJSystem) {
    this.sys = sys
    this.e0 = sys.totalEnergy()
    this.sample()
  }

  private sample(): void {
    const s = this.sys
    this.hist.push({ t: s.time, T: s.temperature(), ke: s.kinetic() / s.n, pe: s.pe / s.n, p: s.pressure() })
    if (this.hist.length > 3000) {
      this.hist = this.hist.filter((_, i) => i % 2 === 0)
      this.every *= 2
    }
  }

  advance(steps: number, thermostat: { target: number; tau: number } | null): void {
    const s = this.sys
    for (let i = 0; i < steps; i++) {
      if (thermostat) this.usedThermostat = true
      s.step(thermostat ?? undefined)
      if (s.steps % this.every === 0) this.sample()
      if (s.steps >= EQUIL_STEPS && s.steps % 20 === 0) s.accumulateRdf()
    }
  }

  /** Relative total-energy change since the start; only meaningful when no thermostat was used. */
  drift(): number | null {
    if (this.usedThermostat || this.e0 === 0) return null
    return Math.abs(this.sys.totalEnergy() - this.e0) / Math.abs(this.e0)
  }

  draw(cv: HTMLCanvasElement): void {
    const s = this.sys
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const size = cv.width
    ctx.clearRect(0, 0, size, size)
    const k = size / s.L
    const order = Array.from({ length: s.n }, (_, i) => i).sort((a, b) => s.z[a] - s.z[b])
    for (const i of order) {
      const depth = s.z[i] / s.L
      ctx.beginPath()
      ctx.arc(s.x[i] * k, s.y[i] * k, 0.5 * k * (0.75 + 0.35 * depth), 0, 2 * Math.PI)
      ctx.fillStyle = `hsla(${200 - 90 * depth}, 80%, ${45 + 20 * depth}%, ${0.55 + 0.4 * depth})`
      ctx.fill()
    }
  }
}

export function makeMdRun(form: MdForm): { run: MdRun | null; error: string } {
  const n = Number(form.n)
  const density = num(form.density)
  const temp = num(form.temp)
  const dt = num(form.dt)
  if (!(density >= 0.01 && density <= 1.2)) return { run: null, error: 'Density must be between 0.01 and 1.2 (reduced units).' }
  if (!(temp >= 0.05 && temp <= 10)) return { run: null, error: 'Temperature must be between 0.05 and 10 (reduced units).' }
  if (!(dt >= 0.0005 && dt <= 0.01)) return { run: null, error: 'Time step must be between 0.0005 and 0.01.' }
  if (form.thermo === 'on' && !(num(form.target) >= 0.05 && num(form.target) <= 10)) return { run: null, error: 'Target temperature must be between 0.05 and 10.' }
  try {
    return { run: new MdRun(new LJSystem({ n, density, temperature: temp, dt })), error: '' }
  } catch (e) {
    return { run: null, error: e instanceof Error ? e.message : 'Could not start the simulation.' }
  }
}
