import { contextBridge, ipcRenderer } from 'electron'
import type { CodeMapApi, Progress } from '../shared/types'

// The only bridge between the screen and the Node side.
// The screen can ask for these three things and nothing else.
const api: CodeMapApi = {
  loadRepo: (url) => ipcRenderer.invoke('repo:load', url),
  getSource: (fileId) => ipcRenderer.invoke('repo:source', fileId),
  onProgress: (cb) => {
    const listener = (_e: unknown, p: Progress) => cb(p)
    ipcRenderer.on('repo:progress', listener)
    return () => ipcRenderer.removeListener('repo:progress', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
