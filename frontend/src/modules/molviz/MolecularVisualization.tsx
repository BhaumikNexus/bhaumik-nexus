import { useMemo, useRef, useState } from 'react'
import MolViewer from '../../components/molecular/MolViewer.tsx'
import type { ColorMode, Representation } from '../../components/molecular/MolViewer.tsx'
import { fetchStructure } from '../../services/structureService.ts'
import type { Viewer3D } from '../../types/3dmol.d.ts'

const FORMATS: Record<string, string> = {
  pdb: 'pdb', ent: 'pdb', cif: 'cif', mmcif: 'cif', sdf: 'sdf', mol: 'sdf', mol2: 'mol2', xyz: 'xyz',
}

const EXAMPLES = ['1CRN', '1EMA', '3PQR']

interface Loaded {
  source: string
  format: string
  data: string
}

/** Counts from the loaded text itself; only meaningful for PDB files. */
function pdbSummary(data: string) {
  const chains = new Set<string>()
  const hets = new Map<string, number>()
  let models = 0
  for (const line of data.split('\n')) {
    if (line.startsWith('MODEL')) models++
    else if (line.startsWith('ATOM  ')) chains.add(line[21] || '?')
    else if (line.startsWith('HETATM')) {
      const resn = line.slice(17, 20).trim()
      if (resn !== 'HOH') hets.set(resn, (hets.get(resn) ?? 0) + 1)
    }
  }
  return { chains: [...chains].sort(), hets: [...hets.keys()].sort(), models: Math.max(models, 1) }
}

function MolecularVisualization() {
  const viewerRef = useRef<Viewer3D | null>(null)
  const [id, setId] = useState('')
  const [pasted, setPasted] = useState('')
  const [pasteFormat, setPasteFormat] = useState('pdb')
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [atoms, setAtoms] = useState<number | null>(null)
  const [rep, setRep] = useState<Representation>('cartoon')
  const [color, setColor] = useState<ColorMode>('spectrum')
  const [surface, setSurface] = useState(false)
  const [water, setWater] = useState(false)
  const [spin, setSpin] = useState(false)
  const [dark, setDark] = useState(true)

  const summary = useMemo(() => (loaded?.format === 'pdb' ? pdbSummary(loaded.data) : null), [loaded])
  const tooBigForSurface = (atoms ?? 0) > 40000

  function accept(next: Loaded) {
    setError('')
    setAtoms(null)
    setSurface(false)
    setLoaded(next)
  }

  async function fetchPdb(raw: string) {
    const pdb = raw.trim().toUpperCase()
    if (!/^[0-9][A-Z0-9]{3}$/.test(pdb)) {
      setError('A PDB ID is 4 characters, starting with a digit (for example 1CRN).')
      return
    }
    setBusy(true)
    setError('')
    try {
      const { data, format } = await fetchStructure(pdb)
      accept({ source: `RCSB PDB ${pdb}`, format, data })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load that structure.')
    } finally {
      setBusy(false)
    }
  }

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    const format = FORMATS[ext]
    if (!format) {
      setError(`Unsupported file type ".${ext}". Use pdb, cif, sdf, mol, mol2 or xyz.`)
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      setError('That file is larger than 50 MB.')
      return
    }
    accept({ source: file.name, format, data: await file.text() })
  }

  function resetView() {
    viewerRef.current?.zoomTo()
    viewerRef.current?.render()
  }

  function screenshot() {
    const uri = viewerRef.current?.pngURI()
    if (!uri) return
    const a = document.createElement('a')
    a.href = uri
    a.download = 'structure.png'
    a.click()
  }

  return (
    <>
      <div className="seq-main">
        <MolViewer
          data={loaded?.data ?? ''}
          format={loaded?.format ?? 'pdb'}
          representation={rep}
          colorMode={color}
          surface={surface && !tooBigForSurface}
          showWater={water}
          spin={spin}
          dark={dark}
          placeholder="Fetch a PDB entry or open a structure file."
          onViewer={(v) => { viewerRef.current = v }}
          onLoaded={(i) => setAtoms(i.atoms)}
          onError={setError}
        />
        {error && <div className="tool-error">{error}</div>}
        <div className="seq-block">
          <div className="seq-block-head"><h4>Load a structure</h4></div>
          <div className="tool-row seq-actions">
            <input
              className="chem-input"
              style={{ maxWidth: 160 }}
              value={id}
              maxLength={4}
              placeholder="PDB ID"
              aria-label="PDB ID"
              onChange={(e) => setId(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void fetchPdb(id) }}
            />
            <button type="button" className="chip" disabled={busy || !id} onClick={() => void fetchPdb(id)}>
              {busy ? 'Loading…' : 'Fetch from RCSB'}
            </button>
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" className="chip" disabled={busy} onClick={() => { setId(ex); void fetchPdb(ex) }}>
                {ex}
              </button>
            ))}
            <label className="chip file-chip">
              Open file
              <input type="file" accept=".pdb,.ent,.cif,.mmcif,.sdf,.mol,.mol2,.xyz" onChange={onFile} />
            </label>
          </div>
          <details style={{ marginTop: 10 }}>
            <summary className="note">Paste structure text instead</summary>
            <div className="seq-input" style={{ marginTop: 8 }}>
              <textarea value={pasted} spellCheck={false} onChange={(e) => setPasted(e.target.value)} placeholder="Paste PDB, mmCIF, SDF, MOL2 or XYZ text" />
              <div className="tool-row seq-actions">
                <select aria-label="Format" value={pasteFormat} onChange={(e) => setPasteFormat(e.target.value)} style={{ width: 'auto' }}>
                  <option value="pdb">PDB</option>
                  <option value="cif">mmCIF</option>
                  <option value="sdf">SDF / MOL</option>
                  <option value="mol2">MOL2</option>
                  <option value="xyz">XYZ</option>
                </select>
                <button type="button" className="chip" disabled={!pasted.trim()} onClick={() => accept({ source: 'pasted text', format: pasteFormat, data: pasted })}>
                  Show
                </button>
              </div>
            </div>
          </details>
        </div>
      </div>

      <aside className="workspace-side tool-panel">
        <h4>Display</h4>
        <div>
          <label htmlFor="mv-rep">Representation</label>
          <select id="mv-rep" className="chem-input" value={rep} onChange={(e) => setRep(e.target.value as Representation)}>
            <option value="cartoon">Cartoon (proteins) + sticks for ligands</option>
            <option value="stick">Stick</option>
            <option value="sphere">Sphere</option>
            <option value="line">Line</option>
          </select>
        </div>
        <div>
          <label htmlFor="mv-color">Colour</label>
          <select id="mv-color" className="chem-input" value={color} onChange={(e) => setColor(e.target.value as ColorMode)}>
            <option value="spectrum">Spectrum (N to C terminus)</option>
            <option value="chain">By chain</option>
            <option value="element">By element</option>
            <option value="ssPyMol">Secondary structure</option>
          </select>
        </div>
        <div className="mv-toggles">
          <label className="seq-check"><input type="checkbox" checked={surface && !tooBigForSurface} disabled={tooBigForSurface || !loaded} onChange={(e) => setSurface(e.target.checked)} /> Van der Waals surface</label>
          <label className="seq-check"><input type="checkbox" checked={water} disabled={!loaded} onChange={(e) => setWater(e.target.checked)} /> Show water</label>
          <label className="seq-check"><input type="checkbox" checked={spin} disabled={!loaded} onChange={(e) => setSpin(e.target.checked)} /> Spin</label>
          <label className="seq-check"><input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} /> Dark background</label>
        </div>
        {tooBigForSurface && <p className="note">Surface is turned off for files with more than 40,000 atoms because it would be very slow.</p>}
        <div className="tool-row">
          <button type="button" className="chip" disabled={!loaded} onClick={resetView}>Reset view</button>
          <button type="button" className="chip" disabled={!loaded} onClick={screenshot}>Save image</button>
        </div>

        <h4>File</h4>
        {loaded ? (
          <>
            <dl className="tool-info">
              <dt>Source</dt><dd>{loaded.source}</dd>
              <dt>Format</dt><dd>{loaded.format.toUpperCase()}</dd>
              <dt>Atoms</dt><dd>{atoms === null ? '…' : atoms.toLocaleString()}</dd>
              {summary && (
                <>
                  <dt>Models</dt><dd>{summary.models}</dd>
                  <dt>Chains (ATOM records)</dt><dd>{summary.chains.join(', ') || '—'}</dd>
                  <dt>Ligands / hetero groups</dt><dd>{summary.hets.join(', ') || 'none'}</dd>
                </>
              )}
            </dl>
            <p className="note">Counted from the loaded file, not from a database record. Open the Protein Structure module for official RCSB figures.</p>
          </>
        ) : (
          <p className="note">Nothing loaded yet.</p>
        )}
      </aside>
    </>
  )
}

export default MolecularVisualization
