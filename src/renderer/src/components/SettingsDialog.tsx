import { useEffect, useState } from 'react'
import { KeyRound, X } from 'lucide-react'
import { AI_MODELS, type Settings } from '../../../shared/types'

interface Props {
  settings: Settings
  onSave: (s: Settings) => void
  onClose: () => void
}

export function SettingsDialog({ settings, onSave, onClose }: Props) {
  const [key, setKey] = useState('')
  const [model, setModel] = useState(settings.model)
  const [theme, setTheme] = useState(settings.theme)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = async (removeKey = false) => {
    setSaving(true)
    const s = await window.api.saveSettings({
      apiKey: removeKey ? null : key.trim() ? key.trim() : undefined,
      model,
      theme
    })
    setSaving(false)
    setKey('')
    onSave(s)
    if (!removeKey) onClose()
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-label="Settings" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Settings</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <label className="field">
          <span className="field-label">
            <KeyRound size={14} /> Claude API key
          </span>
          <input
            className="input"
            type="password"
            placeholder={settings.hasApiKey ? (settings.keyFromEnv ? 'Using ANTHROPIC_API_KEY from your system' : '•••••••• saved') : 'sk-ant-…'}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <span className="field-help">
            Used to write block names, notes and feature groups. Stored encrypted on this computer only. Get one at{' '}
            <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
              console.anthropic.com
            </a>
            .
          </span>
          {settings.hasApiKey && !settings.keyFromEnv && (
            <button className="link-btn" onClick={() => save(true)}>
              Remove saved key
            </button>
          )}
        </label>

        <label className="field">
          <span className="field-label">Model</span>
          <select className="input" value={model} onChange={(e) => setModel(e.target.value)}>
            {AI_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <span className="field-help">Results are cached, so opening the same repo again is free.</span>
        </label>

        <div className="field">
          <span className="field-label">Theme</span>
          <div className="segmented">
            {(['system', 'dark', 'light'] as const).map((t) => (
              <button key={t} className={theme === t ? 'on' : ''} onClick={() => setTheme(t)}>
                {t === 'system' ? 'Match system' : t === 'dark' ? 'Dark' : 'Light'}
              </button>
            ))}
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => save()} disabled={saving}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
