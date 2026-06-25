# Build your first module

**Atelier is a harness for building apps fast — especially with coding agents.**
Its shape is deliberate: it fixes the things that are hard to get right *across* an
app, so each app you build can stay small, self-contained, and safe. It's a
separation of concerns into three layers, frozen-to-flexible:

- **Shell** — the frozen baseline: the build, routing, the real-time channel, hot-reload, workspaces, and auth. You build *on* it; you never rebuild it.
- **Chrome** — visual coherence: one theme wraps every app (rail, fonts, colors, `@atelier/kit`), so dozens of apps look like one product.
- **Module** — your feature: a `frontend.jsx` and/or a `backend.js`. That's the only part you write.

Every module gets a real stack out of the box — **Node 24+**, **React**, **Tailwind
v4**, and a real-time **WebSocket** — plus `@atelier/kit` components, scoped HTTP
routes, hot-reload, workspaces and auth. The stuff that usually balloons an app —
bundler, design system, sockets, auth, routing — is already handled, so a module
stays tiny: a folder with a single `frontend.jsx` is already a working app. Let's
make one, then hand the keys to an agent.

## 1. Make a folder

Next to the other modules in your instance, create a folder — its name is the
module's id:

```
hello/
└─ frontend.jsx
```

## 2. Write `frontend.jsx`

That one file *is* the module. `React` is already global (don't import it), and
Tailwind classes come from the active chrome — so just write a component:

```jsx
export const meta = { name: 'Hello', icon: 'sparkles' }

export default function Module() {
  const [n, setN] = React.useState(0)
  return (
    <div className="p-8 text-center">
      <h1 className="text-2xl font-bold tracking-tight">Hello, Atelier 👋</h1>
      <p className="mt-2 text-sm text-zinc-500">Your first module is live.</p>
      <button
        onClick={() => setN(n + 1)}
        className="mt-5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
      >
        clicked {n} {n === 1 ? 'time' : 'times'}
      </button>
    </div>
  )
}
```

## 3. See it live

That's it — no install, no restart. The shell discovers the folder, puts **Hello**
in the rail (with the `sparkles` icon), and serves it. Open it and click the
button. Edits hot-reload as you save.

> A module renders inside a padded card, so don't add your own outer card — just
> use the space. For real apps, reach for `@atelier/kit` primitives and the
> chrome's `--color-*` tokens so you match the rest of Atelier.

That's the whole contract for the frontend. Add a `backend.js` when you need
routes or real-time, and you've got a full app. The details — `ctx`, the shared
WebSocket, workspaces, hot-reload — are all in the **Atelier reference** below.

## Now let an agent go hard

You've seen how small a module is. The fun part: an agent can hold an entire
module in its head and build something genuinely impressive in one pass. Open
your coding agent **inside the instance folder** and paste this:

```
Build me an Atelier module — a single self-contained feature that runs in the
Atelier shell. Make it genuinely impressive.

First, read the Atelier docs (start with the **Modules** reference) so you follow
the contract exactly:
- A module is a `frontend.jsx` (and an optional `backend.js`) in its own folder.
- `React` is global — use hooks, but never `import React` and never import npm
  packages in `frontend.jsx`.
- Style with Tailwind classes + the active chrome's `@atelier/kit` primitives and
  `--color-*` tokens. Keep it minimal, monospace-leaning, lots of whitespace —
  match Atelier.
- Real-time uses the shell's one WebSocket: frontend
  `window.__atelier.self(import.meta.url).subscribe(...)`, backend
  `ctx.broadcast(...)`. Routes mount under `ctx` at `/api/<ws>/<id>`.
- Deep-linkable sub-pages via `window.__atelier.useRoute()` — make the back
  button and reload work.
- Never edit the `atelier/` shell. Declare any backend deps in the module's own
  `package.json`. The module renders inside a padded card — don't add your own.

Then pick an idea with a live pulse and build it end to end — e.g. a streaming
metrics dashboard, a collaborative scratchpad, a tiny multiplayer game, a
markdown notepad with live preview, or a real-time activity feed. Wire the
backend to broadcast and the frontend to subscribe so it updates live.

When you're done, open it in the browser and verify it renders with zero console
errors. Go hard — make me say "wow".
```

Tweak the idea, the style, the scope — then let it run. When it's done, publish it
in a marketplace (see **Publish a marketplace**) so anyone can install it.
