<!-- atelier-module-dev: instance playbook v1 -->
# Atelier

**Building a module here?** The full contract — `ctx`, the real-time WebSocket, `@atelier/kit`, workspaces, and `atelier.config.json` — is documented. Always scan atelier docs and code first to become an expert in it, if you have not built up that context yet.

@{{INSTANCE}}/atelier/docs/README.md
@{{INSTANCE}}/atelier/docs/MODULES.md

## 1. The `atelier/` Shell Is Not Your Module — Don't Touch It, Be A Good Citizen

**Don't edit anything inside `atelier/` when working on another module — no exceptions.** That includes `atelier/server.js`, `atelier/build.js`, `atelier/discovery.js`, `atelier/client.jsx`, `atelier/package.json`, and every other file in that folder. Adding a dep to the shell `package.json` to unblock a module is not OK. The shell is cross-cutting; touching it from a module task is never a side-effect, always a separate task with its own authorization.

If a module needs something the shell doesn't provide — a new dep, a new endpoint, a new style token — name the gap and ask. Don't reach into `atelier/` to install it yourself.

Module `frontend.jsx` and `backend.js` edits hot-reload automatically; shell files require a manual `npm run dev` restart.

**Atelier deliberately provides very few things. What it does provide is meant to be used; for everything else, look how other modules do it and write your own simple version.**

- **Streaming** uses the shell's single WebSocket at `/_atelier/ws`. No module-private WS, no SSE, no polling. Frontend: `const self = window.__atelier.self(import.meta.url); self.subscribe((frame) => { ... })` — workspace-aware, listens on your module's own `<ws>/<id>` topic; **never hardcode a topic string** (it breaks when the module moves workspaces). Backend: `ctx.broadcast({ type, ... })` — the shell stamps the topic with your module's `<ws>/<id>` qualifiedId; you can't set it.
- **Module shape** defaults to a single file — a folder with `frontend.jsx` (`default function Module() {}`) and/or `backend.js` (`default { async mountRoutes(router, ctx) {} }`). Split into multiple files only when a concrete reason exists (a second consumer, a dep the shell shouldn't carry, a real build step). Name the reason in the change.
- **Visuals** come from the active chrome via the `@atelier/kit` import specifier (the shell rewrites it to `/modules/<chromeQid>/kit.js`). Reuse the chrome's primitives and `--color-*` / `--font-*` tokens. Match Atelier's posture: simple, minimal, monospace-leaning, generous whitespace, restrained color. No Material UI / shadcn / Chakra inside a module.
- **No cross-module dependencies** without explicit operator approval. Importing another module's files, reading its data, or coupling to its internals — none of it without prior sign-off.
- **Don't hardcode module names, URLs, or paths.** The same module can be mounted under different qualified IDs in different workspaces. The only thing to rely on is the shell contract (the WebSocket, `window.__atelier`, `ctx`, `@atelier/kit`). Read your own identity and routing from `ctx` and the shell's API, never from a string literal.
- Modules hot-reload both in the frontend and backend — long-running functionality must survive that. `mountRoutes` may return a teardown function (the canonical cleanup hook). Long-lived state belongs in `ctx.module(id)` slots, not module scope.

Why: this is a single runtime by design, not a microkernel. Each module that grows its own WS / design system / dependency graph turns the project into N small projects you have to maintain in parallel. When something genuinely doesn't fit, name the gap and propose extending the shell.

## 2. Verify Visuals Through The Browser

**Whenever your changes touch how a page looks or behaves on screen, render-verify before reporting done.** Type-checks and tests prove correctness; a browser proves the feature.

Use **browser-harness** — it defines the helpers (`new_tab`, `wait_for_load`, `capture_screenshot`, `click_at_xy`, `js`, `cdp`, `ensure_real_tab`, …) and the design constraints behind them.

### Render-verify pattern

Modules serve at `http://localhost:{{PORT}}/<module>` — open it, let it settle, then `capture_screenshot()` + `page_info()`.

Clicking atelier UI: `click_at_xy()` works, but for atelier's own markup prefer `js("document.querySelector(...).click()")` — selectors are stable since we own the DOM.

### When to render-verify

- You added or restyled UI (margins, typography, layout, colors).
- You renamed/moved a route or page.
- You changed a frontend hook, store subscription, or WS handler.
- You touched the active chrome's `@atelier/kit` primitives you consume (a chrome edit is a separate, cross-cutting task).

When to skip: pure backend / data work with no UI surface, prompt-only edits, doc files, refactors with green tests and no DOM-visible effect.

### Before reporting visual work as complete

1. Screenshot the changed view with `capture_screenshot()`.
2. Eyeball the screenshot — typography size, alignment, spacing, dark-mode colors, no broken icons. If you wrote it for `<h1>`, confirm the rendered size matches what you wrote (the active chrome's element-level CSS can shadow Tailwind utilities — see the active chrome's `styles.css`, e.g. `catalyst-chrome/styles.css`).
3. Check the browser console via `cdp("Runtime.evaluate", ...)` or `js("...")` for errors. Interaction-specific patterns live in the [browser-harness interaction-skills](https://github.com/browser-use/browser-harness/tree/main/interaction-skills).
4. Note what you saw in the response. "Verified via browser-harness screenshot, no console errors" is the right hand-off.

If you can't render-verify (server down, the browser's CDP port in use by something else, no permission), say so explicitly rather than implying it works. Don't claim visual success from compile-checks alone.

## 3. Module Development

Write modules in such a way that they'll also run without problems on other systems. if any dependency is needed. the module should always declare it's own dependencies and install them instead of relying what's on the developers host system.

The modules are currently mounted into a card that has padding. So don't add a card at the top yourself and don't use designs that assume they are full-width. Instead directly use the full space and at your outer bounds of the module design assume there's a padding.

Make sure to implement navigation properly. If you have subpages make sure the back button works and that they change the url. So reload works and clicking on the sidebar to go to the initial screen works.
