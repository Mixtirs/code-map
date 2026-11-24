import { memo, useContext, createContext } from 'react'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import type { MapNodeData } from '../layout/build'

/** Lets nodes ask the app to expand or collapse them. */
export const ToggleContext = createContext<(id: string) => void>(() => {})

type MapNode = Node<MapNodeData>

const KIND_ICON: Record<string, string> = {
  simple: '≡',
  if: '◇',
  for: '↻',
  while: '↻',
  try: '⚠',
  with: '⊡',
  match: '⋔',
  branch: '↳',
  def: 'ƒ'
}

// Files are stacked top to bottom, so their links leave from the bottom edge.
// Functions and blocks sit in columns, so their links use the sides.
function Handles({ vertical = false }: { vertical?: boolean }) {
  return (
    <>
      <Handle type="target" position={vertical ? Position.Top : Position.Left} className="handle" isConnectable={false} />
      <Handle type="source" position={vertical ? Position.Bottom : Position.Right} className="handle" isConnectable={false} />
    </>
  )
}

function Chevron({ id, data }: { id: string; data: MapNodeData }) {
  const toggle = useContext(ToggleContext)
  if (!data.expandable) return null
  return (
    <button
      className="chevron nodrag"
      title={data.expanded ? 'Collapse' : `Expand (${data.childCount} inside)`}
      onClick={(e) => {
        e.stopPropagation()
        toggle(id)
      }}
    >
      {data.expanded ? '▾' : '▸'}
    </button>
  )
}

const cls = (data: MapNodeData, base: string) =>
  [base, data.highlight ? 'is-highlight' : '', data.expanded ? 'is-open' : 'is-closed'].filter(Boolean).join(' ')

export const FileNodeView = memo(({ id, data }: NodeProps<MapNode>) => (
  <div className={cls(data, 'node node-file')}>
    <Handles vertical />
    <div className="node-head">
      <Chevron id={id} data={data} />
      <span className="node-icon">📄</span>
      <div className="node-text">
        <div className="node-title" title={data.title}>
          {data.title}
          {data.hasParseErrors && <span className="badge-warn" title="Some syntax was not understood">!</span>}
        </div>
        <div className="node-sub">{data.subtitle}</div>
      </div>
    </div>
  </div>
))

export const FunctionNodeView = memo(({ id, data }: NodeProps<MapNode>) => (
  <div className={cls(data, 'node node-function')}>
    <Handles />
    <div className="node-head">
      <Chevron id={id} data={data} />
      <span className="node-icon fn-icon">ƒ</span>
      <div className="node-text">
        <div className="node-title" title={`${data.title}${data.subtitle ?? ''}`}>
          {data.title}
        </div>
        <div className="node-sub" title={data.subtitle}>
          {data.subtitle} · L{data.lines[0]}–{data.lines[1]}
        </div>
      </div>
      {!data.expanded && data.childCount > 0 && <span className="count">{data.childCount}</span>}
    </div>
  </div>
))

export const BlockNodeView = memo(({ id, data }: NodeProps<MapNode>) => {
  const n = data.lines[1] - data.lines[0] + 1
  return (
    <div className={cls(data, `node node-block kind-${data.blockKind}`)}>
      <Handles />
      <div className="block-row">
        <Chevron id={id} data={data} />
        <span className="block-icon">{KIND_ICON[data.blockKind ?? 'simple']}</span>
        <span className="block-label" title={data.title}>
          {data.title}
        </span>
        <span className="block-lines" title={`Lines ${data.lines[0]}–${data.lines[1]}`}>
          {n > 1 ? `${n} lines` : `L${data.lines[0]}`}
        </span>
      </div>
    </div>
  )
})

export const nodeTypes = { file: FileNodeView, function: FunctionNodeView, block: BlockNodeView }
