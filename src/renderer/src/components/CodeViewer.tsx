import { useEffect, useMemo, useRef, useState } from 'react'
import hljs from 'highlight.js/lib/core'
import python from 'highlight.js/lib/languages/python'
import { Sparkles, X } from 'lucide-react'
import type { AiNotes } from '../../../shared/types'
import { linesOf, titleOf, type GraphIndex } from '../lib/graph'

hljs.registerLanguage('python', python)

interface Props {
  id: string
  index: GraphIndex
  ai: AiNotes
  onClose: () => void
}

/** Shows the source file of the selected box, with its lines highlighted. */
export function CodeViewer({ id, index, ai, onClose }: Props) {
  const item = index.items.get(id)
  const fileId = item ? (item.kind === 'file' ? item.file.id : item.file.id) : null
  const [source, setSource] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let live = true
    setSource(null)
    if (fileId) window.api.getSource(fileId).then((s) => live && setSource(s))
    return () => {
      live = false
    }
  }, [fileId])

  const lines = useMemo(() => {
    if (source == null) return []
    return source.split('\n').map((l) => {
      try {
        return hljs.highlight(l, { language: 'python', ignoreIllegals: true }).value
      } catch {
        return l.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
      }
    })
  }, [source])

  const [from, to] = item ? linesOf(item) : [0, 0]
  const whole = item?.kind === 'file'

  useEffect(() => {
    if (!lines.length || !scroller.current) return
    const el = scroller.current.querySelector<HTMLElement>(`[data-line="${whole ? 1 : from}"]`)
    if (el) scroller.current.scrollTop = Math.max(0, el.offsetTop - 60)
  }, [lines, from, whole])

  if (!item) return null
  const note = item.kind === 'block' ? ai.blocks[id]?.purpose : item.kind === 'function' ? ai.functions[id] : null

  return (
    <div className="code-viewer">
      <div className="cv-head">
        <div className="cv-title-wrap">
          <div className="cv-title" title={titleOf(item, ai)}>
            {titleOf(item, ai)}
          </div>
          <div className="cv-path">
            {item.file.path}
            {!whole && ` · ${from === to ? `line ${from}` : `lines ${from}–${to}`}`}
          </div>
        </div>
        <button className="icon-btn" onClick={onClose} title="Close code" aria-label="Close code">
          <X size={16} />
        </button>
      </div>
      {note && (
        <div className="cv-note">
          <Sparkles size={12} /> {note}
        </div>
      )}
      <div className="cv-code" ref={scroller}>
        {source == null ? (
          <div className="muted small cv-loading">Loading…</div>
        ) : (
          <pre>
            {lines.map((html, i) => {
              const n = i + 1
              const on = !whole && n >= from && n <= to
              return (
                <div key={n} data-line={n} className={`cv-line${on ? ' cv-on' : ''}`}>
                  <span className="cv-num">{n}</span>
                  <span className="cv-text" dangerouslySetInnerHTML={{ __html: html || ' ' }} />
                </div>
              )
            })}
          </pre>
        )}
      </div>
    </div>
  )
}
