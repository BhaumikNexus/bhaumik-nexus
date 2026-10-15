// A small local library of saved inputs ("project items"), kept in this browser's localStorage.
// Items are plain text, so they can be exported, backed up and re-imported as JSON.

export interface ProjectItem {
  id: string
  /** Module title the item belongs to, for example "DNA / RNA Sequence". */
  module: string
  /** What the data is within that module, for example "sequence", "groups", "curve". */
  kind: string
  name: string
  /** The saved input: sequence text, a SMILES string, a data table, a PDB ID, or JSON for multi-part inputs. */
  data: string
  created: number
}

export const OPENABLE_MODULES = [
  'DNA / RNA Sequence',
  'Chemical Structure',
  'Scientific Data',
  'Experiment Data',
  'Protein Structure',
  'Molecular Visualization',
] as const

const KEY = 'bhaumik-nexus.projects.v1'
const MAX_ITEMS = 500
const MAX_TEXT = 5 * 1024 * 1024

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

function isItem(v: unknown): v is ProjectItem {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return (
    typeof o.id === 'string' && o.id.length > 0 && o.id.length <= 100 &&
    typeof o.module === 'string' && (OPENABLE_MODULES as readonly string[]).includes(o.module) &&
    typeof o.kind === 'string' && o.kind.length <= 40 &&
    typeof o.name === 'string' && o.name.length <= 200 &&
    typeof o.data === 'string' && o.data.length <= MAX_TEXT &&
    typeof o.created === 'number' && Number.isFinite(o.created)
  )
}

export function loadItems(): ProjectItem[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isItem) : []
  } catch {
    return []
  }
}

function write(items: ProjectItem[]): Result<ProjectItem[]> {
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
    return { ok: true, value: items }
  } catch {
    return { ok: false, error: 'Could not save: the browser storage is full or blocked. Export your items and delete some.' }
  }
}

function newId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }
}

export function addItem(input: Omit<ProjectItem, 'id' | 'created'>): Result<ProjectItem> {
  const items = loadItems()
  if (items.length >= MAX_ITEMS) return { ok: false, error: `The library holds at most ${MAX_ITEMS} items.` }
  if (input.data.length > MAX_TEXT) return { ok: false, error: 'That input is larger than 5 MB.' }
  const item: ProjectItem = { ...input, name: input.name.slice(0, 200), id: newId(), created: Date.now() }
  const r = write([item, ...items])
  return r.ok ? { ok: true, value: item } : r
}

export function renameItem(id: string, name: string): Result<ProjectItem[]> {
  return write(loadItems().map((i) => (i.id === id ? { ...i, name: name.slice(0, 200) } : i)))
}

export function deleteItem(id: string): Result<ProjectItem[]> {
  return write(loadItems().filter((i) => i.id !== id))
}

export function exportJson(items: ProjectItem[]): string {
  return JSON.stringify({ app: 'bhaumik-nexus', version: 1, items }, null, 2)
}

/** Merges items from a backup file. Items with an id already present are skipped; malformed entries are counted. */
export function importJson(text: string): Result<{ added: number; skipped: number; items: ProjectItem[] }> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' }
  }
  const list = (parsed as { items?: unknown } | null)?.items
  if (!Array.isArray(list)) return { ok: false, error: 'This does not look like a Bhaumik Nexus backup.' }
  const current = loadItems()
  const have = new Set(current.map((i) => i.id))
  const fresh: ProjectItem[] = []
  let skipped = 0
  for (const v of list) {
    if (isItem(v) && !have.has(v.id) && current.length + fresh.length < MAX_ITEMS) {
      fresh.push(v)
      have.add(v.id)
    } else skipped++
  }
  const r = write([...fresh, ...current])
  return r.ok ? { ok: true, value: { added: fresh.length, skipped, items: r.value } } : r
}

/** Rough size of the library in bytes (characters, which is what browser storage counts). */
export function usedBytes(items: ProjectItem[]): number {
  return items.reduce((s, i) => s + i.data.length + i.name.length + 120, 0)
}

export function fileExtension(item: Pick<ProjectItem, 'module' | 'kind' | 'data'>): string {
  if (item.module === 'DNA / RNA Sequence') return item.data.trimStart().startsWith('>') ? 'fasta' : 'txt'
  if (item.module === 'Chemical Structure') return item.data.includes('M  END') ? 'sdf' : 'smi'
  if (item.module === 'Scientific Data' || item.module === 'Experiment Data') {
    if (item.data.trimStart().startsWith('{')) return 'json'
    return item.data.includes('\t') ? 'tsv' : 'csv'
  }
  return 'txt'
}
