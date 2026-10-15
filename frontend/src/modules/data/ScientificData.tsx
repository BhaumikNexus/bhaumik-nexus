import { useMemo, useState } from 'react'
import Chart from './Chart.tsx'
import type { ChartKind } from './Chart.tsx'
import { buildTable, fmt, histogram, linearFit, pairs, parseDelimited, pearson, summarize } from './dataUtils.ts'
import SaveToProject from '../../components/common/SaveToProject.tsx'
import type { ProjectItem } from '../../services/projectStore.ts'

const EXAMPLES = [
  {
    label: 'Anscombe set I',
    text: 'x,y\n10,8.04\n8,6.95\n13,7.58\n9,8.81\n11,8.33\n14,9.96\n6,7.24\n4,4.26\n12,10.84\n7,4.82\n5,5.68',
  },
  {
    label: 'Synthetic growth',
    text: '# synthetic demo data, not measurements\nhour,od600,group\n0,0.05,A\n2,0.09,A\n4,0.21,A\n6,0.52,A\n8,1.05,A\n10,1.48,A\n12,1.71,A\n0,0.05,B\n2,0.07,B\n4,0.14,B\n6,0.33,B\n8,0.71,B\n10,1.12,B\n12,1.39,B',
  },
]

function ScientificData({ initial }: { initial?: ProjectItem | null }) {
  const [text, setText] = useState(initial?.data ?? '')
  const [note, setNote] = useState('')
  const [kind, setKind] = useState<ChartKind>('scatter')
  const [xName, setXName] = useState('')
  const [yName, setYName] = useState('')
  const [showFit, setShowFit] = useState(true)

  const table = useMemo(() => {
    const cleaned = text.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n')
    return buildTable(parseDelimited(cleaned))
  }, [text])
  const numeric = table.columns.filter((c) => c.numeric)
  const x = numeric.find((c) => c.name === xName) ?? numeric[0]
  const y = numeric.find((c) => c.name === yName) ?? numeric[1] ?? numeric[0]

  const points = useMemo(() => (x && y ? pairs(x.values, y.values) : []), [x, y])
  const corr = useMemo(() => pearson(points), [points])
  const fit = useMemo(() => linearFit(points), [points])
  const hist = useMemo(() => {
    if (!x) return undefined
    const v = x.values.filter((n): n is number => n !== null)
    return v.length ? histogram(v) : undefined
  }, [x])
  const matrix = useMemo(
    () => numeric.slice(0, 8).map((a) => numeric.slice(0, 8).map((b) => (a === b ? 1 : (pearson(pairs(a.values, b.values))?.r ?? null)))),
    [numeric],
  )

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > 20 * 1024 * 1024) {
      setNote('That file is larger than 20 MB.')
      return
    }
    setText(await file.text())
    setXName('')
    setYName('')
    setNote(`Loaded ${file.name}`)
  }

  const needsY = kind !== 'histogram'
  const canPlot = kind === 'histogram' ? Boolean(x) : numeric.length >= 2

  return (
    <>
      <div className="seq-main">
        <div className="seq-input">
          <label htmlFor="data-text">Data table (CSV, TSV or semicolon-separated; first row is the header)</label>
          <textarea id="data-text" value={text} spellCheck={false} placeholder={'x,y\n1,2.1\n2,3.9'} onChange={(e) => { setText(e.target.value); setNote('') }} />
          <div className="tool-row seq-actions">
            {EXAMPLES.map((ex) => (
              <button key={ex.label} type="button" className="chip" onClick={() => { setText(ex.text); setXName(''); setYName(''); setNote('') }}>
                {ex.label}
              </button>
            ))}
            <label className="chip file-chip">
              Open file
              <input type="file" accept=".csv,.tsv,.txt" onChange={onFile} />
            </label>
            <button type="button" className="chip" disabled={!text} onClick={() => setText('')}>Clear</button>
            <SaveToProject module="Scientific Data" kind="table" data={text} defaultName="Data table" />
          </div>
          {note && <p className="note">{note}</p>}
        </div>

        {table.columns.length > 0 && table.rowCount > 0 && (
          <>
            <div className="seq-block">
              <div className="seq-block-head"><h4>Chart</h4></div>
              <div className="tool-row seq-actions">
                <select aria-label="Chart type" value={kind} onChange={(e) => setKind(e.target.value as ChartKind)} style={{ width: 'auto' }}>
                  <option value="scatter">Scatter</option>
                  <option value="line">Line</option>
                  <option value="histogram">Histogram</option>
                </select>
                <select aria-label="X column" value={x?.name ?? ''} onChange={(e) => setXName(e.target.value)} style={{ width: 'auto' }}>
                  {numeric.map((c) => <option key={c.name}>{c.name}</option>)}
                </select>
                {needsY && (
                  <select aria-label="Y column" value={y?.name ?? ''} onChange={(e) => setYName(e.target.value)} style={{ width: 'auto' }}>
                    {numeric.map((c) => <option key={c.name}>{c.name}</option>)}
                  </select>
                )}
                {kind === 'scatter' && (
                  <label className="seq-check"><input type="checkbox" checked={showFit} onChange={(e) => setShowFit(e.target.checked)} /> Fit line</label>
                )}
              </div>
              {canPlot && x ? (
                <div className="chem-draw data-wrap">
                  <Chart
                    kind={kind}
                    xLabel={x.name}
                    yLabel={kind === 'histogram' ? 'Count' : (y?.name ?? '')}
                    points={points}
                    hist={hist}
                    fit={kind === 'scatter' && showFit ? fit : null}
                  />
                </div>
              ) : (
                <p className="note">Charts need at least {kind === 'histogram' ? 'one' : 'two'} numeric column{kind === 'histogram' ? '' : 's'}.</p>
              )}
              {kind !== 'histogram' && points.length > 5000 && <p className="note">Showing the line/fit only: more than 5,000 points are not drawn individually.</p>}
              {kind === 'scatter' && x && y && (
                <p className="note">
                  {corr && fit
                    ? `${points.length} complete pairs. Pearson r = ${fmt(corr.r)}, R² = ${fmt(fit.r2)}; least-squares line y = ${fmt(fit.slope)}·x + ${fmt(fit.intercept)}. `
                    : 'Fewer than 3 complete pairs, or no spread in one column, so no correlation or fit is calculated. '}
                  Correlation shows association only, and a single r can hide very different patterns, so look at the plot.
                </p>
              )}
            </div>

            <div className="seq-block">
              <div className="seq-block-head"><h4>Column summary</h4></div>
              <div className="orf-scroll" tabIndex={0} role="region" aria-label="Column summary">
                <table className="orf-table">
                  <thead>
                    <tr><th>Column</th><th>Type</th><th>n</th><th>Missing</th><th>Mean</th><th>SD</th><th>Min</th><th>Median</th><th>Max</th></tr>
                  </thead>
                  <tbody>
                    {table.columns.map((c) => {
                      const s = c.numeric ? summarize(c.values) : null
                      const filled = c.raw.filter((v) => v !== '').length
                      return (
                        <tr key={c.name}>
                          <td>{c.name}</td>
                          <td>{c.numeric ? 'number' : 'text'}</td>
                          <td>{s ? s.n : filled}</td>
                          <td>{s ? s.missing : table.rowCount - filled}</td>
                          <td>{fmt(s?.mean)}</td>
                          <td>{fmt(s?.sd)}</td>
                          <td>{fmt(s?.min)}</td>
                          <td>{fmt(s?.median)}</td>
                          <td>{fmt(s?.max)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="note">SD is the sample standard deviation (n − 1). Median uses linear interpolation. Missing means empty, NA, NaN or null.</p>
            </div>

            {numeric.length >= 2 && (
              <div className="seq-block">
                <div className="seq-block-head"><h4>Correlation matrix (Pearson r)</h4></div>
                <div className="orf-scroll" tabIndex={0} role="region" aria-label="Correlation matrix">
                  <table className="orf-table">
                    <thead>
                      <tr><th />{numeric.slice(0, 8).map((c) => <th key={c.name}>{c.name}</th>)}</tr>
                    </thead>
                    <tbody>
                      {numeric.slice(0, 8).map((a, i) => (
                        <tr key={a.name}>
                          <td>{a.name}</td>
                          {matrix[i].map((r, j) => <td key={j}>{r === null ? '—' : r.toFixed(3)}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {numeric.length > 8 && <p className="note">Only the first 8 numeric columns are shown.</p>}
              </div>
            )}

            <div className="seq-block">
              <div className="seq-block-head"><h4>Preview</h4></div>
              <div className="orf-scroll" tabIndex={0} role="region" aria-label="Data preview">
                <table className="orf-table">
                  <thead><tr>{table.columns.map((c) => <th key={c.name}>{c.name}</th>)}</tr></thead>
                  <tbody>
                    {Array.from({ length: Math.min(15, table.rowCount) }, (_, r) => (
                      <tr key={r}>{table.columns.map((c) => <td key={c.name}>{c.raw[r]}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {table.rowCount > 15 && <p className="note">First 15 of {table.rowCount.toLocaleString()} rows.</p>}
            </div>
          </>
        )}
      </div>

      <aside className="workspace-side tool-panel">
        <h4>Dataset</h4>
        {table.columns.length > 0 && table.rowCount > 0 ? (
          <dl className="tool-info">
            <dt>Rows</dt><dd>{table.rowCount.toLocaleString()}</dd>
            <dt>Columns</dt><dd>{table.columns.length}</dd>
            <dt>Numeric</dt><dd>{numeric.length}</dd>
            <dt>Text</dt><dd>{table.columns.length - numeric.length}</dd>
          </dl>
        ) : (
          <p className="note">Paste data, open a CSV/TSV file or pick an example.</p>
        )}
        <p className="note">All figures here are calculated from the table you provide; nothing is uploaded anywhere.</p>
      </aside>
    </>
  )
}

export default ScientificData
