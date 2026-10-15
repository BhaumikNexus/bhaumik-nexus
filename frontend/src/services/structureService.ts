// Loading and fetching helpers for molecular structures (RCSB PDB + 3Dmol.js).
const SCRIPT_URL = 'https://3Dmol.org/build/3Dmol-min.js'

let scriptPromise: Promise<void> | null = null

export function loadViewerLibrary(): Promise<void> {
  if (window.$3Dmol) return Promise.resolve()
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = SCRIPT_URL
      script.onload = () => resolve()
      script.onerror = () => {
        scriptPromise = null
        reject(new Error('Could not load the 3D viewer library. Check your internet connection.'))
      }
      document.head.appendChild(script)
    })
  }
  return scriptPromise
}

export async function fetchStructure(id: string): Promise<{ data: string; format: 'pdb' | 'cif' }> {
  const attempts = [
    { ext: 'pdb', format: 'pdb' },
    { ext: 'cif', format: 'cif' },
  ] as const

  try {
    for (const { ext, format } of attempts) {
      const res = await fetch(`https://files.rcsb.org/download/${id}.${ext}`)
      if (res.ok) return { data: await res.text(), format }
    }
  } catch {
    throw new Error('Could not reach the RCSB Protein Data Bank. Check your internet connection.')
  }
  throw new Error(`No structure found for "${id}". Check the PDB ID.`)
}

export function parseTitle(data: string, format: 'pdb' | 'cif'): string {
  if (format === 'pdb') {
    return data
      .split('\n')
      .filter((line) => line.startsWith('TITLE '))
      .map((line) => line.slice(10).trim())
      .join(' ')
  }
  const match = data.match(/_struct\.title\s+(?:'([^']*)'|"([^"]*)"|(\S.*))/)
  return (match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim()
}


/** Official summary of a PDB entry, as reported by the RCSB data API. Any field can be missing. */
export interface EntryRecord {
  title: string
  method: string
  resolution: number | null
  released: string
  atoms: number | null
  residues: number | null
  polymerChains: number | null
  polymerEntities: number | null
  nonpolymerEntities: number | null
  models: number | null
}

/** Returns null when the record cannot be fetched, so the viewer still works offline from the API. */
export async function fetchEntryRecord(id: string): Promise<EntryRecord | null> {
  try {
    const res = await fetch(`https://data.rcsb.org/rest/v1/core/entry/${id}`)
    if (!res.ok) return null
    const j = await res.json()
    const info = j.rcsb_entry_info ?? {}
    const methods: string[] = Array.isArray(j.exptl) ? j.exptl.map((e: { method?: string }) => e.method ?? '') : []
    return {
      title: j.struct?.title ?? '',
      method: methods.filter(Boolean).join(', '),
      resolution: Array.isArray(info.resolution_combined) ? (info.resolution_combined[0] ?? null) : null,
      released: String(j.rcsb_accession_info?.initial_release_date ?? '').slice(0, 10),
      atoms: info.deposited_atom_count ?? null,
      residues: info.deposited_polymer_monomer_count ?? null,
      polymerChains: info.deposited_polymer_entity_instance_count ?? null,
      polymerEntities: info.polymer_entity_count ?? null,
      nonpolymerEntities: info.nonpolymer_entity_count ?? null,
      models: info.deposited_model_count ?? null,
    }
  } catch {
    return null
  }
}
