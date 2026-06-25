# Quickstart

Publish your own marketplace in about five minutes. A marketplace is just a Git
repo (or local folder) full of modules — no build step, no registration.

## 1. Create a repo

```bash
mkdir my-marketplace && cd my-marketplace
git init
```

## 2. Describe the marketplace

Add **`.atelier/marketplace.json`** — the only required file. It's what makes
your marketplace self-describing.

```json
{
  "name": "My Marketplace",
  "description": "A few tools I built.",
  "icon": "store",
  "accent": "#2563eb"
}
```

`icon` is any [lucide](https://lucide.dev/icons) name; `accent` is a hex color.

## 3. Add an app

Drop a normal Atelier module into **`apps/`** (or, if you skip `apps/`, straight
at the repo root). The folder name is the app id.

```
apps/hello/frontend.jsx
```

```jsx
export const meta = { name: 'Hello', icon: 'sparkles', group: 'fun' }
export default function Module() {
  return <div className="p-6">Hello from my first app.</div>
}
```

That's all it needs — **name, icon and category come from `meta`**. The module
stays clean: the listing is enriched from files it already has, and the
marketplace curates the rest (see step 4).

- **`README.md`** — its first line becomes the **tagline**; the whole file is the
  **description**.
- **`package.json`** — `version`, `keywords` (→ tags), `author`, and node
  `dependencies` (→ "Requires"). Other runtimes (Python, Go…) go in `apps[]`.

## 4. Curate with `apps[]` (screenshots & overrides)

The marketplace curates listings in its own config, so modules stay clean. Add an
`apps[]` to `marketplace.json` — entries match modules by `id` and override the
auto-detected listing. This is where **screenshots** live (shipped in the
marketplace, e.g. `.atelier/media/`), plus any tweaks like categories or non-node
requirements:

```json
"apps": [
  { "id": "hello", "screenshots": [".atelier/media/hello-1.png", ".atelier/media/hello-2.png"] },
  { "id": "transcribe", "category": "Voice", "requires": ["Python 3.11+", "ffmpeg"] }
]
```

Screenshots render as a gallery on the app page. Paths are relative to the
marketplace root (or `https://` URLs).

## 5. Push to GitHub

```bash
git add -A && git commit -m "My marketplace"
git remote add origin https://github.com/you/my-marketplace.git
git push -u origin main
```

(Or skip GitHub entirely — a local folder works as a source too.)

## 6. Add it here

Open **Manage → Add a marketplace**, enter `you/my-marketplace` (a full git URL,
or a local path), and click **Add & scan**. Your apps appear immediately, and the
marketplace is re-scanned periodically for new apps and version bumps.

## 7. Ship a chrome (recommended)

A **chrome** is the look your apps render in (rail, topbar, theme) — and it's just
another module, one whose `meta` declares `isChrome: true`. Marketplaces should
almost always ship their own; you can ship several.

Add a chrome module:

```
apps/midnight/frontend.jsx
```

```jsx
export const meta = { isChrome: true, hidden: true, name: 'Midnight' }
export function chrome(props) { /* render the rail, topbar, and props.children */ }
```

Then point each app at it with `meta.chrome`:

```jsx
export const meta = { name: 'Hello', icon: 'sparkles', group: 'fun', chrome: 'midnight' }
```

Atelier supports multiple installed chromes, so each app renders in the chrome it
names — no instance-wide switch, no restart.

## Next

- **Reference** — every field, the folder conventions (and which names are
  skipped), screenshots, chromes, and how listings are derived.
- Bump an app's `package.json` `version` to surface an **Update** badge to
  everyone who has it.
