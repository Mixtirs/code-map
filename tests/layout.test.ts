import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import { mapSources } from '../src/main/pipeline'
import { computeLayout } from '../src/renderer/src/layout/compute'
import { expandedForLevel, indexGraph } from '../src/renderer/src/lib/graph'
import { buildSteps, findEntryPoint } from '../src/renderer/src/lib/steps'

function readPyTree(root: string) {
  const out: { path: string; text: string }[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (name.endsWith('.py')) out.push({ path: relative(root, full).replace(/\\/g, '/'), text: readFileSync(full, 'utf8') })
    }
  }
  walk(root)
  return out
}

const root = process.env.REAL_REPO ?? join(__dirname, '../samples/todo_app')

describe('layout', async () => {
  const { graph } = await mapSources({
    repo: { owner: 'local', name: 'x', ref: '', url: '' },
    files: readPyTree(root),
    skipped: 0,
    warnings: [],
    wasmDir: join(__dirname, '../resources'),
    onProgress: () => {}
  })
  const index = indexGraph(graph)

  it.each(['files', 'functions', 'blocks'] as const)('lays out the %s level', async (level) => {
    const r = await computeLayout(graph, expandedForLevel(graph, level))
    expect(r.boxes.length).toBeGreaterThan(0)
  })

  it('lays out with every container open', async () => {
    const all = new Set(index.items.keys())
    const t = Date.now()
    const r = await computeLayout(graph, all)
    console.log('all-open boxes', r.boxes.length, 'ms', Date.now() - t)
    expect(r.boxes.length).toBe(index.items.size)
  })

  it('builds step-through order from the entry point', () => {
    const entry = findEntryPoint(graph)!
    const steps = buildSteps(index, entry)
    expect(steps[0].kind).toBe('enter')
    expect(steps.length).toBeGreaterThan(1)
  })
})
