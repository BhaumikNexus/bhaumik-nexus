import { niceTicks } from '../data/dataUtils.ts'
import { predict4pl } from './doseResponse.ts'
import type { Fit4pl } from './doseResponse.ts'
import { fmt } from './statsUtils.ts'

const W = 600
const H = 340
const M = { l: 58, r: 16, t: 14, b: 50 }

function DoseChart({ x, y, fit, xLabel, yLabel }: { x: number[]; y: number[]; fit: Fit4pl; xLabel: string; yLabel: string }) {
  const pos = x.filter((v) => v > 0)
  const hasZero = x.some((v) => v === 0)
  const minPos = Math.min(...pos)
  const maxPos = Math.max(...pos)
  const loExp = Math.floor(Math.log10(minPos) - (hasZero ? 0.7 : 0.15))
  const hiExp = Math.ceil(Math.log10(maxPos) + 0.15)
  const sx = (v: number) => {
    const lx = v === 0 ? Math.log10(minPos) - 0.5 : Math.log10(v)
    return M.l + ((lx - loExp) / (hiExp - loExp)) * (W - M.l - M.r)
  }
  const curve: [number, number][] = []
  for (let i = 0; i <= 160; i++) {
    const v = 10 ** (loExp + 0.2 + ((hiExp - loExp - 0.2) * i) / 160)
    curve.push([v, predict4pl(fit, v)])
  }
  const allY = [...y, ...curve.map((c) => c[1])]
  const yt = niceTicks(Math.min(...allY), Math.max(...allY))
  const y0 = yt[0]
  const y1 = yt[yt.length - 1]
  const sy = (v: number) => H - M.b - ((v - y0) / (y1 - y0)) * (H - M.t - M.b)
  const decades: number[] = []
  for (let e = Math.ceil(loExp); e <= hiExp; e++) decades.push(e)

  return (
    <svg className="data-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Dose-response data with fitted curve">
      {yt.map((t) => (
        <g key={t}>
          <line x1={M.l} x2={W - M.r} y1={sy(t)} y2={sy(t)} className="grid" />
          <text x={M.l - 8} y={sy(t) + 4} textAnchor="end">{fmt(t, 4)}</text>
        </g>
      ))}
      {decades.map((e) => (
        <text key={e} x={sx(10 ** e)} y={H - M.b + 18} textAnchor="middle">{fmt(10 ** e, 3)}</text>
      ))}
      {hasZero && <text x={sx(0)} y={H - M.b + 18} textAnchor="middle">0</text>}
      <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} className="axis" />
      <line x1={M.l} x2={M.l} y1={M.t} y2={H - M.b} className="axis" />
      <text x={(M.l + W - M.r) / 2} y={H - 8} textAnchor="middle" className="axis-label">{xLabel} (log scale)</text>
      <text transform={`translate(14 ${(M.t + H - M.b) / 2}) rotate(-90)`} textAnchor="middle" className="axis-label">{yLabel}</text>
      <polyline className="series" fill="none" points={curve.map(([a, b]) => `${sx(a)},${sy(b)}`).join(' ')} />
      <line x1={sx(fit.ec50)} x2={sx(fit.ec50)} y1={M.t} y2={H - M.b} className="fit" />
      <text x={sx(fit.ec50) + 4} y={M.t + 12}>EC50 {fmt(fit.ec50, 3)}</text>
      {x.map((v, i) => (
        <circle key={i} cx={sx(v)} cy={sy(y[i])} r={3.5} className="dot">
          <title>{`${fmt(v)}, ${fmt(y[i])}`}</title>
        </circle>
      ))}
    </svg>
  )
}

export default DoseChart
