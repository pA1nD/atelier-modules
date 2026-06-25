# Marketplace reference

The format for a **marketplace** (an "uplink") — a Git repo or local folder the
Atelier marketplace can scan, browse, and install from.

> New here? Start with the **Quickstart** for a 5-minute walkthrough.

## What a marketplace is

A marketplace is a directory with **one required file**, `.atelier/marketplace.json`
(its identity), plus **module folders**. The modules live either:

- under an **`apps/`** folder, or
- at the **repo root** — when there's no `apps/`, so any repo full of modules
  becomes a marketplace the moment you add the manifest.

```
your-marketplace/
├─ .atelier/marketplace.json     ← required: marketplace identity
└─ apps/                          ← optional; omit to use the repo root
   └─ my-app/                     ← a normal Atelier module
      ├─ frontend.jsx             ← meta drives name / icon / category
      ├─ backend.js
      ├─ package.json             ← version / keywords / author / dependencies
      └─ README.md                ← description + any screenshots (images)
```

## `.atelier/marketplace.json`

```json
{
  "id": "atelier-modules",
  "name": "Atelier Modules",
  "description": "Every Atelier module, in one place.",
  "icon": "boxes",
  "accent": "#7c3aed",
  "publisher": "pa1nd",
  "homepage": "https://github.com/pA1nD/atelier-modules",
  "featured": "latency-map",
  "apps": [
    { "id": "latency-map", "screenshots": [".atelier/media/latency-map-1.svg", ".atelier/media/latency-map-2.svg"] },
    { "id": "mlx-tts", "category": "Voice", "requires": ["Python 3.11+", "mlx-audio"] },
    { "id": "claude", "category": "AI" }
  ]
}
```

| Field | Required | Meaning |
|---|---|---|
| `name` | yes | Display name in the rail and section header. |
| `id` | | Stable id (defaults to the repo/dir name). |
| `description` | | One line shown under the marketplace name. |
| `icon` | | A [lucide](https://lucide.dev/icons) name for the marketplace badge. |
| `accent` | | Brand color (hex) for the badge and section. |
| `publisher` | | Who publishes it. |
| `homepage` | | Link shown on app pages. |
| `featured` | | An app `id` to feature at the top of the catalog. |
| `apps` | | Per-app overrides (by `id`) + inline-only listings — see [Apps & overrides](#apps--overrides). |

> Chrome is **not** a marketplace-level setting. Each app declares the chrome it
> renders in via its own `meta.chrome`, and the chrome ships as a module in the
> marketplace — see [Chromes](#chromes).

## How an app is described

Each app is a **normal Atelier module** — there is no separate per-app manifest.
Its listing is read from what the module already declares:

| Field | Comes from |
|---|---|
| name | `frontend.jsx` → `export const meta.name` (else the folder name) |
| icon | `meta.icon` (a [lucide](https://lucide.dev/icons) name) |
| category | `meta.group`, capitalized (else **Other**) |
| version | `package.json` → `version` (else `0.0.0`) |
| tags | `package.json` → `keywords` |
| author | `package.json` → `author` |
| requires | `package.json` → `dependencies` (node). Other runtimes (Python, Go…) → set in `apps[]` |
| surfaces | derived — `UI` if `frontend.jsx`, `API` if `backend.js` |
| chrome | `meta.chrome` — the chrome this app renders in (see [Chromes](#chromes)) |
| tagline | the first line of `README.md` |
| description | the full `README.md`, rendered |
| screenshots | the marketplace's `apps[]` (see [Screenshots](#screenshots)) |

So the **minimum publishable app** is a folder with a `frontend.jsx`. Everything
else enriches the listing as you add it — and the marketplace can override any of
it (see below) without touching the module.

## Apps & overrides

The manifest's `apps[]` is an array of entries matched to modules by `id`. Each
entry **overrides** the auto-detected listing — so the marketplace curates
(screenshots, a cleaner tagline, a fixed category, non-node requirements) while
the module stays clean:

```json
"apps": [
  { "id": "latency-map", "screenshots": [".atelier/media/route.svg"] },
  { "id": "mlx-tts", "category": "Voice", "requires": ["Python 3.11+", "mlx-audio"] },
  { "id": "claude", "category": "AI" }
]
```

Overridable fields: `name`, `icon`, `tagline`, `category`, `tags`, `version`,
`author`, `homepage`, `requires`, `screenshots`, `description`. An entry whose
`id` matches no module folder is shown as an **inline-only** listing.

## Chromes

A **chrome** is the visual shell your apps render in (rail, topbar, theme) — and
it's just another module, one whose `meta` sets `isChrome: true`:

```jsx
// apps/midnight/frontend.jsx
export const meta = { isChrome: true, hidden: true, name: 'Midnight' }
export function chrome(props) { /* render the rail, topbar, and props.children */ }
```

Ship it in your marketplace like any app. Atelier can have **multiple** chromes
installed at once, so a marketplace can ship several. Each app opts into one with
`meta.chrome`:

```jsx
export const meta = { name: 'Hello', icon: 'sparkles', group: 'fun', chrome: 'midnight' }
```

That app then renders in the named chrome — no instance-wide switch, no restart.
A marketplace should almost always **ship its own chrome and point its apps at
it**, so they look the way they were designed.

## Screenshots

Screenshots are curated by the **marketplace**, not the module — so module folders
stay clean. List them in the app's `apps[]` entry and ship the image files in the
marketplace itself (e.g. under `.atelier/media/`):

```json
{ "id": "latency-map", "screenshots": [".atelier/media/latency-map-1.svg", ".atelier/media/latency-map-2.svg"] }
```

Paths are relative to the **marketplace root** (or absolute `https://` URLs);
local files are inlined when the page is shown. They render as a gallery on the
app page, App-Store style.

## Folder & file conventions

When collecting a marketplace's apps, these directories are **skipped** — never
treated as apps:

| Skipped | Why |
|---|---|
| `node_modules`, `apps`, `data`, `docs`, `shims`, `test` | tooling / reserved names |
| `atelier`, `api`, `assets`, `modules`, `global` | reserved by the Atelier shell |
| names starting with `.`, `_`, `-`, or a space | hidden / excluded by convention (`_wip`, `.git`, …) |
| symlinks | only real directories are scanned |

At the **repo root**, a directory is listed only if it looks like a module (it has
a `frontend.jsx` or `backend.js`). Inside an explicit **`apps/`** folder, every
non-skipped directory is treated as an app.

## Categories

`category` comes from each module's `meta.group` (capitalized) and drives the rail
filter and the card accent color. Modules with no group fall under **Other**.
Common groups: `dev`, `tools`, `voice`, `media`, `data`, `docs`, `reading`, `lab`.

## Adding & updating

Add a marketplace by **`owner/repo`**, a full git URL, or a **local path** (a
folder or a local git working copy). GitHub repos are shallow-cloned and cached;
local paths are read in place. Marketplaces are re-scanned on an interval and on
demand — bump a module's `package.json` `version` to surface an **Update** badge.

**Private GitHub repos** work too: if the [`gh`](https://cli.github.com) CLI is
installed, dock runs `gh auth setup-git` (idempotent) before cloning so git
authenticates as your signed-in GitHub user — no tokens in URLs. If a clone or
fetch still fails for auth (a private repo you can't reach, or you're signed out),
the scan reports a clear error: *"private repo or no access — run `gh auth login`
(or check repo access), then re-scan."*

## Dependencies & supported package managers

A module's code is yours; a marketplace's job is to make it **install and run on
someone else's machine**. So every dependency must be **declared** — and declared
**once, in the file the package manager already owns**. The manifest's
`apps[].requires` only names the *manager*; it never restates a package list, so
nothing can drift.

### Supported managers (only these)

| `requires` entry | For | Source of truth (in the module) | Install runs |
|---|---|---|---|
| `"npm"` | Node deps | `package.json` (+ `package-lock.json`) | `npm ci` |
| `"uv"` | Python packages | `requirements.txt` / `pyproject.toml` (+ `uv.lock`) | `uv venv <module>/.venv` + `uv pip install -r requirements.txt` |
| `{ "brew": ["ffmpeg"] }` | system CLIs | *(not machine-readable — only `spawn('x')`)* | `brew install …` |
| `{ "uvtool": "parakeet-mlx" }` | standalone Python CLIs | — | `uv tool install …` |
| `{ "note": "Apple Silicon" }` | human prerequisite | — | shown, not installed |

That's the whole supported set: **npm, uv, brew, uv tool.** For npm and uv the
manifest carries **no package list** — just the keyword; the list lives in the
module's own manifest file.

### Everything else goes in a script

Any need a supported manager can't cover (apt, cargo, go, a model download, a
sudo step, a custom setup) must be a **declared script the module ships**, not an
ad-hoc instruction:

```jsonc
{ "id": "latency-map", "requires": ["npm", { "script": "./install.sh" }] }
```

The script is the **only escape hatch** — and it's explicit, versioned, and
re-runnable, so a human (or a future installer) knows exactly what an app needs.
Never bury a dependency in imperative runtime code (e.g. a `uv pip install …`
inside `backend.js`): move the packages to `requirements.txt`, or, if it truly
can't be declared any other way, into the script.

### The `requires[]` schema

```jsonc
{ "id": "sous", "requires": ["npm", "uv", { "brew": ["ffmpeg"] }, { "uvtool": "parakeet-mlx" }] }
```

Each item is the string `"npm"`/`"uv"`, or a one-key object naming a manager
(`brew`, `uvtool`, `script`, `note`). No versions, no nesting, no resolver — the
managers handle transitives themselves.

### Conventions a packaged module must follow

- **npm**: real `package.json` + lockfile. Load backend deps with
  `createRequire(import.meta.url)('pkg')`, never a static bare `import`.
- **python**: a `requirements.txt` (no imperative `uv pip install X Y` in code);
  resolve the venv as `path.join(moduleDir, '.venv')` so it travels with the install.
- **system CLIs**: referenced by name in `spawn`/`command -v`, declared in
  `requires` — never installed from inside the module.
- **identity & paths**: never hardcode module names, URLs, absolute paths, or
  references to other repos on your machine — read identity from `ctx` /
  `window.__atelier.self(import.meta.url)`.

## Installing apps

Hitting **Get** copies the app's files into dock's own data folder
(`dock/data/installed/<marketplace>/<id>`), **applies its dependencies** (see
below), and mounts it into a **workspace named after the marketplace**
(auto-created). That makes it a self-contained **installed** app — distinct from a
**linked** module (a path you added by hand, which stays where it lives). If the
app declares a `meta.chrome` the marketplace ships, that theme is installed
(and its deps applied) alongside it. **Update** re-copies the newer version (your
`data/` is preserved) and **re-applies dependencies**; **Uninstall** removes the
copy (with an opt-in to also delete its data). `node_modules` and `.git` are never
copied — npm/uv re-create them on install.

### Dependency apply on Get

Install no longer copies files only — it now reads the app's `requires` (and what
the copied files actually carry) and acts:

| What | When | Runs |
|---|---|---|
| **npm** | `requires` includes `"npm"`, **or** the app ships a `package.json` with `dependencies` | `npm ci` in the install dir (falls back to `npm install` when there's no lockfile) |
| **uv** | `requires` includes `"uv"`, **or** the app ships a `requirements.txt` | `uv venv .venv` then `uv pip install --python .venv -r requirements.txt` in the install dir |

These run **asynchronously** (spawned, never a blocking call that freezes the
shared shell), each with a timeout, streaming their output to the **Activity** log
over the WebSocket. The outcome is recorded (`dock/data/installs.json`) and shown
on the app page; a failed apply is surfaced (the page stays put instead of
reloading) — never silent. Both steps are idempotent, so re-installing or updating
re-applies cleanly. Deps are applied **before** the config write that mounts the
module, so an app only ever mounts once its dependencies are in place.

### System steps are surfaced, not auto-run

Host-touching `requires` entries are **never executed automatically** — they run
arbitrary host commands and need your consent. Install lists them on the app page
(with a copy-paste command) as **manual system steps** for you to apply:

| Entry | Surfaced as |
|---|---|
| `{ "brew": ["ffmpeg", "sox"] }` | `brew install ffmpeg sox` |
| `{ "uvtool": "parakeet-mlx" }` | `uv tool install parakeet-mlx` |
| `{ "script": "./install.sh" }` | the app's own setup script to run |
| `{ "note": "Apple Silicon" }` | a human prerequisite (shown, no command) |

A pre-schema manifest that lists free-text strings (e.g. `"Python 3.11+"`,
`"ffmpeg"`) degrades gracefully: anything that isn't `"npm"`/`"uv"` is shown as a
note (shown, not run) rather than mis-applied. Package names already covered by
npm aren't double-reported.
