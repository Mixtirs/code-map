import ELK from 'elkjs/lib/elk.bundled.js'
import type { Block, RepoGraph } from '../../../shared/types'

// Pure geometry: where every visible box goes and how big it is.
// Runs inside a web worker so the screen never freezes on big repos.
//
// Inside a file everything is stacked by hand (blocks top-to-bottom in run
// order, functions in columns). ELK only arranges the files themselves,
// using the links between files, so connected files end up near each other.

export const SIZE = {
  blockW: 280,
  blockH: 36,
  pad: 10,
  gap: 8,
  header: 36,
  fnHeader: 48,
  fileHeader: 54,
  colGap: 28,
  fnCollapsedH: 52,
  collapsedFileW: 320,
  collapsedFileH: 66
}

export type BoxKind = 'file' | 'function' | 'block'

export interface Box {
  id: string
  kind: BoxKind
  parentId?: string
  /** position relative to the parent box (what React Flow wants) */
  x: number
  y: number
  /** absolute position on the canvas (for centring the view) */
  ax: number
  ay: number
  w: number
  h: number
  expanded: boolean
}

export interface LayoutResult {
  boxes: Box[]
}

const blockSize = (b: Block, expanded: Set<string>): { w: number; h: number } => {
  if (!expanded.has(b.id) || b.children.length === 0) return { w: SIZE.blockW, h: SIZE.blockH }
  const inner = stackSize(b.children, expanded)
  return { w: Math.max(SIZE.blockW, inner.w + SIZE.pad * 2), h: SIZE.header + inner.h + SIZE.pad }
}

const stackSize = (blocks: Block[], expanded: Set<string>) => {
  let h = 0
  let w = 0
  blocks.forEach((b, i) => {
    const s = blockSize(b, expanded)
    h += s.h + (i ? SIZE.gap : 0)
    w = Math.max(w, s.w)
  })
  return { w, h }
}

export async function computeLayout(graph: RepoGraph, expanded: Set<string>): Promise<LayoutResult> {
  const boxes: Box[] = []
  const fileSizes = new Map<string, { w: number; h: number }>()
  const fileChildren = new Map<string, Box[]>()

  const placeBlocks = (blocks: Block[], parentId: string, top: number, width: number, out: Box[]) => {
    let y = top
    for (const b of blocks) {
      const s = blockSize(b, expanded)
      const open = expanded.has(b.id) && b.children.length > 0
      out.push({ id: b.id, kind: 'block', parentId, x: SIZE.pad, y, ax: 0, ay: 0, w: width, h: s.h, expanded: open })
      if (open) placeBlocks(b.children, b.id, SIZE.header, width - SIZE.pad * 2, out)
      y += s.h + SIZE.gap
    }
  }

  for (const file of graph.files) {
    const fileOpen = expanded.has(file.id) && file.functions.length > 0
    if (!fileOpen) {
      fileSizes.set(file.id, { w: SIZE.collapsedFileW, h: SIZE.collapsedFileH })
      fileChildren.set(file.id, [])
      continue
    }
    const fns = file.functions.map((fn) => {
      const open = expanded.has(fn.id) && fn.blocks.length > 0
      let w = SIZE.blockW + SIZE.pad * 2
      let h = SIZE.fnCollapsedH
      if (open) {
        const s = stackSize(fn.blocks, expanded)
        w = Math.max(w, s.w + SIZE.pad * 2)
        h = SIZE.fnHeader + s.h + SIZE.pad
      }
      return { fn, open, w, h }
    })

    // Shortest-column-first, so a file stays roughly square.
    const cols = Math.min(4, Math.max(1, Math.round(Math.sqrt(fns.length / 2))))
    const colH = new Array(cols).fill(0)
    const colW = new Array(cols).fill(0)
    const colOf: number[] = []
    const yOf: number[] = []
    fns.forEach((f, i) => {
      const c = colH.indexOf(Math.min(...colH))
      colOf[i] = c
      yOf[i] = colH[c]
      colH[c] += f.h + SIZE.colGap / 2
      colW[c] = Math.max(colW[c], f.w)
    })
    const colX: number[] = []
    let x = SIZE.pad * 2
    for (let c = 0; c < cols; c++) {
      colX[c] = x
      x += colW[c] + SIZE.colGap
    }
    const kids: Box[] = []
    fns.forEach((f, i) => {
      const w = colW[colOf[i]]
      kids.push({
        id: f.fn.id,
        kind: 'function',
        parentId: file.id,
        x: colX[colOf[i]],
        y: SIZE.fileHeader + yOf[i],
        ax: 0,
        ay: 0,
        w,
        h: f.h,
        expanded: f.open
      })
      if (f.open) placeBlocks(f.fn.blocks, f.fn.id, SIZE.fnHeader, w - SIZE.pad * 2, kids)
    })
    fileSizes.set(file.id, {
      w: Math.max(SIZE.collapsedFileW, x - SIZE.colGap + SIZE.pad * 2),
      h: SIZE.fileHeader + Math.max(...colH) - SIZE.colGap / 2 + SIZE.pad * 2
    })
    fileChildren.set(file.id, kids)
  }

  // ---- Arrange files with ELK, using links between files ----
  const fileOf = new Map<string, string>()
  for (const file of graph.files) {
    fileOf.set(file.id, file.id)
    for (const fn of file.functions) {
      fileOf.set(fn.id, file.id)
      const walk = (bs: Block[]) => bs.forEach((b) => (fileOf.set(b.id, file.id), walk(b.children)))
      walk(fn.blocks)
    }
  }
  const fileEdges = new Map<string, { source: string; target: string }>()
  for (const link of graph.links) {
    const a = fileOf.get(link.from)
    const b = fileOf.get(link.to)
    if (a && b && a !== b) fileEdges.set(`${a}|${b}`, { source: a, target: b })
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

  const abs = new Map<string, { x: number; y: number }>()
  for (const file of graph.files) {
    const p = pos.get(file.id) ?? { x: 0, y: 0 }
    const s = fileSizes.get(file.id)!
    boxes.push({ id: file.id, kind: 'file', x: p.x, y: p.y, ax: p.x, ay: p.y, w: s.w, h: s.h, expanded: expanded.has(file.id) && file.functions.length > 0 })
    abs.set(file.id, p)
    for (const k of fileChildren.get(file.id)!) {
      const pa = abs.get(k.parentId!)!
      k.ax = pa.x + k.x
      k.ay = pa.y + k.y
      abs.set(k.id, { x: k.ax, y: k.ay })
      boxes.push(k)
    }
  }
  return { boxes }
}
