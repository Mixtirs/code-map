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
