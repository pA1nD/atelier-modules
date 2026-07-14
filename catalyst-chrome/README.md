# catalyst-chrome

An atelier **chrome** (theme) built on the [Catalyst](https://catalyst.tailwindui.com/) UI
kit. It claims the `chrome` slot via `meta = { chrome: true, hidden: true }`: the shell
renders its `chrome` export as the root and hands it every module's frontend to host
inside the sidebar layout. Like every chrome it ships its own `styles.css` (Tailwind v4 +
catalyst tokens) and may publish primitives to modules via `@atelier/kit` (see `kit.js`).

Because a chrome is cross-cutting — it renders *every* module on the instance — treat
changes here with the same care as the shell. It hot-reloads like any module (it's mounted,
not part of `atelier/`), so a browser reload picks up edits; no server restart needed.

## Icons — two separate systems

This trips up module authors, so it's the first thing to know:

| Where | Library | How |
|---|---|---|
| The chrome's **own UI** (chevrons, settings cog, the add button, dialogs…) | **heroicons** (`@heroicons/react/16/solid`) | imported directly in `frontend.jsx` |
| A **module's rail icon** (`meta.icon`) | **lucide** (`lucide-react`) | a *string name*, rendered by the chrome |

### Module rail icons (`meta.icon`)

A module names its rail icon with a string in **lucide's own kebab-case vocabulary**:

```js
export const meta = { icon: 'chef-hat', name: 'Sous', group: 'tools' }
```

- **Any** [lucide icon](https://lucide.dev/icons) works — `meta.icon` is matched against the
  full set (~1700 icons). Browse the gallery and copy the name shown there.
- It's a **string only — never import an icon library in a module.** Module frontends are
  transformed per-file, not bundled; only `react`, `react-dom`, and `@atelier/kit` resolve.
  An `import … from 'lucide-react'` (or `heroicons`) in a module will fail to load. The
  chrome owns the icon set; the module just names which one.
- An unknown name (typo, or a name lucide doesn't have) falls back to a neutral square and
  logs a one-line `console.warn` naming the bad value — so a mistake surfaces instead of
  silently rendering the wrong icon.

Lucide icons are **stroke/outline** glyphs, where catalyst's UI heroicons are solid. Catalyst
styles every `[data-slot=icon]` with a solid `fill-*` utility, which would flood an outline
icon solid — so `styles.css` has an unlayered `.lucide` rule that renders them as intended
(no fill, themed via `stroke`, mirroring catalyst's muted→bright icon schedule). If you
change the icon colors in `sidebar.jsx`, keep the `.lucide` strokes in `styles.css` in sync.

> Historical note: rail icons used to be a hand-maintained map of ~20 lucide-style names →
> heroicons. That silently fell back to a square for any unlisted name, which is why modules
> "set the wrong icon." Rendering lucide directly removed the map (and made several icons
> correct again — e.g. `chef-hat` is now a chef hat, not the fire-icon stand-in).

## Styles / Tailwind

`styles.css` is `@import 'tailwindcss'` plus catalyst tokens (Inter font stack, the
`dark` custom-variant driving `html.dark`, a couple of `@keyframes`, and the docs-viewer
prose styles). The shell's Tailwind scanner generates utilities from every `.jsx` in the
instance, so catalyst's classes — and the classes modules write — all get compiled. The
shell defines no design tokens; they live here.

## Layout

- `frontend.jsx` — the `chrome(props)` root: sidebar rail, workspace switcher, keyboard
  nav, the ⌘K command palette, favicon/theme-color, the settings + docs dialogs, and
  `ModIcon`.
- `sidebar-layout.jsx` / `sidebar.jsx` / `navbar.jsx` / `dropdown.jsx` / … — Catalyst
  components (their utility classes are what the scanner picks up).
- `styles.css` — Tailwind + tokens + the `.lucide` icon override.
- `kit.js` — primitives published to modules via `@atelier/kit`.
- `backend.js` — serves this chrome's API (e.g. the shell docs for the in-app viewer).
