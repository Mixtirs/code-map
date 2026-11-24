import type { RepoGraph } from '../../../shared/types'
import type { LayoutResult } from './compute'
import { computeLayout } from './compute'

// Talks to the layout worker. Only the newest request matters: older answers
// are dropped, so fast clicking never shows a stale layout.

export class LayoutClient {
  private worker: Worker | null = null
  private reqId = 0
  private pending = new Map<number, (r: LayoutResult) => void>()
  private graph: RepoGraph | null = null

  constructor() {
    try {
      this.worker = new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' })
      this.worker.onmessage = (e) => {
        const cb = this.pending.get(e.data.reqId)
        this.pending.delete(e.data.reqId)
        if (!cb) return
        if (e.data.type === 'layout') cb(e.data.result)
        else {
          console.error('Layout worker failed:', e.data.error)
          this.fallback(cb)
        }
      }
      this.worker.onerror = (e) => {
        // Worker could not start or crashed: finish on the main thread from now on.
        console.error('Layout worker error:', e.message)
        this.worker = null
        for (const [id, cb] of this.pending) {
          this.pending.delete(id)
          this.fallback(cb)
        }
      }
    } catch {
      this.worker = null
    }
  }

  private lastExpanded = new Set<string>()

  private fallback(cb: (r: LayoutResult) => void) {
    computeLayout(this.graph!, this.lastExpanded).then(cb)
  }

  setGraph(graph: RepoGraph) {
    this.graph = graph
    this.worker?.postMessage({ type: 'graph', graph })
  }

  /** Resolves with the layout, or null if a newer request replaced this one. */
  layout(expanded: Set<string>): Promise<LayoutResult | null> {
    const id = ++this.reqId
    this.lastExpanded = expanded
    if (!this.worker) return computeLayout(this.graph!, expanded).then((r) => (id === this.reqId ? r : null))
    return new Promise((resolve) => {
      for (const [old, cb] of this.pending) {
        this.pending.delete(old)
        ;(cb as unknown as (r: LayoutResult | null) => void)(null)
      }
      this.pending.set(id, resolve as (r: LayoutResult) => void)
      this.worker!.postMessage({ type: 'layout', reqId: id, expanded: [...expanded] })
    })
  }

  dispose() {
    this.worker?.terminate()
  }
}
