import { useMemo, useRef, useState } from 'react'
import {
  OPENABLE_MODULES, addItem, deleteItem, exportJson, fileExtension, importJson, loadItems, renameItem, usedBytes,
} from '../../services/projectStore.ts'
import type { ProjectItem } from '../../services/projectStore.ts'

function guessModule(fileName: string, text: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  if (['fasta', 'fa', 'fna', 'faa'].includes(ext) || text.trimStart().startsWith('>')) return 'DNA / RNA Sequence'
  if (['sdf', 'mol', 'smi', 'smiles'].includes(ext)) return 'Chemical Structure'
  if (['csv', 'tsv'].includes(ext)) return 'Scientific Data'
  return 'Scientific Data'
}

function kindFor(module: string): string {
  switch (module) {
    case 'DNA / RNA Sequence': return 'sequence'
    case 'Chemical Structure': return 'structure'
    case 'Experiment Data': return 'groups'
    case 'Protein Structure':
    case 'Molecular Visualization': return 'pdb-id'
    default: return 'table'
  }
}

function download(name: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

function ProjectsFiles({ onOpen }: { onOpen: (item: ProjectItem) => void }) {
  const [items, setItems] = useState<ProjectItem[]>(() => loadItems())
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')
  const [confirm, setConfirm] = useState<string | null>(null)
  const [importModule, setImportModule] = useState('auto')
  const backupInput = useRef<HTMLInputElement>(null)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((i) => (filter === 'all' || i.module === filter) && (!q || i.name.toLowerCase().includes(q) || i.data.toLowerCase().includes(q)))
  }, [items, filter, query])

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    let added = 0
    const problems: string[] = []
    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) {
        problems.push(`${file.name} is larger than 5 MB`)
        continue
      }
      const text = await file.text()
      if (text.includes('\u0000')) {
        problems.push(`${file.name} does not look like a text file`)
        continue
      }
      const module = importModule === 'auto' ? guessModule(file.name, text) : importModule
      const r = addItem({ module, kind: kindFor(module), name: file.name, data: text })
      if (r.ok) added++
      else problems.push(r.error)
    }
    setItems(loadItems())
    setMessage(`${added} file(s) added.${problems.length ? ' ' + problems.join('; ') + '.' : ''}`)
  }

  async function onBackup(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const r = importJson(await file.text())
    if (r.ok) {
      setItems(r.value.items)
      setMessage(`${r.value.added} item(s) restored${r.value.skipped ? `, ${r.value.skipped} skipped (already here or not valid)` : ''}.`)
    } else setMessage(r.error)
  }

  function doRename(id: string) {
    const r = renameItem(id, renameText.trim() || 'Untitled')
    if (r.ok) setItems(r.value)
    else setMessage(r.error)
    setRenaming(null)
  }

  function doDelete(id: string) {
    const r = deleteItem(id)
    if (r.ok) setItems(r.value)
    else setMessage(r.error)
    setConfirm(null)
  }

  return (
    <>
      <div className="seq-main">
        <div className="seq-block">
          <div className="seq-block-head">
            <h4>Saved items ({shown.length}{shown.length !== items.length ? ` of ${items.length}` : ''})</h4>
            <div className="tool-row">
              <select aria-label="Filter by module" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 'auto' }}>
                <option value="all">All modules</option>
                {OPENABLE_MODULES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <input className="chem-input" style={{ maxWidth: 180 }} value={query} placeholder="Search" aria-label="Search saved items" onChange={(e) => setQuery(e.target.value)} />
            </div>
          </div>

          {items.length === 0 ? (
            <p className="note">
              Nothing saved yet. Use <strong>Save to Projects</strong> in the sequence, chemistry, data, experiment and structure tools, or
              add a file below.
            </p>
          ) : shown.length === 0 ? (
            <p className="note">No items match.</p>
          ) : (
            <ul className="proj-list">
              {shown.map((i) => (
                <li key={i.id} className="proj-item">
                  <div className="proj-main">
                    {renaming === i.id ? (
                      <span className="tool-row">
                        <input
                          className="chem-input"
                          autoFocus
                          value={renameText}
                          aria-label="New name"
                          onChange={(e) => setRenameText(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') doRename(i.id); if (e.key === 'Escape') setRenaming(null) }}
                        />
                        <button type="button" className="chip" onClick={() => doRename(i.id)}>Save</button>
                        <button type="button" className="chip" onClick={() => setRenaming(null)}>Cancel</button>
                      </span>
                    ) : (
                      <strong>{i.name}</strong>
                    )}
                    <span className="proj-meta">
                      {i.module} · {i.kind} · {new Date(i.created).toLocaleString()} · {i.data.length.toLocaleString()} characters
                    </span>
                    <code className="proj-preview">{i.data.replace(/\s+/g, ' ').slice(0, 90)}{i.data.length > 90 ? '…' : ''}</code>
                  </div>
                  <div className="tool-row proj-actions">
                    <button type="button" className="chip" onClick={() => onOpen(i)}>Open</button>
                    <button type="button" className="chip" onClick={() => { setRenaming(i.id); setRenameText(i.name) }}>Rename</button>
                    <button type="button" className="chip" onClick={() => download(`${i.name.replace(/[^\w.-]+/g, '_') || 'item'}.${fileExtension(i)}`, i.data)}>Download</button>
                    {confirm === i.id ? (
                      <>
                        <button type="button" className="chip" onClick={() => doDelete(i.id)}>Confirm delete</button>
                        <button type="button" className="chip" onClick={() => setConfirm(null)}>Keep</button>
                      </>
                    ) : (
                      <button type="button" className="chip" onClick={() => setConfirm(i.id)}>Delete</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {message && <p className="note" role="status">{message}</p>}
        </div>

        <div className="seq-block">
          <div className="seq-block-head"><h4>Add files</h4></div>
          <div className="tool-row seq-actions">
            <select aria-label="Which module the files belong to" value={importModule} onChange={(e) => setImportModule(e.target.value)} style={{ width: 'auto' }}>
              <option value="auto">Detect from the file</option>
              {OPENABLE_MODULES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <label className="chip file-chip">
              Add text files
              <input type="file" multiple accept=".fasta,.fa,.fna,.faa,.txt,.csv,.tsv,.sdf,.mol,.smi,.smiles" onChange={onFile} />
            </label>
          </div>
          <p className="note">Files are stored as text in this browser, up to 5 MB each. For structure files such as PDB, save the PDB ID from the Protein or Molecular Visualization tool instead.</p>
        </div>
      </div>

      <aside className="workspace-side tool-panel">
        <h4>Library</h4>
        <dl className="tool-info">
          <dt>Items</dt><dd>{items.length}</dd>
          <dt>Approx. size</dt><dd>{(usedBytes(items) / 1024).toFixed(1)} KB</dd>
        </dl>
        <div className="tool-row">
          <button type="button" className="chip" disabled={items.length === 0} onClick={() => download('bhaumik-nexus-backup.json', exportJson(items), 'application/json')}>
            Export backup
          </button>
          <button type="button" className="chip" onClick={() => backupInput.current?.click()}>Restore backup</button>
          <input ref={backupInput} type="file" accept=".json,application/json" hidden onChange={onBackup} />
        </div>
        <p className="note">
          Items live in this browser only. Clearing site data, using a private window or switching browsers loses them, so export a backup
          now and then. Nothing is uploaded anywhere.
        </p>
      </aside>
    </>
  )
}

export default ProjectsFiles
