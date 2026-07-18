# Atelier Modules

The public **Atelier** collection: seven small apps that set up a sharper
Claude Code — each one teaches a system in plain language, reads your *real*
machine live, and switches the system on without leaving the page — plus the
chrome they render in.

| Module | What it does |
|---|---|
| **statusbar** | Session Codes + the status bar: every agent session earns a callsign · colour · emoji from one hash the terminal, dashboard, and browser all agree on — and the terminal line that wears it, wired into `~/.claude/settings.json` with one click (merged, backed up first). |
| **horse-browser** | The night console: give your agents a browser of their own — browser-harness (the ~600-line CDP engine) + the dedicated Horse Browser, installed and updated from npm (`@pa1nd/horse-browser`), with a live wall of agent sessions · harness daemons · open tabs. |
| **claude-md** | CLAUDE.md — the note Claude reads first: the four Karpathy rules and where they came from, your real `~/.claude/CLAUDE.md` read live chapter by chapter, appended-with-backup in one click. |
| **gwx** | Your whole Google Workspace in your agent's hands: one multi-account CLI (`@pa1nd/gwx` on npm), 96 ready-made agent skills in a searchable catalogue, and live per-account sign-in state. |
| **hb-auth** | Credentials your agents can use but never see: an account registry over your vault plus the ENFORCED Bitwarden broker — a signed local daemon holding the only vault session, gating every credential behind per-credential policy, an origin check, and a native macOS approval; secrets are typed over CDP and never enter the model's context. macOS only. |
| **hb-display** | Screenshots that survive a closed lid: a real compositing probe (timed 1×1 CDP capture), the display census (asleep / clamshell / virtual), one-click DeskPad install for a virtual display that never sleeps, and the launcher's self-heal journal, live. macOS only. |
| **atelier-config** | Your whole instance, edited from inside it: `atelier.config.json` as a form or raw JSON (validated, atomic, patch-merged — conflicts rejected, never clobbered), drag-and-drop apps & workspaces, a package-manager doctor checked against the latest LTS/stable upstream, start-at-login via launchd with a guided port handoff, and the server's live output. |
| **catalyst-chrome** | The chrome these modules pin (`meta.chrome = 'catalyst-chrome'`) — a Catalyst-based theme that publishes the `@atelier/kit` primitives and owns the rail, tokens, and dark mode. |

## Install

Into an existing [Atelier](https://github.com/pA1nD/atelier) instance:

```sh
npx atelier add github:pA1nD/atelier-modules
```

Or start a fresh instance preloaded with this collection:

```sh
npm create @pa1nd/atelier my-studio -- --kit pA1nD/atelier-modules
cd my-studio && npm install && npm run dev     # → http://localhost:1844
```

Every module reads its machine honestly and degrades gracefully — anything a
module can install for you is behind an explicit, confirmed click, always
backed up first.

## License

MIT — see [LICENSE](./LICENSE).
