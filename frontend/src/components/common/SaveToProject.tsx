import { useState } from 'react'
import { addItem } from '../../services/projectStore.ts'

interface Props {
  module: string
  kind: string
  data: string
  defaultName: string
  disabled?: boolean
}

/** A small "Save to Projects" control for a module's toolbar. */
function SaveToProject({ module, kind, data, defaultName, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [msg, setMsg] = useState('')

  function save() {
    const r = addItem({ module, kind, data, name: name.trim() || defaultName || 'Untitled' })
    setMsg(r.ok ? 'Saved to Projects / Files.' : r.error)
    if (r.ok) {
      setOpen(false)
      setName('')
    }
  }

  if (!open) {
    return (
      <>
        <button type="button" className="chip" disabled={disabled || !data.trim()} onClick={() => { setOpen(true); setMsg('') }}>
          Save to Projects
        </button>
        {msg && <span className="note" role="status">{msg}</span>}
      </>
    )
  }
  return (
    <span className="tool-row">
      <input
        className="chem-input"
        style={{ maxWidth: 220 }}
        autoFocus
        value={name}
        placeholder={defaultName || 'Name'}
        aria-label="Name for the saved item"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setOpen(false) }}
      />
      <button type="button" className="chip" onClick={save}>Save</button>
      <button type="button" className="chip" onClick={() => setOpen(false)}>Cancel</button>
    </span>
  )
}

export default SaveToProject
