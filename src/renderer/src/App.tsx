import { useCallback, useEffect, useMemo, useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import type { Progress, RepoGraph } from '../../shared/types'
import { defaultExpanded, indexGraph, type LinkToggles } from './layout/build'
import { Diagram } from './components/Diagram'
import { SidePanel } from './components/SidePanel'

export default function App() {
  const [panelOpen, setPanelOpen] = useState(true)
  const [graph, setGraph] = useState<RepoGraph | null>(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [toggles, setToggles] = useState<LinkToggles>({ import: true, call: true })
  const [selected, setSelected] = useState<string | null>(null)
  const [fitKey, setFitKey] = useState(0)

  useEffect(() => window.api.onProgress(setProgress), [])

  const index = useMemo(() => (graph ? indexGraph(graph) : null), [graph])

  const load = useCallback(async (url: string) => {
    setLoading(true)
    setError(null)
    setProgress({ stage: 'download', message: 'Starting…' })
    const res = await window.api.loadRepo(url)
    setLoading(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setSelected(null)
    setExpanded(defaultExpanded(res.graph))
    setGraph(res.graph)
    setFitKey((k) => k + 1)
  }, [])

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const expandAllFunctions = () => {
    if (!graph) return
    const next = new Set(expanded)
    for (const f of graph.files) {
      next.add(f.id)
      for (const fn of f.functions) next.add(fn.id)
    }
    setExpanded(next)
    setFitKey((k) => k + 1)
  }
  const collapseAll = () => {
    setExpanded(new Set())
    setFitKey((k) => k + 1)
  }

  return (
    <div className="app">
      <SidePanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        loading={loading}
        progress={progress}
        error={error}
        graph={graph}
        toggles={toggles}
        onToggles={setToggles}
        onLoad={load}
        onExpandAll={expandAllFunctions}
        onCollapseAll={collapseAll}
        onFit={() => setFitKey((k) => k + 1)}
      />
      <main className="diagram">
        {graph && index ? (
          <ReactFlowProvider>
            <Diagram
              graph={graph}
              index={index}
              expanded={expanded}
              toggles={toggles}
              selected={selected}
              onSelect={setSelected}
              onToggle={toggle}
              fitKey={fitKey}
            />
          </ReactFlowProvider>
        ) : (
          <div className="empty">
            <div className="empty-mark">◆</div>
            <h1>See how a Python repo fits together</h1>
            <p>Paste a public GitHub link on the left. Each file becomes a box, each function a card, and each step inside it a block.</p>
          </div>
        )}
      </main>
    </div>
  )
}
