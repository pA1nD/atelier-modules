# CLAUDE.md

The note Claude reads before it writes a line. Extracted from the retired
**claude5iq** module: its CLAUDE.md chapter, now a standalone module (same
lineage as `statusbar` and `horse-browser`).

> The module **id** is `claude-md` — atelier ids can't contain dots
> (`^[a-zA-Z0-9][a-zA-Z0-9_-]*$`) — but the rail shows **CLAUDE.md** via
> `meta.name`.

## The page

The story (left): Karpathy's January 2026 thread → the multica-ai CLAUDE.md
(~183k stars, MIT) → its essence as four rules, with a modal that renders the
full skill. The status (right): your real `~/.claude/CLAUDE.md` read live —
its top-level chapters drawn as a document with bodies omitted, the
four-rules chapter lit when present — plus the Horse Browser playbooks
@-import that shares the same file, with its own drift check.

## Backend (`backend.js`)

Pure Node builtins, no deps.

- `GET /snapshot` — `~/.claude/CLAUDE.md` parsed live (chapters, bytes, "ours" detection = the section carrying all four rule titles), plus the playbooks-import state (`claude-md.sh check`, cached 90s, resolved from the horse-browser launcher's realpath — no cross-module coupling).
- `GET /templates/global` — the four-rule template the modal renders and the install appends.
- `POST /action/install-global-claudemd` — **appends** the block (never clobbers), backs the file up first; no-ops if the rules are already present. `POST /action/install-browser-config` — `claude-md.sh apply`. Both refuse without `{ confirm: true }` and stream over the shell WS.

## Design

Light page in the catalyst card (pins `meta.chrome = 'catalyst-chrome'`),
fuchsia accent, inline lucide icon paths (the `github` mark inlined — lucide
dropped brand icons). Responsive from birth: `grid-cols-1` base +
`minmax(0,fr)` tracks.
