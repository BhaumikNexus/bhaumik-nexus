import { GENETIC_CODES, findOrfs, parseInput, proteinMass, validate, composition, gcContent, reverseComplement, translate, formatBlocks } from '../../frontend/src/modules/sequence/sequenceUtils.ts'
let fails = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fails++
  console.log(ok ? 'ok  ' : 'FAIL', name, ok ? '' : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`)
}
eq('parse bare', parseInput('atg c\naaa'), [{ name: 'Pasted sequence', sequence: 'ATGCAAA' }])
eq('parse fasta 2', parseInput('>a\nAC\nGT\n>b desc\nUUU'), [{ name: 'a', sequence: 'ACGT' }, { name: 'b desc', sequence: 'UUU' }])
eq('parse genbank numbers', parseInput('1 atgc gtac\n11 tt'), [{ name: 'Pasted sequence', sequence: 'ATGCGTACTT' }])
eq('type DNA', validate('ATGC').type, 'DNA')
eq('type RNA', validate('AUGC').type, 'RNA')
eq('mix T/U invalid', validate('ATU').valid, false)
eq('bad chars', validate('ATGX').valid, false)
eq('iupac ok', validate('ATGCRYN').valid, true)
const comp = composition('AACCGGTTN')
eq('composition', comp, { A: 2, C: 2, G: 2, T: 2, U: 0, ambiguous: 1, invalid: 0 })
eq('gc 50%', gcContent(comp), 50)
eq('gc all-N null', gcContent(composition('NNN')), null)
eq('gc GGCC 100', gcContent(composition('GGCC')), 100)
eq('revcomp', reverseComplement('ATGC', 'DNA'), 'GCAT')
eq('revcomp RNA', reverseComplement('AUGC', 'RNA'), 'GCAU')
eq('revcomp iupac', reverseComplement('ARN', 'DNA'), 'NYT')
eq('translate ATG GCC ATT GTA ATG GGC CGC TGA', translate('ATGGCCATTGTAATGGGCCGCTGA', 0), 'MAIVMGR*')
eq('translate RNA', translate('AUGGCCAUUGUAAUGGGCCGCUGA', 0), 'MAIVMGR*')
eq('translate frame 2', translate('AATGGCC', 1), 'MA')
eq('translate partial dropped', translate('ATGGC', 0), 'M')
eq('translate ambiguous', translate('ATGNCC', 0), 'MX')
eq('all 64 codons stop count', ['TAA','TAG','TGA'].map(c => translate(c, 0)), ['*','*','*'])
eq('TGG=W TTT=F GGG=G', translate('TGGTTTGGG', 0), 'WFG')
eq('blocks', formatBlocks('A'.repeat(25), 20, 10), [{ start: 1, text: 'AAAAAAAAAA AAAAAAAAAA' }, { start: 21, text: 'AAAAA' }])
eq('invalid counted apart', composition('ACXN-'), { A: 1, C: 1, G: 0, T: 0, U: 0, ambiguous: 1, invalid: 2 })
const orfSeq = 'CC' + 'ATG' + 'GCC'.repeat(35) + 'TGA'
const f1 = findOrfs(orfSeq, 30)
eq('orf count', f1.length, 1)
eq('orf fields', f1[0] && [f1[0].strand, f1[0].frame, f1[0].start, f1[0].end, f1[0].lengthAa], ['+', 3, 3, 113, 36])
eq('orf protein', f1[0]?.protein, 'M' + 'A'.repeat(35))
const f2 = findOrfs(reverseComplement(orfSeq, 'DNA'), 30)
eq('reverse orf', f2.length === 1 && [f2[0].strand, f2[0].frame, f2[0].start, f2[0].end, f2[0].lengthAa], ['-', 3, 1, 111, 36])
eq('min length filters', findOrfs(orfSeq, 40).length, 0)
eq('no stop = no orf', findOrfs('ATG' + 'GCC'.repeat(40), 5).length, 0)
eq('RNA input', findOrfs(orfSeq.replace(/T/g, 'U'), 30).length, 1)
eq('second orf after stop', findOrfs('ATGGCCTAAATGAAATAG', 1).map(o => [o.start, o.end, o.protein]), [[1, 9, 'MA'], [10, 18, 'MK']])
// genetic codes: strings checked against independently written override rules
const nt = 'TCAG'
const codons = [...Array(64).keys()].map(n => nt[n >> 4] + nt[(n >> 2) & 3] + nt[n & 3])
const std = GENETIC_CODES[0].aminoAcids
const rules: Record<number, Record<string, string>> = { 1: {}, 11: {}, 2: { AGA: '*', AGG: '*', ATA: 'M', TGA: 'W' }, 5: { AGA: 'S', AGG: 'S', ATA: 'M', TGA: 'W' } }
for (const code of GENETIC_CODES) {
  const derived = codons.map((c, n) => rules[code.id][c] ?? std[n]).join('')
  eq(`table ${code.id} matches rules`, code.aminoAcids, derived)
  eq(`table ${code.id} has 64 codons`, code.aminoAcids.length, 64)
}
eq('std AGA AGG ATA TGA', translate('AGAAGGATATGA', 0), 'RRI*')
eq('table 2 AGA AGG ATA TGA', translate('AGAAGGATATGA', 0, 2), '**MW')
eq('table 5 AGA AGG ATA TGA', translate('AGAAGGATATGA', 0, 5), 'SSMW')
eq('table 11 = standard', translate('ATGGCCTGATAA', 0, 11), translate('ATGGCCTGATAA', 0, 1))
const gtg = 'GTG' + 'GCC'.repeat(35) + 'TAA'
eq('alt start off', findOrfs(gtg, 30, 11, false).length, 0)
eq('alt start on', findOrfs(gtg, 30, 11, true).map(o => [o.start, o.end, o.lengthAa, o.protein.slice(0, 3)]), [[1, 111, 36, 'MAA']])
eq('table 2: TGA is not a stop', findOrfs('ATG' + 'GCC'.repeat(5) + 'TGA' + 'GCC'.repeat(30) + 'TAA', 30, 2).map(o => o.lengthAa), [37])
eq('table 1: TGA is a stop', findOrfs('ATG' + 'GCC'.repeat(5) + 'TGA' + 'GCC'.repeat(30) + 'TAA', 30, 1).length, 0)
const close = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 0.01
eq('mass glycine 75.07', close(proteinMass('G'), 75.0666), true)
eq('mass diglycine 132.12', close(proteinMass('GG'), 132.1179), true)
eq('mass ignores stop', proteinMass('GG*'), proteinMass('GG'))
eq('mass rejects X', proteinMass('GXG'), null)
eq('mass empty', proteinMass('*'), null)
console.log(fails === 0 ? 'sequence: ALL PASSED' : `sequence: ${fails} FAILED`)
if (fails) process.exitCode = 1
