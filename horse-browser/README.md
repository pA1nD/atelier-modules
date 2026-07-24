# Horse Browser

The **control board** for the Horse Browser — the dedicated browser your agents
drive, logged in and never in your way. Extracted from the retired **claude5iq**
module (its Browser chapter), then grown into the single home for everything
about the agent browser: it absorbed **hb-display** (agent vision) and
**hb-auth** (the Bitwarden credential broker), and retired the standalone
`dev/browser` hub.

## The page — routes (`window.__atelier.useRoute`)

The board is deliberately lean — the essentials up top, everything heavier one
click into a subpage.

- **`''` — the control board.** Fits on one screen and doubles as a first-run
  setup guide.
  1. **Hero** — the banner with the brand, a live indicator, and **"read the
     full story →"** bottom-left; the **install & version box** (horse-browser
     vN · up to date / Update · the npm command) floated top-right as a distinct
     dark card, kept separate from the live-status panels.
  2. **Live status** — three *clickable* glance tiles: **The browser** and
     **Driving now** open the live stack (`runtime`), **What agents know** opens
     the docs. Each carries a one-line "what's behind the click".
  3. **Credentials & access** — the whole auth system, live: the broker header,
     a **Connection** panel (daemon · CLI · account · server · session token ·
     vault) and an **Access** panel (accounts reachable · collections · auto ·
     ask — from cached group metadata, no vault unlock — plus a **quick account
     search** that lazily unlocks only on focus), then a **Recent access** log
     preview. Links out to Settings / all accounts / the full log.
- **`credentials` — broker settings** (folded in from hb-auth, dark-restyled):
  connection management (lock / rebuild / disconnect / setup), the
  grant-by-collection table, and (advanced) the agent helpers + hint-hook. The
  reachable list and access log are their own pages now.
- **`accounts` — reachable accounts:** the full list an agent can enumerate
  (name · username · host · tier · 2FA), filterable.
- **`activity` — the access log:** every credential request, allowed or denied,
  with account · site · tier · requesting session. Live.
- **`runtime` — the live operations view:** a real compositing probe (timed 1×1
  capture) + the DeskPad card and the **"why waking a sleeping display is the
  wrong fix"** reasoning (all folded in from hb-display — it's ops, so it lives
  here with agent vision, not in the marketing story), the process wall (agent
  sessions · harness daemons · tabs, callsign-matched via the tab-grouper
  extension), and the launcher's `heal.log` journal, pushed on change.
- **`docs` — how agents learn it:** the always-on rule + on-demand manual, each
  opening in a reading modal (pretty / raw).
- **`story` — the full narrative:** cinematic banner → idea → the demo
  agent-browser wall → the engine (horse-harness, vendored since v0.9, the
  bitter lesson).

## Files

- `frontend.jsx` — the hero, the board, and the `story` / `runtime` / `docs` routes.
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
- `GET /compositing` — display census + `paintProbe()`, a REAL timed 1×1 `Page.captureScreenshot` (`ok`/`hang`/`no-browser`/`no-page` + ms). On page open + Recheck, never polled.
- `GET /heal-log` — the launcher's incident journal (`~/.config/horse-browser/heal.log`), parsed; a dir watcher pushes the tail on change.
- `GET /images/:name` — bundled imagery (basename-guarded).
- `POST /action/:id` — streams over the shell WS: `install-horse-browser` (**npm — `@pa1nd/horse-browser`**, install and update are the same command; postinstall builds the vendored harness venv; applies `claude-md.sh` after), `harness-setup` (`horse-browser harness-setup`, rebuilds the venv), `install-browser-config` (`claude-md.sh apply`), `install-deskpad` (brew cask) + `launch-deskpad`. Outward actions refuse without `{ confirm: true }`; children tracked + killed on hot-reload/shutdown.

## Credentials — the Bitwarden broker (folded in from hb-auth)

The ENFORCED path: a signed local daemon (`native/`, compiled on first run into
`~/Library/Application Support/hb-broker` — outside the module tree) holds the
only Bitwarden session and gates every credential by the collection it lives in
(`auto` | `ask` | `never`) + an origin check read from the browser + a native
macOS approval. Agents call `hb_type_secret` / `hb_type_totp` — the password is
typed over the broker's own CDP session, never entering agent code. The daemon
subsystem is `broker.js` + `native/`; the routes + agent-helper plumbing +
hint hook are `credentials.js`; the dark UI is `credentials.jsx`. macOS only
(Keychain, code-signing, launchd, LocalAuthentication). Needs `bw` + Swift.

- `GET /broker/status` · `GET|POST /broker/policy` · `GET /broker/groups` · `POST /broker/refresh` · `GET /broker/reachable` · `GET /broker/audit` · `POST /broker/{lock,rebuild,disconnect}` — the broker control surface (status pushed over the shell WS; audit tailed live).
- `GET|POST /hints-config` · `GET /hints` · `POST /hints-hook/install` — the credential-hint hook (`~/.config/horse-browser/hints.d/atelier-hb-auth`): on first navigation to a host with a granted credential, it prints the exact `hb_type_secret("<item>")` line.
- `POST /helpers/install` · `GET|POST /selfheal` · `GET /state` — the managed `atelier_login_helpers.py` (auto-loaded by the harness) + self-heal.
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
