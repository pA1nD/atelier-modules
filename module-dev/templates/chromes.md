<!-- atelier-module-dev: chromes playbook v1 -->
# Atelier Chromes

**This folder holds the chromes — the themes of the instance at `{{INSTANCE}}`.** Every module renders inside a chrome from here and imports its `@atelier/kit` primitives. So **keep changes minimal and be very careful** — a change here ripples to every dependent module at once. A chrome edit is never a side-effect of a module task; it is always its own task with its own authorization.

The chrome contract is documented — read it before changing anything:

@{{INSTANCE}}/atelier/docs/MODULES.md

## 1. The Surface You Maintain

Everything in a chrome is cross-cutting. Each item is a contract modules depend on:

- **`@atelier/kit`** — the primitives (Button, Dialog, Table, …) the chrome publishes via `kit.js`. Companion modules import them by name; renaming a primitive or changing its props breaks every one of them at once.
- **`styles.css`** — the design tokens (`--color-*`, `--font-*`) and any element-level CSS. Element selectors can shadow a module's Tailwind utilities — a "small" token change reshapes every page.
- **The chrome component** (`meta = { isChrome: true }`) — the rail, topbar, fonts, dark mode. It renders every module's `active.element`; a layout bug here is a layout bug everywhere.

Rules of the road:

- Before **adding** anything: "Does a real module need this *now*, or am I anticipating?" If anticipating, don't. If a single module needs it, first ask whether it could live in the module.
- Before **removing or renaming** anything: ask the operator and name the specific contract you'd change. Modules on other machines may depend on it.
- Chromes hot-reload like any module — edits are live on the next request.

## 2. Verify Visuals Through The Browser — Always

A chrome change affects every module's rendering, not just one screen. After any edit here, render at least one module page **in addition to** the shell home, so you catch ripple effects.

Use **browser-harness** (`new_tab`, `wait_for_load`, `capture_screenshot`, `js`, `cdp`, …) — the shell serves at `http://localhost:{{PORT}}/` and modules at `http://localhost:{{PORT}}/<workspace>/<module>`.

1. Screenshot the shell home and at least one module page with `capture_screenshot()`.
2. Eyeball: typography size, alignment, spacing, dark-mode colors, no broken icons. The chrome's element-level CSS can shadow utility classes — confirm rendered sizes match what you wrote.
3. Check the browser console via `cdp("Runtime.evaluate", ...)` or `js("...")` for errors.
4. Note what you saw in the response. "Verified via browser-harness screenshot on shell + <module>, no console errors" is the right hand-off.

If you can't render-verify, say so explicitly rather than implying it works. Don't claim visual success from compile-checks alone.
