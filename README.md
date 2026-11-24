# Code Map

Code mapping app that extracts GitHub code and maps the code to make it easier to debug and understand.

A Windows desktop app that turns a public GitHub Python repo into an interactive diagram,
so you can see how the code fits together without reading every line.

Built for the Nmkkn AI Hackathon (Nov–Dec 2026).

## What works now (Phase 1)

- Paste a public GitHub repo URL. The app downloads GitHub's zip of it (no git needed).
- Only `.py` files are read. **The repo's code is never run.**
- Tree-sitter reads each file and finds files, functions, classes and methods.
- Each function is split into **blocks**, one per step:
  - neighbouring simple lines (assignments, prints, returns) become one block;
  - `if` / `for` / `while` / `try` / `with` / `match` become one block you can open (▸) to see the blocks inside.
- **Hard links** (solid lines), found by the parser:
  - blue: a file imports another file;
  - amber: a block calls a function in this repo (calls to outside libraries get no line).
- Click any box to highlight its links. Open or close files, functions and blocks with ▸ / ▾.

## Run it on Windows

You need [Node.js](https://nodejs.org) 20 or newer (the LTS installer is fine).

```powershell
npm install
npm run dev
```

`npm run dev` opens the app with live reload. Other commands:

| Command | What it does |
| --- | --- |
| `npm test` | Runs the parser tests on `samples/todo_app` |
| `npm run typecheck` | Checks the TypeScript for mistakes |
| `npm run dist:win` | Builds a Windows installer and portable `.exe` into `release/` |

## How it's organised

```
src/
  main/            Node side of Electron (has file and network access)
    repo/          GitHub URL parsing, zip download, .py extraction
    parser/        Tree-sitter → functions and blocks
    links/         imports + calls → hard links
    pipeline.ts    the whole flow: URL → graph
  preload/         the safe bridge the screen uses to ask the Node side for things
  renderer/        the screen (React)
    src/components SidePanel, Diagram, the file/function/block boxes
    src/layout     positions boxes (blocks stacked in run order, files arranged by ELK)
  shared/types.ts  the data shapes both sides agree on
resources/         Tree-sitter WebAssembly files (Python grammar)
samples/           a tiny to-do app used by the tests
tests/             parser and link tests
```

## Limits (on purpose, for now)

- Python only. Zips over 60 MB, single files over 1 MB and folders like `venv/` or `site-packages/` are skipped.
- A call on a variable (`store.add()`) gets no link, because knowing what `store` is would mean running the code.

## Roadmap

1. ✅ Repo download + parser + blocks + hard links on screen
2. Block names and hover notes from Claude, click a block to see its code
3. AI-guessed feature links (dashed), zoom levels, search
4. Step-through mode in run order, demo polish
