# Code Map: handoff notes

Everything you need to finish, build and demo Code Map on your own. Last updated Tue 24 Nov 2026.

## Status

| Step | What | State |
| --- | --- | --- |
| Phase 1 | Repo download, parser, blocks, hard links on screen | ✅ done |
| 1 | Performance: only boxes in view are drawn, Functions level by default, boxes memoised, layout in a web worker with a loading state | ✅ done |
| 2 | UI/UX: one colour palette, colour per block type + legend, readable hover cards and labels at every zoom, dark + light theme, side panel sections with icons, empty states and clear errors, first-run hint | ✅ done |
| 3 | Open a local folder (same pipeline, no download) | ✅ done |
| 4 | Phase 2: Claude block names, hover notes, click to code | ✅ done, **needs a test with a real API key** |
| 5 | Phase 3+4: AI-guessed feature links, zoom levels, search, step-through | ✅ done |
| 6 | Packaging: Windows installer, Mac `.app`, app icon, GitHub build | ✅ done, **the installers have not been built yet (see below)** |
| 7 | This file | ✅ done |

## First things to check on your laptop

These could not be tested in the cloud, where GitHub zip downloads are blocked and there is no API key.

1. `npm install`, then `npm run dev`.
2. Paste `https://github.com/pallets/itsdangerous` and press →. You should see 15 files, 114 functions.
   If this fails, the download code is in `src/main/repo/github.ts`.
3. Press **Open a folder on this computer** and pick any Python project.
4. Open Settings (gear icon), paste your Claude API key, press **Explain with Claude**.
   Block names should appear, hover notes should fill in, and dashed "AI-guessed" lines should show up.
   If it fails, the side panel shows the reason (bad key, no credit, rate limit, no internet). The code is in `src/main/ai.ts`.
   Tip: pick **Haiku** in Settings while testing, because it is the cheapest. Use Opus for the demo.

## Build the app you launch from an icon

Each installer must be built on its own system: the Windows one on Windows, the Mac one on a Mac.

**Windows** (PowerShell, inside the `code-map` folder):

```powershell
npm install
npm run dist:win
```

You get `release\Code Map Setup 0.1.0.exe` (installer, adds a desktop and Start menu shortcut) and
`release\Code Map 0.1.0.exe` (portable, runs without installing).
Windows may say "Windows protected your PC" because the app isn't signed: click **More info**, then **Run anyway**.

**Mac** (Terminal, inside the `code-map` folder):

```bash
npm install
npm run dist:mac
```

You get a `.dmg` file (such as `release/Code Map-0.1.0-arm64.dmg`) and a `.zip`.
Open the `.dmg` and drag **Code Map** to **Applications**.
The app isn't signed, so the first time, right-click it in Applications and choose **Open**, then **Open** again.
If macOS says the app "is damaged", run this once and try again:

```bash
xattr -cr "/Applications/Code Map.app"
```

**Without either computer: build on GitHub.** The repo has a workflow (`.github/workflows/build.yml`) that builds both.
On GitHub open the repo, then **Actions**, **Build apps**, **Run workflow**. After about 10 minutes the run page has two
downloads at the bottom: `code-map-windows` and `code-map-mac`. Pushing a tag such as `v0.1.0` runs it too:

```bash
git tag v0.1.0
git push origin v0.1.0
```

## What's left

- Run the checks in "First things to check" above and fix anything that breaks.
- Build the installers and try them on a clean start (double-click the icon, not `npm run dev`).
- Pick 1 or 2 demo repos that look good. `pallets/itsdangerous` (small) and `psf/requests` (big) both map well.
  Press **Explain with Claude** on them before the demo, so the notes are cached and appear instantly on stage.
- Rehearse the story: the problem (reading every line is slow), the map, a hover note, step-through, the dashed AI links.
- Nice to have, if there is time: more languages (JavaScript would need `tree-sitter-javascript.wasm` and a new parser file),
  export the map as an image, remember the last opened repo.

## Known issues

- **Untested in the cloud:** the real GitHub download and a real Claude API key (see above).
- **Unsigned app:** Windows SmartScreen and macOS Gatekeeper warn on first launch. Signing needs paid certificates, so it is skipped.
- **Very big repos:** the Blocks level on a repo with thousands of blocks takes a second or two to lay out. Functions level (the default) stays smooth.
- **Calls on variables** (`store.add()`) get no solid link, because knowing what `store` is would mean running the code.
- **Step-through** follows the code's text in order. It can't know which branch of an `if` would really run.
- **Build warning:** `npm run build` prints a warning about `"use client"` directives. It is harmless.
- The Windows installer can't be built on Linux without `wine`, which is why the GitHub workflow exists.

## How it works (for when you ask an AI to change something)

- `src/main/pipeline.ts`: source files → graph. `src/main/parser/python.ts` makes functions and blocks, `src/main/links/resolve.ts` makes import and call links.
- `src/main/ai.ts`: sends each file's numbered source to Claude (4 files at a time) for block names and notes, then one call for feature groups.
  Results are cached in the app's data folder under `ai-cache`, keyed by a hash of the code and the model.
  The model list is `AI_MODELS` in `src/shared/types.ts`.
- `src/main/settings.ts`: the API key is encrypted with the system keychain. The `ANTHROPIC_API_KEY` environment variable also works.
- `src/renderer/src/App.tsx`: all screen state (what's open, the selection, step-through, theme).
- `src/renderer/src/layout/`: positions boxes in a web worker. `flow.ts` turns positions into React Flow boxes and lines.
- `src/renderer/src/components/`: `SidePanel`, `Diagram`, `MapNodes` (the boxes), `HoverCard`, `CodeViewer`, `SettingsDialog`, `Legend`, `FirstRun`.
- `src/renderer/src/styles.css`: every colour is a variable at the top, with a dark and a light set.
  `kinds.ts` holds the block types, their labels and icons.

**Rule:** the app must never run the code it maps. Don't add anything that imports or executes the user's Python.

## Test hooks

These environment variables help testing without a network or a key:

| Variable | What it does |
| --- | --- |
| `CODEMAP_TEST_ZIP_DIR=/some/dir` | Reads `<owner>-<repo>.zip` from that folder instead of downloading |
| `CODEMAP_TEST_FOLDER=/some/project` | "Open a folder" uses this folder without showing the dialog |
| `CODEMAP_FAKE_AI=1` with `ANTHROPIC_API_KEY=fake` | Fake Claude notes and features, no API calls, no cost |

Example (Mac/Linux): `CODEMAP_FAKE_AI=1 ANTHROPIC_API_KEY=fake npm run dev`.
On Windows PowerShell: `$env:CODEMAP_FAKE_AI=1; $env:ANTHROPIC_API_KEY="fake"; npm run dev`.
