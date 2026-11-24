import type { AiNotes, RepoGraph } from '../../../shared/types'
import type { GraphIndex } from './graph'
import { titleOf } from './graph'

export interface SearchHit {
  id: string
  kind: 'file' | 'function' | 'block'
  title: string
  detail: string
  score: number
}

/** Finds files, functions and blocks whose name, code, or AI note matches. */
export function search(graph: RepoGraph, index: GraphIndex, ai: AiNotes, query: string, limit = 40): SearchHit[] {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []
  const hits: SearchHit[] = []
  for (const [id, item] of index.items) {
    const title = titleOf(item, ai)
    let score = 0
    const t = title.toLowerCase()
    if (t === q) score = 100
    else if (t.startsWith(q)) score = 80
    else if (t.includes(q)) score = 60
    else {
      const extra =
        item.kind === 'block'
          ? `${item.block.label} ${ai.blocks[id]?.purpose ?? ''}`
          : item.kind === 'function'
            ? ai.functions[id] ?? ''
            : ''
      if (extra.toLowerCase().includes(q)) score = 30
    }
    if (!score) continue
    if (item.kind === 'file') score += 5
    if (item.kind === 'function') score += 3
    const detail =
      item.kind === 'file'
        ? `${item.file.functions.length} functions`
        : item.kind === 'function'
          ? item.file.path
          : `${item.fn.name} · ${item.file.path}`
    hits.push({ id, kind: item.kind, title, detail, score })
  }
  void graph
  return hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, limit)
}
