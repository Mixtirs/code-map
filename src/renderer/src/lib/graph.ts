import type { AiNotes, Block, FileNode, FunctionNode, Link, RepoGraph } from '../../../shared/types'

// Lookups over a RepoGraph that the screen needs again and again.

export type Item =
  | { kind: 'file'; file: FileNode }
  | { kind: 'function'; fn: FunctionNode; file: FileNode }
  | { kind: 'block'; block: Block; fn: FunctionNode; file: FileNode }

export interface GraphIndex {
  parent: Map<string, string>
  items: Map<string, Item>
  /** links leaving each id (block -> function calls, file -> file imports) */
  out: Map<string, Link[]>
  /** links arriving at each id */
  incoming: Map<string, Link[]>
}

export function indexGraph(graph: RepoGraph): GraphIndex {
  const parent = new Map<string, string>()
  const items = new Map<string, Item>()
  for (const file of graph.files) {
    items.set(file.id, { kind: 'file', file })
    for (const fn of file.functions) {
      parent.set(fn.id, file.id)
      items.set(fn.id, { kind: 'function', fn, file })
      const walk = (blocks: Block[], owner: string) => {
        for (const b of blocks) {
          parent.set(b.id, owner)
          items.set(b.id, { kind: 'block', block: b, fn, file })
          walk(b.children, b.id)
        }
      }
      walk(fn.blocks, fn.id)
    }
  }
  const out = new Map<string, Link[]>()
  const incoming = new Map<string, Link[]>()
  for (const l of graph.links) {
    if (!out.has(l.from)) out.set(l.from, [])
    out.get(l.from)!.push(l)
    if (!incoming.has(l.to)) incoming.set(l.to, [])
    incoming.get(l.to)!.push(l)
  }
  return { parent, items, out, incoming }
}

/** [file, function, block, ..., id] */
export function chainOf(index: GraphIndex, id: string): string[] {
  const chain: string[] = []
  for (let cur: string | undefined = id; cur; cur = index.parent.get(cur)) chain.unshift(cur)
  return chain
}

export function fileIdOf(index: GraphIndex, id: string): string {
  return chainOf(index, id)[0]
}

/** Adds every ancestor of id to the expanded set, so id is on screen. */
export function revealIn(index: GraphIndex, expanded: Set<string>, id: string): Set<string> {
  const chain = chainOf(index, id)
  const next = new Set(expanded)
  chain.slice(0, -1).forEach((c) => next.add(c))
  return next
}

export function titleOf(item: Item, ai: AiNotes): string {
  if (item.kind === 'file') return item.file.path
  if (item.kind === 'function') return item.fn.name
  return ai.blocks[item.block.id]?.name ?? item.block.label
}

/** Line range of an item, 1-based inclusive. */
export function linesOf(item: Item): [number, number] {
  if (item.kind === 'file') return [1, item.file.lineCount]
  if (item.kind === 'function') return [item.fn.startLine, item.fn.endLine]
  return [item.block.startLine, item.block.endLine]
}

export const blockCount = (blocks: Block[]): number => blocks.reduce((n, b) => n + 1 + blockCount(b.children), 0)

/** Ids to expand for each zoom level. */
export function expandedForLevel(graph: RepoGraph, level: 'files' | 'functions' | 'blocks'): Set<string> {
  const open = new Set<string>()
  if (level === 'files') return open
  for (const f of graph.files) {
    open.add(f.id)
    if (level === 'blocks') for (const fn of f.functions) open.add(fn.id)
  }
  return open
}
