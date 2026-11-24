import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import { mapSources } from '../src/main/pipeline'
import { parseGitHubUrl } from '../src/main/repo/github'
import type { Block, RepoGraph } from '../src/shared/types'

const wasmDir = join(__dirname, '../resources')

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

async function mapFolder(root: string): Promise<RepoGraph> {
  const { graph } = await mapSources({
    repo: { owner: 'local', name: 'sample', ref: 'HEAD', url: '' },
    files: readPyTree(root),
    skipped: 0,
    warnings: [],
    wasmDir,
    onProgress: () => {}
  })
  return graph
}

const fn = (g: RepoGraph, path: string, name: string) =>
  g.files.find((f) => f.path === path)!.functions.find((x) => x.name === name)!

describe('GitHub URLs', () => {
  it('accepts common shapes', () => {
    expect(parseGitHubUrl('https://github.com/psf/requests')).toMatchObject({ owner: 'psf', name: 'requests', ref: 'HEAD' })
    expect(parseGitHubUrl('github.com/psf/requests.git')).toMatchObject({ name: 'requests' })
    expect(parseGitHubUrl('psf/requests/tree/v2.0')).toMatchObject({ ref: 'v2.0' })
    expect(() => parseGitHubUrl('hello')).toThrow()
  })
})

describe('sample to-do app', async () => {
  const g = await mapFolder(join(__dirname, '../samples/todo_app'))

  it('finds files and functions', () => {
    expect(g.files.map((f) => f.path).sort()).toEqual(['main.py', 'todo/__init__.py', 'todo/formatting.py', 'todo/store.py'])
    expect(fn(g, 'todo/store.py', 'TodoStore.load')).toBeTruthy()
    expect(fn(g, 'main.py', '(module code)').blocks[0].kind).toBe('if')
  })

  it('merges simple lines and nests if/elif/else', () => {
    const run = fn(g, 'main.py', 'run')
    expect(run.blocks.map((b) => b.kind)).toEqual(['simple', 'if', 'simple'])
    expect(run.blocks[0].startLine).toBe(8)
    expect(run.blocks[0].endLine).toBe(9)
    expect(run.blocks[1].children.map((b) => b.label)).toEqual(['if not args', 'elif args[0] == "add"', 'else'])
  })

  it('handles try/except/finally, with, for/else, while, match', () => {
    const load = fn(g, 'todo/store.py', 'TodoStore.load').blocks[0]
    expect(load.kind).toBe('try')
    expect(load.children.map((b) => b.label)).toEqual(['try', 'except FileNotFoundError', 'finally'])
    expect(load.children[0].children[0].kind).toBe('with')
    const add = fn(g, 'todo/store.py', 'TodoStore.add').blocks
    expect(add.map((b) => b.kind)).toEqual(['simple', 'for'])
    expect(add[1].children.map((b) => b.kind)).toEqual(['if', 'branch'])
    expect(fn(g, 'todo/formatting.py', 'clean').blocks.map((b) => b.kind)).toEqual(['simple', 'while', 'simple'])
    expect(fn(g, 'todo/formatting.py', 'describe').blocks[0].children.map((b: Block) => b.label)).toEqual(['case 0', 'case 1', 'case _'])
  })

  it('links imports and calls across files', () => {
    const imports = g.links.filter((l) => l.kind === 'import').map((l) => `${l.from} -> ${l.to}`).sort()
    expect(imports).toEqual([
      'f:main.py -> f:todo/formatting.py',
      'f:main.py -> f:todo/store.py',
      'f:todo/store.py -> f:todo/formatting.py'
    ])
    const calls = g.links.filter((l) => l.kind === 'call').map((l) => `${l.label} => ${l.to.split(':').slice(1, 3).join(':')}`).sort()
    expect(calls).toEqual([
      'TodoStore() => todo/store.py:TodoStore.__init__',
      'clean() => todo/formatting.py:clean',
      'formatting.render_list() => todo/formatting.py:render_list',
      'run() => main.py:run',
      'self._log() => todo/store.py:TodoStore._log', // from load()'s finally
      'self._log() => todo/store.py:TodoStore._log' // from save()
    ])
    // "store.add()" calls a method on a variable; we can't know its type without running code, so no link.
  })
})

const realRepo = process.env.REAL_REPO
describe.runIf(!!realRepo)('real repo', () => {
  it('maps without crashing', async () => {
    const g = await mapFolder(realRepo!)
    console.log(JSON.stringify(g.stats), g.warnings.slice(0, 5))
    expect(g.stats.files).toBeGreaterThan(0)
  })
})
