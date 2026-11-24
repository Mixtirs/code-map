import { AlignLeft, CornerDownRight, GitBranch, Layers, Repeat, ShieldAlert, SquareFunction, Split, type LucideIcon } from 'lucide-react'
import type { BlockKind } from '../../../shared/types'

// One place for what each kind of block looks like and means.
// Colours come from CSS variables (--kind-...) so light and dark themes match.

export const KIND_META: Record<BlockKind, { label: string; hint: string; icon: LucideIcon }> = {
  simple: { label: 'Steps', hint: 'Plain lines that run one after another', icon: AlignLeft },
  if: { label: 'Decision', hint: 'if / elif / else: picks one path', icon: GitBranch },
  match: { label: 'Decision', hint: 'match / case: picks one path', icon: Split },
  for: { label: 'Loop', hint: 'for: repeats for each item', icon: Repeat },
  while: { label: 'Loop', hint: 'while: repeats until a condition is false', icon: Repeat },
  try: { label: 'Error handling', hint: 'try / except: catches problems', icon: ShieldAlert },
  with: { label: 'Resource', hint: 'with: opens something and closes it safely', icon: Layers },
  branch: { label: 'Branch', hint: 'One path inside a decision or try', icon: CornerDownRight },
  def: { label: 'Inner definition', hint: 'A function or class defined inside another', icon: SquareFunction }
}

/** Legend rows: kinds grouped by colour. */
export const LEGEND: { kinds: BlockKind[]; label: string; hint: string }[] = [
  { kinds: ['simple'], label: 'Steps', hint: KIND_META.simple.hint },
  { kinds: ['if', 'match'], label: 'Decision', hint: 'if / match: picks one path' },
  { kinds: ['for', 'while'], label: 'Loop', hint: 'for / while: repeats' },
  { kinds: ['try'], label: 'Error handling', hint: KIND_META.try.hint },
  { kinds: ['with'], label: 'Resource', hint: KIND_META.with.hint },
  { kinds: ['def'], label: 'Inner definition', hint: KIND_META.def.hint }
]
