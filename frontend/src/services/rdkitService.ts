// Loads RDKit (WebAssembly build of the RDKit cheminformatics toolkit) from a CDN on first use.
const BASE = 'https://cdn.jsdelivr.net/npm/@rdkit/rdkit@2024.3.5-1.0.0/dist/'

export interface RDKitMol {
  is_valid(): boolean
  get_svg(width: number, height: number): string
  get_svg_with_highlights(details: string): string
  get_smiles(): string
  get_inchi(): string
  get_descriptors(): string
  get_molblock(): string
  add_hs(): string
  get_morgan_fp(details?: string): string
  get_substruct_match(query: RDKitMol): string
  get_substruct_matches(query: RDKitMol): string
  delete(): void
}

export interface RDKitModule {
  version(): string
  get_mol(input: string, details?: string): RDKitMol | null
  get_qmol(input: string): RDKitMol | null
  get_inchikey_for_inchi(inchi: string): string
}

declare global {
  interface Window {
    initRDKitModule?: (opts?: { locateFile?: (file: string) => string }) => Promise<RDKitModule>
  }
}

let loading: Promise<RDKitModule> | null = null

export function loadRDKit(): Promise<RDKitModule> {
  if (loading) return loading
  loading = new Promise<RDKitModule>((resolve, reject) => {
    const fail = (message: string) => {
      loading = null
      reject(new Error(message))
    }
    const start = () => {
      if (!window.initRDKitModule) return fail('RDKit loaded but did not start.')
      window
        .initRDKitModule({ locateFile: (file) => BASE + file })
        .then(resolve)
        .catch((e: unknown) => fail(e instanceof Error ? e.message : 'RDKit failed to start.'))
    }
    if (window.initRDKitModule) return start()
    const script = document.createElement('script')
    script.src = BASE + 'RDKit_minimal.js'
    script.async = true
    script.onload = start
    script.onerror = () => fail('Could not download RDKit (needs internet access to cdn.jsdelivr.net).')
    document.head.appendChild(script)
  })
  return loading
}
