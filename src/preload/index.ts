import { contextBridge, ipcRenderer } from 'electron'
import type { CodeMapApi } from '../shared/types'

// The only bridge between the screen and the Node side.
// The screen can ask for these things and nothing else.
function listen<T>(channel: string, cb: (v: T) => void) {
  const listener = (_e: unknown, v: T) => cb(v)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api: CodeMapApi = {
  loadRepo: (url) => ipcRenderer.invoke('repo:load', url),
  openFolder: () => ipcRenderer.invoke('repo:openFolder'),
  getSource: (fileId) => ipcRenderer.invoke('repo:source', fileId),
  onProgress: (cb) => listen('repo:progress', cb),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),
  runAi: () => ipcRenderer.invoke('ai:run'),
  cancelAi: () => ipcRenderer.invoke('ai:cancel'),
  onAiNotes: (cb) => listen('ai:notes', cb),
  onAiStatus: (cb) => listen('ai:status', cb)
}

contextBridge.exposeInMainWorld('api', api)
