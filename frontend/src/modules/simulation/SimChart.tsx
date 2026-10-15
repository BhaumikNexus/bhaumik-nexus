import { fmt, niceTicks } from '../data/dataUtils.ts'

const W = 600
const H = 340
const M = { l: 60, r: 16, t: 14, b: 46 }
const COLOURS = ['#5b8cff', '#ff9f45', '#3ddcc4', '#d58bff', '#ff6b8a', '#c9d36a']
const DASHES = ['', '6 3', '2 3', '10 3 2 3', '', '6 3']

export interface Series {
  name: string
  points: [number, number][]
}

interface Props {
  series: Series[]
  xLabel: string
  yLabel: string
  yMin?: number
  /** horizontal reference line */
  refY?: number
}

/** Line chart for one or more series; each series has its own colour and dash pattern, and a legend is shown below. */
function SimChart({ series, xLabel, yLabel, yMin, refY }: Props) {
  const all = series.flatMap((s) => s.points).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))
  if (all.length === 0) return <p className="note">Nothing to plot yet.</p>
  const xs = all.map((p) => p[0])
  const ys = all.map((p) => p[1])
  const xt = niceTicks(Math.min(...xs), Math.max(...xs))
  const yLo = yMin ?? Math.min(...ys, refY ?? Infinity)
  const yHi = Math.max(...ys, refY ?? -Infinity)
  const yt = niceTicks(yLo, yHi === yLo ? yLo + 1 : yHi)
  const x0 = xt[0]
  const x1 = xt[xt.length - 1]
  const y0 = yt[0]
  const y1 = yt[yt.length - 1]
  const sx = (v: number) => M.l + ((v - x0) / (x1 - x0 || 1)) * (W - M.l - M.r)
  const sy = (v: number) => H - M.b - ((v - y0) / (y1 - y0 || 1)) * (H - M.t - M.b)

  return (
    <div className="sim-chart">
      <svg className="data-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${yLabel} against ${xLabel}`}>
        {yt.map((t) => (
          <g key={`y${t}`}>
            <line x1={M.l} x2={W - M.r} y1={sy(t)} y2={sy(t)} className="grid" />
            <text x={M.l - 8} y={sy(t) + 4} textAnchor="end">{fmt(t, 4)}</text>
          </g>
        ))}
        {xt.map((t) => (
          <text key={`x${t}`} x={sx(t)} y={H - M.b + 18} textAnchor="middle">{fmt(t, 4)}</text>
        ))}
        <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} className="axis" />
        <line x1={M.l} x2={M.l} y1={M.t} y2={H - M.b} className="axis" />
        <text x={(M.l + W - M.r) / 2} y={H - 8} textAnchor="middle" className="axis-label">{xLabel}</text>
        <text transform={`translate(14 ${(M.t + H - M.b) / 2}) rotate(-90)`} textAnchor="middle" className="axis-label">{yLabel}</text>
        {refY !== undefined && <line x1={M.l} x2={W - M.r} y1={sy(refY)} y2={sy(refY)} stroke="#8d9bb8" strokeDasharray="3 4" />}
        {series.map((s, i) => (
          <polyline
            key={s.name}
            fill="none"
            stroke={COLOURS[i % COLOURS.length]}
            strokeWidth={1.8}
            strokeDasharray={DASHES[i % DASHES.length]}
            points={s.points.filter((p) => Number.isFinite(p[1])).map((p) => `${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join(' ')}
          />
        ))}
      </svg>
      {series.length > 1 && (
        <ul className="sim-legend">
          {series.map((s, i) => (
            <li key={s.name}>
              <svg width="28" height="8" aria-hidden="true">
                <line x1="0" x2="28" y1="4" y2="4" stroke={COLOURS[i % COLOURS.length]} strokeWidth="2" strokeDasharray={DASHES[i % DASHES.length]} />
              </svg>
              {s.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default SimChart
