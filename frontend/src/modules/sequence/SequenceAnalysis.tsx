import { useMemo, useState } from 'react'
import {
  composition,
  GENETIC_CODES,
  findOrfs,
  formatBlocks,
  getGeneticCode,
  gcContent,
  parseInput,
  proteinMass,
  reverseComplement,
  translate,
  validate,
} from './sequenceUtils.ts'
import SaveToProject from '../../components/common/SaveToProject.tsx'
import type { ProjectItem } from '../../services/projectStore.ts'

const EXAMPLES = [
  { label: 'Short DNA', text: '>example_dna (synthetic, for testing)\nATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAG' },
  { label: 'Short RNA', text: '>example_rna (synthetic, for testing)\nAUGGCCAUUGUAAUGGGCCGCUGA' },
]

function mass(protein: string): string {
  const m = proteinMass(protein)
  return m === null ? '–' : (m / 1000).toFixed(2)
}

function pct(value: number, total: number): string {
  return total === 0 ? '0.0' : ((value / total) * 100).toFixed(1)
}

function SequenceAnalysis({ initial }: { initial?: ProjectItem | null }) {
  const [text, setText] = useState(initial?.data ?? '')
  const [selected, setSelected] = useState(0)
  const [frame, setFrame] = useState(0)
  const [minAa, setMinAa] = useState(30)
  const [codeId, setCodeId] = useState(1)
  const [altStarts, setAltStarts] = useState(false)
  const geneticCode = getGeneticCode(codeId)
  const [fileNote, setFileNote] = useState('')

  const records = useMemo(() => parseInput(text), [text])
  const record = records[Math.min(selected, Math.max(records.length - 1, 0))]
  const check = useMemo(() => (record ? validate(record.sequence) : null), [record])
  const comp = useMemo(() => (record ? composition(record.sequence) : null), [record])
  const gc = comp ? gcContent(comp) : null
  const type = check?.type ?? 'unknown'

  const revComp = useMemo(
    () => (record && check?.valid ? reverseComplement(record.sequence, type) : ''),
    [record, check, type],
  )
  const protein = useMemo(() => {
    if (!record || !check?.valid) return ''
    return frame < 3 ? translate(record.sequence, frame, codeId) : translate(revComp, frame - 3, codeId)
  }, [record, check, frame, revComp, codeId])
  const orfs = useMemo(
    () => (record && check?.valid ? findOrfs(record.sequence, minAa, codeId, altStarts) : []),
    [record, check, minAa, codeId, altStarts],
  )

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setFileNote('That file is larger than 5 MB. Paste a shorter sequence or split the file.')
      return
    }
    setText(await file.text())
    setSelected(0)
    setFileNote(`Loaded ${file.name}`)
  }

  const total = record?.sequence.length ?? 0
  const bases: { key: 'A' | 'C' | 'G' | 'T' | 'U'; show: boolean }[] = [
    { key: 'A', show: true },
    { key: 'C', show: true },
    { key: 'G', show: true },
    { key: 'T', show: type !== 'RNA' },
    { key: 'U', show: type === 'RNA' },
  ]

  return (
    <>
      <div className="seq-main">
        <div className="seq-input">
          <label htmlFor="seq-text">Sequence (plain text or FASTA)</label>
          <textarea
            id="seq-text"
            value={text}
            spellCheck={false}
            placeholder={'>my_sequence\nATGGCC...'}
            onChange={(e) => {
              setText(e.target.value)
              setSelected(0)
              setFileNote('')
            }}
          />
          <div className="tool-row seq-actions">
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                type="button"
                className="chip"
                onClick={() => {
                  setText(ex.text)
                  setSelected(0)
                  setFileNote('')
                }}
              >
                {ex.label}
              </button>
            ))}
            <label className="chip file-chip">
              Open file
              <input type="file" accept=".fasta,.fa,.fna,.txt,text/plain" onChange={handleFile} />
            </label>
            <button type="button" className="chip" disabled={!text} onClick={() => setText('')}>
              Clear
            </button>
            <SaveToProject module="DNA / RNA Sequence" kind="sequence" data={text} defaultName={records[0]?.name ?? 'Sequence'} />
          </div>
          {fileNote && <p className="note">{fileNote}</p>}
        </div>

        {records.length > 1 && (
          <div>
            <label htmlFor="seq-record">Record</label>
            <select id="seq-record" value={selected} onChange={(e) => setSelected(Number(e.target.value))}>
              {records.map((r, i) => (
                <option key={i} value={i}>
                  {r.name} ({r.sequence.length.toLocaleString()})
                </option>
              ))}
            </select>
          </div>
        )}

        {!record && (
          <p className="note">Paste a DNA or RNA sequence, open a FASTA file, or try an example to see the analysis.</p>
        )}

        {check && !check.valid && (
          <div className="tool-error">
            {check.problems.map((p) => (
              <div key={p}>{p}</div>
            ))}
          </div>
        )}

        {record && (
          <div className="seq-block">
            <h4>{record.name}</h4>
            <div className="seq-lines" role="region" aria-label="Formatted sequence" tabIndex={0}>
              {formatBlocks(record.sequence).map((line) => (
                <div key={line.start}>
                  <span className="seq-pos">{line.start}</span>
                  {line.text}
                </div>
              ))}
            </div>
          </div>
        )}

        {record && check?.valid && (
          <div className="seq-block">
            <h4>Reverse complement</h4>
            <div className="seq-lines" tabIndex={0} role="region" aria-label="Reverse complement">
              {formatBlocks(revComp).map((line) => (
                <div key={line.start}>
                  <span className="seq-pos">{line.start}</span>
                  {line.text}
                </div>
              ))}
            </div>
          </div>
        )}

        {record && check?.valid && (
          <div className="seq-block">
            <div className="seq-block-head">
              <h4>Translation</h4>
              <div>
                <label htmlFor="seq-code">Genetic code</label>
                <select id="seq-code" value={codeId} onChange={(e) => setCodeId(Number(e.target.value))}>
                  {GENETIC_CODES.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} (table {c.id})</option>
                  ))}
                </select>
                <label htmlFor="seq-frame">Reading frame</label>
                <select id="seq-frame" value={frame} onChange={(e) => setFrame(Number(e.target.value))}>
                  <option value={0}>Frame 1 (forward)</option>
                  <option value={1}>Frame 2 (forward)</option>
                  <option value={2}>Frame 3 (forward)</option>
                  <option value={3}>Frame 1 (reverse strand)</option>
                  <option value={4}>Frame 2 (reverse strand)</option>
                  <option value={5}>Frame 3 (reverse strand)</option>
                </select>
              </div>
            </div>
            <div className="seq-lines" tabIndex={0} role="region" aria-label="Translation">
              {protein ? formatBlocks(protein, 60, 10).map((line) => (
                <div key={line.start}>
                  <span className="seq-pos">{line.start}</span>
                  {line.text}
                </div>
              )) : 'Sequence is too short to translate in this frame.'}
            </div>
            <p className="note">
              Calculated with NCBI translation table {geneticCode.id} ({geneticCode.name}). * marks a stop codon, X a codon with an ambiguity code.
              This is a plain translation of the chosen frame, not a gene prediction. Reverse-strand frames translate
              the reverse complement.
            </p>
          </div>
        )}

        {record && check?.valid && (
          <div className="seq-block">
            <div className="seq-block-head">
              <h4>Open reading frames</h4>
              <div>
                <label htmlFor="seq-minaa">Minimum length</label>
                <select id="seq-minaa" value={minAa} onChange={(e) => setMinAa(Number(e.target.value))}>
                  <option value={10}>10 amino acids</option>
                  <option value={30}>30 amino acids</option>
                  <option value={50}>50 amino acids</option>
                  <option value={100}>100 amino acids</option>
                </select>
                <label className="seq-check">
                  <input type="checkbox" checked={altStarts} onChange={(e) => setAltStarts(e.target.checked)} />
                  Alternative start codons ({geneticCode.starts.filter((c) => c !== 'ATG').join(', ')})
                </label>
              </div>
            </div>
            {orfs.length === 0 ? (
              <p className="note">No ORFs of at least {minAa} amino acids ({altStarts ? geneticCode.starts.join('/') : 'ATG'} to a stop codon, table {geneticCode.id}) in any of the six frames.</p>
            ) : (
              <div className="orf-scroll" tabIndex={0} role="region" aria-label="Open reading frames">
                <table className="orf-table">
                  <thead>
                    <tr>
                      <th>Strand</th>
                      <th>Frame</th>
                      <th>Start–End</th>
                      <th>Length (aa)</th>
                      <th>Mass (kDa)</th>
                      <th>Protein</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orfs.slice(0, 10).map((o) => (
                      <tr key={`${o.strand}${o.frame}-${o.start}`}>
                        <td>{o.strand}</td>
                        <td>{o.frame}</td>
                        <td>{o.start.toLocaleString()}–{o.end.toLocaleString()}</td>
                        <td>{o.lengthAa}</td>
                        <td>{mass(o.protein)}</td>
                        <td className="orf-protein">{o.protein.length > 30 ? `${o.protein.slice(0, 30)}…` : o.protein}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="note">
              {orfs.length > 10 ? `Showing the 10 longest of ${orfs.length}. ` : ''}
              An ORF here runs from a start codon ({altStarts ? 'ATG or an alternative start of this table' : 'ATG only'}) to the first in-frame
              stop codon and must reach one; the first residue is shown as M. Mass is the calculated average mass of the
              protein (free amino acids, peptide bonds), not a measured value. Positions refer to the sequence as
              entered, including the stop codon. Finding an ORF does not show that it is a real gene.
            </p>
          </div>
        )}
      </div>

      <aside className="workspace-side tool-panel">
        <h4>Summary</h4>
        {record && check && comp ? (
          <>
            <dl className="tool-info">
              <dt>Type</dt>
              <dd>{type === 'unknown' ? 'Could not determine' : type}</dd>
              <dt>Length</dt>
              <dd>{total.toLocaleString()} {type === 'RNA' ? 'nt' : 'bp'}</dd>
              <dt>GC content</dt>
              <dd>{gc === null ? '—' : `${gc.toFixed(1)}%`}</dd>
              <dt>Ambiguous bases</dt>
              <dd>{comp.ambiguous.toLocaleString()}</dd>
              {comp.invalid > 0 && (
                <>
                  <dt>Invalid characters</dt>
                  <dd>{comp.invalid.toLocaleString()}</dd>
                </>
              )}
            </dl>

            <div>
              <label>Composition</label>
              <div className="comp-bars">
                {bases.filter((b) => b.show).map((b) => (
                  <div className="comp-row" key={b.key}>
                    <span>{b.key}</span>
                    <div className="comp-track">
                      <div className="comp-fill" style={{ width: `${pct(comp[b.key], total)}%` }} />
                    </div>
                    <span className="comp-num">
                      {comp[b.key].toLocaleString()} · {pct(comp[b.key], total)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <p className="note">
              GC content is G+C divided by the A, C, G and T/U bases. Ambiguity codes (N, R, Y and so on) are left out of
              that count.
            </p>
          </>
        ) : (
          <p className="note">Nothing to analyze yet.</p>
        )}
      </aside>
    </>
  )
}

export default SequenceAnalysis
