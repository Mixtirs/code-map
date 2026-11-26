import { useEffect, useMemo, useRef, useState } from 'react'
import { ReactFlow, Background, Controls, MiniMap, useReactFlow, useViewportStore, type Edge, type Node } from '@xyflow/react'
import type { AiNotes, RepoGraph } from '../../../shared/types'
import type { LayoutResult } from '../layout/compute'
import { buildFlow, type MapNodeData, type ViewState } from '../layout/flow'
import type { GraphIndex } from '../lib/graph'
import { nodeTypes, ToggleContext } from './MapNodes'
import { HoverCard } from './HoverCard'
import { Legend } from './Legend'

interface Props {
  graph: RepoGraph
  index: GraphIndex
  layout: LayoutResult | null
  busy: boolean
  ai: AiNotes
  view: ViewState
  dark: boolean
  hasKey: boolean
  onSelect: (id: string | null) => void
  onToggle: (id: string) => void
  /** Fit the whole map when this changes */
  fitKey: number
  /** Centre on this id when focusKey changes */
  focus: { id: string; key: number; waitLayout: boolean } | null
}

// Zoom buckets: labels change size and detail with zoom, so they stay readable.
const zoomClass = (z: number) => (z < 0.22 ? 'zoom-far' : z < 0.6 ? 'zoom-mid' : 'zoom-near')

export function Diagram(p: Props) {
  const flow = useReactFlow()
  const cache = useRef(new Map())
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null)
  const hoverTimer = useRef<number | null>(null)
  const wrapper = useRef<HTMLDivElement>(null)
  // Rounded so the screen only updates when the zoom changes noticeably.
  const z = useViewportStore((s) => Math.round(s.transform[2] * 20) / 20 || 0.05)
  const zoom = zoomClass(z)
  const inv = Math.min(10, Math.max(1, 0.8 / z))
  const lastFit = useRef(-1)
  const lastFocus = useRef(-1)

  const { nodes, edges } = useMemo<{ nodes: Node<MapNodeData>[]; edges: Edge[] }>(() => {
    if (!p.layout) return { nodes: [], edges: [] }
    return buildFlow(p.graph, p.index, p.layout, p.ai, p.view, cache.current)
  }, [p.graph, p.index, p.layout, p.ai, p.view])

  // New repo: forget cached nodes.
  useEffect(() => {
    cache.current = new Map()
  }, [p.graph])

  // Move the view: fit everything, or centre on one box. When the box was just
  // opened, wait for the new layout so we centre on where it really ends up.
  const focusLayout = useRef<{ key: number; layout: LayoutResult | null } | null>(null)
  // A fit asked for together with a new zoom level runs again once the new
  // layout arrives, so it fits the boxes that are really on screen.
  const fitPending = useRef<LayoutResult | null>(null)
  useEffect(() => {
    if (!p.layout) return
    const fit = () => requestAnimationFrame(() => flow.fitView({ padding: 0.08, duration: 350 }))
    if (lastFit.current !== p.fitKey) {
      lastFit.current = p.fitKey
      fitPending.current = p.layout
      if (p.focus) lastFocus.current = p.focus.key // a fit replaces any older "go to this box"
      fit()
      return
    }
    const newFocus = !!p.focus && lastFocus.current !== p.focus.key
    if (fitPending.current && !newFocus) {
      if (fitPending.current !== p.layout) {
        fitPending.current = null
        fit()
      }
      return
    }
    fitPending.current = null
    if (!p.focus || lastFocus.current === p.focus.key) return
    if (p.focus.waitLayout) {
      if (focusLayout.current?.key !== p.focus.key) {
        focusLayout.current = { key: p.focus.key, layout: p.layout }
        return
      }
      if (focusLayout.current.layout === p.layout) return
    }
    const box = p.layout.boxes.find((b) => b.id === p.focus!.id)
    if (!box) return
    lastFocus.current = p.focus.key
    const z = Math.max(flow.getZoom(), box.kind === 'file' ? 0.5 : 0.9)
    flow.setCenter(box.ax + Math.min(box.w, 600) / 2, box.ay + Math.min(box.h, 320) / 2, { zoom: Math.min(z, 1.4), duration: 450 })
  }, [p.layout, p.fitKey, p.focus, flow])

  const startHover = (id: string, e: React.MouseEvent) => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current)
    const rect = wrapper.current!.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    hoverTimer.current = window.setTimeout(() => setHover({ id, x, y }), 280)
  }
  const endHover = () => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current)
    setHover(null)
  }

  return (
    <ToggleContext.Provider value={p.onToggle}>
      <div ref={wrapper} className={`diagram-inner ${zoom}`} style={{ '--inv': inv } as React.CSSProperties}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={(_e, n) => p.onSelect(n.id)}
          onNodeDoubleClick={(_e, n) => (n.data as MapNodeData).expandable && p.onToggle(n.id)}
          onPaneClick={() => p.onSelect(null)}
          onNodeMouseEnter={(e, n) => startHover(n.id, e)}
          onNodeMouseMove={(e, n) => (hover?.id === n.id ? undefined : startHover(n.id, e))}
          onNodeMouseLeave={endHover}
          onMoveStart={endHover}
          nodesDraggable={false}
          nodesConnectable={false}
          edgesFocusable={false}
          elementsSelectable
          onlyRenderVisibleElements
          minZoom={0.03}
          maxZoom={2.5}
          proOptions={{ hideAttribution: true }}
          forceColorMode={p.dark ? 'dark' : 'light'}
        >
          <Background gap={24} size={1} />
          <Controls showInteractive={false} position="bottom-right" />
          <MiniMap
            pannable
            zoomable
            position="top-right"
            nodeColor={(n) => (n.type === 'file' ? 'var(--mini-file)' : n.type === 'function' ? 'var(--mini-fn)' : 'var(--mini-block)')}
            maskColor="var(--mini-mask)"
          />
        </ReactFlow>
        <Legend aiOn={p.ai.features.length > 0} />
        {hover && (
          <HoverCard id={hover.id} x={hover.x} y={hover.y} index={p.index} ai={p.ai} hasKey={p.hasKey} bounds={wrapper.current?.getBoundingClientRect()} />
        )}
        {p.busy && (
          <div className="diagram-busy">
            <span className="spinner" /> Laying out…
          </div>
        )}
      </div>
    </ToggleContext.Provider>
  )
}
