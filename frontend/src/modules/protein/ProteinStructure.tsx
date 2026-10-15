import { useEffect, useRef, useState } from 'react'
import type { Viewer3D } from '../../types/3dmol.d.ts'
import { fetchEntryRecord, fetchStructure, loadViewerLibrary, parseTitle } from '../../services/structureService.ts'
import type { EntryRecord } from '../../services/structureService.ts'

type Representation = 'cartoon' | 'stick' | 'sphere' | 'line'
type ColorMode = 'spectrum' | 'chain' | 'ssPyMol'
type Status = 'idle' | 'loading' | 'ready' | 'error'

interface StructureInfo {
  id: string
  title: string
  atoms: number
  residues: number
  chains: string[]
  ligands: string[]
  record: EntryRecord | null
}

const EXAMPLES = ['1CRN', '4HHB', '1L5G']

function ProteinStructure() {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Viewer3D | null>(null)

  const [pdbId, setPdbId] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [info, setInfo] = useState<StructureInfo | null>(null)
  const [representation, setRepresentation] = useState<Representation>('cartoon')
  const [colorMode, setColorMode] = useState<ColorMode>('spectrum')
  const [spinning, setSpinning] = useState(false)

  useEffect(() => {
    return () => {
      viewerRef.current?.spin(false)
      viewerRef.current?.clear()
      viewerRef.current = null
    }
  }, [])

  function applyStyle(rep: Representation, color: ColorMode) {
    const viewer = viewerRef.current
    if (!viewer) return
    const colorOption = color === 'spectrum' ? { color: 'spectrum' } : { colorscheme: color === 'chain' ? 'chain' : 'ssPyMol' }

    viewer.setStyle({}, { [rep]: colorOption })
    viewer.setStyle({ hetflag: true }, { stick: { radius: 0.2, colorscheme: 'Jmol' } })
    viewer.setStyle({ resn: 'HOH' }, {})
    viewer.render()
  }

  async function loadStructure(rawId: string) {
    const id = rawId.trim().toUpperCase()
    if (!/^[0-9][A-Z0-9]{3}$/.test(id)) {
      setStatus('error')
      setError('A PDB ID is 4 characters, starting with a digit (for example 1CRN).')
      return
    }

    setStatus('loading')
    setError('')

    try {
      await loadViewerLibrary()
      const [{ data, format }, record] = await Promise.all([fetchStructure(id), fetchEntryRecord(id)])

      const container = containerRef.current
      if (!container || !window.$3Dmol) return

      if (!viewerRef.current) {
        viewerRef.current = window.$3Dmol.createViewer(container, { backgroundColor: '#0b1220' })
      }
      const viewer = viewerRef.current

      viewer.spin(false)
      setSpinning(false)
      viewer.clear()
      const model = viewer.addModel(data, format)
      applyStyle(representation, colorMode)
      viewer.zoomTo()
      viewer.render()

      const atoms = model.selectedAtoms({})
      const residues = new Set(
        atoms.filter((a) => !a.hetflag).map((a) => `${a.chain}:${a.resi}`),
      )
      // Polymer chains only: chain IDs that exist just for ligands, sugars or water are not counted.
      const chains = [...new Set(atoms.filter((a) => !a.hetflag).map((a) => a.chain))].filter(Boolean)
      const ligands = [
        ...new Set(atoms.filter((a) => a.hetflag && a.resn !== 'HOH').map((a) => a.resn)),
      ]

      setInfo({
        id,
        title: parseTitle(data, format),
        atoms: atoms.length,
        residues: residues.size,
        chains,
        ligands,
        record,
      })
      setPdbId(id)
      setStatus('ready')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Something went wrong loading the structure.')
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    void loadStructure(pdbId)
  }

  function handleRepresentation(value: Representation) {
    setRepresentation(value)
    applyStyle(value, colorMode)
  }

  function handleColor(value: ColorMode) {
    setColorMode(value)
    applyStyle(representation, value)
  }

  function toggleSpin() {
    const next = !spinning
    setSpinning(next)
    viewerRef.current?.spin(next)
  }

  function resetView() {
    viewerRef.current?.zoomTo()
    viewerRef.current?.render()
  }

  const hasStructure = info !== null

  return (
    <>
      <div className="workspace-viewer protein-viewer">
        <div ref={containerRef} className="viewer-canvas" />

        {(!hasStructure || status === 'loading') && (
          <div className="viewer-overlay">
            {status === 'loading' ? (
              <p>Loading structure…</p>
            ) : (
              <>
                <span className="viewer-icon">🧬</span>
                <h3>Load a protein structure</h3>
                <p>Enter a PDB ID on the right to view it in 3D.</p>
              </>
            )}
          </div>
        )}
      </div>

      <aside className="workspace-side tool-panel">
        <form className="tool-form" onSubmit={handleSubmit}>
          <label htmlFor="pdb-id">PDB ID</label>
          <div className="tool-row">
            <input
              id="pdb-id"
              type="text"
              value={pdbId}
              maxLength={4}
              placeholder="e.g. 1CRN"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setPdbId(e.target.value)}
            />
            <button className="primary-button" type="submit" disabled={status === 'loading'}>
              Load
            </button>
          </div>
        </form>

        <div className="chip-row">
          {EXAMPLES.map((id) => (
            <button
              key={id}
              type="button"
              className="chip"
              disabled={status === 'loading'}
              onClick={() => {
                setPdbId(id)
                void loadStructure(id)
              }}
            >
              {id}
            </button>
          ))}
        </div>

        {status === 'error' && <p className="tool-error">{error}</p>}

        <div className="tool-controls">
          <label htmlFor="representation">Representation</label>
          <select
            id="representation"
            value={representation}
            disabled={!hasStructure}
            onChange={(e) => handleRepresentation(e.target.value as Representation)}
          >
            <option value="cartoon">Cartoon</option>
            <option value="stick">Stick</option>
            <option value="sphere">Sphere</option>
            <option value="line">Line</option>
          </select>

          <label htmlFor="color-mode">Colour</label>
          <select
            id="color-mode"
            value={colorMode}
            disabled={!hasStructure}
            onChange={(e) => handleColor(e.target.value as ColorMode)}
          >
            <option value="spectrum">Rainbow (N → C)</option>
            <option value="chain">By chain</option>
            <option value="ssPyMol">Secondary structure</option>
          </select>

          <div className="tool-row">
            <button type="button" className="secondary-button" disabled={!hasStructure} onClick={toggleSpin}>
              {spinning ? 'Stop spin' : 'Spin'}
            </button>
            <button type="button" className="secondary-button" disabled={!hasStructure} onClick={resetView}>
              Reset view
            </button>
          </div>
        </div>

        {info && (
          <>
            {info.record ? (
              <section aria-label="RCSB record">
                <h5 className="tool-info-title">RCSB record <span>official, deposited data</span></h5>
                <dl className="tool-info">
                  <dt>Structure</dt>
                  <dd>{info.id}{info.record.title ? ` — ${info.record.title}` : ''}</dd>
                  {info.record.method && (<><dt>Method</dt><dd>{info.record.method}</dd></>)}
                  {info.record.resolution !== null && (<><dt>Resolution</dt><dd>{info.record.resolution} Å</dd></>)}
                  {info.record.released && (<><dt>Released</dt><dd>{info.record.released}</dd></>)}
                  {info.record.polymerChains !== null && (<><dt>Polymer chains</dt><dd>{info.record.polymerChains}</dd></>)}
                  {info.record.residues !== null && (<><dt>Residues</dt><dd>{info.record.residues.toLocaleString()}</dd></>)}
                  {info.record.atoms !== null && (<><dt>Atoms</dt><dd>{info.record.atoms.toLocaleString()}</dd></>)}
                  {info.record.models !== null && info.record.models > 1 && (<><dt>Models</dt><dd>{info.record.models}</dd></>)}
                </dl>
              </section>
            ) : (
              <p className="note">
                The official RCSB record could not be loaded, so only values calculated from the file are shown.
              </p>
            )}

            <section aria-label="Calculated from the file">
              <h5 className="tool-info-title">Calculated from the file <span>counted here, not official</span></h5>
              <dl className="tool-info">
                {!info.record && (<><dt>Structure</dt><dd>{info.id}{info.title ? ` — ${info.title}` : ''}</dd></>)}
                <dt>Chains</dt>
                <dd>{info.chains.length ? info.chains.join(', ') : '—'}</dd>
                <dt>Residues</dt>
                <dd>{info.residues.toLocaleString()}</dd>
                <dt>Atoms</dt>
                <dd>{info.atoms.toLocaleString()}</dd>
                <dt>Ligands</dt>
                <dd>{info.ligands.length ? info.ligands.join(', ') : 'None'}</dd>
              </dl>
            </section>

            {info.record &&
              ((info.record.atoms !== null && info.record.atoms !== info.atoms) ||
                (info.record.residues !== null && info.record.residues !== info.residues)) && (
                <p className="note">
                  The counts calculated from the file differ from the official record. Residues here are counted from
                  protein and nucleic-acid atoms by chain and number, so modified residues and insertion codes can be
                  missed. Use the RCSB figures when quoting numbers.
                </p>
              )}
          </>
        )}
      </aside>
    </>
  )
}

export default ProteinStructure
