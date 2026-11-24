import { FolderOpen, GitFork, MousePointerClick, Sparkles } from 'lucide-react'

/** What a beginner sees before any repo is open. */
export function EmptyState({ onExample, onFolder }: { onExample: (url: string) => void; onFolder: () => void }) {
  return (
    <div className="empty">
      <div className="empty-mark">◆</div>
      <h1>See how a Python project fits together</h1>
      <p className="empty-lead">Code Map turns code into boxes you can open, follow and read, without running anything.</p>
      <ol className="steps-cards">
        <li>
          <GitFork size={20} />
          <b>1. Open some code</b>
          <span>Paste a public GitHub link on the left, or open a folder on this computer.</span>
        </li>
        <li>
          <MousePointerClick size={20} />
          <b>2. Explore</b>
          <span>Each file is a box, each function a card. Click ▸ to open one, click any box to read its code.</span>
        </li>
        <li>
          <Sparkles size={20} />
          <b>3. Ask Claude</b>
          <span>Add an API key in Settings and press “Explain with Claude” for plain-English notes.</span>
        </li>
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
