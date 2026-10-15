export {}

interface AtomInfo {
  chain: string
  resi: number
  resn: string
  hetflag: boolean
  elem?: string
}

interface Model3D {
  selectedAtoms(selection: object): AtomInfo[]
}

export interface Viewer3D {
  addModel(data: string, format: string): Model3D
  setStyle(selection: object, style: object): void
  setBackgroundColor(color: string): void
  addSurface(type: number, style: object, selection?: object): unknown
  removeAllSurfaces(): void
  pngURI(): string
  clear(): void
  zoomTo(): void
  render(): void
  resize(): void
  spin(on: boolean): void
}

declare global {
  interface Window {
    $3Dmol?: {
      createViewer(element: HTMLElement, config?: object): Viewer3D
      SurfaceType: { VDW: number }
    }
  }
}
