<!-- atelier-agent-md: chromes-folder playbook v1 -->
# Atelier Chromes — Handle With Care

**This folder holds the chromes (themes) — and possibly the shell itself.**
Every module of the instance at `{{INSTANCE}}` renders inside a chrome from
here and imports its `@atelier/kit` primitives. So **keep changes minimal and
be very careful** — a change here ripples to every dependent module at once.
Module agents never edit this folder as a side-effect of a feature; a chrome
change is always its own task with its own authorization.

The full shell contract + module-authoring guide:

@{{INSTANCE}}/atelier/docs/README.md

## The surface you maintain

Everything here is cross-cutting. Each item is a contract modules depend on:

- **`@atelier/kit`** — the primitives (Button, Dialog, Table, …) a chrome
  publishes via `kit.js`. Companion modules import them by name; renaming or
  changing props breaks every one of them at once.
- **`styles.css`** — the design tokens (`--color-*`, `--font-*`) and any
  element-level CSS. Element selectors can shadow a module's utility classes —
  a "small" token change reshapes every page.
- **The chrome component** (`meta = { isChrome: true }`) — the rail, topbar,
  fonts, dark mode. It renders every module's `active.element`; a layout bug
  here is a layout bug everywhere.

Rules of the road:

- Before **adding** anything: does a real module need this *now*? If you're
  anticipating, don't. If a single module needs it, ask whether it could live
  in the module.
- Before **removing or renaming** anything: ask the operator and name the
  specific contract you'd change. Modules on other machines may depend on it.
- Chromes hot-reload like any module. If the shell (`atelier/`) also lives in
  this folder, its files do NOT hot-reload — restart the instance after
  editing them, and say so in your hand-off.

## Verify through the browser — always

A chrome change affects every module's rendering, not just one screen. After
any edit here, render at least one module page **in addition to** the shell
home, so you catch ripple effects. Screenshot, eyeball typography / spacing /
dark mode, check the console for errors, and say what you saw in your
hand-off. If you can't render-verify, say so explicitly — never claim visual
success from compile-checks alone.
