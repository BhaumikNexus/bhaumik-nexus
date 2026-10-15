import { buildTable, histogram, linearFit, niceTicks, pairs, parseDelimited, pearson, summarize } from '../../frontend/src/modules/data/dataUtils.ts'
let f = 0
const eq = (n: string, a: unknown, b: unknown) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { f++; console.log('FAIL', n, JSON.stringify(a), JSON.stringify(b)) } }
const near = (n: string, a: number | undefined, b: number, tol: number) => { if (a === undefined || Math.abs(a - b) > tol) { f++; console.log('FAIL', n, a, b) } }
const s = summarize([1, 2, 3, 4])!
near('mean', s.mean, 2.5, 1e-12); near('sd', s.sd ?? undefined, 1.2909944487, 1e-9); near('q1', s.q1, 1.75, 1e-12); near('q3', s.q3, 3.25, 1e-12); near('med', s.median, 2.5, 1e-12)
eq('single sd', summarize([5])!.sd, null)
eq('missing', summarize([1, null, 3])!.missing, 1)
eq('empty', summarize([null]), null)
const ax = [10, 8, 13, 9, 11, 14, 6, 4, 12, 7, 5], ay = [8.04, 6.95, 7.58, 8.81, 8.33, 9.96, 7.24, 4.26, 10.84, 4.82, 5.68]
const p = pairs(ax, ay)
near('anscombe r', pearson(p)?.r, 0.81642, 1e-5)
const fit = linearFit(p)
near('slope', fit?.slope, 0.5001, 1e-4); near('intercept', fit?.intercept, 3.0001, 1e-4); near('r2', fit?.r2, 0.6665, 1e-4)
eq('perfect', linearFit([[1, 3], [2, 5], [3, 7]])?.slope, 2)
eq('no spread', pearson([[1, 1], [1, 2], [1, 3]]), null)
eq('csv quotes', parseDelimited('a,b\n"x, y","he said ""hi"""\n1,2\n'), [['a', 'b'], ['x, y', 'he said "hi"'], ['1', '2']])
eq('tsv detect', parseDelimited('a\tb\n1\t2'), [['a', 'b'], ['1', '2']])
eq('semicolon', parseDelimited('a;b\r\n1;2\r\n'), [['a', 'b'], ['1', '2']])
const t = buildTable(parseDelimited('name,val,mixed\nx,1.5,3\ny,NA,abc\nz,2e3,4'))
eq('types', t.columns.map(c => c.numeric), [false, true, false])
eq('vals', t.columns[1].values, [1.5, null, 2000])
const h = histogram([1, 2, 2, 3, 3, 3, 10], 3)
eq('hist counts sum', h.counts.reduce((a, b) => a + b, 0), 7)
eq('hist top edge inclusive', h.counts, [6, 0, 1])
const tk = niceTicks(0.3, 9.4)
eq('ticks cover', tk[0] <= 0.3 && tk[tk.length - 1] >= 9.4, true)
eq('ticks', niceTicks(0, 10), [0, 2, 4, 6, 8, 10])
console.log(f ? 'data: ' + f + ' FAILED' : 'data: ALL PASSED')
if (f) process.exitCode = 1
