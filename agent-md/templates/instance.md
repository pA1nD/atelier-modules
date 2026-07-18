<!-- atelier-agent-md: instance-folder playbook v1 -->
# Atelier — This Folder Runs The Instance

**This folder is the wiring, not the workshop.** It holds
`atelier.config.json` (the instance's source of truth), the shell (`atelier/`),
the environment (`.env`), and the collections working copies (`_collections/`).
Three folders share the work, and each has one job:

| Folder | Job | Agents may edit? |
|---|---|---|
| `{{INSTANCE}}` (this one) | Runs the instance — config, env, shell | Config edits only, deliberately |
| `{{MODULES}}` | Every module's working copy — **features are built here** | Yes — this is the workshop |
| `{{CHROMES}}` | The chromes (themes) — visual language for every module | Not from a module task |

Why the split: an agent building a feature holds one module in its head — small
enough to fit a context window — and physically cannot wreck the shell or
restyle the whole system, because those live in folders its task never touches.
The config below is the single wiring point that composes them.

**Building a module?** Work in `{{MODULES}}` — its own `CLAUDE.md` carries the
module playbook. The full shell contract is documented here:

@atelier/docs/README.md
@atelier/docs/MODULES.md

## Rules for this folder

- **Never edit `atelier/`** (`server.js`, `build.js`, `discovery.js`,
  `client.jsx`, `chrome-resolve.js`, `package.json`). It is the frozen
  baseline every module depends on; changes there are their own task with
  their own authorization, and need a manual restart.
- **`atelier.config.json` is the one file you do edit** — to mount a new
  module (a path entry pointing into `{{MODULES}}`), move one between
  workspaces, or change settings. Prefer editing it through the instance's own
  settings UI when one is installed (the `atelier-config` module): writes are
  validated, atomic, and merge-safe.
- New modules land in `{{MODULES}}` and new chromes in `{{CHROMES}}` — the
  `installPath` setting in the config points the `atelier add` installer
  there, so installs follow the layout automatically.
- Secrets live in `.env`, never in a module folder and never in the config.
