import { app, BrowserWindow, dialog, ipcMain, net, shell, nativeTheme } from 'electron'
import { join } from 'path'
import { readFile } from 'fs/promises'
import { mapRepo, mapSources } from './pipeline'
import { readPythonFolder, folderRepoInfo } from './repo/local'
import { getApiKey, getSettings, saveSettings } from './settings'
import { AiRunner } from './ai'
import type { LoadResult, RepoGraph } from '../shared/types'

// Where the Tree-sitter .wasm files live: the repo's resources/ folder while
// developing, and the installed app's resources folder once packaged.
const wasmDir = app.isPackaged ? join(process.resourcesPath, 'wasm') : join(__dirname, '../../resources')

// The repo on screen now, kept for the code viewer and the AI pass.
let current: { graph: RepoGraph; sources: Map<string, string> } | null = null
let ai: AiRunner | null = null

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: 'Foothold',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#2b3040' : '#e9ebf2',
    autoHideMenuBar: true,
    icon: join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // Links open in the normal browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

// Test hook: CODEMAP_TEST_ZIP_DIR=folder makes the app read "<owner>-<repo>.zip"
// from that folder instead of downloading. Only used for automated tests.
const testZipDir = process.env['CODEMAP_TEST_ZIP_DIR']
const fetchRepo = async (u: string): Promise<Response> => {
  if (!testZipDir) return net.fetch(u)
  const m = u.match(/codeload\.github\.com\/([^/]+)\/([^/]+)\//)
  try {
    return new Response(await readFile(join(testZipDir, `${m?.[1]}-${m?.[2]}.zip`)))
  } catch {
    return new Response(null, { status: 404 })
  }
}

function startNew() {
  ai?.cancel()
  ai = null
}

ipcMain.handle('repo:load', async (event, url: string): Promise<LoadResult> => {
  startNew()
  try {
    current = await mapRepo({
      url,
      fetchFn: fetchRepo,
      wasmDir,
      onProgress: (p) => event.sender.send('repo:progress', p)
    })
    return { ok: true, graph: current.graph }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
})

ipcMain.handle('repo:openFolder', async (event): Promise<LoadResult | null> => {
  const win = BrowserWindow.fromWebContents(event.sender)
  // Test hook: CODEMAP_TEST_FOLDER skips the dialog.
  const picked = process.env['CODEMAP_TEST_FOLDER']
    ? { canceled: false, filePaths: [process.env['CODEMAP_TEST_FOLDER']] }
    : await dialog.showOpenDialog(win!, { title: 'Choose a folder with Python code', properties: ['openDirectory'] })
  if (picked.canceled || !picked.filePaths[0]) return null
  const root = picked.filePaths[0]
  startNew()
  try {
    event.sender.send('repo:progress', { stage: 'unzip', message: 'Finding Python files…' })
    const { files, skipped, warnings } = await readPythonFolder(root)
    current = await mapSources({
      repo: folderRepoInfo(root),
      files,
      skipped,
      warnings,
      wasmDir,
      onProgress: (p) => event.sender.send('repo:progress', p)
    })
    return { ok: true, graph: current.graph }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
})

ipcMain.handle('repo:source', (_e, fileId: string) => current?.sources.get(fileId) ?? null)

ipcMain.handle('settings:get', () => getSettings())
ipcMain.handle('settings:save', (_e, update) => {
  const s = saveSettings(update)
  if (update.theme) nativeTheme.themeSource = update.theme
  return s
})

ipcMain.handle('ai:run', async (event) => {
  if (!current) return
  const key = getApiKey() ?? (process.env['CODEMAP_FAKE_AI'] ? 'fake' : null)
  const send = (ch: string, v: unknown) => !event.sender.isDestroyed() && event.sender.send(ch, v)
  if (!key) {
    send('ai:status', { state: 'error', message: 'Add your Claude API key in Settings first.', filesDone: 0, filesTotal: 0 })
    return
  }
  ai?.cancel()
  const runner = new AiRunner(key, getSettings().model, join(app.getPath('userData'), 'ai-cache'))
  ai = runner
  const target = current
  await runner.run(
    target.graph,
    target.sources,
    (notes) => ai === runner && send('ai:notes', notes),
    (s) => ai === runner && send('ai:status', s)
  )
})

ipcMain.handle('ai:cancel', () => {
  ai?.cancel()
})

app.whenReady().then(() => {
  nativeTheme.themeSource = getSettings().theme
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
