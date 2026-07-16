# HB Display

The Horse Browser's display & health wing — a sibling of the `horse-browser`
module (same night-console design, same banner, its lib copied per the
no-cross-module-imports rule).

## Why it exists

With the display asleep (esp. clamshell: lid closed, box kept awake by SSH),
WindowServer composites nothing: agents keep browsing but screenshots hang.
Waking the panel is worse — macOS force-re-blanks a closed lid ~10s after ANY
wake and Chrome for Testing drops every CDP websocket on that transition
(measured 2026-07-11; held assertions and repeated declarations don't prevent
it). Since v0.8.6 the launcher never wakes a sleeping display; the clean fix
for lid-closed vision is a virtual display that never sleeps.

## The page

Horse banner → the idea → **the compositing check**: a tinted verdict box that
answers the headline question with a real probe — a timed 1×1
`Page.captureScreenshot` through the Horse Browser, run on every page open and
on the Recheck button, with display-census chips and an explanation of why
captures *hang* rather than fail → the lid-closed story beside a live DeskPad
card (installed / running / virtual display online, verdict line, one-click
brew install + launch **and the copyable commands** beside them, and the audit
note: 436 lines read, MIT, sandboxed, **no network entitlement**) → the health
journal (the launcher's `~/.config/horse-browser/heal.log`, parsed and
colour-coded, with why-context fields like `since_wake=` and `tabs_saved=`).

## Backend (`backend.js`)

Pure Node builtins, no deps.

- `GET /snapshot` — `deskpad`: installed · running · display census (asleep /
  online / non-builtin count via CoreGraphics ctypes, clamshell via ioreg).
- `GET /compositing` — the live check: display census + `paintProbe()`, a REAL
  timed 1×1 `Page.captureScreenshot` against :9223 (`ok`/`hang`/`no-browser`/
  `no-page` + ms). Read-only; called on page open + Recheck, never polled.
- `GET /heal-log` — the incident journal, parsed (`ts · event · k=v fields`),
  newest first.
- `GET /images/:name` — bundled imagery (basename-guarded).
- `POST /action/:id` — `install-deskpad` (brew cask + launch; first run needs
  a one-time Screen Recording grant before the virtual display registers) and
  `launch-deskpad`. Network actions refuse without `{ confirm: true }`;
  children tracked + killed on hot-reload/shutdown.

## DeskPad, trust

Recommended only after an audit: the entire app is 436 lines of Swift (all
read), MIT, App-Sandboxed with no network entitlement — macOS itself forbids
it from making outbound connections — no updater, no analytics; brew fetches
the notarized GitHub release sha256-pinned. Its single permission (Screen
Recording) is consumed by mirroring its own virtual display into its window.
