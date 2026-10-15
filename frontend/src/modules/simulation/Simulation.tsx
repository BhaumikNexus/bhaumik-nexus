import { useState } from 'react'
import type { ProjectItem } from '../../services/projectStore.ts'
import KineticsTab from './KineticsTab.tsx'
import MdTab from './MdTab.tsx'
import PkTab from './PkTab.tsx'

type Tab = 'md' | 'kinetics' | 'pk'

function parseSaved(item?: ProjectItem | null): { tab: Tab; saved: unknown } {
  if (!item) return { tab: 'md', saved: undefined }
  let saved: unknown
  try {
    saved = JSON.parse(item.data)
  } catch {
    saved = undefined
  }
  return { tab: item.kind === 'kinetics' ? 'kinetics' : item.kind === 'pk' ? 'pk' : 'md', saved }
}

function Simulation({ initial }: { initial?: ProjectItem | null }) {
  const start = parseSaved(initial)
  const [tab, setTab] = useState<Tab>(start.tab)

  return (
    <div className="seq-main">
      <div className="tool-row seq-actions">
        <button type="button" className={`chip${tab === 'md' ? ' chip-active' : ''}`} onClick={() => setTab('md')}>Molecular dynamics</button>
        <button type="button" className={`chip${tab === 'kinetics' ? ' chip-active' : ''}`} onClick={() => setTab('kinetics')}>Reaction kinetics</button>
        <button type="button" className={`chip${tab === 'pk' ? ' chip-active' : ''}`} onClick={() => setTab('pk')}>Pharmacokinetics</button>
      </div>
      {tab === 'md' && <MdTab saved={start.tab === 'md' ? start.saved : undefined} />}
      {tab === 'kinetics' && <KineticsTab saved={start.tab === 'kinetics' ? start.saved : undefined} />}
      {tab === 'pk' && <PkTab saved={start.tab === 'pk' ? start.saved : undefined} />}
      <p className="note">Everything on this page is calculated in your browser from the numbers you enter; nothing is retrieved, predicted by AI, or uploaded.</p>
    </div>
  )
}

export default Simulation
