// Data shapes shared by the Node side (main) and the screen (renderer).
// Everything the parser finds ends up in one RepoGraph.

/** What kind of step a block is. */
export type BlockKind =
  | 'simple' // neighbouring plain lines (assignments, prints, returns...) merged together
  | 'if'
  | 'for'
  | 'while'
  | 'try'
  | 'with'
  | 'match'
  | 'branch' // one arm inside a container: "else", "except ValueError", "case 1"...
  | 'def' // a function or class defined inside another function

export interface Block {
  id: string
  kind: BlockKind
  /** Short text shown on the block. Phase 2 replaces this with an AI name. */
  label: string
  startLine: number // 1-based, inclusive
  endLine: number
  /** Inner blocks, for containers (if/for/while/try/with/match/branch). */
  children: Block[]
  /** Raw call targets written in this block, e.g. "helper", "self.save", "utils.load". */
  calls: string[]
}

export interface FunctionNode {
  id: string
  fileId: string
  /** "load" or "User.save" for methods. "(module code)" for top-level statements. */
  name: string
  className?: string
  params: string
  startLine: number
  endLine: number
  isModuleCode: boolean
  blocks: Block[]
}

export interface FileNode {
  id: string
  /** Path inside the repo, always with forward slashes. */
  path: string
  /** Python module name, e.g. "pkg.utils". */
  module: string
  lineCount: number
  functions: FunctionNode[]
  hasParseErrors: boolean
}

export type LinkKind = 'import' | 'call'

/** A "hard" link: found by the parser, not guessed. Drawn as a solid line. */
export interface Link {
  id: string
  kind: LinkKind
  /** import: file id -> file id. call: block id -> function id. */
  from: string
  to: string
  label: string
}

export interface RepoInfo {
  owner: string
  name: string
  ref: string
  url: string
}

export interface RepoGraph {
  repo: RepoInfo
  files: FileNode[]
  links: Link[]
  warnings: string[]
  stats: {
    files: number
    functions: number
    blocks: number
    importLinks: number
    callLinks: number
    skippedFiles: number
  }
}

export interface Progress {
  stage: 'download' | 'unzip' | 'parse' | 'link' | 'done'
  message: string
  /** 0..1 when known */
  fraction?: number
}

export type LoadResult = { ok: true; graph: RepoGraph } | { ok: false; error: string }

/** What the preload script exposes to the screen as window.api */
export interface CodeMapApi {
  loadRepo(url: string): Promise<LoadResult>
  onProgress(cb: (p: Progress) => void): () => void
  getSource(fileId: string): Promise<string | null>
}
