import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import { createHash } from 'crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { AiFeature, AiNotes, AiStatus, Block, FileNode, RepoGraph } from '../shared/types'

// Phase 2 + 3 AI pass:
//   1. one request per file: a short name + plain-English purpose for every block,
//      and a one-sentence summary per function;
//   2. one request for the whole repo: group functions into app features.
// Results are cached on disk, so opening the same repo again costs nothing.

const FileNotesSchema = z.object({
  functions: z.array(z.object({ ref: z.string(), summary: z.string() })),
  blocks: z.array(z.object({ ref: z.string(), name: z.string(), purpose: z.string() }))
})

const FeaturesSchema = z.object({
  features: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      function_refs: z.array(z.string())
    })
  )
})

const FILE_SYSTEM = `You help beginners understand real Python code.
You get one source file (with line numbers) and a list of numbered parts of it:
functions (F1, F2, ...) and blocks (B1, B2, ...). A block is one step inside a function:
a few simple lines, or an if / for / while / try / with / match and its branches.

For every function, write a one-sentence summary of what it does for the app.
For every block, write:
- name: 2 to 5 words, Title Case, saying what the step does (e.g. "Load Saved Todos", "Retry On Timeout"). No code, no function names in backticks.
- purpose: 1 or 2 short plain-English sentences a beginner understands, saying what the step does and why. Avoid jargon; if you must use a term, explain it.

Use every ref exactly once, exactly as given. Be accurate: describe what the code really does.`

const FEATURE_SYSTEM = `You group the functions of a Python project into the features of the app,
as a product person would describe them (e.g. "Sign in", "Save to disk", "Command-line interface").
Make 3 to 8 features. A function may be in at most one feature; leave out helpers that fit nowhere.
Each feature needs a short name (1-4 words) and a one-sentence description.
Use the function refs (F1, F2, ...) exactly as given.`

type Emit = (notes: Partial<AiNotes>) => void
type Status = (s: AiStatus) => void

export class AiRunner {
  private cancelled = false

  constructor(
    private apiKey: string,
    private model: string,
    private cacheDir: string
  ) {}

  cancel() {
    this.cancelled = true
  }

  private client() {
    return new Anthropic({ apiKey: this.apiKey, maxRetries: 3, timeout: 5 * 60 * 1000 })
  }

  private cacheGet<T>(key: string): T | null {
    try {
      return JSON.parse(readFileSync(join(this.cacheDir, key + '.json'), 'utf8')) as T
    } catch {
      return null
    }
  }

  private cachePut(key: string, value: unknown) {
    try {
      mkdirSync(this.cacheDir, { recursive: true })
      writeFileSync(join(this.cacheDir, key + '.json'), JSON.stringify(value))
    } catch {
      /* cache is optional */
    }
  }

  async run(graph: RepoGraph, sources: Map<string, string>, emit: Emit, status: Status): Promise<void> {
    const files = graph.files.filter((f) => f.functions.length > 0)
    const all: AiNotes = { blocks: {}, functions: {}, features: [] }
    let done = 0
    let failed = 0
    let lastError = ''
    const report = (state: AiStatus['state'], message: string) =>
      status({ state, message, filesDone: done, filesTotal: files.length })

    report('running', `Reading ${files.length} files with ${this.model}…`)

    // A few files at a time: fast, without hitting rate limits.
    const queue = [...files]
    const worker = async () => {
      for (let f = queue.shift(); f && !this.cancelled; f = queue.shift()) {
        try {
          const notes = await this.fileNotes(f, sources.get(f.id) ?? '')
          Object.assign(all.blocks, notes.blocks)
          Object.assign(all.functions, notes.functions)
          emit({ blocks: notes.blocks, functions: notes.functions })
        } catch (e) {
          failed++
          lastError = friendlyError(e)
          if (e instanceof Anthropic.AuthenticationError) {
            this.cancelled = true
          }
        }
        done++
        report('running', `Explained ${done} of ${files.length} files…`)
      }
    }
    await Promise.all([worker(), worker(), worker(), worker()])

    if (this.cancelled) {
      report(failed ? 'error' : 'idle', failed ? lastError : 'Stopped.')
      return
    }
    if (Object.keys(all.functions).length === 0) {
      report('error', lastError || 'Claude returned no notes.')
      return
    }

    report('running', 'Grouping functions into features…')
    try {
      all.features = await this.features(graph, all.functions)
      emit({ features: all.features })
    } catch (e) {
      failed++
      lastError = friendlyError(e)
    }
    report(
      failed ? 'error' : 'done',
      failed ? `Done, but ${failed} request${failed > 1 ? 's' : ''} failed: ${lastError}` : `Explained ${files.length} files and found ${all.features.length} features.`
    )
  }

  private async fileNotes(file: FileNode, source: string): Promise<Pick<AiNotes, 'blocks' | 'functions'>> {
    // Short refs (F1, B1...) keep the request small and the answer easy to match.
    const fnRefs = new Map<string, string>()
    const blockRefs = new Map<string, string>()
    const lines: string[] = []
    file.functions.forEach((fn, i) => {
      const ref = `F${i + 1}`
      fnRefs.set(ref, fn.id)
      lines.push(`${ref}: function ${fn.name} (lines ${fn.startLine}-${fn.endLine})`)
      const walk = (blocks: Block[], depth: number) => {
        for (const b of blocks) {
          const bref = `B${blockRefs.size + 1}`
          blockRefs.set(bref, b.id)
          lines.push(`${'  '.repeat(depth)}${bref}: ${b.kind} block, lines ${b.startLine}-${b.endLine}, in ${ref}: ${b.label}`)
          walk(b.children, depth + 1)
        }
      }
      walk(fn.blocks, 1)
    })

    const numbered = source
      .split('\n')
      .map((l, i) => `${String(i + 1).padStart(4)}| ${l}`)
      .join('\n')
    const prompt = `File: ${file.path}\n\n<source>\n${numbered}\n</source>\n\nParts to describe:\n${lines.join('\n')}`

    if (process.env['CODEMAP_FAKE_AI']) return fakeFileNotes(fnRefs, blockRefs, file)

    const key = 'file-' + hash(this.model, FILE_SYSTEM, prompt)
    const cached = this.cacheGet<Pick<AiNotes, 'blocks' | 'functions'>>(key)
    if (cached) return cached

    const res = await this.client().beta.messages.parse({
      model: this.model,
      max_tokens: 32000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: betaZodOutputFormat(FileNotesSchema) },
      system: FILE_SYSTEM,
      messages: [{ role: 'user', content: prompt }]
    })
    if (res.stop_reason === 'refusal') throw new Error(`Claude declined to describe ${file.path}.`)
    if (res.stop_reason === 'max_tokens') throw new Error(`${file.path} is too long to describe in one go.`)
    const out = res.parsed_output
    if (!out) throw new Error(`Claude's answer for ${file.path} could not be read.`)

    const result: Pick<AiNotes, 'blocks' | 'functions'> = { blocks: {}, functions: {} }
    for (const f of out.functions) {
      const id = fnRefs.get(f.ref.trim())
      if (id) result.functions[id] = f.summary.trim()
    }
    for (const b of out.blocks) {
      const id = blockRefs.get(b.ref.trim())
      if (id) result.blocks[id] = { name: b.name.trim(), purpose: b.purpose.trim() }
    }
    this.cachePut(key, result)
    return result
  }

  private async features(graph: RepoGraph, summaries: Record<string, string>): Promise<AiFeature[]> {
    const refs = new Map<string, string>()
    const lines: string[] = []
    for (const file of graph.files) {
      for (const fn of file.functions) {
        if (fn.isModuleCode && !summaries[fn.id]) continue
        const ref = `F${refs.size + 1}`
        refs.set(ref, fn.id)
        lines.push(`${ref}: ${file.path} :: ${fn.name} — ${summaries[fn.id] ?? '(no summary)'}`)
      }
    }
    // Very big repos: keep the request a sensible size.
    if (process.env['CODEMAP_FAKE_AI']) return fakeFeatures(graph)
    const listed = lines.slice(0, 1500)
    const prompt = `Project: ${graph.repo.owner}/${graph.repo.name}\n\nFunctions:\n${listed.join('\n')}`
    const key = 'features-' + hash(this.model, FEATURE_SYSTEM, prompt)
    const cached = this.cacheGet<AiFeature[]>(key)
    if (cached) return cached

    const res = await this.client().beta.messages.parse({
      model: this.model,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(FeaturesSchema) },
      system: FEATURE_SYSTEM,
      messages: [{ role: 'user', content: prompt }]
    })
    if (res.stop_reason === 'refusal') throw new Error('Claude declined to group the features.')
    const out = res.parsed_output
    if (!out) throw new Error("Claude's feature list could not be read.")
    const used = new Set<string>()
    const features: AiFeature[] = out.features
      .map((f, i) => ({
        id: `feature-${i + 1}`,
        name: f.name.trim(),
        description: f.description.trim(),
        functionIds: f.function_refs
          .map((r) => refs.get(r.trim()))
          .filter((id): id is string => !!id && !used.has(id) && (used.add(id), true))
      }))
      .filter((f) => f.functionIds.length > 0)
    this.cachePut(key, features)
    return features
  }
}

function hash(...parts: string[]): string {
  const h = createHash('sha256')
  for (const p of parts) h.update(p).update('\0')
  return h.digest('hex').slice(0, 32)
}

function friendlyError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'The API key was rejected. Check it in Settings.'
  if (e instanceof Anthropic.PermissionDeniedError) return 'This API key is not allowed to use that model.'
  if (e instanceof Anthropic.NotFoundError) return 'That model was not found. Pick another in Settings.'
  if (e instanceof Anthropic.RateLimitError) return 'Rate limit reached. Wait a minute and try again.'
  if (e instanceof Anthropic.APIConnectionError) return 'Could not reach the Claude API. Check your internet connection.'
  if (e instanceof Anthropic.APIError) return `Claude API error ${e.status ?? ''}: ${e.message}`
  return (e as Error)?.message ?? String(e)
}

// ---------- Test-only stand-ins (CODEMAP_FAKE_AI=1) ----------
// Lets the screens be tested without an API key or network. Never used otherwise.

function fakeFileNotes(fnRefs: Map<string, string>, blockRefs: Map<string, string>, file: FileNode) {
  const out: Pick<AiNotes, 'blocks' | 'functions'> = { blocks: {}, functions: {} }
  for (const id of fnRefs.values()) out.functions[id] = `Fake summary of ${id.split(':')[2]} in ${file.path}.`
  for (const id of blockRefs.values()) out.blocks[id] = { name: `Step ${id.split(':').pop()}`, purpose: 'A fake note used for testing the screen.' }
  return out
}

function fakeFeatures(graph: RepoGraph): AiFeature[] {
  const byDir = new Map<string, string[]>()
  for (const f of graph.files) {
    const dir = f.path.includes('/') ? f.path.split('/').slice(0, -1).join('/') : '(root)'
    for (const fn of f.functions) if (!fn.isModuleCode) byDir.set(dir, [...(byDir.get(dir) ?? []), fn.id])
  }
  return [...byDir.entries()].slice(0, 5).map(([dir, ids], i) => ({
    id: `feature-${i + 1}`,
    name: `Fake feature ${dir}`,
    description: 'Fake feature for testing.',
    functionIds: ids.slice(0, 6)
  }))
}
