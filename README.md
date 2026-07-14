# Atelier Modules

The public **Atelier** collection: four small apps that set up a sharper
Claude Code — each one teaches a system in plain language, reads your *real*
machine live, and switches the system on without leaving the page — plus the
chrome they render in.

| Module | What it does |
|---|---|
| **statusbar** | Session Codes + the status bar: every agent session earns a callsign · colour · emoji from one hash the terminal, dashboard, and browser all agree on — and the terminal line that wears it, wired into `~/.claude/settings.json` with one click (merged, backed up first). |
| **horse-browser** | The night console: give your agents a browser of their own — browser-harness (the ~600-line CDP engine) + the dedicated Horse Browser, installed and updated from npm (`@pa1nd/horse-browser`), with a live wall of agent sessions · harness daemons · open tabs. |
| **claude-md** | CLAUDE.md — the note Claude reads first: the four Karpathy rules and where they came from, your real `~/.claude/CLAUDE.md` read live chapter by chapter, appended-with-backup in one click. |
| **gwx** | Your whole Google Workspace in your agent's hands: one multi-account CLI (`@pa1nd/gwx` on npm), 96 ready-made agent skills in a searchable catalogue, and live per-account sign-in state. |
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
