# Module Development

The three-folder layout for serious agent development — taught, detected, and
installed from one page.

## The layout

| Folder | Job | Agents edit it? |
|---|---|---|
| **instance** | Runs the instance: `atelier.config.json`, `.env`, the shell | Config only, deliberately |
| **modules** | Every module's working copy — features are built here | Yes — the workshop |
| **chromes** | The themes — visual language for every module | Not from a module task |

Why: an agent building a feature holds one module in its head — small enough
for a context window — and physically cannot wreck the shell or restyle the
whole system, because those live in folders its task never touches. The config
is the single wiring point (path-mounts + `installPath`), and each folder
carries a **CLAUDE.md playbook** so any agent that lands there already knows
the rules.

## What the page does

- **Reads your instance live** (over the shell WebSocket, no polling): where the
  three folders are (from `installPath`, or suggested as siblings of the
  instance), whether they exist, and each folder's CLAUDE.md state — honestly:
  *playbook installed* / *a CLAUDE.md of yours* / *none*.
- **Sets it up**: create the folders (`mkdir -p`, existing ones untouched),
  wire `installPath` (atomic config write), install the three playbooks —
  templates shipped in `templates/`, filled with your instance's real paths.
  An existing CLAUDE.md is **backed up next to the file and appended to,
  never clobbered**. Each template can be previewed before installing.
- **Migration scan**: every mounted module resolved and classified — modules
  still living inside the instance folder, chromes sitting in the modules
  folder. Moving folders on a running instance is deliberate work, so the page
  produces a copyable **agent brief** (move one module, update its config
  entry, verify, repeat) instead of a button.

## Tests

`npm test` — the pure helpers (template fill, CLAUDE.md state detection,
write/append-with-backup semantics) run against a temp dir.
