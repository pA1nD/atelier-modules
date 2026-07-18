<!-- atelier-floorplan: modules-folder playbook v1 -->
# Atelier Modules — Agent Playbook

**Every subfolder here is one Atelier module**, mounted into the instance at
`{{INSTANCE}}` by a path entry in its `atelier.config.json`. Features are built
HERE — never in the instance folder, never in the shell, never in the chromes
folder (`{{CHROMES}}`).

**Building a module?** The full contract — `ctx`, the real-time WebSocket,
`@atelier/kit`, workspaces, and `atelier.config.json` — is documented. Always
scan the atelier docs first to become an expert in it, if you have not built up
that context yet:

@{{INSTANCE}}/atelier/docs/README.md
@{{INSTANCE}}/atelier/docs/MODULES.md

## 1. The `atelier/` Shell Is Not Your Module — Don't Touch It, Be A Good Citizen

**Don't edit anything inside `{{INSTANCE}}/atelier/` when working on a module — no
exceptions.** That includes `server.js`, `build.js`, `discovery.js`,
`client.jsx`, `package.json`, and every other file in that folder. Adding a dep
to the shell `package.json` to unblock a module is not OK. The shell is
cross-cutting; touching it from a module task is never a side-effect, always a
separate task with its own authorization. The same goes for the chromes in
`{{CHROMES}}` — visuals are the chrome's job, and a chrome edit ripples into
every module at once.

If a module needs something the shell doesn't provide — a new dep, a new
endpoint, a new style token — name the gap and ask. Don't reach in and install
it yourself.

Module `frontend.jsx` and `backend.js` edits hot-reload automatically; shell
files require a manual restart of the instance.

**Atelier deliberately provides very few things. What it does provide is meant
to be used; for everything else, look how other modules do it and write your
own simple version.**

- **Streaming** uses the shell's single WebSocket at `/_atelier/ws`. No
  module-private WS, no SSE, no polling. Frontend:
  `const self = window.__atelier.self(import.meta.url); self.subscribe((frame) => { ... })`
  — workspace-aware, listens on your module's own `<ws>/<id>` topic; **never
  hardcode a topic string**. Backend: `ctx.broadcast({ type, ... })` — the
  shell stamps the topic with your module's qualifiedId; you can't set it.
  The realtime pattern that works: the poll lives SERVER-side (one watcher for
  all viewers — tick, diff, broadcast only on change); clients fetch a snapshot
  once on mount, then just listen.
- **Module shape** defaults to a single file — a folder with `frontend.jsx`
  (`default function Module() {}`) and/or `backend.js`
  (`default { mountRoutes(router, ctx) {} }`). Split into multiple files only
  when a concrete reason exists. Write `mountRoutes` synchronous unless a
  mount-time await is genuinely needed, and clear a previous mount's timers /
  watchers at mount start (store them on `ctx.module(ctx.id)`), so hot reloads
  never stack them.
- **Visuals** come from the active chrome via the `@atelier/kit` import
  specifier. Reuse the chrome's primitives and `--color-*` / `--font-*` tokens.
  Match Atelier's posture: simple, minimal, monospace-leaning, generous
  whitespace, restrained color. No Material UI / shadcn / Chakra inside a
  module.
- **No cross-module dependencies** without explicit operator approval.
- **Don't hardcode module names, URLs, or paths.** The same module can be
  mounted under different qualified IDs in different workspaces. Rely only on
  the shell contract (the WebSocket, `window.__atelier`, `ctx`,
  `@atelier/kit`). Read your own identity and routing from `ctx` and the
  shell's API, never from a string literal.
- Modules hot-reload both frontend and backend — long-running functionality
  must survive that. `mountRoutes` may return a teardown function; long-lived
  state belongs in `ctx.module(id)` slots, not module scope.

## 2. Verify Visuals Through The Browser

**Whenever your changes touch how a page looks or behaves on screen,
render-verify before reporting done.** Type-checks and tests prove correctness;
a browser proves the feature.

Modules serve at `http://localhost:{{PORT}}/<workspace>/<module>` — open the
page with your browser tooling (e.g. [browser-harness](https://github.com/browser-use/browser-harness):
`new_tab(url)`, `wait_for_load()`, `capture_screenshot()`, `js(...)`), let it
settle, then screenshot and read the DOM.

Before reporting visual work as complete:

1. Screenshot the changed view and eyeball it — typography, alignment, spacing,
   dark-mode colors, no broken icons.
2. Check the browser console for errors.
3. Check the page at a phone width (~390px) — the content card must never
   scroll horizontally.
4. Note what you saw in the response. "Verified via screenshot, no console
   errors" is the right hand-off.

If you can't render-verify, say so explicitly rather than implying it works.
Don't claim visual success from compile-checks alone.

## 3. Module Development

Write modules so they also run without problems on other systems. If any
dependency is needed, the module declares its own dependencies (its own
`package.json` / `requirements.txt`) and installs them, instead of relying on
what happens to be on the developer's host system. In `backend.js`, load
node_modules deps with `createRequire(import.meta.url)('pkg')` — never a static
bare `import` (the backend hot-loads from a `data:` URL, which can't resolve
bare specifiers).

Modules are mounted into a card that has padding. Don't add a card at the top
yourself and don't use designs that assume full-width. Use the full space, and
at your outer bounds assume there's a padding.

Implement navigation properly. Sub-pages go through
`window.__atelier.useRoute()` (`{ path, navigate }` — real pushState
sub-routes), so the back button works, the URL changes, reload works, and
clicking the sidebar returns to the initial screen.
