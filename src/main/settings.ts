import { app, safeStorage } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import type { Settings } from '../shared/types'

// Settings live in a small JSON file in the app's user-data folder.
// The API key is encrypted with the operating system's keychain (safeStorage)
// when that is available.

interface Stored {
  apiKeyEnc?: string // base64 of encrypted key
  apiKeyPlain?: string // only used if the OS offers no encryption
  model?: string
  theme?: Settings['theme']
}

const file = () => join(app.getPath('userData'), 'settings.json')

function read(): Stored {
  try {
    return JSON.parse(readFileSync(file(), 'utf8'))
  } catch {
    return {}
  }
}

function write(s: Stored) {
  mkdirSync(dirname(file()), { recursive: true })
  writeFileSync(file(), JSON.stringify(s, null, 2))
}

export function getApiKey(): string | null {
  const s = read()
  if (s.apiKeyEnc && safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(s.apiKeyEnc, 'base64'))
    } catch {
      /* fall through */
    }
  }
  if (s.apiKeyPlain) return s.apiKeyPlain
  return process.env['ANTHROPIC_API_KEY'] || null
}

export function getSettings(): Settings {
  const s = read()
  const stored = !!(s.apiKeyEnc || s.apiKeyPlain)
  return {
    hasApiKey: stored || !!process.env['ANTHROPIC_API_KEY'],
    keyFromEnv: !stored && !!process.env['ANTHROPIC_API_KEY'],
    model: s.model || 'claude-opus-5-5',
    theme: s.theme || 'system'
  }
}

export function saveSettings(update: { apiKey?: string | null; model?: string; theme?: Settings['theme'] }): Settings {
  const s = read()
  if (update.apiKey !== undefined) {
    delete s.apiKeyEnc
    delete s.apiKeyPlain
    const key = update.apiKey?.trim()
    if (key) {
      if (safeStorage.isEncryptionAvailable()) s.apiKeyEnc = safeStorage.encryptString(key).toString('base64')
      else s.apiKeyPlain = key
    }
  }
  if (update.model) s.model = update.model
  if (update.theme) s.theme = update.theme
  write(s)
  return getSettings()
}
