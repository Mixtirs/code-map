import { MarkerType, type Edge, type Node } from '@xyflow/react'
import type { AiNotes, BlockKind, RepoGraph } from '../../../shared/types'
import type { Box, LayoutResult } from './compute'
import { blockCount, chainOf, titleOf, type GraphIndex } from '../lib/graph'

// Turns a layout (boxes) plus what the user is doing (selection, feature,
// step) into React Flow nodes and edges. Cheap: runs on the main thread.

export interface MapNodeData extends Record<string, unknown> {
  kind: 'file' | 'function' | 'block'
  title: string
  /** the code itself, shown under an AI name */
  code?: string
  subtitle?: string
  blockKind?: BlockKind
  lines: [number, number]
  expandable: boolean
  expanded: boolean
  childCount: number
  hasParseErrors?: boolean
  hasNote?: boolean
  state: '' | 'highlight' | 'dim'
  step: boolean
  hit: boolean
}

export interface LinkToggles {
  import: boolean
  call: boolean
  logical: boolean
}

export interface ViewState {
  selected: string | null
  featureId: string | null
  stepId: string | null
  hits: Set<string>
  toggles: LinkToggles
}

type MapNode = Node<MapNodeData>

export function buildFlow(
  graph: RepoGraph,
  index: GraphIndex,
  layout: LayoutResult,
  ai: AiNotes,
  view: ViewState,
  cache: Map<string, { key: string; node: MapNode }>
): { nodes: MapNode[]; edges: Edge[] } {
  const onScreen = new Set(layout.boxes.map((b) => b.id))
  const boxOf = new Map(layout.boxes.map((b) => [b.id, b]))

  // Nearest box on screen for any id (its own box, or a collapsed parent's).
  const visibleOf = (id: string): string | null => {
    const chain = chainOf(index, id)
    for (let i = chain.length - 1; i >= 0; i--) {
      if (onScreen.has(chain[i])) {
        // Must be the first collapsed one from the top.
        for (let j = 0; j < i; j++) if (!boxOf.get(chain[j])?.expanded) return chain[j]
        return chain[i]
      }
    }
    return null
  }

  // ---- Edges ----
  type E = { kind: 'import' | 'call' | 'logical'; from: string; to: string; label: string; count: number; featureId?: string }
  const edgeMap = new Map<string, E>()
  const addEdge = (kind: E['kind'], fromId: string, toId: string, label: string, featureId?: string) => {
    const from = visibleOf(fromId)
    const to = visibleOf(toId)
    if (!from || !to || from === to) return
    const key = `${kind}|${from}|${to}|${featureId ?? ''}`
    const e = edgeMap.get(key)
    if (e) e.count++
    else edgeMap.set(key, { kind, from, to, label, count: 1, featureId })
  }
  for (const link of graph.links) if (view.toggles[link.kind]) addEdge(link.kind, link.from, link.to, link.label)
  if (view.toggles.logical) {
    for (const f of ai.features) {
      // Chain the feature's functions, ordered by file, so related code is tied together.
      const ids = [...f.functionIds].sort((a, b) => a.localeCompare(b))
      for (let i = 1; i < ids.length; i++) addEdge('logical', ids[i - 1], ids[i], f.name, f.id)
    }
  }

  // ---- What to emphasise ----
  const emphasis = new Set<string>()
  if (view.selected && onScreen.has(view.selected)) emphasis.add(view.selected)
  if (view.featureId) {
    const f = ai.features.find((x) => x.id === view.featureId)
    f?.functionIds.forEach((id) => {
      const v = visibleOf(id)
      if (v) emphasis.add(v)
    })
  }
  const focusOn = view.selected || view.featureId
  const edges: Edge[] = []
  for (const [key, e] of edgeMap) {
    const touches = view.selected ? e.from === view.selected || e.to === view.selected : !!view.featureId && e.featureId === view.featureId
    if (touches && view.selected) {
      emphasis.add(e.from)
      emphasis.add(e.to)
    }
    const color = e.kind === 'import' ? 'var(--link-import)' : e.kind === 'call' ? 'var(--link-call)' : 'var(--link-ai)'
    const showLabel = touches || (e.kind === 'logical' && !focusOn && view.toggles.logical && edgeMap.size < 60)
    const label =
      e.kind === 'logical' ? `AI-guessed · ${e.label}` : e.count > 1 ? `${e.label} ×${e.count}` : e.label
    edges.push({
      id: key,
      source: e.from,
      target: e.to,
      type: 'default',
      zIndex: touches ? 2000 : 1000,
      animated: touches && e.kind !== 'logical',
      label: showLabel ? label : undefined,
      className: `link link-${e.kind}${focusOn ? (touches ? ' link-selected' : ' link-dim') : ''}`,
      style: { stroke: color, strokeWidth: e.kind === 'import' ? 2.6 : e.kind === 'call' ? 1.2 : 1.6, strokeDasharray: e.kind === 'logical' ? '7 5' : undefined },
      markerEnd: e.kind === 'logical' ? undefined : { type: MarkerType.ArrowClosed, color, width: 16, height: 16 }
    })
  }

  // ---- Nodes ----
  const nodes: MapNode[] = []
  for (const box of layout.boxes) {
    const item = index.items.get(box.id)
    if (!item) continue
    const data = nodeData(box, item, ai)
    data.state = focusOn ? (emphasis.has(box.id) ? 'highlight' : 'dim') : ''
    data.step = view.stepId === box.id
    data.hit = view.hits.has(box.id)
    const key = JSON.stringify([box.x, box.y, box.w, box.h, data])
    const prev = cache.get(box.id)
    if (prev && prev.key === key) {
      nodes.push(prev.node)
      continue
    }
    const node: MapNode = {
      id: box.id,
      type: box.kind,
      position: { x: box.x, y: box.y },
      parentId: box.parentId,
      extent: box.parentId ? 'parent' : undefined,
      draggable: false,
      selectable: true,
      style: { width: box.w, height: box.h },
      width: box.w,
      height: box.h,
      data
    }
    cache.set(box.id, { key, node })
    nodes.push(node)
  }
  return { nodes, edges }
}

function nodeData(box: Box, item: NonNullable<ReturnType<GraphIndex['items']['get']>>, ai: AiNotes): MapNodeData {
  const base = { state: '' as const, step: false, hit: false, expanded: box.expanded }
  if (item.kind === 'file') {
    const fns = item.file.functions.filter((f) => !f.isModuleCode).length
    return {
      ...base,
      kind: 'file',
      title: item.file.path,
      subtitle: `${fns} function${fns === 1 ? '' : 's'} · ${item.file.lineCount} lines`,
      lines: [1, item.file.lineCount],
      expandable: item.file.functions.length > 0,
      childCount: item.file.functions.length,
      hasParseErrors: item.file.hasParseErrors
    }
  }
  if (item.kind === 'function') {
    const fn = item.fn
    return {
      ...base,
      kind: 'function',
      title: fn.name,
      subtitle: fn.isModuleCode ? 'runs when the file loads' : fn.params,
      lines: [fn.startLine, fn.endLine],
      expandable: fn.blocks.length > 0,
      childCount: blockCount(fn.blocks),
      hasNote: !!ai.functions[fn.id]
    }
  }
  const b = item.block
  const note = ai.blocks[b.id]
  return {
    ...base,
    kind: 'block',
    title: note?.name ?? b.label,
    code: note ? b.label : undefined,
    blockKind: b.kind,
    lines: [b.startLine, b.endLine],
    expandable: b.children.length > 0,
    childCount: blockCount(b.children),
    hasNote: !!note
  }
}

export { titleOf }
