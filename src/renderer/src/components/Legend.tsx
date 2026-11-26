import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { KIND_META, LEGEND } from './kinds'

/** Small key in the corner: what the colours and lines mean. */
export function Legend({ aiOn }: { aiOn: boolean }) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem('codemap.legend') !== 'closed'
    } catch {
      return true
    }
  })
  const toggle = () => {
    setOpen(!open)
    try {
      localStorage.setItem('codemap.legend', open ? 'closed' : 'open')
    } catch {
      /* ignore */
    }
  }
  return (
    <div className={`legend ${open ? '' : 'legend-closed'}`}>
      <button className="legend-head" onClick={toggle}>
        Legend {open ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
      </button>
      {open && (
        <div className="legend-body">
          {LEGEND.map((row) => {
            const Icon = KIND_META[row.kinds[0]].icon
            return (
              <div key={row.label} className="legend-row" title={row.hint}>
                <Icon className={`legend-icon kind-ink-${row.kinds[0]}`} size={13} />
                {row.label}
              </div>
            )
          })}
          <div className="legend-sep" />
          <div className="legend-row">
            <span className="legend-line line-import" /> Imports a file
          </div>
          <div className="legend-row">
            <span className="legend-line line-call" /> Calls a function
          </div>
          <div className={`legend-row ${aiOn ? '' : 'muted'}`}>
            <span className="legend-line dashed" /> AI-guessed feature
          </div>
        </div>
      )}
    </div>
  )
}
