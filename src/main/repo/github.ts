import AdmZip from 'adm-zip'
import type { RepoInfo } from '../../shared/types'

// Limits so a huge repo can't freeze the app.
export const LIMITS = {
  maxZipBytes: 60 * 1024 * 1024, // 60 MB download
  maxPyFiles: 1500,
  maxFileBytes: 1024 * 1024, // skip single .py files over 1 MB (usually generated)
  maxTotalPyBytes: 25 * 1024 * 1024
}

// Folders that hold other people's code or build output, not the project itself.
const SKIP_DIRS = new Set([
  '.git',
  '__pycache__',
  'node_modules',
  'site-packages',
  'venv',
  '.venv',
  'env',
  '.env',
  '.tox',
  '.nox',
  '.eggs',
  'build',
  'dist',
  '.mypy_cache',
  '.pytest_cache'
])

/**
 * Accepts:
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo.git
 *   https://github.com/owner/repo/tree/some-branch
 *   github.com/owner/repo
 *   owner/repo
 */
export function parseGitHubUrl(input: string): RepoInfo {
  let s = input.trim()
  if (!s) throw new Error('Paste a GitHub repo URL first.')
  s = s.replace(/^git\+/, '').replace(/^https?:\/\//i, '').replace(/^www\./i, '')
  if (s.toLowerCase().startsWith('github.com/')) s = s.slice('github.com/'.length)
  s = s.split(/[?#]/)[0].replace(/\/+$/, '')
  const parts = s.split('/')
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    throw new Error('That does not look like a GitHub repo URL. Example: https://github.com/psf/requests')
  }
  const owner = parts[0]
  const name = parts[1].replace(/\.git$/i, '')
  const valid = /^[A-Za-z0-9_.-]+$/
  if (!valid.test(owner) || !valid.test(name)) throw new Error('The owner or repo name has characters GitHub does not allow.')
  let ref = 'HEAD'
  if (parts[2] === 'tree' && parts[3]) ref = parts.slice(3).join('/')
  return { owner, name, ref, url: `https://github.com/${owner}/${name}` }
}

export function zipUrl(repo: RepoInfo): string {
  const ref = repo.ref === 'HEAD' ? 'HEAD' : encodeURIComponent(repo.ref).replace(/%2F/g, '/')
  return `https://codeload.github.com/${repo.owner}/${repo.name}/zip/${ref}`
}

type FetchFn = (url: string) => Promise<Response>

/** Downloads the repo zip into memory, stopping early if it grows past the limit. */
export async function downloadZip(
  fetchFn: FetchFn,
  repo: RepoInfo,
  onProgress: (received: number, total: number | null) => void
): Promise<Buffer> {
  let res: Response
  try {
    res = await fetchFn(zipUrl(repo))
  } catch (e) {
    throw new Error(`Could not reach GitHub. Check your internet connection. (${(e as Error).message})`)
  }
  if (res.status === 404) {
    throw new Error(`GitHub says ${repo.owner}/${repo.name}${repo.ref !== 'HEAD' ? ` (branch ${repo.ref})` : ''} was not found. It may be private or misspelled.`)
  }
  if (!res.ok || !res.body) throw new Error(`GitHub download failed (HTTP ${res.status}).`)

  const totalHeader = Number(res.headers.get('content-length'))
  const total = Number.isFinite(totalHeader) && totalHeader > 0 ? totalHeader : null
  if (total && total > LIMITS.maxZipBytes) throw tooBig(total)

  const chunks: Uint8Array[] = []
  let received = 0
  const reader = res.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    if (received > LIMITS.maxZipBytes) {
      await reader.cancel()
      throw tooBig(received)
    }
    chunks.push(value)
    onProgress(received, total)
  }
  return Buffer.concat(chunks)
}

function tooBig(bytes: number): Error {
  return new Error(
    `This repo is too big for now (${(bytes / 1024 / 1024).toFixed(0)} MB+, limit ${LIMITS.maxZipBytes / 1024 / 1024} MB). Try a smaller one.`
  )
}

export interface SourceFile {
  path: string
  text: string
}

/**
 * Reads .py files straight out of the zip, in memory.
 * Nothing is written to disk and nothing is ever run.
 */
export function extractPythonFiles(zip: Buffer): { files: SourceFile[]; skipped: number; warnings: string[] } {
  const archive = new AdmZip(zip)
  const files: SourceFile[] = []
  const warnings: string[] = []
  let skipped = 0
  let totalBytes = 0

  const entries = archive
    .getEntries()
    .filter((e) => !e.isDirectory && e.entryName.toLowerCase().endsWith('.py'))
    .sort((a, b) => a.entryName.localeCompare(b.entryName))

  for (const entry of entries) {
    // GitHub zips wrap everything in "repo-branch/". Drop that first folder.
    const parts = entry.entryName.replace(/\\/g, '/').split('/').slice(1)
    if (parts.length === 0 || parts.some((p) => p === '..' || p === '')) {
      skipped++
      continue
    }
    if (parts.slice(0, -1).some((d) => SKIP_DIRS.has(d))) {
      skipped++
      continue
    }
    const size = entry.header.size
    if (size > LIMITS.maxFileBytes) {
      skipped++
      warnings.push(`Skipped ${parts.join('/')} (${(size / 1024).toFixed(0)} KB, too big to be hand-written).`)
      continue
    }
    if (files.length >= LIMITS.maxPyFiles || totalBytes + size > LIMITS.maxTotalPyBytes) {
      skipped++
      continue
    }
    totalBytes += size
    files.push({ path: parts.join('/'), text: entry.getData().toString('utf8') })
  }
  if (files.length >= LIMITS.maxPyFiles) warnings.push(`Only the first ${LIMITS.maxPyFiles} Python files were mapped.`)
  return { files, skipped, warnings }
}
