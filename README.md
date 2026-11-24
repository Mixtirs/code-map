# Code Map

Code mapping app that extracts GitHub code and maps the code to make it easier to debug and understand.

A desktop app (Windows and Mac) that turns a Python project, from GitHub or from your own computer,
into an interactive diagram, so you can see how the code fits together without reading every line.

Built for the Nmkkn AI Hackathon (Nov–Dec 2026). For build steps, status and known issues, see [HANDOFF.md](HANDOFF.md).

## What it does

- **Open code:** paste a public GitHub repo URL (the app downloads GitHub's zip, no git needed), or press
  **Open a folder on this computer**. Only `.py` files are read. **The code is never run.**
- **Blocks:** Tree-sitter reads each file and splits every function into blocks, one per step.
  Neighbouring simple lines become one block; `if` / `for` / `while` / `try` / `with` / `match` become a block you can open (▸).
  Each block type has its own colour, shown in the legend.
- **Hard links** (solid lines), found by the parser: blue when a file imports another file, amber when a block calls a function in this repo.
- **Claude notes** (needs an API key in Settings): press **Explain with Claude** to get a short name for every block,
  a one-line note on every function and block (rest the mouse on a box to see it), and feature groups drawn as
  **dashed "AI-guessed" links**. Notes are cached, so a second look at the same code is free.
- **Click to code:** click a box to see its lines in the side panel, highlighted.
- **Zoom levels:** Files, Functions or Blocks. Labels stay readable at every zoom.
- **Search** (Ctrl+F): find a file, function or step and jump to it.
- **Step through:** walks the code in run order from the entry point, going into functions it calls. Use ← and → keys. Nothing is executed; it follows the code's text.
- Dark and light themes, a resizable side panel and a short first-run hint.

## Run it

You need [Node.js](https://nodejs.org) 20 or newer.

```
npm install
npm run dev
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Opens the app with live reload |
| `npm test` | Runs the parser and layout tests |
| `npm run typecheck` | Checks the TypeScript for mistakes |
| `npm run dist:win` | Windows installer and portable `.exe` into `release/` (run on Windows) |
| `npm run dist:mac` | Mac `.dmg` and `.zip` with `Code Map.app` into `release/` (run on a Mac) |

You can also build both on GitHub: Actions tab, **Build apps**, **Run workflow**. See HANDOFF.md.

## How it's organised

```
src/
  main/            Node side of Electron (file and network access)
    repo/          GitHub URL parsing + zip download, local folder reading
    parser/        Tree-sitter → functions and blocks
    links/         imports + calls → hard links
    ai.ts          Claude calls: block names, notes, feature groups (cached on disk)
    settings.ts    API key (encrypted with the OS keychain), model, theme
    pipeline.ts    the whole flow: source files → graph
  preload/         the safe bridge the screen uses to ask the Node side for things
  renderer/        the screen (React + React Flow)
    src/components side panel, diagram, boxes, hover card, code viewer, settings, legend
    src/layout     positions boxes in a web worker (ELK arranges files, blocks are stacked in run order)
    src/lib        graph index, search, step-through order
  shared/types.ts  the data shapes both sides agree on
resources/         Tree-sitter WebAssembly files (Python grammar)
build/icon.png     app icon
samples/           a tiny to-do app used by the tests
tests/             parser and layout tests
```

## Limits (on purpose)

- Python only. Zips over 60 MB, single files over 1 MB and folders like `venv/` or `site-packages/` are skipped.
- A call on a variable (`store.add()`) gets no solid link, because knowing what `store` is would mean running the code.
  Claude's dashed links help fill that gap, and they are always marked as guesses.
