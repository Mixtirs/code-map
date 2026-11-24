import { app, BrowserWindow, ipcMain, net, shell } from 'electron'
import { join } from 'path'
import { readFile } from 'fs/promises'
import { mapRepo } from './pipeline'
import type { LoadResult } from '../shared/types'

// Where the Tree-sitter .wasm files live: the repo's resources/ folder while
// developing, and the installed app's resources folder once packaged.
const wasmDir = app.isPackaged ? join(process.resourcesPath, 'wasm') : join(__dirname, '../../resources')

// Source text of the last repo, kept in memory for the code viewer (Phase 2).
let sources = new Map<string, string>()

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Code Map',
    backgroundColor: '#1f1e1d',
    autoHideMenuBar: true,
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

ipcMain.handle('repo:load', async (event, url: string): Promise<LoadResult> => {
  try {
    const result = await mapRepo({
      url,
      fetchFn: fetchRepo,
      wasmDir,
      onProgress: (p) => event.sender.send('repo:progress', p)
    })
    sources = result.sources
    return { ok: true, graph: result.graph }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
})

ipcMain.handle('repo:source', (_e, fileId: string) => sources.get(fileId) ?? null)

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
