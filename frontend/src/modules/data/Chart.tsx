import { fmt, niceTicks } from './dataUtils.ts'

const W = 600
const H = 360
const M = { l: 58, r: 16, t: 14, b: 48 }

export type ChartKind = 'histogram' | 'scatter' | 'line'

interface ChartProps {
  kind: ChartKind
  xLabel: string
  yLabel: string
  /** scatter / line points */
  points?: [number, number][]
  /** histogram */
  hist?: { edges: number[]; counts: number[] }
  fit?: { slope: number; intercept: number } | null
}

function Chart({ kind, xLabel, yLabel, points = [], hist, fit }: ChartProps) {
  let xs: number[]
  let ys: number[]
  if (kind === 'histogram' && hist) {
    xs = [hist.edges[0], hist.edges[hist.edges.length - 1]]
    ys = [0, Math.max(...hist.counts)]
  } else {
    xs = points.map((p) => p[0])
    ys = points.map((p) => p[1])
  }
  if (xs.length === 0) return <p className="note">Nothing to plot.</p>

  const xt = niceTicks(Math.min(...xs), Math.max(...xs))
  const yt = niceTicks(kind === 'histogram' ? 0 : Math.min(...ys), Math.max(...ys))
  const x0 = xt[0]
  const x1 = xt[xt.length - 1]
  const y0 = yt[0]
  const y1 = yt[yt.length - 1]
  const sx = (v: number) => M.l + ((v - x0) / (x1 - x0)) * (W - M.l - M.r)
  const sy = (v: number) => H - M.b - ((v - y0) / (y1 - y0)) * (H - M.t - M.b)

  const sorted = kind === 'line' ? [...points].sort((a, b) => a[0] - b[0]) : points

  return (
    <svg className="data-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${kind} of ${yLabel} against ${xLabel}`}>
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

      {kind === 'histogram' && hist &&
        hist.counts.map((c, i) => (
          <rect key={i} x={sx(hist.edges[i]) + 1} y={sy(c)} width={Math.max(0, sx(hist.edges[i + 1]) - sx(hist.edges[i]) - 2)} height={sy(0) - sy(c)} className="bar">
            <title>{`${fmt(hist.edges[i])} to ${fmt(hist.edges[i + 1])}: ${c}`}</title>
          </rect>
        ))}

      {kind === 'line' && <polyline className="series" fill="none" points={sorted.map(([a, b]) => `${sx(a)},${sy(b)}`).join(' ')} />}
      {kind !== 'histogram' && sorted.length <= 5000 &&
        sorted.map(([a, b], i) => (
          <circle key={i} cx={sx(a)} cy={sy(b)} r={kind === 'scatter' ? 3.5 : 2.5} className="dot">
            <title>{`${fmt(a)}, ${fmt(b)}`}</title>
          </circle>
        ))}
      {kind === 'scatter' && fit && (
        <line className="fit" x1={sx(x0)} y1={sy(fit.slope * x0 + fit.intercept)} x2={sx(x1)} y2={sy(fit.slope * x1 + fit.intercept)} />
      )}
    </svg>
  )
}

export default Chart
