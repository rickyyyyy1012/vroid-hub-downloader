# VRoid Hub Downloader

A local tool that takes a [VRoid Hub](https://hub.vroid.com) model link, pulls the encrypted preview, decrypts it, reverses the vertex-displacement obfuscation and saves a normal `.vrm` file into `downloads/`.

It ships with a small web interface so you never have to touch the command line: paste a link, hit **Download**, watch the log stream live, and browse everything you have downloaded in the history panel.

> **Educational use only.** Use it on models you are allowed to obtain. Support the creators on VRoid Hub.

---

## What it does

1. Fetches the encrypted preview for a model id from the VRoid Hub API (HTTP/2, and it reuses your Firefox VRoid session when a preview is login-gated).
2. Decrypts it (AES-CBC) and decompresses it (Zstandard).
3. Computes the per-model seed map, restores the original vertices and converts the KTX2 / Basis / WebP textures back to PNG.
4. Repairs the VRM extensions that `gltf-transform` mangles on its own, then writes `<model name> (<id>).deob.vrm` into `downloads/`.

## What is in the box

| Piece | Description |
| --- | --- |
| **Web UI** | Single screen: model link, Download button, live activity console, download history, clock, session timer and a shut down button. |
| **Themes** | Matrix (green, default), Blue and AMOLED, switchable from the dropdown in the top bar. Your choice is remembered. |
| **Launcher** | `start.bat` — double-click it on Windows. It checks Node.js, installs dependencies when needed, starts the server and opens the page for you. |
| **CLI** | The original `node src/index.js <url>` workflow still works. |

Downloads always land in the `downloads/` folder next to the project, and the **Open downloads** button takes you straight there.

---

## Requirements

- **Node.js — latest version.** Install from [nodejs.org](https://nodejs.org/). Node 24 or newer is recommended; the project needs at least **Node 23.8**, because it uses the built-in Zstandard decompressor (`node:zlib`) and `node:sqlite`. Check with `node -v`.
- **pnpm** — used to install the dependencies ([install guide](https://pnpm.io/installation)). `npm install` also works if you prefer.
- **Windows** for the `start.bat` launcher. On macOS and Linux use the commands below instead; the web UI itself is cross-platform.
- **Firefox, logged into VRoid Hub** (optional) — models whose preview is restricted to logged-in users can only be fetched when a VRoid session cookie is available. The tool reads it from your Firefox profile; without it those models return `404`.
- About 400 MB of free disk space for `node_modules`, plus room for the models you download.

---

## Setup

```bash
# inside the project folder
pnpm install
```

That is the only install step. Everything else (the server, the UI, the history file, the `downloads/` folder) is created automatically.

## Launching

**Windows:** double-click **`start.bat`**.

The launcher window prints a short summary, then the server starts and your browser opens on `http://127.0.0.1:4321`. Keep that window open while you use the app — closing it stops the server.

**Any platform, from a terminal:**

```bash
pnpm start:open   # start the server and open the page
pnpm start        # start the server only, then open http://127.0.0.1:4321 yourself
```

If port `4321` is taken, run with another one: `PORT=4322 pnpm start` (PowerShell: `$env:PORT=4322; pnpm start`).

## Using it

1. Open a model on `hub.vroid.com` and copy the page URL (the trailing number is the model id; a bare id works too).
2. Paste it into the field and press **Download**.
3. Watch the **Activity** console: fetching, decrypting, seed map, vertex displacement, textures, save. The status pill shows how long the current run has taken.
4. The finished file appears in `downloads/` and in the **History** panel with its result, size and file name.

One download runs at a time; a second request is rejected until the first finishes.

### Knowing it is running

- The launcher window stays open and prints `VRoid Hub Downloader is running` with the URL and the downloads path.
- In the page, the green dot next to **Activity** means the log stream is connected; the taskbar/browser tab shows the page.
- The header clock counts **elapsed time** since you opened the app in this tab.

### Stopping it

- **Shut down** in the top bar. It asks for a second click, then stops the server and cancels anything still running. The page shows a "Session ended" card — closing a tab that the browser did not open for a script is blocked by browsers, so use its **Close this tab** button.
- **Ctrl+C** in the launcher window, or just close that window. Same result.

Both are safe: nothing is left running in the background.

---

## Command line

```bash
pnpm cli https://hub.vroid.com/en/characters/147647967680376151/models/259570871427745417
# or a bare model id
pnpm cli 259570871427745417
```

The CLI writes into the same `downloads/` folder and prints its log to the terminal.

---

## Troubleshooting

- **`404` while fetching the preview** — the model is login-gated and no VRoid session cookie was found. Log into VRoid Hub in Firefox and try again.
- **The downloaded VRM looks broken in your viewer** — `gltf-transform` rewrites parts of the file on export. Open the result in Blender or Unity (with either VRM extension version) and re-export a fresh VRM.
- **`Seed not found for timestamp`** — VRoid Hub rotated its seed map. The tool re-downloads the seed map module automatically; if it still fails, delete `cache/` and retry.
- **`Port 4321 is already in use`** — another copy is running. Stop it (Shut down / Ctrl+C), or start with `PORT=4322`.
- **Discord / GitHub links in the corner** — that is just the author, not a feature.

---

## Project layout

```
src/index.js        deobfuscator + CLI entry point
src/server.js       local web server (static files, SSE log stream, history, shutdown)
public/             the single-screen UI (HTML, CSS, JS, no build step)
downloads/          saved .vrm files (git-ignored, created on demand)
cache/              downloaded previews + seed map module (git-ignored)
debug/              textures and extension dumps from the last run (git-ignored)
history.json        download history for the UI (git-ignored)
start.bat           Windows launcher
```

`history.json`, `downloads/`, `cache/` and `debug/` are all regenerated at runtime and are excluded from version control.

---

## Credits

Made with no effort by **ricky** &lt;3

- Discord: [rickyyyyy1020](https://discord.com/users/rickyyyyy1020)
- GitHub: [rickyyyyy1012](https://github.com/rickyyyyy1012)

Background reading: [Borrowing intellectual property](https://toon.link/blog/1740863435/borrowing-intellectual-property).
