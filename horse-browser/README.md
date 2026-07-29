# Horse Browser

The **control board** for the Horse Browser — the dedicated browser your agents
drive, logged in and never in your way. One module is the single home for
everything about the agent browser: the live board, agent vision (compositing
probe + DeskPad), and the enforced Bitwarden credential broker. (Earlier
standalone modules were merged in; that `hb-auth` heritage survives only in
on-disk names installed machines already carry — the `atelier-hb-auth` hint
hook and the `de.pa1nd.hb-broker` daemon label.)

## The page — routes (`window.__atelier.useRoute`)

The board is deliberately lean — the essentials up top, everything heavier one
click into a subpage.

- **`''` — the control board.** Fits on one screen and doubles as a first-run
  setup guide.
  1. **Hero** — the banner with the brand, a live indicator, and **"read the
     full story →"** bottom-left; the **install & version box** (horse-browser
     vN · up to date / Update · the npm command) floated top-right as a distinct
     dark card, kept separate from the live-status panels.
  2. **Live status** — three *clickable* cards: **The browser** (Chrome ·
     port · sessions · a screenshot-health probe, → `runtime`), **Wired up**
     (is the always-on rule installed and current, → `docs`), and **Site
     skills** (per-host playbook count, → `site-skills`).
  3. **Credentials & access** — the whole auth system, live: the broker header
     with **"hand to an agent"** (+ copy button), a **Connection** panel
     (daemon · CLI · account · server · session token · vault), an **Agent
     integration** panel (plugin · hint hook · safety rule), and an **Access**
     panel (accounts reachable · collections · auto · ask — from cached group
     metadata, no vault unlock — plus a **quick account search**), then a
     **Recent access** log preview. Links out to Settings / all accounts / the
     full log.
- **`credentials` — broker settings**:
  connection management (lock / rebuild / disconnect / setup), the
  grant-by-collection table, and an agent-integration reference page. The
  reachable list and access log are their own pages now.
- **`skill` — "hand this to an agent":** the login skill as a page, with the
  copyable one-line prompt and a pretty/raw render of `/skill.md`.
- **`accounts` — reachable accounts:** the full list an agent can enumerate
  (name · username · host · tier · 2FA), filterable.
- **`activity` — the access log:** every credential request, allowed or denied,
  with account · site · tier · requesting session. Live.
- **`runtime` — the live operations view:** a real compositing probe (timed 1×1
  capture) + the DeskPad card and the **"why waking a sleeping display is the
  wrong fix"** reasoning (it's ops, so it lives here with agent vision, not in
  the marketing story), the process wall (agent
  sessions · harness daemons · tabs, callsign-matched via the tab-grouper
  extension), and the launcher's `heal.log` journal, pushed on change.
- **`docs` — how agents learn it:** the always-on rule (+ the broker's safety
  rule) and the on-demand manual in reading modals (pretty / raw), plus the
  **live verb reference** — every loaded verb introspected from
  `horse-browser verbs --json`, grouped into its three tiers (core →
  plugins → the operator's own `agent_helpers.py`, last wins), each verb with
  a docstring popup and a Read of its source file.
- **`site-skills` — per-site playbooks:** an explorer over
  `~/.config/browser-harness/agent-workspace/domain-skills/<domain.tld>/*.md`
  — the quirks/selectors/login-trap notes agents read on arrival, expandable
  to full content.
- **`story` — the full narrative:** cinematic banner → idea → the demo
  agent-browser wall → the engine (horse-harness, vendored since v0.9, the
  bitter lesson).

## Files

- `frontend.jsx` — the hero, the board, and the `story` / `runtime` / `docs` / `site-skills` routes.
- `credentials.jsx` — the Bitwarden broker UI (dark-restyled) + the board's live credentials card.
- `credentials.js` — the credential backend: `/broker/*`, `/helpers/*`, `/hints*`, `/state`, `/skill.md` routes; imports `./broker.js`.
- `broker.js` — the signed-daemon subsystem (socket RPC + build/launchd supervision + live audit tail).
- `native/` — the Swift daemon (`hb-broker`) + `HBBrokerCore` + `OriginCheck` tests. Builds out-of-tree into `~/Library/Application Support/hb-broker/build`.
- `lib.jsx` — the shared dark design system: narrative scaffold, live-data hooks, `Modal`, inline lucide icons.
- `media/` — the banner + eight site screenshots the demo wall scrolls, and `bitwarden.png` (served via `/images/:name`).

## Backend (`backend.js`)

Pure Node builtins, no deps.

- `GET /snapshot` — the CDP on :9223 (version · tabs · pid), harness daemons + venv readiness, DeskPad + display census (asleep / clamshell / virtual via CoreGraphics ctypes + ioreg), tool presence, versions.
- `GET /processes` — the live stack: sessions (codenames + cwd), daemons (HORSE_SESSION → callsign; pre-0.9 `browser_harness.daemon` leftovers flagged `legacy`), tabs (→ session via the extension's tab groups).
- `GET /compositing` — display census + DeskPad install/run state + `paintProbe()`, a REAL timed 1×1 `Page.captureScreenshot` (`ok`/`hang`/`no-browser`/`no-page` + ms). On page open + Recheck, never polled.
- `GET /verbs` — every loaded verb by tier (core / `plugin:<file>` / local), from `horse-browser verbs --json` (cached ~15s; empty when horse-browser isn't installed).
- `GET /site-skills` — the full per-host playbook tree (`domain-skills/<host>/*.md`) with content, for the explorer page; a cheap summary rides the snapshot.
- `GET /heal-log` — the launcher's incident journal (`~/.config/horse-browser/heal.log`), parsed; a dir watcher pushes the tail on change.
- `GET /images/:name` — bundled imagery (basename-guarded).
- `POST /action/:id` — the two module-owned actions that remain (installation itself is an agent task via `GET /setup.md`, not a button): `install-browser-config` (`claude-md.sh apply` — writes the always-on browser rule) and `launch-deskpad`. Streams over the shell WS; `install-browser-config` refuses without `{ confirm: true }`; children tracked + killed on hot-reload/shutdown.
- `GET /setup.md` (`?part=browser|credentials|display`, `&bare=1`) — the agent-run install skill, generated with this machine's live state; the setup wizard renders it. `GET /verbs` — every loaded verb by tier (cached; empty when horse-browser isn't installed). `GET /site-skills` — the per-host playbook tree.

## Credentials — the Bitwarden broker

The ENFORCED path: a signed local daemon (`native/`, compiled on first run into
`~/Library/Application Support/hb-broker` — outside the module tree) holds the
only Bitwarden session and gates every credential by the collection it lives in
(`auto` | `ask` | `never`) + an origin check read from the browser + a native
macOS approval. Agents call `list_login_profiles` (the non-secret allow-list),
`type_secret` / `type_totp` — the password/code is typed over the broker's own
CDP session, never entering agent code. `get_totp` returns the self-expiring
2FA code as a fallback for broken widgets; there is **no** `get_secret` — a
password is only ever typed, never returned. The old `hb_*` / `creds` names
live on as warn-once deprecation shims. The origin check matches on the **registrable
domain** (`accounts.google.com` covers `mail.google.com`; a ccTLD second-level
list keeps `foo.co.uk` from matching `bar.co.uk`). Cold discovery is served
from a 0600 **reachable-cache** (non-secret metadata, "synced X ago" + Sync
now in the UI) — a fill always re-validates tier + origin live, resolving one
item by id. "Lock vault" is a **soft lock** (drops warmth, keeps the token —
re-warms silently); Disconnect is the hard cut. The daemon subsystem is
`broker.js` + `native/`; the routes + plugin plumbing + hint hook are
`credentials.js`; the dark UI is `credentials.jsx`. macOS only (Keychain,
code-signing, launchd, LocalAuthentication). Needs `bw` + Swift.

- `GET /broker/status` · `GET|POST /broker/policy` · `GET /broker/groups` · `POST /broker/refresh` · `GET /broker/reachable` · `GET /broker/audit` · `POST /broker/{lock,rebuild,disconnect}` — the broker control surface (status pushed over the shell WS; audit tailed live).
- `POST /agent-integration {enabled}` · `GET /hints-config` · `GET /hints` — the **agent-integration package**: one toggle installs/removes three module-templated files together — the verb plugin (`<workspace>/plugins/atelier_login.py`, auto-loaded; precedence core < plugins < the operator's own `agent_helpers.py`), the credential-hint hook (`~/.config/horse-browser/hints.d/atelier-hb-auth`, prints "🐴 vault login available" with the exact `type_secret(...)` line on a granted host), and the always-on safety rule (`~/.claude/rules/horse-browser-auth.md`). While the toggle is on, `/state` + `/hints-config` reads keep all three current; a foreign file (no marker) is never touched. `POST /authrule/install` replaces a foreign rule. `GET /state` reports the plugin/verb status the skill points at.
- `GET /skill.md` — the "hand this to an agent" login skill, generated live with this machine's URL.

## One npm package, harness included

Installed and updated from **`@pa1nd/horse-browser`**. Since v0.9 the package
vendors the harness (`horse_harness`) — there is no separate pip
`browser-harness` tool; the launcher execs the package's own
`harness/.venv` Python, built by npm's postinstall and rebuildable with
`horse-browser harness-setup`. The installed version is read from the
`package.json` next to the resolved launcher (works for npm's bin symlink and
a dev-repo symlink alike). **Never run `horse-browser --version` to probe it**
— the launcher's job is to bring the browser up first, so a version check
would launch Chrome.

## Design

The one deliberately dark page: a self-contained `bg-zinc-950` night console
that reads the same in the chrome's light and dark modes. Pins
`meta.chrome = 'catalyst-chrome'`; typography rides the chrome's tokens.
