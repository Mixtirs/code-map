// The Foothold logo, drawn in code so it follows the theme (see brand/BRAND.md).

/** "foothold" in Plex Mono, with the two o's drawn as two boxes on the map. */
export function Wordmark() {
  return (
    <span className="wordmark" aria-label="Foothold">
      f<i className="o" />
      <i className="o on" />
      thold
    </span>
  )
}

/** The app icon: two boxes and the link between them. */
export function AppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="var(--slate)" />
      <path d="M21 34V21.5h13" stroke="var(--mist)" strokeWidth="4" fill="none" strokeLinejoin="round" />
      <rect x="12" y="34" width="18" height="18" rx="3.5" fill="var(--mist)" />
      <rect x="34" y="12" width="18" height="18" rx="3.5" fill="var(--lav)" />
    </svg>
  )
}

/** Marks text written by Claude. Dashed, like the AI-guessed links on the map. */
export function AiTag() {
  return (
    <span className="ai-tag" title="Written by Claude, may be wrong">
      AI
    </span>
  )
}
