import { niceTicks } from '../data/dataUtils.ts'
import { fmt } from './statsUtils.ts'

const W = 600
const H = 340
const M = { l: 58, r: 16, t: 14, b: 56 }

export interface GroupBar {
  name: string
  values: number[]
  mean: number
  /** Half-length of the error bar, or null when it cannot be calculated. */
  err: number | null
}

function GroupChart({ groups, yLabel, errLabel }: { groups: GroupBar[]; yLabel: string; errLabel: string }) {
  if (groups.length === 0) return null
  const lows = groups.flatMap((g) => [Math.min(...g.values), g.err === null ? g.mean : g.mean - g.err])
  const highs = groups.flatMap((g) => [Math.max(...g.values), g.err === null ? g.mean : g.mean + g.err])
  const yt = niceTicks(Math.min(0, ...lows), Math.max(0, ...highs))
  const y0 = yt[0]
  const y1 = yt[yt.length - 1]
  const sy = (v: number) => H - M.b - ((v - y0) / (y1 - y0)) * (H - M.t - M.b)
  const slot = (W - M.l - M.r) / groups.length
  const bw = Math.min(70, slot * 0.55)

  return (
    <svg className="data-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Group means with ${errLabel} error bars`}>
      {yt.map((t) => (
        <g key={t}>
          <line x1={M.l} x2={W - M.r} y1={sy(t)} y2={sy(t)} className="grid" />
          <text x={M.l - 8} y={sy(t) + 4} textAnchor="end">{fmt(t, 4)}</text>
        </g>
      ))}
      <line x1={M.l} x2={W - M.r} y1={sy(Math.max(y0, 0))} y2={sy(Math.max(y0, 0))} className="axis" />
      <line x1={M.l} x2={M.l} y1={M.t} y2={H - M.b} className="axis" />
      <text transform={`translate(14 ${(M.t + H - M.b) / 2}) rotate(-90)`} textAnchor="middle" className="axis-label">{yLabel}</text>
      {groups.map((g, i) => {
        const cx = M.l + slot * (i + 0.5)
        const top = sy(g.mean)
        const base = sy(Math.max(y0, 0))
        return (
          <g key={g.name + i}>
            <rect x={cx - bw / 2} y={Math.min(top, base)} width={bw} height={Math.abs(base - top)} className="bar" fillOpacity={0.55}>
              <title>{`${g.name}: mean ${fmt(g.mean)}`}</title>
            </rect>
            {g.err !== null && (
              <g className="fit" strokeDasharray="none" style={{ stroke: '#0f172a' }}>
                <line x1={cx} x2={cx} y1={sy(g.mean - g.err)} y2={sy(g.mean + g.err)} />
                <line x1={cx - 8} x2={cx + 8} y1={sy(g.mean - g.err)} y2={sy(g.mean - g.err)} />
                <line x1={cx - 8} x2={cx + 8} y1={sy(g.mean + g.err)} y2={sy(g.mean + g.err)} />
              </g>
            )}
            {g.values.map((v, j) => (
              <circle key={j} cx={cx + (((j * 37) % 21) - 10) * (bw / 40)} cy={sy(v)} r={3} className="dot">
                <title>{fmt(v)}</title>
              </circle>
            ))}
            <text x={cx} y={H - M.b + 18} textAnchor="middle">{g.name.length > 14 ? g.name.slice(0, 13) + '…' : g.name}</text>
          </g>
        )
      })}
    </svg>
  )
}

export default GroupChart
