// Retrieved data from PubChem (PUG REST). Called only when the user asks; the SMILES or name is sent to PubChem.
const BASE = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug'

export interface NameHit {
  cid: number
  title: string
  smiles: string
}

async function explain(res: Response, what: string): Promise<never> {
  if (res.status === 404) throw new Error(`PubChem has no ${what}.`)
  if (res.status === 503 || res.status === 429) throw new Error('PubChem is busy right now. Wait a few seconds and try again.')
  throw new Error(`PubChem returned an error (${res.status}).`)
}

export async function lookupName(name: string): Promise<NameHit> {
  let res: Response
  try {
    res = await fetch(`${BASE}/compound/name/${encodeURIComponent(name.trim())}/property/SMILES,Title/JSON`)
  } catch {
    throw new Error('Could not reach PubChem. Check your internet connection.')
  }
  if (!res.ok) return explain(res, `compound named "${name.trim()}"`)
  const j = await res.json()
  const p = j?.PropertyTable?.Properties?.[0]
  const smiles: string | undefined = p?.SMILES ?? p?.ConnectivitySMILES
  if (!p || !smiles) throw new Error('PubChem returned no structure for that name.')
  return { cid: p.CID, title: p.Title ?? name.trim(), smiles }
}

/** PubChem's deposited 3D conformer (SDF text) for a structure, found by SMILES. Not every compound has one. */
export async function fetch3dConformer(smiles: string): Promise<string> {
  let res: Response
  try {
    res = await fetch(`${BASE}/compound/smiles/SDF?record_type=3d`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'smiles=' + encodeURIComponent(smiles),
    })
  } catch {
    throw new Error('Could not reach PubChem. Check your internet connection.')
  }
  if (!res.ok) return explain(res, '3D conformer for this structure')
  const text = await res.text()
  if (!text.includes('M  END')) throw new Error('PubChem returned no 3D conformer for this structure.')
  return text
}
