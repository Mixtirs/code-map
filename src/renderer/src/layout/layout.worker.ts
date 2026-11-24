/// <reference lib="webworker" />
import './worker-shim'
import { computeLayout } from './compute'
import type { RepoGraph } from '../../../shared/types'

// Layout runs here, off the main thread, so the window stays responsive.
let graph: RepoGraph | null = null

self.addEventListener('message', async (e: MessageEvent) => {
  const msg = e.data
  if (msg.type === 'graph') {
    graph = msg.graph
    return
  }
  if (msg.type === 'layout' && graph) {
    try {
      const result = await computeLayout(graph, new Set<string>(msg.expanded))
      ;(self as unknown as Worker).postMessage({ type: 'layout', reqId: msg.reqId, result })
    } catch (err) {
      ;(self as unknown as Worker).postMessage({ type: 'error', reqId: msg.reqId, error: String(err) })
    }
  }
})
