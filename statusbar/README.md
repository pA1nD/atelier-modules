# Status Bar

A name for every agent, and a line that wears it. Extracted from the retired
**claude5iq** module: its two opening chapters, now a standalone module.

## The two chapters

| # | Chapter | What it covers |
|---|---|---|
| 01 | **Session Codes** | The identity engine: one session id → callsign + emoji + colour, computed by one hash the terminal, the dashboard, and the browser all agree on. A live pipeline (FNV-1a → murmur3 → `%48`) decodes a rolling id; the 48-slot grid lights the result; the sessions running on this machine resolve live. |
| 02 | **The Status Bar** | The Claude Code statusline, dissected piece by piece — folder, model, context fill, identity, last prompt — then wired into `~/.claude/settings.json` from the page (merge, never clobber; backed up first). |

## Files

- `frontend.jsx` — compact header (live session chips + wired state) + the two chapters, scroll-spied and deep-linkable via `useRoute`.
- `sections/codes.jsx` · `sections/statusbar.jsx` — the two chapters, one file each (copied from claude5iq; kept split so each stays a readable unit).
- `lib.jsx` — the shared design system: the codename engine, live-data hooks (`useSnapshot`, `useActions`), and the narrative scaffold (`ChapterIntro`, `Step`, `Card`, `ActionConsole`).
- `term.jsx` — the shared terminal-mock primitives both chapters render.
- `statusline.sh` — the script the module installs. **Byte-identical hash** (FNV-1a 32-bit + murmur3 finalizer) to `lib.jsx` and `backend.js`, so the emoji/colour/callsign match across terminal, dashboard, and browser tab group.

## Backend (`backend.js`)

Pure Node builtins, no deps.

- `GET /snapshot` — running Claude sessions (as codenames), jq + Homebrew presence, the wired statusline.
- `POST /action/install-statusbar` — installs jq if missing (Homebrew), then points `settings.json`'s `statusLine` at this module's `statusline.sh`; refuses without `{ confirm: true }`, backs up the target first, merges rather than clobbers. Streams every line over the shell WebSocket (`action-log` / `action-done`). Children are tracked and killed on hot-reload and shutdown.

## Design

Rides the catalyst chrome's tokens: Inter via `--font-sans`, JetBrains Mono via
`--font-mono` (mono reserved for code), dark mode via `html.dark`, white
`rounded-2xl` cards on catalyst's zinc palette, the codename palette (8 colours)
as the one saturated accent. Pins `meta.chrome = 'catalyst-chrome'` and inlines
its own lucide icon paths (the catalyst chrome exposes no icon global).
