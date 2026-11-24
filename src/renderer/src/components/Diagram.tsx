import { useEffect, useRef, useState } from 'react'
import { ReactFlow, Background, Controls, MiniMap, useReactFlow, type Edge, type Node } from '@xyflow/react'
import type { RepoGraph } from '../../../shared/types'
import { buildLayout, type GraphIndex, type LinkToggles, type MapNodeData } from '../layout/build'
import { nodeTypes, ToggleContext } from './MapNodes'

interface Props {
  graph: RepoGraph
  index: GraphIndex
  expanded: Set<string>
  toggles: LinkToggles
  selected: string | null
  onSelect: (id: string | null) => void
  onToggle: (id: string) => void
  fitKey: number
}

export function Diagram({ graph, index, expanded, toggles, selected, onSelect, onToggle, fitKey }: Props) {
  const [nodes, setNodes] = useState<Node<MapNodeData>[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [busy, setBusy] = useState(false)
  const flow = useReactFlow()
  const lastFit = useRef(-1)

  useEffect(() => {
    let cancelled = false
    setBusy(true)
    buildLayout(graph, index, expanded, toggles, selected).then((r) => {
      if (cancelled) return
      setNodes(r.nodes)
      setEdges(r.edges)
      setBusy(false)
      if (lastFit.current !== fitKey) {
        lastFit.current = fitKey
        requestAnimationFrame(() => flow.fitView({ padding: 0.08, duration: 300 }))
      }
    })
    return () => {
      cancelled = true
    }
  }, [graph, index, expanded, toggles, selected, fitKey, flow])

  return (
    <ToggleContext.Provider value={onToggle}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_e, n) => onSelect(n.id === selected ? null : n.id)}
        onPaneClick={() => onSelect(null)}
        nodesDraggable={false}
        nodesConnectable={false}
        onlyRenderVisibleElements
        minZoom={0.05}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        forceColorMode="dark"
      >
        <Background gap={24} size={1} />
        <Controls showInteractive={false} position="bottom-right" />
        <MiniMap
          pannable
          zoomable
          position="top-right"
          nodeColor={(n) => (n.type === 'file' ? '#3a3936' : n.type === 'function' ? '#4a4945' : '#5b5a55')}
          maskColor="rgba(20,20,19,0.7)"
        />
      </ReactFlow>
      {busy && <div className="diagram-busy">Laying out…</div>}
    </ToggleContext.Provider>
  )
}
