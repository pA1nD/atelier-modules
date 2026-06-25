# dock

The **marketplace module** — the home an Atelier user opens first: a place to
**discover, browse, and understand** apps published across one or more
**marketplaces** (GitHub repos shaped per [docs/reference.md](./docs/reference.md)).
It ships bundled with the `atelier-chrome` so it works on a fresh instance out of
the box.

## What it does (v1)

- **Browse** — a filter rail (marketplaces + categories with counts), a featured
  banner, and per-marketplace sections of calm, accessible cards.
- **Understand** — a beautiful per-app preview: an App-Store-style screenshot
  gallery (curated by the marketplace), the rendered README, what it adds to your
  rail, dependencies, and source.
- **Manage** — add / remove marketplace uplinks (`owner/repo`, a git URL, or a
  local path) and re-scan on demand.
- **Stay current** — uplinks are shallow-cloned and re-scanned on an interval;
  new apps and version bumps surface as `New` / `Update` badges (broadcast over
  the shell WebSocket, so the catalog updates live).

An app's listing is read entirely from the module itself — `meta`, `package.json`,
and `README.md` — there is no parallel manifest. See [docs/reference.md](./docs/reference.md).

## Architecture

| File | Role |
|---|---|
| `frontend.jsx` | The three views (catalog · app preview · manage), URL-routed via `useRoute`. |
| `backend.js` | Uplink registry, scan orchestration, background interval, catalog/detail/scan routes. |
| `scanner.js` | Resolve a source (local / git), parse `marketplace.json`, collect apps (from `apps/` or the repo root), build the catalog. |
| `markdown.js` | Safe (escape-first) Markdown → HTML for README rendering. |
| `docs/` | `quickstart.md` + `build-first-module.md` + `reference.md`, rendered in-app under **Docs**. |

State lives under `data/`: `uplinks.json` (the registry), `state.json` (last-scan
versions, for diffing), and `uplinks/<slug>/` (git clones).

## Installing apps

Hitting **Get** copies the app into dock's own data folder
(`data/installed/<marketplace>/<id>`) and path-mounts it into a workspace named
after the marketplace — a `{ "path": … }` entry added to the instance's
`atelier.config.json` `modules`, live with no restart (**Uninstall** removes it).
If the app declares a `meta.chrome` the marketplace ships, that theme installs
alongside it. See [docs/reference.md](./docs/reference.md#installing-apps) for the
full flow.

## Contract notes

- No hardcoded routes/topics — everything via `window.__atelier.self(import.meta.url)`.
- Icons render through the active chrome's global lucide (`<i data-lucide>`),
  using the chrome's safe ref-managed `Icon` pattern.
- Visuals use `@atelier/kit` + the chrome's zinc/blue tokens; theme-aware (light + dark).
- Scan state lives in a `ctx.module()` slot, so the background scanner survives
  hot-reload; the interval is cleared in teardown.
