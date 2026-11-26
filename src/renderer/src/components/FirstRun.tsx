import { FolderOpen, MousePointerClick } from 'lucide-react'

/** What a beginner sees before any repo is open. */
export function EmptyState({ onExample, onFolder }: { onExample: (url: string) => void; onFolder: () => void }) {
  return (
    <div className="empty">
      <div className="empty-mark">◆</div>
      <h1>See how a Python project fits together</h1>
      <p className="empty-lead">Code Map turns code into boxes you can open, follow and read, without running anything.</p>
      <ol className="steps-list">
        <li>Paste a public GitHub link on the left, or open a folder on this computer.</li>
        <li>Each file is a box and each function a card. Click ▸ to open one, click a box to read its code.</li>
        <li>Optional: add a Claude API key in Settings for plain-English notes on every box.</li>
      </ol>
      <div className="empty-actions">
        <button className="btn btn-primary" onClick={() => onExample('https://github.com/pallets/itsdangerous')}>
          Try an example repo
        </button>
        <button className="btn" onClick={onFolder}>
          <FolderOpen size={15} /> Open a folder
        </button>
      </div>
    </div>
  )
}

/** A one-time tip shown after the first map appears. */
export function FirstMapTip({ onClose }: { onClose: () => void }) {
  return (
    <div className="tip" role="status">
      <MousePointerClick size={16} />
      <span>
        <b>Tip:</b> click ▸ on a file or function to open it, rest the mouse on a box for a note, and click a box to see its code.
      </span>
      <button className="btn btn-small" onClick={onClose}>
        Got it
      </button>
    </div>
  )
}
