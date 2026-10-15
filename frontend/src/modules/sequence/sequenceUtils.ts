// Pure sequence calculations. No React, no network: easy to test.

export type SequenceType = 'DNA' | 'RNA' | 'unknown'

export interface SequenceRecord {
  name: string
  sequence: string
}

export interface Validation {
  type: SequenceType
  valid: boolean
  problems: string[]
}

export interface Composition {
  A: number
  C: number
  G: number
  T: number
  U: number
  /** IUPAC ambiguity codes such as N, R, Y. */
  ambiguous: number
  /** Characters that are not nucleotide codes at all. */
  invalid: number
}

// IUPAC nucleotide codes accepted in DNA (T) or RNA (U) sequences.
const IUPAC = 'ACGTURYSWKMBDHVN'

const COMPLEMENT_DNA: Record<string, string> = {
  A: 'T', T: 'A', G: 'C', C: 'G', U: 'A',
  R: 'Y', Y: 'R', S: 'S', W: 'W', K: 'M', M: 'K',
  B: 'V', V: 'B', D: 'H', H: 'D', N: 'N',
}

// Genetic codes from the NCBI translation tables. Codon order: T/U, C, A, G at each of the three positions.
export interface GeneticCode {
  id: number
  name: string
  aminoAcids: string
  /** Codons that can start translation in this table, ATG first. */
  starts: string[]
}

export const GENETIC_CODES: GeneticCode[] = [
  {
    id: 1,
    name: 'Standard',
    aminoAcids: 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG',
    starts: ['ATG', 'TTG', 'CTG'],
  },
  {
    id: 2,
    name: 'Vertebrate mitochondrial',
    aminoAcids: 'FFLLSSSSYY**CCWWLLLLPPPPHHQQRRRRIIMMTTTTNNKKSS**VVVVAAAADDEEGGGG',
    starts: ['ATG', 'ATT', 'ATC', 'ATA', 'GTG'],
  },
  {
    id: 5,
    name: 'Invertebrate mitochondrial',
    aminoAcids: 'FFLLSSSSYY**CCWWLLLLPPPPHHQQRRRRIIMMTTTTNNKKSSSSVVVVAAAADDEEGGGG',
    starts: ['ATG', 'TTG', 'ATT', 'ATC', 'ATA', 'GTG'],
  },
  {
    id: 11,
    name: 'Bacterial, archaeal and plant plastid',
    aminoAcids: 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG',
    starts: ['ATG', 'TTG', 'CTG', 'ATT', 'ATC', 'ATA', 'GTG'],
  },
]

export function getGeneticCode(id: number): GeneticCode {
  return GENETIC_CODES.find((c) => c.id === id) ?? GENETIC_CODES[0]
}

const BASE_INDEX: Record<string, number> = { T: 0, U: 0, C: 1, A: 2, G: 3 }

/** Amino acid for one codon, "X" if the codon contains an ambiguity code. */
function codonToAmino(codon: string, code: GeneticCode): string {
  const ia = BASE_INDEX[codon[0]]
  const ib = BASE_INDEX[codon[1]]
  const ic = BASE_INDEX[codon[2]]
  if (ia === undefined || ib === undefined || ic === undefined) return 'X'
  return code.aminoAcids[ia * 16 + ib * 4 + ic]
}

/** Splits pasted text into records. Accepts FASTA (">name" headers) or a bare sequence. */
export function parseInput(text: string): SequenceRecord[] {
  const records: SequenceRecord[] = []
  let current: SequenceRecord | null = null

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    if (line.startsWith('>')) {
      current = { name: line.slice(1).trim() || `Sequence ${records.length + 1}`, sequence: '' }
      records.push(current)
      continue
    }
    if (!current) {
      current = { name: 'Pasted sequence', sequence: '' }
      records.push(current)
    }
    // Remove spaces and position numbers (GenBank-style blocks).
    current.sequence += line.replace(/[\s\d]/g, '').toUpperCase()
  }

  return records.filter((r) => r.sequence.length > 0)
}

export function validate(sequence: string): Validation {
  const problems: string[] = []
  const bad = new Map<string, number>()
  for (const ch of sequence) {
    if (!IUPAC.includes(ch)) bad.set(ch, (bad.get(ch) ?? 0) + 1)
  }
  if (bad.size > 0) {
    const list = [...bad.entries()].map(([c, n]) => `"${c}" ×${n}`).join(', ')
    problems.push(`Characters that are not nucleotide codes: ${list}.`)
  }

  const hasT = sequence.includes('T')
  const hasU = sequence.includes('U')
  if (hasT && hasU) problems.push('Contains both T and U, so it cannot be DNA or RNA.')

  let type: SequenceType = 'unknown'
  if (!(hasT && hasU)) type = hasU ? 'RNA' : 'DNA'

  return { type, valid: problems.length === 0, problems }
}

export function composition(sequence: string): Composition {
  const c: Composition = { A: 0, C: 0, G: 0, T: 0, U: 0, ambiguous: 0, invalid: 0 }
  for (const ch of sequence) {
    if (ch === 'A' || ch === 'C' || ch === 'G' || ch === 'T' || ch === 'U') c[ch] += 1
    else if (IUPAC.includes(ch)) c.ambiguous += 1
    else c.invalid += 1
  }
  return c
}

/** GC content as a percentage of the unambiguous bases (A, C, G, T/U). Ambiguity codes are left out. */
export function gcContent(comp: Composition): number | null {
  const unambiguous = comp.A + comp.C + comp.G + comp.T + comp.U
  if (unambiguous === 0) return null
  return ((comp.G + comp.C) / unambiguous) * 100
}

export function reverseComplement(sequence: string, type: SequenceType): string {
  let out = ''
  for (let i = sequence.length - 1; i >= 0; i--) {
    const c = COMPLEMENT_DNA[sequence[i]] ?? 'N'
    out += c
  }
  return type === 'RNA' ? out.replace(/T/g, 'U') : out
}

/**
 * Translates in the given frame (0, 1 or 2) with the chosen genetic code (default: standard).
 * Codons with ambiguity codes become "X". A trailing partial codon is dropped.
 */
export function translate(sequence: string, frame: number, codeId = 1): string {
  const code = getGeneticCode(codeId)
  let protein = ''
  for (let i = frame; i + 3 <= sequence.length; i += 3) {
    protein += codonToAmino(sequence.slice(i, i + 3), code)
  }
  return protein
}

/** Lays a sequence out in numbered lines of `lineLength` bases, grouped in blocks of `block`. */
export function formatBlocks(sequence: string, lineLength = 60, block = 10): { start: number; text: string }[] {
  const lines: { start: number; text: string }[] = []
  for (let i = 0; i < sequence.length; i += lineLength) {
    const chunk = sequence.slice(i, i + lineLength)
    const groups: string[] = []
    for (let j = 0; j < chunk.length; j += block) groups.push(chunk.slice(j, j + block))
    lines.push({ start: i + 1, text: groups.join(' ') })
  }
  return lines
}

export interface Orf {
  strand: '+' | '-'
  /** Reading frame 1-3 on that strand. */
  frame: number
  /** 1-based positions on the original (forward) sequence, including the stop codon. */
  start: number
  end: number
  lengthAa: number
  protein: string
}

/**
 * Finds open reading frames in all six frames with the chosen genetic code.
 * An ORF starts at ATG (or, with `altStarts`, any start codon the table allows) and ends at the first in-frame stop
 * codon. Only ORFs that reach a stop and have at least `minAa` amino acids are reported. The first residue is shown as
 * M, as is usual for start codons. ORFs containing ambiguous codons are skipped. Longest first; ties in position order.
 */
export function findOrfs(sequence: string, minAa = 30, codeId = 1, altStarts = false): Orf[] {
  const code = getGeneticCode(codeId)
  const startCodons = new Set(altStarts ? code.starts : ['ATG'])
  const dna = sequence.replace(/U/g, 'T')
  const total = dna.length
  const strands: { strand: '+' | '-'; seq: string }[] = [
    { strand: '+', seq: dna },
    { strand: '-', seq: reverseComplement(dna, 'DNA') },
  ]
  const found: Orf[] = []

  for (const { strand, seq } of strands) {
    for (let frame = 0; frame < 3; frame++) {
      let startPos = -1
      for (let i = frame; i + 3 <= seq.length; i += 3) {
        const codon = seq.slice(i, i + 3)
        if (startPos < 0) {
          if (startCodons.has(codon)) startPos = i
          continue
        }
        if (codonToAmino(codon, code) !== '*') continue

        const protein = 'M' + translate(seq.slice(startPos + 3, i), 0, codeId)
        const ntEnd = i + 3 // exclusive, includes the stop codon
        if (protein.length >= minAa && !protein.includes('X')) {
          found.push({
            strand,
            frame: frame + 1,
            start: strand === '+' ? startPos + 1 : total - ntEnd + 1,
            end: strand === '+' ? ntEnd : total - startPos,
            lengthAa: protein.length,
            protein,
          })
        }
        startPos = -1
      }
    }
  }
  return found.sort((a, b) => b.lengthAa - a.lengthAa || a.start - b.start)
}

// Average molecular masses (Da) of the free amino acids.
const AMINO_MASS: Record<string, number> = {
  A: 89.0932, C: 121.1582, D: 133.1027, E: 147.1293, F: 165.1891, G: 75.0666, H: 155.1546, I: 131.1729,
  K: 146.1876, L: 131.1729, M: 149.2113, N: 132.1179, P: 115.1305, Q: 146.1445, R: 174.201, S: 105.0926,
  T: 119.1192, V: 117.1463, W: 204.2252, Y: 181.1885,
}
const WATER = 18.0153

/**
 * Average molecular mass in daltons of a protein: the free amino acids joined by peptide bonds (one water lost per
 * bond). A trailing "*" is ignored. Returns null if the sequence is empty or has a letter that is not one of the 20
 * standard amino acids.
 */
export function proteinMass(protein: string): number | null {
  const residues = protein.replace(/\*$/, '')
  if (residues.length === 0) return null
  let mass = 0
  for (const aa of residues) {
    const m = AMINO_MASS[aa]
    if (m === undefined) return null
    mass += m
  }
  return mass - (residues.length - 1) * WATER
}
