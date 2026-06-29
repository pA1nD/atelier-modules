# atelier-chrome

The default atelier **chrome** (theme) — a minimal, light-first shell whose look is
inspired by [Tailwind Plus / Catalyst](https://catalyst.tailwindui.com/) (zinc neutrals,
Inter, hairline borders, a soft white content panel floating on the page), **built from stock
Tailwind utilities** plus a small hand-written keyframe layer (the agent affordances) and the
kit's `@headlessui/react` (MIT) primitives. It claims the chrome slot via `meta = { isChrome: true, hidden: true }`.

## Why this exists / licensing

Every line here is original — nothing is copied from Tailwind Plus / Catalyst (no component
source, no `--btn-*` optical-border tricks). Only the *look* is inspired by Catalyst; the code
is ours, so this chrome — and anything that bundles it (e.g. a marketplace) — ships freely
under the [MIT license](./LICENSE).

The interactive primitives (Dialog, Dropdown, Listbox, Combobox, Select, Switch, Checkbox,
Radio, …) are built on **[`@headlessui/react`](https://github.com/tailwindlabs/headlessui)**,
which is **MIT** — the same accessibility foundation Catalyst itself uses. We wrap it in our
own Tailwind styling, so the dependency is license-clean and the kit stays MIT. The chrome is
esbuild-bundled, so headlessui is baked into the served kit (modules import names, not packages).

> **Rule for contributors:** if you want a Catalyst-style component here, reimplement it from
> scratch — wrap the matching headlessui primitive in our own Tailwind classes. **Never copy
> Catalyst source** (it's a commercial Tailwind Plus product; copying it would break this
> chrome's MIT licence).

## The default greeter

The shell elects the alphabetically-first global module with `meta.isChrome === true`. Since
`atelier-chrome` sorts first, a fresh instance with no `defaultChrome` set in
`atelier.config.json` lands here automatically — it's the first thing a new user sees. To pin a
different chrome, set `defaultChrome` in the config.

## Files

- `frontend.jsx` — the `chrome(props)` root. The sidebar content (`SidebarContent`: brand + nav +
  an **Add module** row + **user panel**) renders in two places: a **desktop in-flow rail**
  (lg+, collapsible — the toggle reveals on hover next to the wordmark, **⌘B** toggles it, and
  collapsing shows a transient "press ⌘B" hint) and a **mobile off-canvas drawer** (below lg,
  opened by a hamburger top bar, dismissed by the scrim / × / Esc / navigating). The nav lists a
  workspace's modules — all workspaces shown together as dividers, or one at a time via a picker
  (see [User settings](#user-settings)). The **Add module** row (pinned at the bottom) opens the marketplace
  module `global/dock` when one is mounted — which is then kept out of the rail itself — else the
  workspace home. The user panel (avatar → upward dropdown) holds any **user-menu modules**
  (`meta.menu: 'user'`, below), a **User settings** item, and a **Sign out** item when the auth module
  set `user.logout`. Also: the connection banner, the module error boundary, empty/loading/error
  states, the stylesheet/font/favicon injection, and the Lucide icon pipeline.
- `styles.css` — `@import 'tailwindcss'` + Inter + the `html.dark` custom variant + the
  `--color-agent` accent token + base surface (light default, zinc-950 dark) + hairline scrollbars
  (with an `.atelier-overlay-scroll` opt-out so the content panel uses the OS overlay bar instead
  of reserving a gutter) + the agent-affordance keyframes. The shell's scanner compiles the
  utility classes used across the `.jsx` here.
- `kit.jsx` + per-component files — a **comprehensive component library** published to modules
  via `@atelier/kit` (one file per component, barrelled in `kit.jsx`). Buttons & status
  (`Button`, `Badge`/`BadgeButton`), typography (`Heading`, `Subheading`, `Text`, `TextLink`,
  `Strong`, `Code`, `Link`), forms (`Fieldset`/`Field`/`Label`, `Input`/`InputGroup`, `Textarea`, `Select`,
  `Switch`, `Checkbox`, `Radio`, `Listbox`, `Combobox`), overlays & menus (`Dialog`, `Alert`,
  `Dropdown`), data display (`Table`, `DescriptionList`, `Divider`, `Pagination`, `Avatar`),
  surfaces & identity (`Card`, `Icon`, `Eyebrow`, `SystemIcon`, `Reveal`), and the **agent
  affordances** (`AgentBadge`, `CopyButton`, `AgentSpark`, on the `--color-agent` accent). Original
  work, built on `@headlessui/react` (MIT) for the interactive primitives — `_util.jsx` holds
  shared internals (`cn`, `useDark`, colour helpers, control glyphs). App-shell layout components
  (Navbar/Sidebar/*Layout) are intentionally not published — a module lives inside the chrome.

## Icons

Rail icons come from a module's `meta.icon` string in [lucide](https://lucide.dev/icons)'s
vocabulary (e.g. `meta = { icon: 'chef-hat' }`). Lucide is loaded from a CDN at runtime (the kit's
`Icon` component renders through it), so icons add no npm dependency. The chrome's only bundled
dependency is `@headlessui/react` (MIT), which powers the kit's interactive primitives; the kit's
own small control glyphs (checkmarks, chevrons) are inline SVG, not an icon library.

## Module meta the chrome reads

Beyond `meta.icon` (above) and `meta.name` (the rail / menu label), this chrome honors a few
optional `meta` fields to *place* a module:

- **`meta.group`** — a rail heading the module is filed under (shown when "Show category names"
  is enabled in User settings; modules with no group list flat).
- **`meta.menu: 'user'`** — surface the module in the **user dropdown** (the avatar menu at the
  bottom of the rail) instead of as a rail app. Use it for utilities / reference pages — a kit
  styleguide, an About, a Help — that shouldn't sit among the real apps.
- **`meta.hidden`** — keep the module out of the rail entirely (e.g. a slot-only or background
  module).
- **`meta.configure: '<sub-route>'`** — add a **Configure <name>** entry to the user dropdown that
  opens the module's config page at `<qid>/<sub-route>` (label from `meta.name`). For an
  instance-config / marketplace module — e.g. `meta.configure: 'config'` on a module named
  *Atelier* gives a "Configure Atelier" link to its `config` view.

These are *this chrome's* placement conventions; another chrome may read `meta` differently.

## User settings

The user panel's **User settings** item opens a modal the chrome owns; every choice persists in
`localStorage`:

- **Display name** (`atelier-chrome-name`) — what the user panel shows. Overridden by the auth
  module's account name when signed in.
- **Appearance** (`atelier-chrome-theme`) — **Light / Dark / System** (`System` = the unpinned
  default, following the OS). Dark mode is driven by `html.dark`, not the media query, so a pin
  always wins.
- **Sidebar** — *Show all workspaces together* (`atelier-chrome-ws-together`, **on** by default:
  every workspace in one list with a divider each; off → a workspace picker, one workspace at a
  time) and *Show category names* (`atelier-chrome-show-categories`, **off** by default: hide the
  `meta.group` headings, listing modules flat).
