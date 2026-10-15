import { useMemo, useState } from 'react'
import { buildTable, linearFit, pairs, parseDelimited, toNumber } from '../data/dataUtils.ts'
import GroupChart from './GroupChart.tsx'
import { describe, fmt, fmtP, oneWayAnova, pairedTTest, welchTTest } from './statsUtils.ts'
import type { Describe } from './statsUtils.ts'

const PLANT_GROWTH =
  '# Example: PlantGrowth, a public teaching dataset (dried plant weight in an R datasets example)\nctrl\ttrt1\ttrt2\n4.17\t4.81\t6.31\n5.58\t4.17\t5.12\n5.18\t4.41\t5.54\n6.11\t3.59\t5.50\n4.50\t5.87\t5.37\n4.61\t3.83\t5.29\n5.17\t6.03\t4.92\n4.53\t4.89\t6.15\n5.33\t4.32\t5.80\n5.14\t4.69\t5.26'
const SYNTHETIC_ASSAY =
  '# Synthetic demo data, not real measurements\nUntreated,Drug 10 uM,Drug 50 uM\n100.2,81.5,52.3\n98.7,79.9,48.8\n103.4,85.2,55.1\n99.1,,50.2'
const STANDARDS = '# Synthetic demo standards: concentration, absorbance\nconc,abs\n0,0.05\n0.25,0.18\n0.5,0.31\n1,0.57\n1.5,0.83\n2,1.08'
const UNKNOWNS = '0.42\n0.90\n2.60'

interface Group {
  name: string
  values: number[]
  rows: (number | null)[]
  d: Describe
}

function parseGroups(text: string): { groups: Group[]; ignored: number } {
  const cleaned = text.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n')
  const rows = parseDelimited(cleaned)
  if (rows.length < 2) return { groups: [], ignored: 0 }
  const head = rows[0]
  const body = rows.slice(1)
  const groups: Group[] = []
  let ignored = 0
  const used = new Set<string>()
  for (let c = 0; c < head.length; c++) {
    let name = head[c].trim() || `Group ${c + 1}`
    while (used.has(name)) name += '_'
    used.add(name)
    const parsed = body.map((r) => toNumber((r[c] ?? '').trim()))
    const cells = parsed.map((v) => (v === null ? null : Number.isNaN(v) ? undefined : v))
    ignored += cells.filter((v) => v === undefined).length
    const rowsNum = cells.map((v) => (v === undefined ? null : v))
    const values = rowsNum.filter((v): v is number => v !== null)
    const d = describe(values)
    if (d) groups.push({ name, values, rows: rowsNum, d })
  }
  return { groups, ignored }
}

type Mode = 'groups' | 'curve'

function ExperimentData() {
  const [mode, setMode] = useState<Mode>('groups')
  const [text, setText] = useState('')
  const [errType, setErrType] = useState<'sd' | 'sem'>('sd')
  const [paired, setPaired] = useState(false)
  const [std, setStd] = useState('')
  const [unk, setUnk] = useState('')
  const [copied, setCopied] = useState('')

  const { groups, ignored } = useMemo(() => parseGroups(text), [text])

  const comparison = useMemo(() => {
    if (groups.length < 2) return null
    if (groups.length === 2) {
      const [a, b] = groups
      if (paired) {
        const keep = a.rows.map((v, i) => [v, b.rows[i]] as const).filter((p): p is readonly [number, number] => p[0] !== null && p[1] !== null)
        const test = pairedTTest(keep.map((p) => p[0]), keep.map((p) => p[1]))
        return { kind: 'two' as const, test, pairs: keep.length }
      }
      return { kind: 'two' as const, test: welchTTest(a.values, b.values), pairs: 0 }
    }
    const anova = oneWayAnova(groups.map((g) => g.values))
    const control = groups[0]
    const k = groups.length - 1
    const vs = groups.slice(1).map((g) => {
      const t = welchTTest(g.values, control.values)
      return { name: g.name, fold: control.d.mean !== 0 ? g.d.mean / control.d.mean : null, test: t, adj: t ? Math.min(1, t.p * k) : null }
    })
    return { kind: 'many' as const, anova, vs }
  }, [groups, paired])

  const curve = useMemo(() => {
    const cleaned = std.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n')
    const t = buildTable(parseDelimited(cleaned))
    const num = t.columns.filter((c) => c.numeric)
    // a header-less file would swallow its first row as a header, so rebuild from raw rows when needed
    const rows = parseDelimited(cleaned)
    let x: (number | null)[] = []
    let y: (number | null)[] = []
    if (num.length >= 2) {
      x = num[0].values
      y = num[1].values
    } else if (rows.length >= 3 && rows[0].every((c) => toNumber(c) !== null && !Number.isNaN(toNumber(c)))) {
      x = rows.map((r) => toNumber(r[0] ?? '') ?? null).map((v) => (v !== null && Number.isNaN(v) ? null : v))
      y = rows.map((r) => toNumber(r[1] ?? '') ?? null).map((v) => (v !== null && Number.isNaN(v) ? null : v))
    }
    const p = pairs(x, y)
    const fit = linearFit(p)
    const sig = p.map((q) => q[1])
    const unknowns = unk
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => {
        const raw = l.split(/[\s,;\t]+/)[0]
        const v = toNumber(raw)
        const value = v === null || Number.isNaN(v) ? null : v
        const conc = fit && value !== null && fit.slope !== 0 ? (value - fit.intercept) / fit.slope : null
        const outside = value !== null && sig.length > 0 && (value < Math.min(...sig) || value > Math.max(...sig))
        return { raw, value, conc, outside }
      })
    return { n: p.length, fit, unknowns }
  }, [std, unk])

  const err = (g: Group) => (errType === 'sd' ? g.d.sd : g.d.sem)

  const summaryTsv = useMemo(() => {
    const head = ['Group', 'n', 'Mean', 'SD (sample)', 'SD (population)', 'Variance', 'SEM', 'CV %', '95% CI low', '95% CI high', 'Median', 'Min', 'Max']
    const lines = groups.map((g) =>
      [g.name, g.d.n, g.d.mean, g.d.sd, g.d.sdPop, g.d.variance, g.d.sem, g.d.cv, g.d.ci95?.[0], g.d.ci95?.[1], g.d.median, g.d.min, g.d.max]
        .map((v) => (v === null || v === undefined ? '' : String(v)))
        .join('\t'),
    )
    return [head.join('\t'), ...lines].join('\n')
  }, [groups])

  async function copy() {
    try {
      await navigator.clipboard.writeText(summaryTsv)
      setCopied('Copied. Paste into Excel or Sheets.')
    } catch {
      setCopied('Could not copy automatically. Use Download CSV instead.')
    }
  }

  function download() {
    const csv = summaryTsv.split('\n').map((l) => l.split('\t').map((c) => (/[",]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'experiment-summary.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="seq-main">
        <div className="tool-row seq-actions">
          <button type="button" className={`chip${mode === 'groups' ? ' chip-active' : ''}`} onClick={() => setMode('groups')}>Replicate groups</button>
          <button type="button" className={`chip${mode === 'curve' ? ' chip-active' : ''}`} onClick={() => setMode('curve')}>Standard curve</button>
        </div>

        {mode === 'groups' && (
          <>
            <div className="seq-input">
              <label htmlFor="exp-text">
                One column per group: the first row is the group name, every row below is one replicate. Paste straight from Excel or Sheets.
              </label>
              <textarea id="exp-text" value={text} spellCheck={false} placeholder={'Control\tTreated\n10.2\t12.8\n9.8\t13.1\n10.5\t12.4'} onChange={(e) => { setText(e.target.value); setCopied('') }} />
              <div className="tool-row seq-actions">
                <button type="button" className="chip" onClick={() => setText(PLANT_GROWTH)}>Example: 3 groups</button>
                <button type="button" className="chip" onClick={() => setText(SYNTHETIC_ASSAY)}>Example: with a missing value</button>
                <button type="button" className="chip" disabled={!text} onClick={() => setText('')}>Clear</button>
              </div>
              {ignored > 0 && <p className="note">{ignored} cell(s) were not numbers and were ignored.</p>}
            </div>

            {groups.length > 0 && (
              <>
                <div className="seq-block">
                  <div className="seq-block-head">
                    <h4>Summary per group</h4>
                    <div className="tool-row">
                      <button type="button" className="chip" onClick={() => void copy()}>Copy table</button>
                      <button type="button" className="chip" onClick={download}>Download CSV</button>
                    </div>
                  </div>
                  <div className="orf-scroll" tabIndex={0} role="region" aria-label="Summary per group">
                    <table className="orf-table">
                      <thead>
                        <tr>
                          <th>Group</th><th>n</th><th>Mean</th><th>SD (sample)</th><th>SD (population)</th><th>Variance</th><th>SEM</th>
                          <th>CV %</th><th>95% CI</th><th>Median</th><th>Min</th><th>Max</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groups.map((g) => (
                          <tr key={g.name}>
                            <td>{g.name}</td>
                            <td>{g.d.n}</td>
                            <td>{fmt(g.d.mean)}</td>
                            <td>{fmt(g.d.sd)}</td>
                            <td>{fmt(g.d.sdPop)}</td>
                            <td>{fmt(g.d.variance)}</td>
                            <td>{fmt(g.d.sem)}</td>
                            <td>{fmt(g.d.cv, 3)}</td>
                            <td>{g.d.ci95 ? `${fmt(g.d.ci95[0])} to ${fmt(g.d.ci95[1])}` : '—'}</td>
                            <td>{fmt(g.d.median)}</td>
                            <td>{fmt(g.d.min)}</td>
                            <td>{fmt(g.d.max)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {copied && <p className="note">{copied}</p>}
                  {groups.some((g) => g.d.outliers.length > 0) && (
                    <p className="note">
                      Possible outliers (outside 1.5 × IQR from the quartiles, a rough flag only):{' '}
                      {groups.filter((g) => g.d.outliers.length > 0).map((g) => `${g.name}: ${g.d.outliers.map((v) => fmt(v)).join(', ')}`).join('; ')}.
                      Nothing is removed from the calculations.
                    </p>
                  )}
                  {groups.some((g) => g.d.n < 2) && <p className="note">Groups with a single value have no sample SD, SEM, variance or CI.</p>}
                  <p className="note">
                    SD (sample) divides by n − 1 and is what most papers report for replicates. SD (population) divides by n and is for
                    when the values are the whole population, not a sample. SEM = SD / √n. CV % = sample SD / |mean| × 100. The 95 % CI
                    uses the t distribution with n − 1 degrees of freedom.
                  </p>
                </div>

                <div className="seq-block">
                  <div className="seq-block-head">
                    <h4>Chart</h4>
                    <div className="tool-row">
                      <label className="seq-check"><input type="radio" name="err" checked={errType === 'sd'} onChange={() => setErrType('sd')} /> Error bars: SD</label>
                      <label className="seq-check"><input type="radio" name="err" checked={errType === 'sem'} onChange={() => setErrType('sem')} /> SEM</label>
                    </div>
                  </div>
                  <div className="chem-draw data-wrap">
                    <GroupChart
                      groups={groups.map((g) => ({ name: g.name, values: g.values, mean: g.d.mean, err: err(g) }))}
                      yLabel="Value"
                      errLabel={errType.toUpperCase()}
                    />
                  </div>
                  <p className="note">Bars show the mean, dots show every replicate, and the error bars show the {errType === 'sd' ? 'sample SD' : 'SEM'}. State which one you used in figure legends.</p>
                </div>

                {comparison && (
                  <div className="seq-block">
                    <div className="seq-block-head">
                      <h4>Comparison</h4>
                      {groups.length === 2 && (
                        <label className="seq-check"><input type="checkbox" checked={paired} onChange={(e) => setPaired(e.target.checked)} /> Paired samples</label>
                      )}
                    </div>
                    {comparison.kind === 'two' ? (
                      comparison.test ? (
                        <dl className="tool-info">
                          <dt>Test</dt><dd>{comparison.test.kind === 'Welch' ? "Welch's t-test (two-sided)" : `Paired t-test (two-sided, ${comparison.pairs} pairs)`}</dd>
                          <dt>Difference of means</dt><dd>{fmt(comparison.test.meanDiff)} ({groups[0].name} − {groups[1].name})</dd>
                          <dt>t</dt><dd>{fmt(comparison.test.t)}</dd>
                          <dt>Degrees of freedom</dt><dd>{fmt(comparison.test.df, 5)}</dd>
                          <dt>p-value</dt><dd>{fmtP(comparison.test.p)}</dd>
                        </dl>
                      ) : (
                        <p className="note">{paired ? 'A paired test needs the same number of complete pairs (at least 2) in both columns.' : 'Each group needs at least 2 values with some spread.'}</p>
                      )
                    ) : (
                      <>
                        {comparison.anova ? (
                          <dl className="tool-info">
                            <dt>One-way ANOVA</dt><dd>F({comparison.anova.df1}, {comparison.anova.df2}) = {fmt(comparison.anova.f)}</dd>
                            <dt>p-value</dt><dd>{fmtP(comparison.anova.p)}</dd>
                          </dl>
                        ) : (
                          <p className="note">ANOVA could not be calculated (needs spread within groups).</p>
                        )}
                        <div className="orf-scroll" tabIndex={0} role="region" aria-label="Comparison with the first group">
                          <table className="orf-table">
                            <thead>
                              <tr><th>Group vs {groups[0].name}</th><th>Fold change (mean ratio)</th><th>Welch p</th><th>Bonferroni-adjusted p</th></tr>
                            </thead>
                            <tbody>
                              {comparison.vs.map((r) => (
                                <tr key={r.name}>
                                  <td>{r.name}</td>
                                  <td>{fmt(r.fold)}</td>
                                  <td>{r.test ? fmtP(r.test.p) : '—'}</td>
                                  <td>{r.adj === null ? '—' : fmtP(r.adj)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                    <p className="note">
                      These tests assume independent, roughly normal data. A p-value is not the size or importance of an effect, and with
                      very few replicates the tests have little power. ANOVA says whether any group differs, not which. The first column
                      is treated as the control for the table; Bonferroni multiplies each p by the number of comparisons.
                    </p>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {mode === 'curve' && (
          <>
            <div className="seq-input">
              <label htmlFor="exp-std">Standards: concentration and signal, two columns (optional header)</label>
              <textarea id="exp-std" value={std} spellCheck={false} placeholder={'0\t0.05\n0.5\t0.31\n1\t0.57'} onChange={(e) => setStd(e.target.value)} />
              <label htmlFor="exp-unk" style={{ marginTop: 10 }}>Unknown samples: one signal per line</label>
              <textarea id="exp-unk" value={unk} spellCheck={false} style={{ minHeight: 90 }} placeholder={'0.42\n0.9'} onChange={(e) => setUnk(e.target.value)} />
              <div className="tool-row seq-actions">
                <button type="button" className="chip" onClick={() => { setStd(STANDARDS); setUnk(UNKNOWNS) }}>Example</button>
                <button type="button" className="chip" disabled={!std && !unk} onClick={() => { setStd(''); setUnk('') }}>Clear</button>
              </div>
            </div>
            {curve.fit && (
              <div className="seq-block">
                <div className="seq-block-head"><h4>Linear fit</h4></div>
                <dl className="tool-info">
                  <dt>Points used</dt><dd>{curve.n}</dd>
                  <dt>Line</dt><dd>signal = {fmt(curve.fit.slope)} × concentration + {fmt(curve.fit.intercept)}</dd>
                  <dt>R²</dt><dd>{fmt(curve.fit.r2, 5)}</dd>
                </dl>
                {curve.unknowns.length > 0 && (
                  <div className="orf-scroll" tabIndex={0} role="region" aria-label="Unknown samples">
                    <table className="orf-table">
                      <thead><tr><th>Signal</th><th>Concentration</th><th>Note</th></tr></thead>
                      <tbody>
                        {curve.unknowns.map((u, i) => (
                          <tr key={i}>
                            <td>{u.raw}</td>
                            <td>{fmt(u.conc)}</td>
                            <td>{u.value === null ? 'not a number' : u.outside ? 'outside the standards, extrapolated' : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="note">
                  Unknown concentration = (signal − intercept) / slope, by ordinary least squares on the standards. Check that the
                  standards are really linear (many assays curve at high concentration) and keep unknowns inside the standard range.
                </p>
              </div>
            )}
            {std.trim() && !curve.fit && <p className="note">Need at least 3 numeric standard pairs, with different concentrations and signals.</p>}
          </>
        )}
      </div>

      <aside className="workspace-side tool-panel">
        <h4>Experiment data</h4>
        {mode === 'groups' ? (
          groups.length > 0 ? (
            <dl className="tool-info">
              <dt>Groups</dt><dd>{groups.length}</dd>
              <dt>Total values</dt><dd>{groups.reduce((s, g) => s + g.d.n, 0)}</dd>
            </dl>
          ) : (
            <p className="note">Paste your replicates or load the example.</p>
          )
        ) : (
          <p className="note">Fit a line to your standards and read concentrations of unknowns off it.</p>
        )}
        <p className="note">Everything is calculated in your browser from the numbers you enter; nothing is uploaded.</p>
      </aside>
    </>
  )
}

export default ExperimentData
