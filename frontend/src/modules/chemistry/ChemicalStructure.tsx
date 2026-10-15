import { useEffect, useMemo, useRef, useState } from 'react'
import MolViewer from '../../components/molecular/MolViewer.tsx'
import type { Representation } from '../../components/molecular/MolViewer.tsx'
import { fetch3dConformer, lookupName } from '../../services/pubchemService.ts'
import { loadRDKit } from '../../services/rdkitService.ts'
import type { RDKitModule } from '../../services/rdkitService.ts'
import { analyze, parseLibrary, prepareInput, rankSimilar } from './chemUtils.ts'
import type { SimilarityHit } from './chemUtils.ts'
import { REFERENCE_SET } from './referenceSet.ts'

const EXAMPLES = [
  { label: 'Aspirin', smiles: 'CC(=O)OC1=CC=CC=C1C(=O)O' },
  { label: 'Caffeine', smiles: 'CN1C=NC2=C1C(=O)N(C(=O)N2C)C' },
  { label: 'Ibuprofen', smiles: 'CC(C)CC1=CC=C(C=C1)C(C)C(=O)O' },
  { label: 'Paracetamol', smiles: 'CC(=O)NC1=CC=C(O)C=C1' },
]

function ChemicalStructure() {
  const [rdkit, setRdkit] = useState<RDKitModule | null>(null)
  const [loadError, setLoadError] = useState('')
  const [smiles, setSmiles] = useState('')
  const [smarts, setSmarts] = useState('')
  const [note, setNote] = useState('')
  const [nameQuery, setNameQuery] = useState('')
  const [pubchemBusy, setPubchemBusy] = useState(false)
  const [conf3d, setConf3d] = useState<{ data: string; source: string } | null>(null)
  const [rep, setRep] = useState<Representation>('stick')
  const [spin, setSpin] = useState(false)
  const [library, setLibrary] = useState(REFERENCE_SET)
  const [similar, setSimilar] = useState<{ hits: SimilarityHit[]; skipped: number } | string | null>(null)
  const lastRequest = useRef(0)

  useEffect(() => {
    let cancelled = false
    loadRDKit()
      .then((m) => !cancelled && setRdkit(m))
      .catch((e: unknown) => !cancelled && setLoadError(e instanceof Error ? e.message : 'RDKit failed to load.'))
    return () => {
      cancelled = true
    }
  }, [])

  const prepared = useMemo(() => prepareInput(smiles), [smiles])
  const result = useMemo(
    () => (rdkit && prepared.text.trim() ? analyze(rdkit, prepared.text, smarts) : null),
    [rdkit, prepared, smarts],
  )
  const error = typeof result === 'string' ? result : ''
  const data = result && typeof result !== 'string' ? result : null

  const view3d = prepared.has3d ? { data: prepared.text, source: 'the file you loaded' } : conf3d

  function setInput(text: string, message = '') {
    setSmiles(text)
    setConf3d(null)
    setSimilar(null)
    setNote(message)
  }

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setNote('That file is larger than 5 MB.')
      return
    }
    setInput(await file.text(), `Loaded ${file.name}`)
  }

  async function findByName() {
    const id = ++lastRequest.current
    setPubchemBusy(true)
    setNote('')
    try {
      const hit = await lookupName(nameQuery)
      if (id !== lastRequest.current) return
      setInput(hit.smiles, `PubChem CID ${hit.cid} (${hit.title}). Structure retrieved from PubChem; everything below is calculated here.`)
    } catch (e) {
      if (id === lastRequest.current) setNote(e instanceof Error ? e.message : 'Lookup failed.')
    } finally {
      if (id === lastRequest.current) setPubchemBusy(false)
    }
  }

  async function get3d() {
    if (!data) return
    const id = ++lastRequest.current
    setPubchemBusy(true)
    setNote('')
    try {
      const sdf = await fetch3dConformer(data.canonicalSmiles)
      if (id === lastRequest.current) setConf3d({ data: sdf, source: 'a PubChem 3D conformer' })
    } catch (e) {
      if (id === lastRequest.current) setNote(e instanceof Error ? e.message : '3D lookup failed.')
    } finally {
      if (id === lastRequest.current) setPubchemBusy(false)
    }
  }

  function runSimilarity() {
    if (!rdkit || !data) return
    setSimilar(rankSimilar(rdkit, data.canonicalSmiles, parseLibrary(library)))
  }

  return (
    <>
      <div className="seq-main">
        <div className="seq-input">
          <label htmlFor="chem-smiles">SMILES, or paste a molfile / SDF</label>
          <textarea
            id="chem-smiles"
            value={smiles}
            spellCheck={false}
            placeholder="CC(=O)OC1=CC=CC=C1C(=O)O"
            onChange={(e) => setInput(e.target.value)}
            style={{ minHeight: 70 }}
          />
          <div className="tool-row seq-actions">
            {EXAMPLES.map((ex) => (
              <button key={ex.label} type="button" className="chip" onClick={() => setInput(ex.smiles)}>
                {ex.label}
              </button>
            ))}
            <label className="chip file-chip">
              Open file
              <input type="file" accept=".sdf,.mol,.smi,.smiles,.txt" onChange={onFile} />
            </label>
            <button type="button" className="chip" disabled={!smiles} onClick={() => setInput('')}>
              Clear
            </button>
          </div>
          <div className="tool-row seq-actions">
            <input
              className="chem-input"
              style={{ maxWidth: 240 }}
              value={nameQuery}
              placeholder="Compound name, e.g. aspirin"
              aria-label="Compound name"
              onChange={(e) => setNameQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && nameQuery.trim()) void findByName() }}
            />
            <button type="button" className="chip" disabled={pubchemBusy || !nameQuery.trim()} onClick={() => void findByName()}>
              Look up in PubChem
            </button>
          </div>
          <p className="note">
            {loadError || (rdkit ? `RDKit ${rdkit.version()} ready.` : 'Loading the RDKit chemistry engine…')}
            {note ? ` ${note}` : ''}
            {prepared.note ? ` ${prepared.note}` : ''}
          </p>
        </div>

        {error && <div className="tool-error">{error}</div>}

        {data && (
          <div className="seq-block">
            <div className="seq-block-head">
              <h4>Structure</h4>
            </div>
            <div className="chem-draw" dangerouslySetInnerHTML={{ __html: data.svg }} />
            <div style={{ marginTop: 12 }}>
              <label htmlFor="chem-smarts">Substructure search (SMARTS, optional)</label>
              <input
                id="chem-smarts"
                className="chem-input"
                value={smarts}
                spellCheck={false}
                placeholder="C(=O)O  (carboxylic acid)"
                onChange={(e) => setSmarts(e.target.value)}
              />
              {data.matchError && <p className="note">{data.matchError}</p>}
              {data.match && (
                <p className="note">
                  {data.match.count === 0
                    ? 'No match.'
                    : `${data.match.count} match${data.match.count > 1 ? 'es' : ''}; the first is highlighted.`}
                </p>
              )}
            </div>
            <p className="note">The drawing is a 2D depiction generated by RDKit.</p>
          </div>
        )}

        {data && (
          <div className="seq-block">
            <div className="seq-block-head">
              <h4>3D view</h4>
              {!view3d && (
                <button type="button" className="chip" disabled={pubchemBusy} onClick={() => void get3d()}>
                  {pubchemBusy ? 'Contacting PubChem…' : 'Get 3D conformer from PubChem'}
                </button>
              )}
            </div>
            {view3d ? (
              <>
                <MolViewer
                  data={view3d.data}
                  format="sdf"
                  representation={rep}
                  colorMode="element"
                  surface={false}
                  showWater={false}
                  spin={spin}
                  dark
                />
                <div className="tool-row seq-actions">
                  <select aria-label="Representation" value={rep} onChange={(e) => setRep(e.target.value as Representation)} style={{ width: 'auto' }}>
                    <option value="stick">Stick</option>
                    <option value="sphere">Sphere</option>
                    <option value="line">Line</option>
                  </select>
                  <label className="seq-check"><input type="checkbox" checked={spin} onChange={(e) => setSpin(e.target.checked)} /> Spin</label>
                </div>
                <p className="note">
                  Coordinates come from {view3d.source}; they were not calculated here. A deposited conformer is one
                  possible shape, not necessarily the one the molecule has in solution or in a binding site.
                </p>
              </>
            ) : (
              <p className="note">
                RDKit here only draws 2D. The button sends this structure&apos;s SMILES to PubChem and shows the 3D
                conformer it has on record, if any. Nothing is sent unless you click it.
              </p>
            )}
          </div>
        )}

        {data && (
          <div className="seq-block">
            <div className="seq-block-head">
              <h4>Similarity search</h4>
              <button type="button" className="chip" onClick={runSimilarity}>Rank by similarity</button>
            </div>
            <label htmlFor="chem-lib">Compare against (one SMILES per line, name optional)</label>
            <textarea
              id="chem-lib"
              className="chem-input"
              style={{ minHeight: 100 }}
              spellCheck={false}
              value={library}
              onChange={(e) => { setLibrary(e.target.value); setSimilar(null) }}
            />
            {typeof similar === 'string' && <p className="note">{similar}</p>}
            {similar && typeof similar !== 'string' && (
              <>
                <div className="orf-scroll">
                  <table className="orf-table">
                    <thead>
                      <tr><th>Rank</th><th>Name</th><th>Tanimoto</th></tr>
                    </thead>
                    <tbody>
                      {similar.hits.slice(0, 10).map((h, i) => (
                        <tr key={`${h.smiles}-${i}`}>
                          <td>{i + 1}</td>
                          <td>{h.name}</td>
                          <td>{h.score.toFixed(3)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {similar.skipped > 0 && <p className="note">{similar.skipped} line(s) could not be read and were skipped.</p>}
              </>
            )}
            <p className="note">
              Tanimoto similarity of Morgan fingerprints (radius 2, 2048 bits), from 0 (nothing shared) to 1 (identical
              fingerprints). The default list is a small demonstration set, not a database, and similar fingerprints do
              not guarantee similar activity.
            </p>
          </div>
        )}
      </div>

      <aside className="workspace-side tool-panel">
        <h4>Calculated by RDKit</h4>
        {data ? (
          <>
            <dl className="tool-info">
              <dt>Formula</dt>
              <dd>{data.formula}</dd>
              {data.props.map((p) => (
                <span key={p.label} style={{ display: 'contents' }}>
                  <dt>{p.label}</dt>
                  <dd>{p.value}{p.note ? ` (${p.note})` : ''}</dd>
                </span>
              ))}
            </dl>
            <div>
              <label>Lipinski rule of five</label>
              <ul className="chem-rules">
                {data.lipinski.map((r) => (
                  <li key={r.rule} className={r.ok ? 'ok' : 'bad'}>
                    {r.ok ? '✓' : '✗'} {r.rule} <span>({r.value})</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <label>Canonical SMILES</label>
              <code className="chem-code">{data.canonicalSmiles}</code>
              {data.inchi && (
                <>
                  <label>InChI</label>
                  <code className="chem-code">{data.inchi}</code>
                  <label>InChIKey</label>
                  <code className="chem-code">{data.inchiKey}</code>
                </>
              )}
            </div>
            <p className="note">
              These are calculated values, not measured. logP is a Crippen atom-contribution estimate and the rule of five
              is a rough guide to oral drug-likeness, not a prediction of activity.
            </p>
          </>
        ) : (
          <p className="note">Enter a SMILES string, open an SDF/molfile or look up a name.</p>
        )}
      </aside>
    </>
  )
}

export default ChemicalStructure
