import { useState, type ReactNode } from 'react'
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Settings as SettingsIcon,
  Square,
  Sun,
  TriangleAlert
} from 'lucide-react'
import type { AiNotes, AiStatus, Progress, RepoGraph, Settings } from '../../../shared/types'
import type { LinkToggles } from '../layout/flow'
import type { SearchHit } from '../lib/search'
import type { Step } from '../lib/steps'
import { titleOf, type GraphIndex } from '../lib/graph'
import { Wordmark } from './Brand'

export type Level = 'files' | 'functions' | 'blocks'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  width: number
  loading: boolean
  progress: Progress | null
  error: string | null
  graph: RepoGraph | null
  index: GraphIndex | null
  settings: Settings | null
  dark: boolean
  onThemeToggle: () => void
  onSettings: () => void
  url: string
  onUrl: (u: string) => void
  onLoad: (url: string) => void
  onFolder: () => void
  // view
  level: Level | null
  onLevel: (l: Level) => void
  toggles: LinkToggles
  onToggles: (t: LinkToggles) => void
  // search
  query: string
  onQuery: (q: string) => void
  hits: SearchHit[]
  onPick: (id: string) => void
  // ai
  ai: AiNotes
  aiStatus: AiStatus | null
  onRunAi: () => void
  onCancelAi: () => void
  featureId: string | null
  onFeature: (id: string | null) => void
  // steps
  steps: Step[] | null
  stepIndex: number
  onStartSteps: () => void
  onStep: (delta: number) => void
  onStopSteps: () => void
  startLabel: string | null
  children?: ReactNode // code viewer
}

export function SidePanel(p: Props) {
  const [showWarnings, setShowWarnings] = useState(false)

  if (!p.open) {
    return (
      <aside className="panel panel-closed">
        <button className="icon-btn" title="Open side panel" aria-label="Open side panel" onClick={() => p.onOpenChange(true)}>
          <PanelLeftOpen size={18} />
        </button>
        <button className="icon-btn" title="Settings" aria-label="Settings" onClick={p.onSettings}>
          <SettingsIcon size={18} />
        </button>
      </aside>
    )
  }

  const submit = () => p.url.trim() && !p.loading && p.onLoad(p.url.trim())
  const g = p.graph
  const step = p.steps && p.steps[p.stepIndex]
  const stepItem = step && p.index?.items.get(step.id)
  const aiRunning = p.aiStatus?.state === 'running'
  const hasAi = Object.keys(p.ai.blocks).length > 0

  return (
    <aside className="panel" style={{ width: p.width }}>
      <div className="panel-top">
        <div className="brand">
          <Wordmark />
        </div>
        <div className="top-actions">
          <button className="icon-btn" title={p.dark ? 'Light theme' : 'Dark theme'} aria-label="Switch theme" onClick={p.onThemeToggle}>
            {p.dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button className="icon-btn" title="Settings" aria-label="Settings" onClick={p.onSettings}>
            <SettingsIcon size={16} />
          </button>
          <button className="icon-btn" title="Hide side panel" aria-label="Hide side panel" onClick={() => p.onOpenChange(false)}>
            <PanelLeftClose size={16} />
          </button>
        </div>
      </div>

      <div className="panel-scroll">
        {/* ---------- Open code ---------- */}
        <section className="panel-section">
          <h3 className="section-label">Open code
          </h3>
          <div className="url-row">
            <input
              id="repo-url"
              className="input"
              placeholder="https://github.com/owner/repo"
              value={p.url}
              onChange={(e) => p.onUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              spellCheck={false}
              disabled={p.loading}
            />
            <button className="btn btn-primary" onClick={submit} disabled={p.loading || !p.url.trim()} title="Map this repo">
              {p.loading ? <span className="spinner" /> : <ArrowRight size={16} />}
            </button>
          </div>
          <button className="btn btn-ghost" onClick={p.onFolder} disabled={p.loading}>
            <FolderOpen size={15} /> Open a folder on this computer
          </button>
          {p.loading && p.progress && (
            <div className="progress">
              <div className="progress-bar">
                <div
                  className={`progress-fill${p.progress.fraction == null ? ' indeterminate' : ''}`}
                  style={p.progress.fraction != null ? { width: `${Math.round(p.progress.fraction * 100)}%` } : undefined}
                />
              </div>
              <div className="muted small">{p.progress.message}</div>
            </div>
          )}
          {p.error && (
            <div className="error">
              <TriangleAlert size={15} />
              <span>{p.error}</span>
            </div>
          )}
          {!g && !p.loading && !p.error && <div className="muted small">Only .py files are read. The code is never run.</div>}
        </section>

        {g && p.index && (
          <>
            {/* ---------- Repo card ---------- */}
            <section className="panel-section">
              <div className="repo-card">
                <div className="repo-name">
                  {g.repo.url ? (
                    <a href={g.repo.url} target="_blank" rel="noreferrer">
                      {g.repo.owner}/{g.repo.name}
                    </a>
                  ) : (
                    <span title={g.repo.localPath}>
                      <FolderOpen size={13} /> {g.repo.name}
                    </span>
                  )}
                </div>
                <div className="muted small">
                  {plural(g.stats.files, 'file')} · {plural(g.stats.functions, 'function')}
                </div>
                {g.warnings.length > 0 && (
                  <>
                    <button className="link-btn" onClick={() => setShowWarnings(!showWarnings)}>
                      {showWarnings ? 'Hide' : 'Show'} {g.warnings.length} note{g.warnings.length > 1 ? 's' : ''} from the parser
                    </button>
                    {showWarnings && (
                      <ul className="warnings">
                        {g.warnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            </section>

            {/* ---------- Search ---------- */}
            <section className="panel-section">
              <h3 className="section-label">Search
              </h3>
              <input
                id="search"
                className="input"
                placeholder="File, function or step…"
                value={p.query}
                onChange={(e) => p.onQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && p.hits[0] && p.onPick(p.hits[0].id)}
                spellCheck={false}
              />
              {p.query.trim().length >= 2 && (
                <div className="hits">
                  {p.hits.length === 0 && <div className="muted small">Nothing matches “{p.query.trim()}”.</div>}
                  {p.hits.map((h) => (
                    <button key={h.id} className="hit" onClick={() => p.onPick(h.id)}>
                      <span className={`hit-kind hit-${h.kind}`}>{h.kind === 'function' ? 'ƒ' : h.kind === 'file' ? 'file' : 'step'}</span>
                      <span className="hit-text">
                        <span className="hit-title">{h.title}</span>
                        <span className="hit-detail">{h.detail}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* ---------- View ---------- */}
            <section className="panel-section">
              <h3 className="section-label">Zoom level
              </h3>
              <div className="segmented">
                {(['files', 'functions', 'blocks'] as const).map((l) => (
                  <button key={l} className={p.level === l ? 'on' : ''} onClick={() => p.onLevel(l)}>
                    {l === 'files' ? 'Files' : l === 'functions' ? 'Functions' : 'Blocks'}
                  </button>
                ))}
              </div>
              <h3 className="section-label">Links
              </h3>
              <Toggle on={p.toggles.import} onChange={(v) => p.onToggles({ ...p.toggles, import: v })} cls="import" label="Imports" count={g.stats.importLinks} />
              <Toggle on={p.toggles.call} onChange={(v) => p.onToggles({ ...p.toggles, call: v })} cls="call" label="Function calls" count={g.stats.callLinks} />
              <Toggle
                on={p.toggles.logical}
                onChange={(v) => p.onToggles({ ...p.toggles, logical: v })}
                cls="logical"
                label="AI-guessed features"
                count={p.ai.features.length}
                disabled={p.ai.features.length === 0}
              />
            </section>

            {/* ---------- AI ---------- */}
            <section className="panel-section">
              <h3 className="section-label">Claude notes
              </h3>
              {!p.settings?.hasApiKey ? (
                <div className="empty-mini">
                  <span>Add a Claude API key to get block names, hover notes and feature groups.</span>
                  <button className="btn" onClick={p.onSettings}>
                    <SettingsIcon size={14} /> Add API key
                  </button>
                </div>
              ) : aiRunning ? (
                <div className="progress">
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${p.aiStatus!.filesTotal ? Math.round((p.aiStatus!.filesDone / p.aiStatus!.filesTotal) * 100) : 5}%` }}
                    />
                  </div>
                  <div className="row-between">
                    <span className="muted small">{p.aiStatus!.message}</span>
                    <button className="link-btn" onClick={p.onCancelAi}>
                      Stop
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button id="explain" className="btn btn-accent" onClick={p.onRunAi}>
                    {hasAi ? 'Explain again' : 'Explain with Claude'}
                  </button>
                  {p.aiStatus && p.aiStatus.state !== 'idle' && (
                    <div className={p.aiStatus.state === 'error' ? 'error' : 'muted small'}>
                      {p.aiStatus.state === 'error' && <TriangleAlert size={15} />}
                      <span>{p.aiStatus.message}</span>
                    </div>
                  )}
                </>
              )}
              {p.ai.features.length > 0 && (
                <div className="features">
                  <div className="muted small">Features (AI-guessed). Click one to highlight it.</div>
                  {p.ai.features.map((f) => (
                    <button
                      key={f.id}
                      className={`feature${p.featureId === f.id ? ' on' : ''}`}
                      onClick={() => p.onFeature(p.featureId === f.id ? null : f.id)}
                      title={f.description}
                    >
                      <span className="feature-name">{f.name}</span>
                      <span className="feature-count">{f.functionIds.length}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* ---------- Step-through ---------- */}
            <section className="panel-section">
              <h3 className="section-label">Step through
              </h3>
              {!p.steps ? (
                <>
                  <button id="step-start" className="btn" onClick={p.onStartSteps} disabled={!p.startLabel}>
                    <Play size={14} /> Start from {p.startLabel ?? '…'}
                  </button>
                  <div className="muted small">Walks the blocks in the order they would run. Select a function first to start there.</div>
                </>
              ) : (
                <div className="stepper">
                  <div className="step-controls">
                    <button className="btn" onClick={() => p.onStep(-1)} disabled={p.stepIndex === 0} aria-label="Previous step">
                      <ChevronLeft size={16} />
                    </button>
                    <span className="step-count">
                      {p.stepIndex + 1} / {p.steps.length}
                    </span>
                    <button className="btn" onClick={() => p.onStep(1)} disabled={p.stepIndex >= p.steps.length - 1} aria-label="Next step">
                      <ChevronRight size={16} />
                    </button>
                    <button className="btn" onClick={p.onStopSteps} title="Stop" aria-label="Stop">
                      <Square size={13} />
                    </button>
                  </div>
                  {step && stepItem && (
                    <div className="step-info">
                      <div className="step-title">
                        {step.kind === 'enter' ? (step.via ? `Calls ${step.via} → enters` : 'Starts in') : 'Runs'}{' '}
                        <b>{titleOf(stepItem, p.ai)}</b>
                      </div>
                      <div className="muted small">
                        {step.depth > 0 && `${step.depth} call${step.depth > 1 ? 's' : ''} deep · `}
                        {stepItem.file.path}
                      </div>
                      {stepItem.kind === 'block' && p.ai.blocks[step.id] && <div className="step-note">{p.ai.blocks[step.id].purpose}</div>}
                      {stepItem.kind === 'function' && p.ai.functions[step.id] && <div className="step-note">{p.ai.functions[step.id]}</div>}
                    </div>
                  )}
                  <div className="muted small">Use ← → keys too. Branches are all shown in order, since the code is not run.</div>
                </div>
              )}
            </section>
          </>
        )}
      </div>
      {p.children}
    </aside>
  )
}

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`

function Toggle(props: { on: boolean; onChange: (v: boolean) => void; cls: string; label: string; count: number; disabled?: boolean }) {
  return (
    <label className={`toggle-row${props.disabled ? ' disabled' : ''}`}>
      <input type="checkbox" checked={props.on && !props.disabled} disabled={props.disabled} onChange={(e) => props.onChange(e.target.checked)} />
      <span className={`swatch swatch-${props.cls}`} />
      <span className="toggle-label">{props.label}</span>
      <span className="muted small">{props.count}</span>
    </label>
  )
}
