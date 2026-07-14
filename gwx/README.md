# gwx

All your Google accounts, one safe command. Extracted from the retired
**claude5iq** module: its gwx chapter — the fourth and final extraction (after
`statusbar`, `horse-browser`, and `claude-md`).

## The page

The suite it reaches (twelve brand-tiled Workspace apps with example asks) →
three features side by side: **every account** (the live registry with per-account
sign-in state), **every kind of request** (reads fan out across accounts in
parallel; a write always names exactly one — `exit 3` otherwise), and the
**ready-made skills** library — a searchable, service-filtered catalogue modal
that renders each SKILL.md with a real little markdown renderer (fences,
tables, blockquotes). Then: why a CLI + a skill beats an MCP, the three
getting-started commands, and the live install card.

## Backend (`backend.js`)

Pure Node builtins, no deps.

- `GET /snapshot` — the account registry (`~/.config/gwx/accounts.list`), per-account sign-in (stored `credentials.enc`), gwx/gws versions (gws checked against npm `@googleworkspace/cli` via the happy-eyeballs-safe fetch).
- `GET /gwx/skills` · `GET /gwx/skill/:id` — the rewritten skill catalogue cached at `~/.cache/gwx/skills-rewritten` (basename-guarded).
- `POST /action/gwx-whoami` — streams `gwx whoami` (timeboxed via `GWX_TIMEOUT`). `POST /action/install-gwx` — **npm — `@pa1nd/gwx`** (refuses without `{ confirm: true }`); install and update are the same command, and the card shows it in the open (`npm install -g @pa1nd/gwx`). gwx AND gws latest-versions checked against npm. Children tracked + killed on hot-reload/shutdown.

## Design

Light page in the catalyst card (pins `meta.chrome = 'catalyst-chrome'`), amber
accent, inline lucide icon paths. The skills modal is phone-aware: below `sm`
the list and the detail pane take turns, with a back arrow in the detail header.
