import { readdir, readFile, stat } from 'fs/promises'
import { basename, join, relative } from 'path'
import { LIMITS, SKIP_DIRS, type SourceFile } from './github'

/**
 * Reads .py files from a folder on this computer, with the same limits as a
 * GitHub download. Files are only read, never run.
 */
export async function readPythonFolder(root: string): Promise<{ files: SourceFile[]; skipped: number; warnings: string[] }> {
  const files: SourceFile[] = []
  const warnings: string[] = []
  let skipped = 0
  let total = 0

  const walk = async (dir: string, depth: number) => {
    if (depth > 25) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return // no permission: skip quietly
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const e of entries) {
      if (files.length >= LIMITS.maxPyFiles) return
      const full = join(dir, e.name)
      if (e.isSymbolicLink()) continue
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue
        await walk(full, depth + 1)
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.py')) {
        const size = (await stat(full)).size
        const rel = relative(root, full).replace(/\\/g, '/')
        if (size > LIMITS.maxFileBytes) {
          skipped++
          warnings.push(`Skipped ${rel} (${(size / 1024).toFixed(0)} KB, too big to be hand-written).`)
          continue
        }
        if (total + size > LIMITS.maxTotalPyBytes) {
          skipped++
          continue
        }
        total += size
        files.push({ path: rel, text: await readFile(full, 'utf8') })
      }
    }
  }
  await walk(root, 0)
  if (files.length >= LIMITS.maxPyFiles) warnings.push(`Only the first ${LIMITS.maxPyFiles} Python files were mapped.`)
  return { files, skipped, warnings }
}

export const folderRepoInfo = (root: string) => ({
  owner: 'local',
  name: basename(root) || root,
  ref: '',
  url: '',
  localPath: root
})
