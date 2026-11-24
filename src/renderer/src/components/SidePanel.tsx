import { useState } from 'react'
import type { Progress, RepoGraph } from '../../../shared/types'
import type { LinkToggles } from '../layout/build'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  loading: boolean
  progress: Progress | null
  error: string | null
  graph: RepoGraph | null
  toggles: LinkToggles
  onToggles: (t: LinkToggles) => void
  onLoad: (url: string) => void
  onExpandAll: () => void
  onCollapseAll: () => void
  onFit: () => void
}

const EXAMPLES = ['https://github.com/pallets/itsdangerous', 'https://github.com/psf/requests']

export function SidePanel(p: Props) {
  const [url, setUrl] = useState('')
  const [showWarnings, setShowWarnings] = useState(false)

  if (!p.open) {
    return (
      <aside className="panel panel-closed">
        <button className="icon-btn" title="Open side panel" onClick={() => p.onOpenChange(true)}>
          ☰
        </button>
      </aside>
    )
  }

  const submit = () => url.trim() && !p.loading && p.onLoad(url.trim())

  return (
    <aside className="panel">
      <div className="panel-top">
        <div className="brand">
          <span className="brand-mark">◆</span> Code Map
        </div>
        <button className="icon-btn" title="Close side panel" onClick={() => p.onOpenChange(false)}>
          ⟨
        </button>
      </div>

      <section className="panel-section">
        <label className="section-label" htmlFor="repo-url">
          GitHub repo
        </label>
        <div className="url-row">
          <input
            id="repo-url"
            className="input"
            placeholder="https://github.com/owner/repo"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            spellCheck={false}
            disabled={p.loading}
          />
          <button className="btn btn-primary" onClick={submit} disabled={p.loading || !url.trim()}>
            {p.loading ? '…' : 'Map it'}
          </button>
        </div>
        {!p.graph && !p.loading && (
          <div className="examples">
            Try:{' '}
            {EXAMPLES.map((e) => (
              <button key={e} className="link-btn" onClick={() => setUrl(e)}>
                {e.replace('https://github.com/', '')}
              </button>
            ))}
          </div>
        )}
        {p.loading && p.progress && (
          <div className="progress">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${Math.round((p.progress.fraction ?? 0.3) * 100)}%` }} />
            </div>
            <div className="muted">{p.progress.message}</div>
          </div>
        )}
        {p.error && <div className="error">{p.error}</div>}
        <div className="muted small">Only reads .py files. Your repo's code is never run.</div>
      </section>

      {p.graph && (
        <>
          <section className="panel-section">
            <div className="section-label">
              <a href={p.graph.repo.url} target="_blank" rel="noreferrer">
                {p.graph.repo.owner}/{p.graph.repo.name}
              </a>
            </div>
            <div className="stats">
              <Stat n={p.graph.stats.files} label="files" />
              <Stat n={p.graph.stats.functions} label="functions" />
              <Stat n={p.graph.stats.blocks} label="blocks" />
              <Stat n={p.graph.stats.importLinks + p.graph.stats.callLinks} label="links" />
            </div>
          </section>

          <section className="panel-section">
            <div className="section-label">Links</div>
            <Toggle
              on={p.toggles.import}
              onChange={(v) => p.onToggles({ ...p.toggles, import: v })}
              swatch="var(--link-import)"
              label="Imports"
              hint="file uses another file"
              count={p.graph.stats.importLinks}
            />
            <Toggle
              on={p.toggles.call}
              onChange={(v) => p.onToggles({ ...p.toggles, call: v })}
              swatch="var(--link-call)"
              label="Function calls"
              hint="block calls a function"
              count={p.graph.stats.callLinks}
            />
            <div className="toggle-row disabled" title="Coming in Phase 3">
              <span className="swatch dashed" />
              <span className="toggle-label">AI-guessed links</span>
              <span className="muted small">Phase 3</span>
            </div>
          </section>

          <section className="panel-section">
            <div className="section-label">View</div>
            <div className="btn-row">
              <button className="btn" onClick={p.onExpandAll}>
                Open functions
              </button>
              <button className="btn" onClick={p.onCollapseAll}>
                Files only
              </button>
              <button className="btn" onClick={p.onFit}>
                Fit
              </button>
            </div>
            <div className="muted small">Click ▸ to open a block. Click any box to highlight its links.</div>
          </section>

          {p.graph.warnings.length > 0 && (
            <section className="panel-section">
              <button className="link-btn" onClick={() => setShowWarnings(!showWarnings)}>
                {showWarnings ? '▾' : '▸'} {p.graph.warnings.length} note{p.graph.warnings.length > 1 ? 's' : ''}
              </button>
              {showWarnings && (
                <ul className="warnings">
                  {p.graph.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      <div className="panel-spacer" />
      <section className="panel-section panel-placeholder">
        <div className="section-label">Code viewer</div>
        <div className="muted small">Click-to-code arrives in Phase 2.</div>
      </section>
    </aside>
  )
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="stat">
      <div className="stat-n">{n.toLocaleString()}</div>
      <div className="stat-l">{label}</div>
    </div>
  )
}

function Toggle(props: { on: boolean; onChange: (v: boolean) => void; swatch: string; label: string; hint: string; count: number }) {
  return (
    <label className="toggle-row">
      <input type="checkbox" checked={props.on} onChange={(e) => props.onChange(e.target.checked)} />
      <span className="swatch" style={{ background: props.swatch }} />
      <span className="toggle-label" title={props.hint}>
        {props.label}
      </span>
      <span className="muted small">{props.count}</span>
    </label>
  )
}
