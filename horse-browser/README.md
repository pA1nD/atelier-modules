# Horse Browser

The night console — give your agents a browser of their own, logged in and
never in your way. Extracted from the retired **claude5iq** module: its Browser
chapter, now a standalone module (same lineage as the `statusbar` module).

## The page

Cinematic banner → the idea → a faked-but-true agent-browser wall (the
signature colour-grouped sidebar + a 4-up monitor of agents scrolling and
clicking real site screenshots) → the engine story (browser-harness and the
bitter lesson, ~600 lines vs ~120k) → the install card → the live process wall
(agent sessions · harness daemons · actual Horse Browser tabs, name-matched by
callsign via the tab-grouper extension).

## Files

- `frontend.jsx` — the whole page (single chapter, no sub-routes).
- `lib.jsx` — the shared design system: dark-palette narrative scaffold, live-data hooks, inline lucide icons (catalyst exposes no icon global).
- `media/` — the banner + eight site screenshots the fake wall scrolls. Lives outside `data/` so it ships with the module.

## Backend (`backend.js`)

Pure Node builtins, no deps.

- `GET /snapshot` — the CDP on :9223 (version · tabs · pid), harness daemons, tool presence, versions.
- `GET /processes` — the live stack: sessions (codenames + cwd), daemons (BU_NAME → callsign), tabs (→ session via the extension's tab groups).
- `GET /images/:name` — bundled imagery (basename-guarded).
- `POST /action/:id` — streams over the shell WS: `install-browser-harness` (uv/pipx from GitHub), `install-horse-browser` (**npm — `@pa1nd/horse-browser`**, install and update are the same command; applies `claude-md.sh` after), `install-browser-config` (`claude-md.sh apply`). Outward actions refuse without `{ confirm: true }`; children tracked + killed on hot-reload/shutdown.

## horse-browser is an npm package now

Installed and updated from **`@pa1nd/horse-browser`**. The installed version is
read from the `package.json` next to the resolved launcher (works for npm's bin
symlink and a dev-repo symlink alike). **Never run `horse-browser --version` to
probe it** — the launcher's job is to bring the browser up first, so a version
check would launch Chrome (and the flag forwards to browser-harness anyway).

## Design

The one deliberately dark page: a self-contained `bg-zinc-950` night console
that reads the same in the chrome's light and dark modes. Pins
`meta.chrome = 'catalyst-chrome'`; typography rides the chrome's tokens.
