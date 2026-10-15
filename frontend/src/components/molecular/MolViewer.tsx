import { useEffect, useRef, useState } from 'react'
import { loadViewerLibrary } from '../../services/structureService.ts'
import type { Viewer3D } from '../../types/3dmol.d.ts'

export type Representation = 'cartoon' | 'stick' | 'sphere' | 'line'
export type ColorMode = 'spectrum' | 'chain' | 'element' | 'ssPyMol'

export interface MolViewerProps {
  /** Structure text; empty shows the placeholder. */
  data: string
  /** 3Dmol format name: pdb, cif, sdf, mol2, xyz. */
  format: string
  representation: Representation
  colorMode: ColorMode
  surface: boolean
  showWater: boolean
  spin: boolean
  dark: boolean
  placeholder?: string
  onViewer?: (viewer: Viewer3D | null) => void
  onLoaded?: (info: { atoms: number }) => void
  onError?: (message: string) => void
}

function colorStyle(mode: ColorMode): object {
  if (mode === 'spectrum') return { color: 'spectrum' }
  if (mode === 'chain') return { colorscheme: 'chain' }
  if (mode === 'ssPyMol') return { colorscheme: 'ssPyMol' }
  return { colorscheme: 'Jmol' }
}

/** Reusable 3D structure viewer (3Dmol.js). Everything is drawn from the data passed in. */
function MolViewer(props: MolViewerProps) {
  const { data, format, representation, colorMode, surface, showWater, spin, dark } = props
  const { onViewer, onLoaded, onError } = props
  const box = useRef<HTMLDivElement>(null)
  const viewer = useRef<Viewer3D | null>(null)
  const [ready, setReady] = useState(false)
  const [atoms, setAtoms] = useState(0)

  // create the viewer once
  useEffect(() => {
    let cancelled = false
    loadViewerLibrary()
      .then(() => {
        if (cancelled || !box.current || !window.$3Dmol) return
        viewer.current = window.$3Dmol.createViewer(box.current, { backgroundColor: dark ? '#0b1220' : '#ffffff' })
        onViewer?.(viewer.current)
        setReady(true)
      })
      .catch((e: unknown) => onError?.(e instanceof Error ? e.message : 'Could not start the 3D viewer.'))
    return () => {
      cancelled = true
      viewer.current?.spin(false)
      viewer.current?.clear()
      viewer.current = null
      onViewer?.(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // load the structure
  useEffect(() => {
    const v = viewer.current
    if (!ready || !v) return
    v.clear()
    setAtoms(0)
    if (!data) {
      v.render()
      return
    }
    try {
      const model = v.addModel(data, format)
      const n = model.selectedAtoms({}).length
      if (n === 0) {
        onError?.('No atoms could be read from that file. Check that the format matches the file.')
        v.clear()
        v.render()
        return
      }
      setAtoms(n)
      onLoaded?.({ atoms: n })
      v.zoomTo()
    } catch {
      onError?.('That file could not be parsed. Check that the format matches the file.')
      v.clear()
    }
    v.render()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, data, format])

  // style, surface, background
  useEffect(() => {
    const v = viewer.current
    if (!ready || !v || !data || atoms === 0) return
    const color = colorStyle(colorMode)
    const rep = { [representation]: representation === 'cartoon' ? color : { ...color, ...(representation === 'sphere' ? { scale: 0.3 } : {}) } }
    v.setStyle({}, rep)
    if (representation === 'cartoon') v.setStyle({ hetflag: true }, { stick: { colorscheme: 'Jmol', radius: 0.18 } })
    v.setStyle({ resn: 'HOH' }, showWater ? { sphere: { radius: 0.25, color: '#ff4040' } } : {})
    v.removeAllSurfaces()
    if (surface && window.$3Dmol) {
      // the surface is built asynchronously, so redraw once it exists
      const pending = v.addSurface(window.$3Dmol.SurfaceType.VDW, { opacity: 0.65, color: 'white' }, { resn: 'HOH', invert: true })
      void Promise.resolve(pending).then(() => viewer.current?.render())
    }
    v.setBackgroundColor(dark ? '#0b1220' : '#ffffff')
    v.render()
  }, [ready, data, atoms, representation, colorMode, surface, showWater, dark])

  useEffect(() => {
    viewer.current?.spin(spin && Boolean(data))
  }, [spin, data, ready])

  return (
    <div className="workspace-viewer protein-viewer">
      <div ref={box} className="viewer-canvas" />
      {!data && (
        <div className="viewer-overlay">
          <div className="viewer-empty">
            <span className="viewer-icon">🔬</span>
            <p>{props.placeholder ?? 'Load a structure to see it here.'}</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default MolViewer
