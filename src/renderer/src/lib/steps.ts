import type { Block, RepoGraph } from '../../../shared/types'
import type { GraphIndex } from './graph'

// Step-through mode: lists blocks in the order they would run, starting from
// an entry point, by reading the code only. Nothing is executed.
//
// When a block calls a function in this repo, we step into that function,
// then come back. Every branch of an if/try/match is shown in order, since we
// can't know which one would run without running the code.

export interface Step {
  id: string
  /** how many calls deep we are */
  depth: number
  /** function we are inside */
  fnId: string
  /** "enter" when stepping into a function, "block" for a step inside one */
  kind: 'enter' | 'block'
  /** the call that brought us here, for "enter" steps */
  via?: string
}

const MAX_STEPS = 400
const MAX_DEPTH = 4

export function buildSteps(index: GraphIndex, startFnId: string): Step[] {
  const steps: Step[] = []
  const stack: string[] = []

  const visitFn = (fnId: string, depth: number, via?: string) => {
    const item = index.items.get(fnId)
    if (!item || item.kind !== 'function' || steps.length >= MAX_STEPS) return
    stack.push(fnId)
    steps.push({ id: fnId, depth, fnId, kind: 'enter', via })
    for (const b of item.fn.blocks) visitBlock(b, fnId, depth)
    stack.pop()
  }

  const visitBlock = (b: Block, fnId: string, depth: number) => {
    if (steps.length >= MAX_STEPS) return
    steps.push({ id: b.id, depth, fnId, kind: 'block' })
    // Calls made by this block, in the order they are written.
    const calls = (index.out.get(b.id) ?? []).filter((l) => l.kind === 'call')
    for (const call of calls) {
      if (depth < MAX_DEPTH && !stack.includes(call.to)) visitFn(call.to, depth + 1, call.label)
    }
    for (const c of b.children) visitBlock(c, fnId, depth)
  }

  visitFn(startFnId, 0)
  return steps
}

/** Best guess at where the program starts. */
export function findEntryPoint(graph: RepoGraph): string | null {
  const moduleCode = graph.files.flatMap((f) => f.functions.filter((fn) => fn.isModuleCode).map((fn) => ({ f, fn })))
  const mainGuard = moduleCode.find(({ fn }) => fn.blocks.some((b) => b.kind === 'if' && /__name__\s*==\s*['"]__main__['"]/.test(b.label)))
  if (mainGuard) return mainGuard.fn.id
  const byName = moduleCode.find(({ f }) => /(^|\/)(__main__|main|app|cli|run|manage)\.py$/.test(f.path))
  if (byName) return byName.fn.id
  const mainFn = graph.files.flatMap((f) => f.functions).find((fn) => fn.name === 'main')
  if (mainFn) return mainFn.id
  return moduleCode[0]?.fn.id ?? graph.files.find((f) => f.functions.length)?.functions[0]?.id ?? null
}
