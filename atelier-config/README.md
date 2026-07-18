# Atelier Config

The instance's settings panel — everything that defines your Atelier, edited
from inside it. Ported from the marketplace dock's Configure surface, minus
everything marketplace: this module knows nothing about catalogs or uplinks;
it only reads and edits **the instance itself**.

## The tabs

| Tab | What it does |
|---|---|
| **General** | `atelier.config.json` as a friendly form (identity / network / behavior) or a highlighted raw-JSON editor. Saves are staged with a save bar, shape-validated, written atomically, and **patch-merged**: only the keys you changed land on top of the current on-disk file, and a key that drifted underneath you is rejected as a conflict instead of clobbered. Fields that need a restart are marked; a banner tracks pending ones with a one-click **Restart Atelier** (under launchd it just exits and KeepAlive relaunches; a manual `npm run dev` re-execs itself detached). |
| **Apps & Workspaces** | Every mounted module resolved with its real meta, grouped into workspace lanes, coloured by the chrome it renders in. Drag an app between workspaces to move it; link a local folder as a new path-mount; unlink (config-only — files and data untouched); create / rename / delete workspaces. The shell folder and this module itself are marked `system` and can't be unlinked. |
| **System check** | The package managers Atelier and its modules typically need (node / npm / git / uv / brew), with versions, on a widened PATH so launchd-started servers still resolve them. |
| **Start at login** | This very instance as a macOS user LaunchAgent (`gui/<uid>`, no sudo): install / start / stop / restart / uninstall, live launchd state, crash-loop detection with the error-log tail pushed over the WS, and the one-time **port takeover** that hands the port from your manual dev server to the service. If a LaunchAgent already runs this instance, its label is **adopted** — never a second job fighting for the port. Reports itself unsupported off macOS. |
| **Activity** | The server's real stdout/stderr, teed into a ring buffer and streamed live over the shell WebSocket — filterable by level and source. |

## Realtime

No client polling. The backend watches launchd on one timer (diff → broadcast
on change), watches the managed agent's log files with `fs.watch`, and pushes
log lines as they happen; clients fetch once and subscribe.

## Portability notes

- The instance root is resolved the way the shell's own `resolveRoot` does
  (`ATELIER_ROOT`, else the parent of the server's `PWD`) — **not** from this
  module's folder, so the module works as a path-mount from anywhere.
- Pure Node builtins, no deps. `config-util.mjs` (the pure config-edit helpers)
  is unit-tested: `npm test`.
- Icons are inline lucide geometry (`icons.js`) — module frontends aren't
  bundled, so the module carries the paths it uses.
