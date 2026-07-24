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
full skill. On your machine (right): the literal load order, read live —
`~/.claude/CLAUDE.md` first (top-level chapters drawn as a document with
bodies omitted), then `~/.claude/rules/*.md` A→Z (per-file owner marker,
`@`-imports, byte/line counts), the four-rules chapter or rule lit when
present. Every chapter and rule file clicks open in a Pretty/Raw reading
modal.

## Backend (`backend.js`)

Pure Node builtins, no deps.

- `GET /snapshot` — `~/.claude/CLAUDE.md` parsed live (chapters, bytes, "ours" detection = the section carrying all four rule titles), plus every `~/.claude/rules/*.md` (owner marker, `@`-imports, byte/line counts).
- `GET /templates/global` — the four-rule template the modal renders and the install writes.
- `GET /chapter/:i` / `GET /rule/:file` — the reading modal's document sources (a CLAUDE.md chapter by index, a rules file by basename — no traversal).
- `POST /action/install-global-claudemd` — writes the four rules to `~/.claude/rules/instructions.md`; if a CLAUDE.md chapter already carries them, it's **moved** over verbatim (your customized text wins over the template) and CLAUDE.md is rewritten without it. Backups both sides; no-ops if a rules file already has them. Refuses without `{ confirm: true }` and streams over the shell WS.

## Design

Light page in the catalyst card (pins `meta.chrome = 'catalyst-chrome'`),
fuchsia accent, inline lucide icon paths (the `github` mark inlined — lucide
dropped brand icons). Responsive from birth: `grid-cols-1` base +
`minmax(0,fr)` tracks.
