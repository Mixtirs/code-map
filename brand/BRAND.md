# Foothold: brand

## Name

**Foothold** (it was called "Code Map" while we built it).

A foothold is the first safe place to put your foot when you climb. The app is that first safe step into a codebase:
you stand on the map before you climb into the lines.

## Story (one sentence)

> Foothold turns a Python project into a map of boxes you can open and follow, so beginners who are afraid of real code
> can see how it fits together before they read a single line.

Who it is for: people who are new to code, or who can judge code but find reading every line slow and scary.
What it never does: run the code it shows you.

## Black-and-white review (26 Nov 2026)

Every screen (start screen, map, hover card, code view, step-through, search, settings) was checked in grayscale,
in both themes, before any colour work. What failed and what changed:

| Screen | Problem in grayscale | Change |
| --- | --- | --- |
| Legend | The 6 block types were told apart only by colour, so in gray they all looked the same. | Each row now shows the block's own icon (the same icon the block has on the map). |
| Map links | "Imports" and "Function calls" were the same line in two colours. In gray you could not tell them apart. | Imports are now a thick line, calls a thin line, AI guesses stay dashed. The legend and the Links toggles show the same thickness. |
| Side panel | Every section heading had its own small icon. They added noise and said nothing the word didn't. | Headings are words only. |
| Side panel | Four number tiles (files, functions, blocks, links). Beginners only need the first two. | One quiet line: "15 files · 114 functions". |
| Side panel | A "fit" button sat inside the Files / Functions / Blocks switch, so it looked like a fourth zoom level. The map's corner already has the same button. | Removed from the switch. |
| Start screen | Three cards with icons repeated what the side panel already says. | A plain numbered list of three short steps. |

Not changed: the layout, the screen order, and the features.

## Brand guide

The full guide (moodboard, colours, fonts, logo, icon, UI elements, mockup, social post) is published as one page:
https://claude.ai/artifact/Uw2KGNSf6JZ8rPmdRhCnVS . Its source is [brand-guide.src.html](brand-guide.src.html)
(the moodboard image is left out of the source file).

Short version:

| Colour | Hex | Dark theme | Light theme |
| --- | --- | --- | --- |
| Slate | `#2B3040` | background | text |
| Mist | `#E9EBF2` | text | background |
| Steel | `#7A8297` | secondary: lines, icons, labels | same |
| Lavender | `#A396E6` | the one accent | same |

Every other shade is a mix of two of these four. Fonts: **IBM Plex Mono** (headings, code, logo) and
**IBM Plex Sans** (body). Icon: [icon.svg](icon.svg), [icon.png](icon.png) (1024 px).

## Anti-slop check (26 Nov 2026)

| Check | Result before | Fix |
| --- | --- | --- |
| No emoji or icon on every heading | Failed: every side-panel heading had an icon. | Fixed in step 2: words only. |
| No purple/blue gradients everywhere | Passed: no gradients. The only two `repeating-linear-gradient`s draw the dashed line samples in the legend. | None needed. |
| No generic copy | Passed: every line says what to do ("Paste a public GitHub link…", "Click a box to see its code"). | None needed. |
| No "3 cards with icons" layout | Failed: the start screen had exactly that. | Fixed in step 2: a plain numbered list. |
| No glass or glow without a reason | Failed: inputs had a glow ring on focus, selected boxes had a glow ring, and the current step pulsed with a glow. | Focus is now a Lavender border. Selection is a solid outline, search hits a dashed outline, the current step a Lavender fill. No glow, no pulse. |
| Looks like ours, not every AI app | Failed: Claude's notes were marked with the ✨ sparkles icon that every AI app uses, and the old orange-on-charcoal theme looked like a chat app. | AI text now wears a small dashed **AI** tag, the same dash as AI-guessed links on the map, so "dashed = guessed by AI" is one rule across the app. Own wordmark, own icon, Slate + Lavender. |
