import type { AiNotes } from '../../../shared/types'
import { linesOf, titleOf, type GraphIndex } from '../lib/graph'
import { KIND_META } from './kinds'
import { AiTag } from './Brand'

interface Props {
  id: string
  x: number
  y: number
  index: GraphIndex
  ai: AiNotes
  hasKey: boolean
  bounds?: DOMRect
}

/** The note that appears when you rest the mouse on a box. */
export function HoverCard({ id, x, y, index, ai, hasKey, bounds }: Props) {
  const item = index.items.get(id)
  if (!item) return null
  const [a, b] = linesOf(item)
  const title = titleOf(item, ai)
  let kind = 'File'
  let code: string | null = null
  let note: string | null = null
  if (item.kind === 'function') {
    kind = item.fn.isModuleCode ? 'Top-level code' : item.fn.className ? 'Method' : 'Function'
    note = ai.functions[id] ?? null
    code = item.fn.isModuleCode ? null : `def ${item.fn.name.split('.').pop()}${item.fn.params}`
  } else if (item.kind === 'block') {
    kind = KIND_META[item.block.kind].label
    note = ai.blocks[id]?.purpose ?? null
    code = item.block.label
  }
  const calls = (index.out.get(id) ?? []).filter((l) => l.kind === 'call').length
  const calledBy = (index.incoming.get(id) ?? []).filter((l) => l.kind === 'call').length
  const imports = (index.out.get(id) ?? []).filter((l) => l.kind === 'import').length
  const importedBy = (index.incoming.get(id) ?? []).filter((l) => l.kind === 'import').length

  // Keep the card inside the diagram.
  const w = 320
  const left = bounds && x + 16 + w > bounds.width ? x - w - 16 : x + 16
  const top = bounds && y + 180 > bounds.height ? Math.max(8, y - 170) : y + 16

  return (
    <div className="hover-card" style={{ left, top, width: w }} role="tooltip">
      <div className="hc-top">
        <span className={`hc-kind kind-chip-${item.kind === 'block' ? item.block.kind : item.kind}`}>{kind}</span>
        <span className="hc-lines">
          {item.kind === 'file' ? `${b} lines` : a === b ? `line ${a}` : `lines ${a}–${b}`}
        </span>
      </div>
      <div className="hc-title">{title}</div>
      {code && code !== title && <code className="hc-code">{code}</code>}
      {note ? (
        <p className="hc-note">
          <AiTag /> {note}
        </p>
      ) : (
        item.kind !== 'file' && (
          <p className="hc-note muted">
            {hasKey ? 'Press “Explain with Claude” for a plain-English note here.' : 'Add a Claude API key in Settings to get a plain-English note here.'}
          </p>
        )
      )}
      <div className="hc-meta">
        {item.kind === 'file' ? (
          <>
            <span>uses {imports} file{imports === 1 ? '' : 's'}</span>
            <span>used by {importedBy}</span>
          </>
        ) : (
          <>
            {item.kind === 'block' && <span>calls {calls} function{calls === 1 ? '' : 's'}</span>}
            {item.kind === 'function' && <span>called from {calledBy} place{calledBy === 1 ? '' : 's'}</span>}
          </>
        )}
        <span className="hc-hint">Click to see the code</span>
      </div>
    </div>
  )
}
