import type { Progress, RepoGraph, RepoInfo } from '../shared/types'
import { downloadZip, extractPythonFiles, parseGitHubUrl, type SourceFile } from './repo/github'
import { countBlocks, getParser, parsePythonFile, type ParsedFile } from './parser/python'
import { resolveLinks } from './links/resolve'

/**
 * The whole Phase 1 flow: URL -> zip -> .py files -> blocks -> hard links.
 * Kept free of Electron so it can be tested with plain Node.
 */
export async function mapRepo(opts: {
  url: string
  fetchFn: (url: string) => Promise<Response>
  wasmDir: string
  onProgress: (p: Progress) => void
}): Promise<{ graph: RepoGraph; sources: Map<string, string> }> {
  const repo = parseGitHubUrl(opts.url)
  opts.onProgress({ stage: 'download', message: `Downloading ${repo.owner}/${repo.name}…` })
  const zip = await downloadZip(opts.fetchFn, repo, (got, total) =>
    opts.onProgress({
      stage: 'download',
      message: `Downloading… ${(got / 1024 / 1024).toFixed(1)} MB`,
      fraction: total ? got / total : undefined
    })
  )
  opts.onProgress({ stage: 'unzip', message: 'Finding Python files…' })
  const { files, skipped, warnings } = extractPythonFiles(zip)
  return mapSources({ repo, files, skipped, warnings, wasmDir: opts.wasmDir, onProgress: opts.onProgress })
}

export async function mapSources(opts: {
  repo: RepoInfo
  files: SourceFile[]
  skipped: number
  warnings: string[]
  wasmDir: string
  onProgress: (p: Progress) => void
}): Promise<{ graph: RepoGraph; sources: Map<string, string> }> {
  const { repo, files, wasmDir, onProgress } = opts
  const warnings = [...opts.warnings]
  if (files.length === 0) throw new Error('No Python (.py) files found in this repo.')

  const parser = await getParser(wasmDir)
  const parsed: ParsedFile[] = []
  const sources = new Map<string, string>()
  for (let i = 0; i < files.length; i++) {
    const f = files[i]
    if (i % 20 === 0) onProgress({ stage: 'parse', message: `Reading code… ${i}/${files.length} files`, fraction: i / files.length })
    try {
      const p = parsePythonFile(parser, f.path, f.text)
      if (p.file.hasParseErrors) warnings.push(`${f.path} has syntax the parser did not fully understand (old Python 2 code?). Some blocks may be missing.`)
      parsed.push(p)
      sources.set(p.file.id, f.text)
    } catch (e) {
      warnings.push(`Could not read ${f.path}: ${(e as Error).message}`)
    }
    // Let progress messages reach the screen on big repos.
    if (i % 50 === 49) await new Promise((r) => setTimeout(r, 0))
  }

  onProgress({ stage: 'link', message: 'Connecting calls and imports…' })
  const { links } = resolveLinks(parsed)

  const fileNodes = parsed.map((p) => p.file)
  const graph: RepoGraph = {
    repo,
    files: fileNodes,
    links,
    warnings,
    stats: {
      files: fileNodes.length,
      functions: fileNodes.reduce((n, f) => n + f.functions.filter((fn) => !fn.isModuleCode).length, 0),
      blocks: fileNodes.reduce((n, f) => n + f.functions.reduce((m, fn) => m + countBlocks(fn.blocks), 0), 0),
      importLinks: links.filter((l) => l.kind === 'import').length,
      callLinks: links.filter((l) => l.kind === 'call').length,
      skippedFiles: opts.skipped
    }
  }
  onProgress({ stage: 'done', message: 'Done' })
  return { graph, sources }
}
