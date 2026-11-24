import type { Block, Link } from '../../shared/types'
import type { ParsedFile } from '../parser/python'

// Turns imports and calls into "hard" links between things in this repo.
// Calls to outside code (print, requests.get, os.path.join...) get no link.

type Binding = { type: 'module'; file: ParsedFile } | { type: 'symbol'; file: ParsedFile; symbol: string }

interface FileScope {
  bindings: Map<string, Binding>
  /** "a.b.c" -> file, from "import a.b.c" (so "a.b.c.func()" resolves) */
  dotted: Map<string, ParsedFile>
  star: ParsedFile[]
}

export function resolveLinks(files: ParsedFile[]): { links: Link[]; unresolvedImports: number } {
  const byModule = new Map<string, ParsedFile>()
  for (const f of files) if (!byModule.has(f.file.module)) byModule.set(f.file.module, f)

  // Module lookup: exact name first, then a unique file whose module ends with ".name"
  // (helps when the code lives in a sub-folder that is not on the import path).
  const suffixCache = new Map<string, ParsedFile | null>()
  const findModule = (name: string): ParsedFile | null => {
    if (!name) return null
    const exact = byModule.get(name)
    if (exact) return exact
    if (suffixCache.has(name)) return suffixCache.get(name)!
    const matches = files.filter((f) => f.file.module.endsWith('.' + name))
    const hit = matches.length === 1 ? matches[0] : null
    suffixCache.set(name, hit)
    return hit
  }

  const links: Link[] = []
  const seen = new Set<string>()
  const add = (kind: Link['kind'], from: string, to: string, label: string) => {
    const id = `${kind}:${from}->${to}`
    if (seen.has(id) || from === to && kind === 'import') return
    seen.add(id)
    links.push({ id, kind, from, to, label })
  }

  let unresolvedImports = 0
  const scopes = new Map<ParsedFile, FileScope>()

  for (const f of files) {
    const scope: FileScope = { bindings: new Map(), dotted: new Map(), star: [] }
    scopes.set(f, scope)
    const isPackage = /(^|\/)__init__\.py$/.test(f.file.path)
    const pkgParts = f.file.module.split('.').filter(Boolean)
    if (!isPackage) pkgParts.pop()

    for (const imp of f.imports) {
      if (imp.kind === 'import') {
        const target = findModule(imp.module)
        if (!target) {
          unresolvedImports++
          continue
        }
        add('import', f.file.id, target.file.id, `import ${imp.module}`)
        if (imp.alias) scope.bindings.set(imp.alias, { type: 'module', file: target })
        else {
          scope.dotted.set(imp.module, target)
          const first = imp.module.split('.')[0]
          const firstFile = findModule(first)
          if (firstFile && !scope.bindings.has(first)) scope.bindings.set(first, { type: 'module', file: firstFile })
        }
      } else {
        let base = imp.module
        if (imp.level > 0) {
          const parts = pkgParts.slice(0, Math.max(0, pkgParts.length - (imp.level - 1)))
          base = [...parts, ...(imp.module ? [imp.module] : [])].join('.')
        }
        const baseFile = findModule(base)
        let linked = false
        if (imp.wildcard && baseFile) {
          scope.star.push(baseFile)
          add('import', f.file.id, baseFile.file.id, `from ${'.'.repeat(imp.level)}${imp.module} import *`)
          linked = true
        }
        for (const { name, alias } of imp.names) {
          const local = alias ?? name
          const sub = findModule(base ? `${base}.${name}` : name)
          if (sub) {
            scope.bindings.set(local, { type: 'module', file: sub })
            add('import', f.file.id, sub.file.id, `from ${'.'.repeat(imp.level)}${imp.module} import ${name}`)
            linked = true
          } else if (baseFile) {
            scope.bindings.set(local, { type: 'symbol', file: baseFile, symbol: name })
            add('import', f.file.id, baseFile.file.id, `from ${'.'.repeat(imp.level)}${imp.module} import ${name}`)
            linked = true
          }
        }
        if (!linked) unresolvedImports++
      }
    }
  }

  // Looks up a name defined at the top of a file: a function, or a class (-> its __init__).
  const topLevel = (file: ParsedFile, name: string, depth = 0): string | null => {
    const fn = file.topFunctions.get(name)
    if (fn) return fn
    const cls = file.classes.get(name)
    if (cls) return cls.get('__init__') ?? null
    // Re-exported through that file's own imports (common in __init__.py)
    if (depth < 3) {
      const b = scopes.get(file)?.bindings.get(name)
      if (b?.type === 'symbol') return topLevel(b.file, b.symbol, depth + 1)
    }
    return null
  }

  const resolveCall = (file: ParsedFile, className: string | undefined, call: string): string | null => {
    const scope = scopes.get(file)!
    const parts = call.split('.')
    if (parts.length === 1) {
      const local = topLevel(file, call)
      if (local) return local
      const b = scope.bindings.get(call)
      if (b?.type === 'symbol') return topLevel(b.file, b.symbol)
      for (const s of scope.star) {
        const hit = topLevel(s, call)
        if (hit) return hit
      }
      return null
    }
    if ((parts[0] === 'self' || parts[0] === 'cls') && parts.length === 2 && className) {
      return file.classes.get(className)?.get(parts[1]) ?? null
    }
    // ClassName.method in the same file
    const localClass = file.classes.get(parts.slice(0, -1).join('.'))
    if (localClass) return localClass.get(parts[parts.length - 1]) ?? null
    // a.b.c.func  (from "import a.b.c")
    for (let i = parts.length - 1; i >= 1; i--) {
      const mod = scope.dotted.get(parts.slice(0, i).join('.'))
      if (mod && i === parts.length - 1) return topLevel(mod, parts[i])
    }
    const b = scope.bindings.get(parts[0])
    if (b?.type === 'module') {
      if (parts.length === 2) return topLevel(b.file, parts[1])
      if (parts.length === 3) {
        const cls = b.file.classes.get(parts[1])
        if (cls) return cls.get(parts[2]) ?? null
      }
    }
    if (b?.type === 'symbol' && parts.length === 2) {
      // Imported class: Thing.method
      const cls = b.file.classes.get(b.symbol)
      if (cls) return cls.get(parts[1]) ?? null
    }
    return null
  }

  for (const f of files) {
    for (const fn of f.file.functions) {
      const walk = (blocks: Block[]) => {
        for (const b of blocks) {
          for (const call of b.calls) {
            const target = resolveCall(f, fn.className, call)
            if (target) add('call', b.id, target, `${call}()`)
          }
          walk(b.children)
        }
      }
      walk(fn.blocks)
    }
  }

  return { links, unresolvedImports }
}
