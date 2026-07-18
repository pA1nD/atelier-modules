<!-- atelier-module-dev: chromes playbook v1 -->
# Atelier Shell

**This folder holds the shipped themes — and, in some setups, the atelier shell itself.** When the shell lives here it is in `atelier/` — `server.js`, `build.js`, `discovery.js`, `client.jsx`, `chrome-resolve.js`, `package.json` — and the chromes (e.g. `catalyst-chrome/`) sit alongside it. Every module on every machine running this shell hangs off all of it: the shell contract *and* the active theme's `@atelier/kit`. So **keep changes minimal and be very careful** — a change here ripples to every dependent module at once. None of the shell files hot-reload; bounce the instance (`npm run dev`) after editing them.

The full shell contract + module-authoring guide is documented — read it before changing any contract.

@{{INSTANCE}}/atelier/docs/README.md

## 1. The Shell Surface

**Atelier deliberately provides very few things.** Everything inside `atelier/` is cross-cutting: it affects every module on this machine and every module on every other machine running the shell. Your job is to keep that surface small, sharp, and stable — not to grow it for hypothetical needs.

The surface you maintain — each item is a contract modules depend on:

- **Streaming** — the single WebSocket at `/_atelier/ws`. Frontend: `window.__atelier.self(import.meta.url).subscribe(cb)` (workspace-aware — listens on the module's own `<ws>/<id>` topic, never hardcoded). Backend: `ctx.broadcast({ type, ... })` — the shell stamps the topic with the module's `<ws>/<id>` qualifiedId; a module can't choose it. No SSE, no polling, no second WS.
- **Module shape** — a folder with `frontend.jsx` (`default function Module() {}`) and/or `backend.js` (`default { async mountRoutes(router, ctx) {} }`). One shape is the feature; hot-reload assumes it.
- **Visuals** — the shell ships zero pixels and **no default theme**. A chrome module (`meta = { isChrome: true }`) owns visuals and may publish primitives via the `@atelier/kit` import specifier (rewritten to `/modules/<chromeQid>/kit.js`); the active chrome is the `defaultChrome` setting in `atelier.config.json`, else elected among installed ones (a module may pin a non-default one via `meta.chrome`). The chromes here live in this folder because their published kit is itself cross-cutting — change one and it ripples to every module that imports from it, so treat them with the same care as the shell. No Material UI / shadcn / Chakra at the shell level.
- **`window.__atelier` and `ctx`** — every helper added becomes API modules can lock onto. Cheap to add, painful to remove.
- **`atelier/package.json` deps** — modules don't ship their own React / store / WS client. Bumping or removing a dep ripples to all of them.
- **Hot reload** — long-running module state must survive `frontend.jsx` / `backend.js` reloads. Breaking that is a regression even if no test catches it.
- **Fail loud, fail isolated** — a module's failure (load error, handler throw, uncaught async error) surfaces on *its own* `/api` as a `500` + a dev overlay, never silently, and never crashes the shell or other modules. Surface errors where the author looks (the response / the overlay), don't swallow them into a log only the operator might read.

Rules of the road:

- Before **adding** anything: "Does a real module need this *now*, or am I anticipating?" If anticipating, don't. If a single module needs it, first ask whether it could live in the module.
- Before **removing or renaming** anything: ask the operator and name the specific contract you'd change. Modules on other computers may depend on it.
- Shell files (`atelier/server.js`, `atelier/build.js`, `atelier/discovery.js`, `atelier/client.jsx`, `atelier/chrome-resolve.js`, `atelier/package.json`) **don't hot-reload**. Mention this in shell-touching work so the operator knows to bounce `npm run dev`. (The chromes hot-reload like any module — they're mounted, not part of `atelier/`.)

Why: this is a single runtime by design, not a microkernel. The shell stays small only if you keep saying no from inside it.

**Keep `atelier/` clean of our setup.** A fresh checkout of `atelier/` ships *nothing* — no chrome, no module, no defaults; others run it with none of our stuff. So never name our specific chromes, modules, ports, hostnames, or personal folder paths in `atelier/`'s docs **or** code comments — keep examples generic (`kanban`, `my-chrome`, `bigcorp`, …) and document contracts inline (no links to sibling folders that don't exist in a clean checkout). Naming our chromes/modules *here* — in this repo's `CLAUDE.md`, the operator's dev guide — is fine; the rule is the shipped `atelier/` library.

## 2. Verify Visuals Through The Browser

**Whenever your changes touch how a page looks or behaves on screen, render-verify before reporting done.** Type-checks and tests prove correctness; a browser proves the feature.

Shell changes need extra care here: a shell visual change affects every module's rendering, not just one screen. After editing a chrome (`catalyst-chrome/` etc.), `atelier/client.jsx`, or shell layout in `server.js`, render at least one module page in addition to the shell home, so you catch ripple effects.

Use **browser-harness** (`new_tab`, `wait_for_load`, `capture_screenshot`, `js`, `cdp`, `ensure_real_tab`, …) — it defines the helpers and the design constraints behind them.

### Render-verify pattern

The shell serves at `http://localhost:{{PORT}}/` and modules at `http://localhost:{{PORT}}/<module>` — open the page, let it settle, then `capture_screenshot()` + `page_info()`. For shell changes, open a module page too, to confirm the ripple is clean.

Clicking atelier UI: `click_at_xy()` works, but for atelier's own markup prefer `js("document.querySelector(...).click()")` — selectors are stable since we own the DOM.

### When to render-verify

- You changed a chrome (a chrome's frontend.jsx or styles.css — any token, any selector).
- You changed `atelier/client.jsx` (layout, components, hooks exposed on `window.__atelier`).
- You changed how `atelier/server.js` renders shell HTML or wires module routes.
- You touched the chrome's `kit.js` primitives consumed by modules via `@atelier/kit`.

When to skip: pure backend / data work with no UI surface, prompt-only edits, doc files, refactors with green tests and no DOM-visible effect.

### Before reporting visual work as complete

1. Screenshot the shell home and at least one module page with `capture_screenshot()`.
2. Eyeball: typography size, alignment, spacing, dark-mode colors, no broken icons. The active chrome's element-level CSS (e.g. `catalyst-chrome/styles.css`) can shadow utility classes — confirm rendered sizes match what you wrote.
3. Check the browser console via `cdp("Runtime.evaluate", ...)` or `js("...")` for errors.
4. Note what you saw in the response. "Verified via browser-harness screenshot on shell + <module>, no console errors" is the right hand-off.

If you can't render-verify (server down, browser unavailable, no permission), say so explicitly rather than implying it works. Don't claim visual success from compile-checks alone.

**Restart after shell edits.** `atelier/server.js`, `atelier/build.js`, `atelier/discovery.js`, `atelier/client.jsx`, `atelier/chrome-resolve.js`, `atelier/package.json` don't hot-reload — restart the instance (`npm run dev`, or kickstart its service if it runs as one). (Chromes hot-reload like any module.)
