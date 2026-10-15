import { parseLibrary, prepareInput, tanimoto } from '../../frontend/src/modules/chemistry/chemUtils.ts'
let f = 0
const eq = (n: string, a: unknown, b: unknown) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { f++; console.log('FAIL', n, JSON.stringify(a), JSON.stringify(b)) } }
eq('tani identical', tanimoto('1100', '1100'), 1)
eq('tani half', tanimoto('1100', '0110'), 1 / 3)
eq('tani disjoint', tanimoto('1100', '0011'), 0)
eq('tani empty', tanimoto('0000', '0000'), 0)
eq('lib', parseLibrary('# c\nCCO ethanol\n\nc1ccccc1\nCC(=O)O acetic acid'), [{ smiles: 'CCO', name: 'ethanol' }, { smiles: 'c1ccccc1', name: 'c1ccccc1' }, { smiles: 'CC(=O)O', name: 'acetic acid' }])
eq('smiles', prepareInput('  CCO ethanol\nCC').text, 'CCO')
const blk = (z: string) => `\n  x\n\n  1  0  0  0  0  0  0  0  0  0999 V2000\n    0.0000    0.0000${z} C   0  0\nM  END\n`
eq('2d', prepareInput(blk('    0.0000')).has3d, false)
eq('3d', prepareInput(blk('    1.2000')).has3d, true)
eq('sdf multi', prepareInput(blk('    0.0000') + '$$$$\n' + blk('    0.0000') + '$$$$\n').note.includes('2 records'), true)
console.log(f ? 'chemistry: ' + f + ' FAILED' : 'chemistry: ALL PASSED')
if (f) process.exitCode = 1
