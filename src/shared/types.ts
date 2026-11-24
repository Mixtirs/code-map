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
  /** GitHub URL, or '' for a local folder */
  url: string
  /** Set when the code came from a folder on this computer */
  localPath?: string
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

// ---------- AI (Claude) ----------

export interface AiBlockNote {
  /** Short name shown on the block, e.g. "Load saved to-dos" */
  name: string
  /** 1-2 plain-English sentences, shown on hover */
  purpose: string
}

/** A group of functions that together make one feature of the app. AI-guessed. */
export interface AiFeature {
  id: string
  name: string
  description: string
  functionIds: string[]
}

export interface AiNotes {
  blocks: Record<string, AiBlockNote>
  /** Function id -> one-sentence summary */
  functions: Record<string, string>
  features: AiFeature[]
}

export interface AiStatus {
  state: 'idle' | 'running' | 'done' | 'error'
  message: string
  filesDone: number
  filesTotal: number
}

export const AI_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (best)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (faster)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (cheapest)' }
] as const

export interface Settings {
  hasApiKey: boolean
  /** true when the key comes from the ANTHROPIC_API_KEY environment variable */
  keyFromEnv: boolean
  model: string
  theme: 'system' | 'dark' | 'light'
}

/** What the preload script exposes to the screen as window.api */
export interface CodeMapApi {
  loadRepo(url: string): Promise<LoadResult>
  openFolder(): Promise<LoadResult | null>
  onProgress(cb: (p: Progress) => void): () => void
  getSource(fileId: string): Promise<string | null>
  getSettings(): Promise<Settings>
  saveSettings(s: { apiKey?: string | null; model?: string; theme?: Settings['theme'] }): Promise<Settings>
  /** Starts naming blocks and grouping features for the repo that is loaded now. */
  runAi(): Promise<void>
  cancelAi(): Promise<void>
  onAiNotes(cb: (notes: Partial<AiNotes>) => void): () => void
  onAiStatus(cb: (s: AiStatus) => void): () => void
}
