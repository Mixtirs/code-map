import { memo, useContext, createContext } from 'react'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { ChevronDown, ChevronRight, FileCode2 } from 'lucide-react'
import { AiTag } from './Brand'
import type { MapNodeData } from '../layout/flow'
import { KIND_META } from './kinds'

/** Lets nodes ask the app to expand or collapse them. */
export const ToggleContext = createContext<(id: string) => void>(() => {})

type MapNode = Node<MapNodeData>

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
  if (!data.expandable) return <span className="chevron-space" />
  return (
    <button
      className="chevron nodrag"
      title={data.expanded ? 'Close' : `Open (${data.childCount} inside)`}
      aria-label={data.expanded ? 'Close' : 'Open'}
      onClick={(e) => {
        e.stopPropagation()
        toggle(id)
      }}
    >
      {data.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
    </button>
  )
}

const cls = (data: MapNodeData, base: string) =>
  [
    base,
    data.state === 'highlight' ? 'is-highlight' : '',
    data.state === 'dim' ? 'is-dim' : '',
    data.step ? 'is-step' : '',
    data.hit ? 'is-hit' : '',
    data.expanded ? 'is-open' : 'is-closed'
  ]
    .filter(Boolean)
    .join(' ')

export const FileNodeView = memo(({ id, data }: NodeProps<MapNode>) => (
  <div className={cls(data, 'node node-file')}>
    <Handles vertical />
    <div className="node-head">
      <Chevron id={id} data={data} />
      <FileCode2 className="node-icon file-icon" size={18} />
      <div className="node-text">
        <div className="node-title lod-title" title={data.title}>
          {data.title}
          {data.hasParseErrors && (
            <span className="badge-warn" title="Some syntax was not understood">
              !
            </span>
          )}
        </div>
        <div className="node-sub lod-detail">{data.subtitle}</div>
      </div>
    </div>
  </div>
))

export const FunctionNodeView = memo(({ id, data }: NodeProps<MapNode>) => (
  <div className={cls(data, 'node node-function')}>
    <Handles />
    <div className="node-head">
      <Chevron id={id} data={data} />
      <span className="fn-icon">ƒ</span>
      <div className="node-text">
        <div className="node-title lod-title" title={data.title}>
          {data.title}
          {data.hasNote && <AiTag />}
        </div>
        <div className="node-sub lod-detail" title={data.subtitle}>
          {data.subtitle ? `${data.subtitle} · ` : ''}L{data.lines[0]}–{data.lines[1]}
        </div>
      </div>
      {!data.expanded && data.childCount > 0 && <span className="count lod-detail">{data.childCount}</span>}
    </div>
  </div>
))

export const BlockNodeView = memo(({ id, data }: NodeProps<MapNode>) => {
  const n = data.lines[1] - data.lines[0] + 1
  const meta = KIND_META[data.blockKind ?? 'simple']
  const Icon = meta.icon
  return (
    <div className={cls(data, `node node-block kind-${data.blockKind}${data.hasNote ? ' has-note' : ''}`)}>
      <Handles />
      <div className="block-row">
        <Chevron id={id} data={data} />
        <Icon className="block-icon" size={14} />
        <span className="block-label lod-title" title={data.code ?? data.title}>
          {data.title}
        </span>
        <span className="block-lines lod-detail">{n > 1 ? `${n} lines` : `L${data.lines[0]}`}</span>
      </div>
    </div>
  )
})

export const nodeTypes = { file: FileNodeView, function: FunctionNodeView, block: BlockNodeView }
