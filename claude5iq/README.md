# Claude 5IQ

**IQ** is the brand (a playful score, *not* a literal intelligence claim), **5** is this
pack — it's the number of **systems**, so the score grows on its own as more are added (a
future 7IQ, say) — and this one is **for Claude**. A guided setup for the five systems that
take Claude Code from clever to genuinely sharp, each a **+1 IQ** brand beat, wrapped in a
persistent live deck that reports the *real* machine. (Folder/route: `claude5iq`; display
brand: **Claude 5IQ**.)

It teaches each system in plain language, then lets you **turn it on without leaving the page**.

## The five chapters

| # | Chapter | What it covers |
|---|---|---|
| 01 | **Session Codes** | The identity engine: one session id → callsign + emoji + colour, computed by one hash the terminal, the dashboard, and the browser all agree on. A live pipeline (FNV-1a → murmur3 → `%48`) decodes the viewer's own id; the 48-slot grid lights the result; three mirrored surfaces snap to it. |
| 02 | **The Status Bar** | The Claude Code statusline, dissected: hover each segment to see the JSON field it reads; a `COLUMNS` slider shows the last-prompt truncate exactly as the bash does. Wire it into `~/.claude/settings.json` (merge, never clobber; backed up first). |
| 03 | **CLAUDE.md** | Global (`~/.claude/CLAUDE.md`, four chapters) vs project (`./CLAUDE.md`) drawn as stacked paper, specific-on-top, with `@import` threads. Live file status (exists · bytes · chapters); install the four chapters with a backup. |
| 04 | **The Browser** | The dark night-console interlude: browser-harness (a one-websocket CDP harness) drives horse-browser (a dedicated Chrome on `:9223` that never steals macOS focus). A focus-integrity diptych, the real Agent Monitor wall, and live CDP telemetry. Launch / smoke-test from the page. |
| 05 | **gwx** | One CLI over every Google account, named every time. An account-first command composer makes the guarantee tactile: reads fan out in parallel; any write aimed at more than one account is refused (`exit 3`). Check auth, install. |

## The live deck

A sticky instrument cluster reports, from the real system every few seconds:
tools on `PATH` (with a breathing up/down dot), the horse-browser CDP (`:9223`
version · tab count · PID), running Claude sessions rendered as emoji codenames,
and the known gwx accounts. It condenses as you scroll.

## Backend (`backend.js`)

Pure Node builtins, no deps. **Instruments** read the machine; **hands** take action.

- `GET /snapshot` — tools, CDP, procs, sessions (codenames), gwx, statusline, both CLAUDE.md files.
- `GET /sessions` — running/recent sessions with cwd + last prompt.
- `GET /gwx/whoami` — per-account auth (on demand; timeboxed).
- `GET /claudemd/:which` · `GET /templates/:which` — file contents + the install templates.
- `GET /images/:name` — bundled imagery from `media/` (basename-guarded).
- `GET /processes` — the live agent / harness-daemon / browser-tab stack for the Browser chapter.
- `GET /gwx/skills` · `GET /gwx/skill/:id` — the gwx skill catalogue + one skill's SKILL.md.
- `POST /action/:id` — streams every line over the shell WebSocket (`action-log` / `action-done`):
  `gwx-whoami`, `install-gwx`, `install-statusbar`, `install-global-claudemd`, `install-browser-harness`, `install-horse-browser`.

**Safety.** Outward / destructive actions (`install-gwx` / `install-browser-harness` /
`install-horse-browser` network; `install-statusbar` and `install-global-claudemd` overwrite)
refuse to run without `{ confirm: true }`,
back up the target first, and merge rather than clobber `settings.json`. Child
processes are tracked and killed on hot-reload and shutdown (`teardown`).

The session codename (emoji · colour · callsign) is **byte-identical** to
`projects/statusline.sh` and the dashboard — FNV-1a (32-bit) + a murmur3
finalizer — so what this module shows matches the terminal and the tab grouper.

## Imagery

`media/` holds the assets the chapters render — eight tall website screenshots
(`grid-*.jpg`) that scroll in the Browser chapter's fake agent-browser, plus the
horse-browser banner. It lives **outside `data/`** (which doesn't ship with a packaged
module) so the imagery travels with the install. All on-palette, all license-clean.

## Design

Speaks the **dock design language** so the two read as one product: **Inter**
(mono reserved for code), the signature `from-blue-600 via-indigo-600 to-violet-700`
gradient hero with a live "this-machine" code-card, white `rounded-2xl/3xl` cards on
zinc, and dock's **squircle** topic icons (a superellipse clip + `155deg` shade
gradient + white Lucide glyph). Pins `meta.chrome = 'atelier-chrome'` and reuses the
kit's `Button` / `Badge` / `CopyButton` / `AgentSpark`; only motion keyframes are
injected via a `<style>`. Chapter 04 stays a deliberate dark interlude — coherent with
dock's dark code windows. The codename palette (8 colours) is the one saturated accent.
