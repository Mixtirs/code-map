import ELK from 'elkjs/lib/elk.bundled.js'
import { MarkerType, type Edge, type Node } from '@xyflow/react'
import type { Block, FileNode, FunctionNode, Link, RepoGraph } from '../../../shared/types'

// Turns a RepoGraph into React Flow nodes and edges.
//
// Inside a file everything is stacked by hand (blocks top-to-bottom in run
// order, functions in columns). ELK only arranges the files themselves,
// using the links between files, so connected files end up near each other.

export const SIZE = {
  blockW: 260,
  blockH: 34,
  pad: 10,
  gap: 8,
  header: 32,
  fnHeader: 44,
  fileHeader: 48,
  colGap: 24,
  collapsedFileW: 320,
  collapsedFileH: 64
}

export type NodeKind = 'file' | 'function' | 'block'

export interface MapNodeData extends Record<string, unknown> {
  kind: NodeKind
  title: string
  subtitle?: string
  blockKind?: Block['kind']
  lines: [number, number]
  expandable: boolean
  expanded: boolean
  childCount: number
  hasParseErrors?: boolean
  dim?: boolean
  highlight?: boolean
}

export interface LinkToggles {
  import: boolean
  call: boolean
}

interface Size {
  w: number
  h: number
}

type Item =
  | { kind: 'file'; file: FileNode }
  | { kind: 'function'; fn: FunctionNode; file: FileNode }
  | { kind: 'block'; block: Block; fn: FunctionNode; file: FileNode }

/** Parent lookup for every id, so a hidden node's links can attach to its nearest visible parent. */
export function indexGraph(graph: RepoGraph) {
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
  return { parent, items }
}

export type GraphIndex = ReturnType<typeof indexGraph>

/** Which ids start expanded: all files, and functions too unless the repo is big. */
export function defaultExpanded(graph: RepoGraph): Set<string> {
  const open = new Set<string>()
  const big = graph.stats.blocks > 400
  for (const f of graph.files) {
    open.add(f.id)
    if (!big) for (const fn of f.functions) open.add(fn.id)
  }
  return open
}

const blockCount = (blocks: Block[]): number => blocks.reduce((n, b) => n + 1 + blockCount(b.children), 0)

export async function buildLayout(
  graph: RepoGraph,
  index: GraphIndex,
  expanded: Set<string>,
  toggles: LinkToggles,
  selected: string | null
): Promise<{ nodes: Node<MapNodeData>[]; edges: Edge[] }> {
  const nodes: Node<MapNodeData>[] = []
  const visible = new Set<string>()

  // ---- Measure and place blocks inside a parent (stacked top to bottom) ----
  const placeBlocks = (blocks: Block[], parentId: string, top: number, left: number, out: Node<MapNodeData>[]): Size => {
    let y = top
    let maxW = 0
    const placed: { node: Node<MapNodeData>; size: Size }[] = []
    for (const b of blocks) {
      const isOpen = expanded.has(b.id) && b.children.length > 0
      const node: Node<MapNodeData> = {
        id: b.id,
        type: 'block',
        parentId,
        extent: 'parent',
        draggable: false,
        position: { x: left, y },
        data: {
          kind: 'block',
          title: b.label,
          blockKind: b.kind,
          lines: [b.startLine, b.endLine],
          expandable: b.children.length > 0,
          expanded: isOpen,
          childCount: blockCount(b.children)
        }
      }
      out.push(node)
      visible.add(b.id)
      let size: Size = { w: SIZE.blockW, h: SIZE.blockH }
      if (isOpen) {
        const inner = placeBlocks(b.children, b.id, SIZE.header, SIZE.pad, out)
        size = { w: Math.max(SIZE.blockW, inner.w + SIZE.pad * 2), h: SIZE.header + inner.h + SIZE.pad }
      }
      placed.push({ node, size })
      y += size.h + SIZE.gap
      maxW = Math.max(maxW, size.w)
    }
    // Same width for siblings so the stack reads as one column.
    for (const p of placed) p.node.style = { width: maxW, height: p.size.h }
    return { w: maxW, h: Math.max(0, y - top - SIZE.gap) }
  }

  // ---- Functions inside a file (shortest-column-first) ----
  const fileSizes = new Map<string, Size>()
  for (const file of graph.files) {
    const fileOpen = expanded.has(file.id)
    const fileNode: Node<MapNodeData> = {
      id: file.id,
      type: 'file',
      position: { x: 0, y: 0 },
      data: {
        kind: 'file',
        title: file.path,
        subtitle: `${file.functions.filter((f) => !f.isModuleCode).length} functions · ${file.lineCount} lines`,
        lines: [1, file.lineCount],
        expandable: file.functions.length > 0,
        expanded: fileOpen,
        childCount: file.functions.length,
        hasParseErrors: file.hasParseErrors
      }
    }
    nodes.push(fileNode)
    visible.add(file.id)

    if (!fileOpen || file.functions.length === 0) {
      fileSizes.set(file.id, { w: SIZE.collapsedFileW, h: SIZE.collapsedFileH })
      fileNode.style = { width: SIZE.collapsedFileW, height: SIZE.collapsedFileH }
      continue
    }

    const inner: { fnNode: Node<MapNodeData>; kids: Node<MapNodeData>[]; size: Size }[] = []
    for (const fn of file.functions) {
      const fnOpen = expanded.has(fn.id) && fn.blocks.length > 0
      const fnNode: Node<MapNodeData> = {
        id: fn.id,
        type: 'function',
        parentId: file.id,
        extent: 'parent',
        draggable: false,
        position: { x: 0, y: 0 },
        data: {
          kind: 'function',
          title: fn.name,
          subtitle: fn.isModuleCode ? 'runs when the file loads' : fn.params,
          lines: [fn.startLine, fn.endLine],
          expandable: fn.blocks.length > 0,
          expanded: fnOpen,
          childCount: blockCount(fn.blocks)
        }
      }
      visible.add(fn.id)
      const kids: Node<MapNodeData>[] = []
      let size: Size = { w: SIZE.blockW + SIZE.pad * 2, h: SIZE.fnHeader }
      if (fnOpen) {
        const s = placeBlocks(fn.blocks, fn.id, SIZE.fnHeader, SIZE.pad, kids)
        size = { w: Math.max(size.w, s.w + SIZE.pad * 2), h: SIZE.fnHeader + s.h + SIZE.pad }
      }
      fnNode.style = { width: size.w, height: size.h }
      inner.push({ fnNode, kids, size })
    }

    const cols = Math.min(4, Math.max(1, Math.round(Math.sqrt(inner.length / 2))))
    const colH = new Array(cols).fill(0)
    const colW = new Array(cols).fill(0)
    const colOf: number[] = []
    inner.forEach((it, i) => {
      const c = colH.indexOf(Math.min(...colH))
      colOf[i] = c
      it.fnNode.position = { x: 0, y: colH[c] } // x fixed below
      colH[c] += it.size.h + SIZE.colGap / 2
      colW[c] = Math.max(colW[c], it.size.w)
    })
    const colX: number[] = []
    let x = SIZE.pad * 2
    for (let c = 0; c < cols; c++) {
      colX[c] = x
      x += colW[c] + SIZE.colGap
    }
    inner.forEach((it, i) => {
      it.fnNode.position = { x: colX[colOf[i]], y: SIZE.fileHeader + it.fnNode.position.y }
      nodes.push(it.fnNode, ...it.kids)
    })
    const w = Math.max(SIZE.collapsedFileW, x - SIZE.colGap + SIZE.pad * 2)
    const h = SIZE.fileHeader + Math.max(...colH) - SIZE.colGap / 2 + SIZE.pad * 2
    fileSizes.set(file.id, { w, h })
    fileNode.style = { width: w, height: h }
  }

  // ---- Links: attach each end to its nearest visible node ----
  const visibleOf = (id: string): string | null => {
    // chain = [file, function, block, inner block, ..., self]
    const chain: string[] = []
    for (let cur: string | undefined = id; cur; cur = index.parent.get(cur)) chain.unshift(cur)
    // The first collapsed ancestor (from the top) is what's on screen.
    for (let i = 0; i < chain.length - 1; i++) if (!expanded.has(chain[i])) return chain[i]
    return visible.has(id) ? id : null
  }
  const fileOf = (id: string): string => {
    let cur = id
    while (index.parent.has(cur)) cur = index.parent.get(cur)!
    return cur
  }

  const edgeMap = new Map<string, { link: Link; from: string; to: string; count: number }>()
  for (const link of graph.links) {
    if (!toggles[link.kind]) continue
    const from = visibleOf(link.from)
    const to = visibleOf(link.to)
    if (!from || !to || from === to) continue
    const key = `${link.kind}|${from}|${to}`
    const e = edgeMap.get(key)
    if (e) e.count++
    else edgeMap.set(key, { link, from, to, count: 1 })
  }

  const touching = new Set<string>()
  const edges: Edge[] = [...edgeMap.entries()].map(([key, e]) => {
    const isSel = !!selected && (e.from === selected || e.to === selected)
    if (isSel) {
      touching.add(e.from)
      touching.add(e.to)
    }
    const color = e.link.kind === 'import' ? 'var(--link-import)' : 'var(--link-call)'
    return {
      id: key,
      source: e.from,
      target: e.to,
      type: 'default',
      zIndex: isSel ? 2000 : 1000,
      animated: isSel,
      label: isSel ? (e.count > 1 ? `${e.link.label} ×${e.count}` : e.link.label) : undefined,
      className: `link link-${e.link.kind}${selected ? (isSel ? ' link-selected' : ' link-dim') : ''}`,
      style: { stroke: color, strokeWidth: e.link.kind === 'import' ? 2 : 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 }
    }
  })

  if (selected) {
    for (const n of nodes) {
      n.data.highlight = n.id === selected || touching.has(n.id)
    }
  }

  // ---- Arrange files with ELK ----
  const fileEdges = new Map<string, { source: string; target: string }>()
  for (const link of graph.links) {
    const a = fileOf(link.from)
    const b = fileOf(link.to)
    if (a !== b) fileEdges.set(`${a}|${b}`, { source: a, target: b })
  }
  const elk = new ELK()
  const layout = await elk.layout({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.spacing.nodeNode': '60',
      'elk.layered.spacing.nodeNodeBetweenLayers': '120',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.separateConnectedComponents': 'true',
      'elk.spacing.componentComponent': '80'
    },
    children: graph.files.map((f) => ({ id: f.id, width: fileSizes.get(f.id)!.w, height: fileSizes.get(f.id)!.h })),
    edges: [...fileEdges.entries()].map(([id, e]) => ({ id, sources: [e.source], targets: [e.target] }))
  })
  const pos = new Map(layout.children?.map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]))
  for (const n of nodes) if (n.type === 'file') n.position = pos.get(n.id) ?? { x: 0, y: 0 }

  return { nodes, edges }
}
