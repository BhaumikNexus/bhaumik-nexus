import type { RDKitMol, RDKitModule } from '../../services/rdkitService.ts'

export interface PreparedInput {
  kind: 'smiles' | 'molblock'
  /** What is passed to RDKit. */
  text: string
  /** True when a molblock carries real 3D coordinates (some z value is not zero). */
  has3d: boolean
  note: string
}

/** Accepts a SMILES string (first token of the first line) or a molfile / SDF (first record). */
export function prepareInput(raw: string): PreparedInput {
  if (raw.includes('M  END')) {
    const records = raw.split('$$$$').filter((r) => r.includes('M  END'))
    const all = records[0].split('\n')
    const countsAt = all.findIndex((l) => /V[23]000/.test(l))
    const lines = countsAt >= 3 ? all.slice(countsAt - 3) : all
    const block = lines.join('\n')
    const nAtoms = parseInt((lines[3] ?? '').slice(0, 3), 10)
    let has3d = false
    for (let i = 0; i < nAtoms && !has3d; i++) {
      const z = parseFloat((lines[4 + i] ?? '').slice(20, 30))
      if (Number.isFinite(z) && z !== 0) has3d = true
    }
    return {
      kind: 'molblock',
      text: block,
      has3d,
      note: records.length > 1 ? `The SDF has ${records.length} records; only the first is analysed.` : '',
    }
  }
  const first = raw.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? ''
  return { kind: 'smiles', text: first.split(/\s+/)[0] ?? '', has3d: false, note: '' }
}

export interface LibraryEntry {
  name: string
  smiles: string
}

/** One entry per line: "SMILES optional name". Blank lines and lines starting with # are skipped. */
export function parseLibrary(text: string): LibraryEntry[] {
  const out: LibraryEntry[] = []
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const [smiles, ...rest] = t.split(/\s+/)
    out.push({ smiles, name: rest.join(' ') || smiles })
  }
  return out
}

/** Tanimoto similarity of two equal-length fingerprints written as strings of 0 and 1. */
export function tanimoto(a: string, b: string): number {
  let both = 0
  let either = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const x = a[i] === '1'
    const y = b[i] === '1'
    if (x && y) both++
    if (x || y) either++
  }
  return either === 0 ? 0 : both / either
}

export interface SimilarityHit extends LibraryEntry {
  score: number
}

function fingerprint(rdkit: RDKitModule, smiles: string): string | null {
  const mol = rdkit.get_mol(smiles)
  if (!mol || !mol.is_valid()) {
    mol?.delete()
    return null
  }
  try {
    return mol.get_morgan_fp(JSON.stringify({ radius: 2, nBits: 2048 }))
  } finally {
    mol.delete()
  }
}

/** Ranks library entries by Tanimoto similarity of Morgan fingerprints (radius 2, 2048 bits) to the query. */
export function rankSimilar(rdkit: RDKitModule, query: string, library: LibraryEntry[]): { hits: SimilarityHit[]; skipped: number } | string {
  const q = fingerprint(rdkit, query)
  if (!q) return 'The query structure could not be read, so similarity cannot be calculated.'
  const hits: SimilarityHit[] = []
  let skipped = 0
  for (const entry of library) {
    const fp = fingerprint(rdkit, entry.smiles)
    if (!fp) skipped++
    else hits.push({ ...entry, score: tanimoto(q, fp) })
  }
  hits.sort((a, b) => b.score - a.score)
  return { hits, skipped }
}

export interface Analysis {
  svg: string
  canonicalSmiles: string
  formula: string
  inchi: string
  inchiKey: string
  props: { label: string; value: string; note?: string }[]
  lipinski: { rule: string; value: string; ok: boolean }[]
  match: { count: number; atoms: number } | null
  matchError: string | null
}

/** Hill-system formula (C, H, then alphabetical) from a V2000 molblock that includes explicit hydrogens. */
export function formulaFromMolblock(block: string): string {
  const lines = block.split('\n')
  const counts = lines[3] ?? ''
  const nAtoms = parseInt(counts.slice(0, 3), 10)
  if (!Number.isFinite(nAtoms) || !counts.includes('V2000')) return '—'
  const tally: Record<string, number> = {}
  for (let i = 0; i < nAtoms; i++) {
    const sym = (lines[4 + i] ?? '').slice(31, 34).trim()
    if (sym) tally[sym] = (tally[sym] ?? 0) + 1
  }
  let charge = 0
  for (const line of lines) {
    if (!line.startsWith('M  CHG')) continue
    const parts = line.trim().split(/\s+/).slice(3)
    for (let i = 1; i < parts.length; i += 2) charge += parseInt(parts[i], 10) || 0
  }
  const keys = Object.keys(tally)
  const order = tally.C
    ? ['C', ...(tally.H ? ['H'] : []), ...keys.filter((k) => k !== 'C' && k !== 'H').sort()]
    : keys.sort()
  let out = order.map((k) => k + (tally[k] > 1 ? tally[k] : '')).join('')
  if (charge !== 0) out += `${Math.abs(charge) > 1 ? Math.abs(charge) : ''}${charge > 0 ? '+' : '−'}`
  return out
}

function num(d: Record<string, unknown>, key: string): number | null {
  const v = d[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function fmt(v: number | null, digits: number, unit = ''): string {
  return v === null ? '—' : `${v.toFixed(digits)}${unit}`
}

/** Calculates everything shown for one molecule. All RDKit objects are freed before returning. */
export function analyze(rdkit: RDKitModule, input: string, smarts: string): Analysis | string {
  const mol = rdkit.get_mol(input.trim())
  if (!mol || !mol.is_valid()) {
    mol?.delete()
    return 'RDKit could not read that SMILES. Check brackets, ring numbers and element symbols.'
  }
  try {
    const d = JSON.parse(mol.get_descriptors()) as Record<string, unknown>

    const withH = rdkit.get_mol(input.trim())
    let formula = '—'
    if (withH) {
      formula = formulaFromMolblock(withH.add_hs())
      withH.delete()
    }

    let inchi = ''
    let inchiKey = ''
    try {
      inchi = mol.get_inchi()
      inchiKey = inchi ? rdkit.get_inchikey_for_inchi(inchi) : ''
    } catch {
      /* InChI is optional */
    }

    let match: Analysis['match'] = null
    let matchError: string | null = null
    let svg = ''
    const query = smarts.trim()
    if (query) {
      const q = rdkit.get_qmol(query)
      if (!q || !q.is_valid()) {
        matchError = 'That SMARTS pattern is not valid.'
        q?.delete()
      } else {
        const first = JSON.parse(mol.get_substruct_match(q)) as { atoms?: number[]; bonds?: number[] }
        const all = JSON.parse(mol.get_substruct_matches(q)) as unknown[]
        if (first.atoms && first.atoms.length > 0) {
          match = { count: all.length, atoms: first.atoms.length }
          svg = mol.get_svg_with_highlights(JSON.stringify({ atoms: first.atoms, bonds: first.bonds ?? [], width: 420, height: 320 }))
        } else {
          match = { count: 0, atoms: 0 }
        }
        q.delete()
      }
    }
    if (!svg) svg = mol.get_svg(420, 320)

    const mw = num(d, 'amw')
    const logp = num(d, 'CrippenClogP')
    const hbd = num(d, 'lipinskiHBD') ?? num(d, 'NumHBD')
    const hba = num(d, 'lipinskiHBA') ?? num(d, 'NumHBA')
    const ok = (v: number | null, max: number) => v !== null && v <= max

    return {
      svg,
      canonicalSmiles: mol.get_smiles(),
      formula,
      inchi,
      inchiKey,
      props: [
        { label: 'Molecular weight', value: fmt(mw, 2, ' g/mol'), note: 'average' },
        { label: 'Exact mass', value: fmt(num(d, 'exactmw'), 4, ' Da'), note: 'monoisotopic' },
        { label: 'logP', value: fmt(logp, 2), note: 'Crippen estimate' },
        { label: 'TPSA', value: fmt(num(d, 'tpsa'), 1, ' Å²') },
        { label: 'H-bond donors', value: fmt(hbd, 0) },
        { label: 'H-bond acceptors', value: fmt(hba, 0) },
        { label: 'Rotatable bonds', value: fmt(num(d, 'NumRotatableBonds'), 0) },
        { label: 'Heavy atoms', value: fmt(num(d, 'NumHeavyAtoms'), 0) },
        { label: 'Rings', value: fmt(num(d, 'NumRings'), 0) },
      ],
      lipinski: [
        { rule: 'Molecular weight ≤ 500', value: fmt(mw, 1), ok: ok(mw, 500) },
        { rule: 'logP ≤ 5', value: fmt(logp, 2), ok: ok(logp, 5) },
        { rule: 'H-bond donors ≤ 5', value: fmt(hbd, 0), ok: ok(hbd, 5) },
        { rule: 'H-bond acceptors ≤ 10', value: fmt(hba, 0), ok: ok(hba, 10) },
      ],
      match,
      matchError,
    }
  } catch (e) {
    return e instanceof Error ? `Calculation failed: ${e.message}` : 'Calculation failed.'
  } finally {
    ;(mol as RDKitMol).delete()
  }
}
