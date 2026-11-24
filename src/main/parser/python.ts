import { Parser, Language, type Node } from 'web-tree-sitter'
import type { Block, BlockKind, FileNode, FunctionNode } from '../../shared/types'

// ---------- Tree-sitter setup ----------

let parserPromise: Promise<Parser> | null = null

/** Loads Tree-sitter (WebAssembly) and the Python grammar once. */
export function getParser(wasmDir: string): Promise<Parser> {
  if (!parserPromise) {
    parserPromise = (async () => {
      await Parser.init({ locateFile: () => joinPath(wasmDir, 'tree-sitter.wasm') })
      const python = await Language.load(joinPath(wasmDir, 'tree-sitter-python.wasm'))
      const parser = new Parser()
      parser.setLanguage(python)
      return parser
    })()
  }
  return parserPromise
}

function joinPath(dir: string, file: string): string {
  return dir.replace(/[\\/]+$/, '') + '/' + file
}

// ---------- What one file looks like after parsing ----------

export interface ImportedName {
  name: string
  alias: string | null
}

export type ImportRecord =
  | { kind: 'import'; module: string; alias: string | null; line: number }
  | { kind: 'from'; module: string; level: number; names: ImportedName[]; wildcard: boolean; line: number }

export interface ParsedFile {
  file: FileNode
  imports: ImportRecord[]
  /** Top-level function name -> function id */
  topFunctions: Map<string, string>
  /** Class name -> (method name -> function id) */
  classes: Map<string, Map<string, string>>
}

// ---------- Helpers ----------

const CONTAINER_TYPES: Record<string, BlockKind> = {
  if_statement: 'if',
  for_statement: 'for',
  while_statement: 'while',
  try_statement: 'try',
  with_statement: 'with',
  match_statement: 'match'
}
const DEF_TYPES = new Set(['function_definition', 'class_definition', 'decorated_definition'])
const IGNORED_TYPES = new Set(['comment', 'pass_statement'])

const kids = (n: Node | null | undefined): Node[] => (n ? (n.namedChildren.filter(Boolean) as Node[]) : [])
const line = (n: Node) => n.startPosition.row + 1
const endLine = (n: Node) => {
  // A node ending at column 0 really ended on the line before.
  const r = n.endPosition.row
  return (n.endPosition.column === 0 && r > n.startPosition.row ? r : r + 1)
}
const firstLine = (n: Node) => n.text.split('\n')[0].trim()
const squash = (s: string) => s.replace(/\s+/g, ' ').trim()
const clip = (s: string, max = 70) => (s.length > max ? s.slice(0, max - 1) + '…' : s)

/** Unwraps @decorators so we see the def/class underneath. */
function unwrapDef(n: Node): Node {
  if (n.type === 'decorated_definition') return n.childForFieldName('definition') ?? n
  return n
}

function isDocstring(n: Node): boolean {
  return n.type === 'expression_statement' && kids(n).length === 1 && kids(n)[0].type === 'string'
}

/** Collects call targets ("foo", "self.bar", "mod.baz") written inside a node. */
function collectCalls(n: Node | null | undefined, out: Set<string>) {
  if (!n) return
  if (n.type === 'function_definition' || n.type === 'class_definition') return // own blocks
  if (n.type === 'call') {
    const fn = n.childForFieldName('function')
    if (fn && (fn.type === 'identifier' || fn.type === 'attribute')) {
      const text = fn.text.replace(/\s+/g, '')
      if (/^[A-Za-z_][\w.]*$/.test(text)) out.add(text)
    }
  }
  for (const c of kids(n)) collectCalls(c, out)
}

// ---------- Blocks ----------

class BlockBuilder {
  private counter = 0
  constructor(private filePath: string) {}

  private newId() {
    return `b:${this.filePath}:${this.counter++}`
  }

  /** Turns a list of statements into blocks, merging neighbouring simple lines. */
  build(statements: Node[]): Block[] {
    const blocks: Block[] = []
    let run: Node[] = []
    const flush = () => {
      if (run.length) blocks.push(this.simple(run))
      run = []
    }
    for (const st of statements) {
      if (IGNORED_TYPES.has(st.type)) continue
      if (CONTAINER_TYPES[st.type]) {
        flush()
        blocks.push(this.container(st))
      } else if (DEF_TYPES.has(st.type)) {
        flush()
        blocks.push(this.def(st))
      } else {
        run.push(st)
      }
    }
    flush()
    return blocks
  }

  private simple(nodes: Node[]): Block {
    const calls = new Set<string>()
    nodes.forEach((n) => collectCalls(n, calls))
    return {
      id: this.newId(),
      kind: 'simple',
      label: clip(squash(firstLine(nodes[0]))),
      startLine: line(nodes[0]),
      endLine: endLine(nodes[nodes.length - 1]),
      children: [],
      calls: [...calls]
    }
  }

  private def(n: Node): Block {
    const d = unwrapDef(n)
    const name = d.childForFieldName('name')?.text ?? '?'
    const word = d.type === 'class_definition' ? 'class' : 'def'
    return {
      id: this.newId(),
      kind: 'def',
      label: `${word} ${name}`,
      startLine: line(n),
      endLine: endLine(n),
      children: [],
      calls: []
    }
  }

  private branch(label: string, start: Node, body: Node | null, header?: Node | null): Block {
    const calls = new Set<string>()
    collectCalls(header, calls)
    return {
      id: this.newId(),
      kind: 'branch',
      label: clip(squash(label)),
      startLine: line(start),
      endLine: endLine(start),
      children: this.build(kids(body)),
      calls: [...calls]
    }
  }

  private container(n: Node): Block {
    const kind = CONTAINER_TYPES[n.type]
    const id = this.newId()
    const calls = new Set<string>()
    let children: Block[] = []

    switch (n.type) {
      case 'if_statement': {
        collectCalls(n.childForFieldName('condition'), calls)
        const arms: Block[] = []
        const cond = n.childForFieldName('condition')
        const consequence = n.childForFieldName('consequence')
        const alternatives = n.childrenForFieldName('alternative').filter(Boolean) as Node[]
        if (alternatives.length === 0) {
          children = this.build(kids(consequence))
        } else {
          // The "if" arm spans from the if keyword to the end of its body.
          arms.push({
            id: this.newId(),
            kind: 'branch',
            label: clip(squash(`if ${cond?.text ?? ''}`)),
            startLine: line(n),
            endLine: consequence ? endLine(consequence) : line(n),
            children: this.build(kids(consequence)),
            calls: []
          })
          for (const alt of alternatives) {
            if (alt.type === 'elif_clause') {
              const c = alt.childForFieldName('condition')
              arms.push(this.branch(`elif ${c?.text ?? ''}`, alt, alt.childForFieldName('consequence'), c))
            } else {
              arms.push(this.branch('else', alt, alt.childForFieldName('body')))
            }
          }
          children = arms
        }
        break
      }
      case 'for_statement':
      case 'while_statement': {
        collectCalls(n.childForFieldName(n.type === 'for_statement' ? 'right' : 'condition'), calls)
        children = this.build(kids(n.childForFieldName('body')))
        const alt = n.childForFieldName('alternative')
        if (alt) children.push(this.branch('else (loop ended without break)', alt, alt.childForFieldName('body')))
        break
      }
      case 'with_statement': {
        for (const c of kids(n)) if (c.type === 'with_clause') collectCalls(c, calls)
        children = this.build(kids(n.childForFieldName('body')))
        break
      }
      case 'try_statement': {
        const body = n.childForFieldName('body')
        children.push({
          id: this.newId(),
          kind: 'branch',
          label: 'try',
          startLine: line(n),
          endLine: body ? endLine(body) : line(n),
          children: this.build(kids(body)),
          calls: []
        })
        for (const c of kids(n)) {
          if (c === body || c.id === body?.id) continue
          if (c.type === 'except_clause' || c.type === 'except_group_clause') {
            const blockNode = kids(c).find((k) => k.type === 'block') ?? null
            const header = c.text.split(':')[0]
            children.push(this.branch(header, c, blockNode))
          } else if (c.type === 'else_clause') {
            children.push(this.branch('else (no error)', c, c.childForFieldName('body')))
          } else if (c.type === 'finally_clause') {
            const blockNode = kids(c).find((k) => k.type === 'block') ?? null
            children.push(this.branch('finally', c, blockNode))
          }
        }
        break
      }
      case 'match_statement': {
        collectCalls(n.childForFieldName('subject'), calls)
        const body = n.childForFieldName('body')
        for (const c of kids(body)) {
          if (c.type !== 'case_clause') continue
          const header = c.text.split('\n')[0].replace(/:\s*$/, '')
          children.push(this.branch(header, c, c.childForFieldName('consequence')))
        }
        break
      }
    }

    return {
      id,
      kind,
      label: clip(squash(firstLine(n).replace(/:\s*$/, ''))),
      startLine: line(n),
      endLine: endLine(n),
      children,
      calls: [...calls]
    }
  }
}

// ---------- Files ----------

export function moduleNameFor(path: string): string {
  const parts = path.replace(/\.py$/i, '').split('/')
  if (parts[parts.length - 1] === '__init__') parts.pop()
  if (parts.length > 1 && parts[0] === 'src') parts.shift()
  return parts.join('.')
}

function readAllImports(n: Node, out: ImportRecord[]) {
  if (n.type === 'import_statement') {
    for (const c of n.childrenForFieldName('name').filter(Boolean) as Node[]) {
      if (c.type === 'aliased_import') {
        out.push({ kind: 'import', module: c.childForFieldName('name')?.text ?? '', alias: c.childForFieldName('alias')?.text ?? null, line: line(n) })
      } else {
        out.push({ kind: 'import', module: c.text, alias: null, line: line(n) })
      }
    }
  } else if (n.type === 'import_from_statement') {
    const mod = n.childForFieldName('module_name')
    let module = ''
    let level = 0
    if (mod?.type === 'relative_import') {
      for (const c of mod.children.filter(Boolean) as Node[]) {
        if (c.type === 'import_prefix') level = c.text.length
        else if (c.type === 'dotted_name') module = c.text
      }
    } else if (mod) {
      module = mod.text
    }
    const names: ImportedName[] = []
    for (const c of n.childrenForFieldName('name').filter(Boolean) as Node[]) {
      if (c.type === 'aliased_import') {
        names.push({ name: c.childForFieldName('name')?.text ?? '', alias: c.childForFieldName('alias')?.text ?? null })
      } else {
        names.push({ name: c.text, alias: null })
      }
    }
    const wildcard = (n.children.filter(Boolean) as Node[]).some((c) => c.type === 'wildcard_import')
    out.push({ kind: 'from', module, level, names, wildcard, line: line(n) })
  }
}

/** Finds imports anywhere in the file (including inside functions and try/except). */
function findImports(n: Node, out: ImportRecord[]) {
  if (n.type === 'import_statement' || n.type === 'import_from_statement') {
    readAllImports(n, out)
    return
  }
  for (const c of kids(n)) findImports(c, out)
}

export function parsePythonFile(parser: Parser, path: string, text: string): ParsedFile {
  const tree = parser.parse(text)
  if (!tree) throw new Error(`Tree-sitter could not parse ${path}`)
  try {
    const root = tree.rootNode
    const fileId = `f:${path}`
    const builder = new BlockBuilder(path)
    const functions: FunctionNode[] = []
    const topFunctions = new Map<string, string>()
    const classes = new Map<string, Map<string, string>>()
    const moduleStatements: Node[] = []

    const addFunction = (defNode: Node, outer: Node, className?: string) => {
      const name = defNode.childForFieldName('name')?.text ?? '?'
      const qual = className ? `${className}.${name}` : name
      const id = `fn:${path}:${qual}:${line(outer)}`
      const body = kids(defNode.childForFieldName('body'))
      const statements = body.length && isDocstring(body[0]) ? body.slice(1) : body
      functions.push({
        id,
        fileId,
        name: qual,
        className,
        params: clip(squash(defNode.childForFieldName('parameters')?.text ?? '()'), 60),
        startLine: line(outer),
        endLine: endLine(outer),
        isModuleCode: false,
        blocks: builder.build(statements)
      })
      return { name, id }
    }

    const addClass = (classNode: Node, prefix?: string) => {
      const cname = (prefix ? prefix + '.' : '') + (classNode.childForFieldName('name')?.text ?? '?')
      const methods = new Map<string, string>()
      classes.set(cname, methods)
      for (const member of kids(classNode.childForFieldName('body'))) {
        const d = unwrapDef(member)
        if (d.type === 'function_definition') {
          const { name, id } = addFunction(d, member, cname)
          methods.set(name, id)
        } else if (d.type === 'class_definition') {
          addClass(d, cname)
        }
      }
    }

    const top = kids(root)
    top.forEach((st, i) => {
      const d = unwrapDef(st)
      if (d.type === 'function_definition') {
        const { name, id } = addFunction(d, st)
        topFunctions.set(name, id)
      } else if (d.type === 'class_definition') {
        addClass(d)
      } else if (st.type === 'import_statement' || st.type === 'import_from_statement' || st.type === 'future_import_statement') {
        // shown as import links instead
      } else if (i === 0 && isDocstring(st)) {
        // module docstring
      } else {
        moduleStatements.push(st)
      }
    })

    const moduleBlocks = builder.build(moduleStatements)
    if (moduleBlocks.length) {
      functions.unshift({
        id: `fn:${path}:(module code)`,
        fileId,
        name: '(module code)',
        params: '',
        startLine: moduleBlocks[0].startLine,
        endLine: moduleBlocks[moduleBlocks.length - 1].endLine,
        isModuleCode: true,
        blocks: moduleBlocks
      })
    }

    const imports: ImportRecord[] = []
    findImports(root, imports)

    return {
      file: {
        id: fileId,
        path,
        module: moduleNameFor(path),
        lineCount: text.split('\n').length,
        functions,
        hasParseErrors: root.hasError
      },
      imports,
      topFunctions,
      classes
    }
  } finally {
    tree.delete()
  }
}

/** Counts every block, including inner ones. */
export function countBlocks(blocks: Block[]): number {
  return blocks.reduce((n, b) => n + (b.kind === 'branch' ? 0 : 1) + countBlocks(b.children), 0)
}
