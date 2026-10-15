import { describe as desc, fUpperP, oneWayAnova, pairedTTest, tCritical, tTwoSidedP, welchTTest } from '../../frontend/src/modules/experiment/statsUtils.ts'
let f = 0
const near = (n: string, a: number | null | undefined, b: number, tol: number) => { if (a === null || a === undefined || Math.abs(a - b) > tol) { f++; console.log('FAIL', n, a, 'want', b) } else console.log('ok  ', n) }
const eq = (n: string, a: unknown, b: unknown) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { f++; console.log('FAIL', n, JSON.stringify(a), JSON.stringify(b)) } else console.log('ok  ', n) }
// t critical values (two-sided 5 %), standard tables
near('t crit df1', tCritical(1), 12.7062, 1e-3); near('t crit df2', tCritical(2), 4.3027, 1e-3)
near('t crit df10', tCritical(10), 2.2281, 1e-3); near('t crit df30', tCritical(30), 2.0423, 1e-3)
near('p t=2 df=10', tTwoSidedP(2, 10), 0.07338803, 1e-6)
near('F crit 3.8853 (2,12)', fUpperP(3.8853, 2, 12), 0.05, 1e-4)
// descriptive: R sleep data group 1 and 2
const s1 = [0.7, -1.6, -0.2, -1.2, -0.1, 3.4, 3.7, 0.8, 0.0, 2.0]
const s2 = [1.9, 0.8, 1.1, 0.1, -0.1, 4.4, 5.5, 1.6, 4.6, 3.4]
const d1 = desc(s1)!, d2 = desc(s2)!
near('mean1', d1.mean, 0.75, 1e-12); near('sd1', d1.sd, 1.789010, 1e-5); near('sdPop1', d1.sdPop, 1.789010 * Math.sqrt(9 / 10), 1e-5)
near('mean2', d2.mean, 2.33, 1e-12); near('sd2', d2.sd, 2.002249, 1e-5)
near('sem1', d1.sem, 1.789010 / Math.sqrt(10), 1e-5)
near('ci1 low', d1.ci95?.[0], 0.75 - 2.262157 * 0.565749, 1e-3)
near('cv2', d2.cv, 2.002249 / 2.33 * 100, 1e-4)
eq('single value sd null', desc([5])!.sd, null)
near('single value sdPop', desc([5])!.sdPop, 0, 0)
eq('empty', desc([]), null)
eq('outlier', desc([1, 2, 2, 3, 2, 3, 40])!.outliers, [40])
// R: t.test(extra ~ group, data = sleep)  t = -1.8608, df = 17.776, p = 0.07939
const w = welchTTest(s1, s2)!
near('welch t', w.t, -1.8608, 1e-4); near('welch df', w.df, 17.776, 1e-3); near('welch p', w.p, 0.07939, 1e-4)
// R: t.test(..., paired = TRUE)  t = -4.0621, df = 9, p = 0.002833
const pr = pairedTTest(s1, s2)!
near('paired t', pr.t, -4.0621, 1e-4); near('paired df', pr.df, 9, 0); near('paired p', pr.p, 0.002833, 1e-5)
eq('paired unequal', pairedTTest([1, 2, 3], [1, 2]), null)
// R PlantGrowth ANOVA: F = 4.846, df 2 and 27, p = 0.01591
const ctrl = [4.17, 5.58, 5.18, 6.11, 4.50, 4.61, 5.17, 4.53, 5.33, 5.14]
const t1 = [4.81, 4.17, 4.41, 3.59, 5.87, 3.83, 6.03, 4.89, 4.32, 4.69]
const t2 = [6.31, 5.12, 5.54, 5.50, 5.37, 5.29, 4.92, 6.15, 5.80, 5.26]
const an = oneWayAnova([ctrl, t1, t2])!
near('anova F', an.f, 4.846, 1e-3); near('anova p', an.p, 0.01591, 1e-4); eq('anova df', [an.df1, an.df2], [2, 27])
console.log(f ? 'experiment: ' + f + ' FAILED' : 'experiment: ALL PASSED')
if (f) process.exitCode = 1
