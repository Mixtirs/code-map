import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import type { AiNotes, AiStatus, Progress, RepoGraph, Settings } from '../../shared/types'
import type { LayoutResult } from './layout/compute'
import { LayoutClient } from './layout/client'
import type { LinkToggles, ViewState } from './layout/flow'
import { expandedForLevel, indexGraph, revealIn, titleOf } from './lib/graph'
import { search } from './lib/search'
import { buildSteps, findEntryPoint, type Step } from './lib/steps'
import { Diagram } from './components/Diagram'
import { SidePanel, type Level } from './components/SidePanel'
import { CodeViewer } from './components/CodeViewer'
import { SettingsDialog } from './components/SettingsDialog'
import { EmptyState, FirstMapTip } from './components/FirstRun'

const EMPTY_AI: AiNotes = { blocks: {}, functions: {}, features: [] }

// Small per-computer preferences (panel width, tips seen). Safe if storage is blocked.
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v)
    } catch {
      /* ignore */
    }
  }
}

function useSystemDark() {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const m = window.matchMedia('(prefers-color-scheme: dark)')
    const on = () => setDark(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return dark
}

type Focus = { id: string; key: number; waitLayout: boolean }

export default function App() {
  // ---- settings & theme ----
  const [settings, setSettings] = useState<Settings | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const systemDark = useSystemDark()
  const dark = settings?.theme === 'dark' || (settings?.theme !== 'light' && systemDark)
  useEffect(() => {
    window.api.getSettings().then(setSettings)
  }, [])
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }, [dark])
  const toggleTheme = async () => setSettings(await window.api.saveSettings({ theme: dark ? 'light' : 'dark' }))

  // ---- panel ----
  const [panelOpen, setPanelOpen] = useState(true)
  const [panelWidth, setPanelWidth] = useState(() => Number(store.get('codemap.panelWidth')) || 360)
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault()
    const move = (ev: MouseEvent) => setPanelWidth(Math.max(280, Math.min(ev.clientX, window.innerWidth * 0.55)))
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }
  useEffect(() => store.set('codemap.panelWidth', String(Math.round(panelWidth))), [panelWidth])

  // ---- repo ----
  const [url, setUrl] = useState('')
  const [graph, setGraph] = useState<RepoGraph | null>(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const index = useMemo(() => (graph ? indexGraph(graph) : null), [graph])
  const [tip, setTip] = useState(false)

  // ---- view ----
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const expandedRef = useRef(expanded)
  expandedRef.current = expanded
  const [level, setLevel] = useState<Level | null>('functions')
  const [layout, setLayout] = useState<LayoutResult | null>(null)
  const [layoutBusy, setLayoutBusy] = useState(false)
  const [toggles, setToggles] = useState<LinkToggles>({ import: true, call: true, logical: true })
  const [selected, setSelected] = useState<string | null>(null)
  const [featureId, setFeatureId] = useState<string | null>(null)
  const [fitKey, setFitKey] = useState(0)
  const [focus, setFocus] = useState<Focus | null>(null)
  const focusKey = useRef(0)

  // ---- search ----
  const [query, setQuery] = useState('')

  // ---- AI ----
  const [ai, setAi] = useState<AiNotes>(EMPTY_AI)
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null)

  // ---- steps ----
  const [steps, setSteps] = useState<Step[] | null>(null)
  const [stepIndex, setStepIndex] = useState(0)

  useEffect(() => window.api.onProgress(setProgress), [])
  useEffect(() => window.api.onAiStatus(setAiStatus), [])
  useEffect(
    () =>
      window.api.onAiNotes((n) =>
        setAi((prev) => ({
          blocks: n.blocks ? { ...prev.blocks, ...n.blocks } : prev.blocks,
          functions: n.functions ? { ...prev.functions, ...n.functions } : prev.functions,
          features: n.features ?? prev.features
        }))
      ),
    []
  )

  // ---- layout runs in a web worker ----
  const layoutClient = useRef<LayoutClient | null>(null)
  if (!layoutClient.current) layoutClient.current = new LayoutClient()
  useEffect(() => () => layoutClient.current?.dispose(), [])
  useEffect(() => {
    if (!graph) return
    let live = true
    setLayoutBusy(true)
    layoutClient.current!.layout(expanded).then((r) => {
      if (!live || !r) return
      setLayout(r)
      setLayoutBusy(false)
    })
    return () => {
      live = false
    }
  }, [graph, expanded])

  const showGraph = (g: RepoGraph) => {
    layoutClient.current!.setGraph(g)
    setSelected(null)
    setFeatureId(null)
    setSteps(null)
    setQuery('')
    setAi(EMPTY_AI)
    setAiStatus(null)
    setLayout(null)
    setLevel('functions')
    setExpanded(expandedForLevel(g, 'functions'))
    setGraph(g)
    setFitKey((k) => k + 1)
    if (!store.get('codemap.tipSeen')) setTip(true)
  }

  const load = useCallback(async (u: string) => {
    setUrl(u)
    setLoading(true)
    setError(null)
    setProgress({ stage: 'download', message: 'Starting…' })
    const res = await window.api.loadRepo(u)
    setLoading(false)
    if (!res.ok) return setError(res.error)
    showGraph(res.graph)
  }, [])

  const openFolder = useCallback(async () => {
    setError(null)
    setLoading(true)
    setProgress({ stage: 'unzip', message: 'Choose a folder…' })
    const res = await window.api.openFolder()
    setLoading(false)
    if (!res) return
    if (!res.ok) return setError(res.error)
    showGraph(res.graph)
  }, [])

  // Open or close a box. Opening also brings it into view at a readable size.
  const toggle = useCallback((id: string) => {
    setLevel(null)
    const opening = !expandedRef.current.has(id)
    const next = new Set(expandedRef.current)
    if (opening) next.add(id)
    else next.delete(id)
    setExpanded(next)
    if (opening) setFocus({ id, key: ++focusKey.current, waitLayout: true })
  }, [])

  const chooseLevel = (l: Level) => {
    if (!graph) return
    setLevel(l)
    setExpanded(expandedForLevel(graph, l))
    setFitKey((k) => k + 1)
  }

  /** Open everything above id, select it and move the view to it. */
  const reveal = useCallback(
    (id: string, select = true) => {
      if (!index) return
      const prev = expandedRef.current
      const next = revealIn(index, prev, id)
      const changed = next.size !== prev.size
      if (changed) {
        setLevel(null)
        setExpanded(next)
      }
      if (select) setSelected(id)
      setFocus({ id, key: ++focusKey.current, waitLayout: changed })
    },
    [index]
  )

  // ---- search results ----
  const hits = useMemo(() => (graph && index ? search(graph, index, ai, query) : []), [graph, index, ai, query])
  const hitSet = useMemo(() => new Set(query.trim().length >= 2 ? hits.map((h) => h.id) : []), [hits, query])

  // ---- step-through ----
  const startFn = useMemo(() => {
    if (!graph || !index) return null
    if (selected) {
      const it = index.items.get(selected)
      if (it && it.kind !== 'file') return it.fn.id
    }
    return findEntryPoint(graph)
  }, [graph, index, selected])
  const startSteps = () => {
    if (!index || !startFn) return
    const s = buildSteps(index, startFn)
    setSteps(s)
    setStepIndex(0)
    setFeatureId(null)
    reveal(s[0].id)
  }
  const moveStep = useCallback(
    (d: number) => {
      if (!steps) return
      const i = Math.max(0, Math.min(steps.length - 1, stepIndex + d))
      setStepIndex(i)
      reveal(steps[i].id)
    },
    [steps, stepIndex, reveal]
  )
  useEffect(() => {
    if (!steps) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, select, textarea')) return
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') moveStep(1)
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') moveStep(-1)
      else if (e.key === 'Escape') setSteps(null)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [steps, moveStep])

  // Ctrl/Cmd+F jumps to search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setPanelOpen(true)
        setTimeout(() => document.getElementById('search')?.focus(), 0)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const view: ViewState = useMemo(
    () => ({ selected, featureId, stepId: steps ? steps[stepIndex]?.id ?? null : null, hits: hitSet, toggles }),
    [selected, featureId, steps, stepIndex, hitSet, toggles]
  )

  const startItem = startFn && index?.items.get(startFn)

  return (
    <div className="app">
      <SidePanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        width={panelWidth}
        loading={loading}
        progress={progress}
        error={error}
        graph={graph}
        index={index}
        settings={settings}
        dark={dark}
        onThemeToggle={toggleTheme}
        onSettings={() => setSettingsOpen(true)}
        url={url}
        onUrl={setUrl}
        onLoad={load}
        onFolder={openFolder}
        level={level}
        onLevel={chooseLevel}
        onFit={() => setFitKey((k) => k + 1)}
        toggles={toggles}
        onToggles={setToggles}
        query={query}
        onQuery={setQuery}
        hits={hits}
        onPick={(id) => reveal(id)}
        ai={ai}
        aiStatus={aiStatus}
        onRunAi={() => window.api.runAi()}
        onCancelAi={() => window.api.cancelAi()}
        featureId={featureId}
        onFeature={(id) => {
          setFeatureId(id)
          setSelected(null)
          if (id) setToggles((t) => ({ ...t, logical: true }))
        }}
        steps={steps}
        stepIndex={stepIndex}
        onStartSteps={startSteps}
        onStep={moveStep}
        onStopSteps={() => setSteps(null)}
        startLabel={startItem ? titleOf(startItem, ai) : null}
      >
        {selected && index && <CodeViewer id={selected} index={index} ai={ai} onClose={() => setSelected(null)} />}
      </SidePanel>
      {panelOpen && <div className="panel-resizer" onMouseDown={startResize} title="Drag to resize" />}
      <main className="diagram">
        {graph && index ? (
          <ReactFlowProvider>
            <Diagram
              graph={graph}
              index={index}
              layout={layout}
              busy={layoutBusy}
              ai={ai}
              view={view}
              dark={dark}
              hasKey={!!settings?.hasApiKey}
              onSelect={(id) => {
                setSelected(id)
                if (id) setFeatureId(null)
              }}
              onToggle={toggle}
              fitKey={fitKey}
              focus={focus}
            />
            {tip && (
              <FirstMapTip
                onClose={() => {
                  setTip(false)
                  store.set('codemap.tipSeen', '1')
                }}
              />
            )}
          </ReactFlowProvider>
        ) : (
          <EmptyState onExample={load} onFolder={openFolder} />
        )}
      </main>
      {settingsOpen && settings && <SettingsDialog settings={settings} onSave={setSettings} onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
