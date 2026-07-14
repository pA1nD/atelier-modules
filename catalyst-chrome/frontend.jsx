/* Catalyst chrome — alternative atelier chrome built on the Catalyst UI kit.
 *
 * One of atelier's chrome modules. Claims the `chrome` slot via
 * `meta = { isChrome: true, hidden: true }`. The shell hands every chrome the
 * same props (boot, user, modules, workspaces, workspace, activeQid, active,
 * loadedModules, navigate, pickWorkspace) and renders its `chrome` named export
 * as the root component.
 *
 * The shell bundles this module's frontend.jsx via esbuild (full dep
 * bundling) when meta.isChrome is true, so we can ship real third-party
 * deps — Headless UI, motion, clsx, heroicons. React + ReactDOM are
 * externalized to atelier/shims/{react,react-dom,jsx-runtime}.js so we
 * share the same React instance as the shell.
 */

import React, { useEffect, useState, useRef, useLayoutEffect } from 'react'
import * as Headless from '@headlessui/react'
import { marked } from 'marked'

import { SidebarLayout } from './sidebar-layout'
import {
  Sidebar,
  SidebarBody,
  SidebarFooter,
  SidebarHeader,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
  SidebarSpacer,
} from './sidebar'
import {
  Navbar,
  NavbarSection,
  NavbarSpacer,
} from './navbar'
import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
  DropdownShortcut,
} from './dropdown'
import { Avatar } from './avatar'
import { Badge } from './badge'
import { Button } from './button'
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from './dialog'
import {
  Description,
  Field,
  FieldGroup,
  Fieldset,
  Label,
} from './fieldset'
import { Input } from './input'
import { Radio, RadioField, RadioGroup } from './radio'

import {
  ChevronDownIcon,
  ChevronUpIcon,
  Cog8ToothIcon,
  PlusIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  WifiIcon,
  BookOpenIcon,
  XMarkIcon,
  ArrowRightStartOnRectangleIcon,
  UserCircleIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/16/solid'
// Module rail icons render via lucide-react — modules name them in lucide's own
// kebab-case vocabulary (meta.icon: 'chef-hat'), so any lucide icon works (see
// ModIcon below). The chrome's OWN UI keeps heroicons (16/solid, above).
import { icons as LucideIcons } from 'lucide-react'

export const meta = { isChrome: true, hidden: true, name: 'catalyst-chrome' }

/* This chrome's own API base, derived from its bundle URL — the same
 * self-location pattern modules use. The Documentation viewer fetches the
 * shell's docs from `${CHROME_API}/docs` (served by this chrome's backend). */
const CHROME_ROUTE = (() => {
  try {
    return new URL('.', import.meta.url).pathname
      .replace(/^\/modules\//, '')
      .replace(/\/$/, '')
  } catch {
    return ''
  }
})()
const CHROME_API = '/api/' + CHROME_ROUTE

/* =========================================================================
 * One-time setup at module load
 *   • Inject this module's stylesheet (Tailwind + Inter + catalyst tokens)
 *   • Load Inter from rsms.me (catalyst convention)
 * Module rail icons are lucide-react, looked up by `meta.icon` name (ModIcon
 * below). The chrome's own UI uses heroicons; only the rail uses lucide.
 * ========================================================================= */

;(function ensureChromeStyles() {
  if (typeof document === 'undefined') return
  // The atelier shell (server.js since 0.3+) pre-injects a render-blocking
  // <link id="atelier-chrome-styles"> in the response head so the CSS lands
  // before the chrome bundle renders — avoids the flash of unstyled icons.
  // If that's present, this IIFE is a no-op; otherwise (e.g. older shell,
  // or a chrome served outside the atelier template) fall back to JS-time
  // injection.
  if (document.getElementById('atelier-chrome-styles')) return
  const id = 'catalyst-chrome-styles'
  if (document.getElementById(id)) return
  let href
  try {
    href = new URL('./styles.css', import.meta.url).href
  } catch {
    return
  }
  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = href
  document.head.appendChild(link)
})()

/* Apply the user's theme preference BEFORE the first React render to avoid
 * a flash of the wrong palette. localStorage key `atelier:theme` =
 * 'light' | 'dark' | 'system'. The React effect below keeps the class in
 * sync as the user toggles in the settings dialog and on prefers-color-
 * scheme changes when `system` is selected. */
;(function applyThemeOnLoad() {
  if (typeof document === 'undefined') return
  let pref
  try { pref = localStorage.getItem('atelier:theme') } catch {}
  pref = pref || 'system'
  const isDark =
    pref === 'dark' ||
    (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', isDark)
})()

;(function ensureInterFont() {
  if (typeof document === 'undefined') return
  const id = 'catalyst-chrome-inter'
  if (document.getElementById(id)) return
  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = 'https://rsms.me/inter/inter.css'
  document.head.appendChild(link)
})()

/* Chrome owns ALL visual identity meta in <head>: favicon, theme-color,
 * (and the title, set further down via useEffect because it reflects the
 * active module). Everything left in `index.html` is technical bootstrap
 * — charset, viewport, the React UMDs, the WS-aware client script. This
 * IIFE replaces the shell's defaults with catalyst's.
 *
 * - favicon: same four-quadrant geometry as the atelier mark, solid-
 *   filled in zinc; its color follows the OS scheme and is re-applied live
 *   on a matchMedia change (see the favicon helpers below).
 * - theme-color: zinc-100 light / zinc-950 dark, matching the body bg
 *   set by styles.css. The OS chrome (Safari address bar, Chrome tab
 *   theming, PWA splash) picks these up.
 *
 * Idempotent under hot reload — we remove any existing tags of the same
 * kind before adding ours so we don't accumulate. */
// Favicon helpers (module scope so both the load-time identity IIFE and the
// per-module effect in the chrome component share them).
//   • atelierMarkSvg(color)           — the four-quadrant mark, in a color.
//   • applyFavicon(svg)               — swaps the single <link rel="icon"> in place.
//   • moduleIconFavicon(svgEl, color) — a rendered rail icon → tab favicon.
// The color is resolved in JS (light → zinc-900, dark → zinc-50) and re-applied
// on a matchMedia change — NOT via an SVG @media rule, because a favicon's
// embedded media query is only evaluated when the icon is (re)rendered (on
// reload), so it wouldn't flip live when the OS theme changes morning/evening.
// Follows prefers-color-scheme (the tab chrome), not the app's html.dark.
const FAVICON_LIGHT = '#18181b'
const FAVICON_DARK = '#fafafa'
const systemPrefersDark = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
const faviconColor = (dark) => (dark ? FAVICON_DARK : FAVICON_LIGHT)
const atelierMarkSvg = (color) =>
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='${color}'><rect x='3' y='3' width='8' height='8' rx='1.5'/><rect x='13' y='3' width='8' height='8' rx='1.5'/><rect x='3' y='13' width='8' height='8' rx='1.5'/><rect x='13' y='13' width='8' height='8' rx='1.5'/></svg>`

function applyFavicon(svgMarkup) {
  if (typeof document === 'undefined') return
  // Keep ONE managed <link> and mutate its href in place. Removing + re-adding
  // makes the browser briefly drop the icon and re-scan, which reads as a lag;
  // an in-place href swap updates the tab much faster.
  let link = document.getElementById('atelier-favicon')
  if (!link) {
    for (const existing of document.querySelectorAll('link[rel~="icon"]')) existing.remove()
    link = document.createElement('link')
    link.id = 'atelier-favicon'
    link.rel = 'icon'
    link.type = 'image/svg+xml'
    document.head.appendChild(link)
  }
  link.href = 'data:image/svg+xml,' + encodeURIComponent(svgMarkup)
}

function moduleIconFavicon(svgEl, color) {
  const clone = svgEl.cloneNode(true)
  clone.removeAttribute('class')
  clone.removeAttribute('data-slot')
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.style.color = color   // lucide strokes with currentColor (fill="none" stays)
  return clone.outerHTML
}

;(function ensureChromeIdentity() {
  if (typeof document === 'undefined') return

  // Favicon — the atelier mark by default; the active module's icon takes over
  // via the favicon effect in the chrome component below.
  applyFavicon(atelierMarkSvg(faviconColor(systemPrefersDark())))

  // theme-color — light + dark variants via media queries. Replace
  // existing tags so we don't end up with shell + chrome theme colors
  // both present (the browser picks one unpredictably).
  for (const existing of document.querySelectorAll('meta[name="theme-color"]')) {
    existing.remove()
  }
  const themeLight = document.createElement('meta')
  themeLight.name = 'theme-color'
  themeLight.content = '#f4f4f5'                       // zinc-100
  themeLight.media = '(prefers-color-scheme: light)'
  document.head.appendChild(themeLight)
  const themeDark = document.createElement('meta')
  themeDark.name = 'theme-color'
  themeDark.content = '#09090b'                        // zinc-950
  themeDark.media = '(prefers-color-scheme: dark)'
  document.head.appendChild(themeDark)
})()

/* =========================================================================
 * Atoms
 * ========================================================================= */

/* Module rail icons render via lucide-react, looked up by the module's
 * `meta.icon` — kebab-case in lucide's own vocabulary ('chef-hat',
 * 'layout-dashboard', 'message-circle'). Any lucide icon name works; there's no
 * map to maintain. lucide keys its export object in PascalCase, so we convert.
 * Unknown names fall back to a neutral square — and warn once, so a typo
 * surfaces instead of silently rendering the wrong icon. The chrome's own UI
 * keeps heroicons; only the rail is lucide. */
const warnedIcons = new Set()
function lucideFor(name) {
  const pascal = String(name || '')
    .split('-')
    .filter(Boolean)
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join('')
  const Icon = LucideIcons[pascal]
  if (!Icon && name && !warnedIcons.has(name)) {
    warnedIcons.add(name)
    console.warn(`[catalyst-chrome] unknown icon "${name}" — pick a name from https://lucide.dev/icons; rendering a square.`)
  }
  return Icon || LucideIcons.Square
}

/* ModIcon — render a module's `meta.icon` in catalyst's icon slot. data-slot
 * "icon" lets catalyst's `*:data-[slot=icon]` rules size + position it; lucide
 * icons are stroke-based, so styles.css renders `.lucide` as outlines (no fill,
 * stroke themed) rather than catalyst's solid-fill heroicon treatment. */
function ModIcon({ name, className }) {
  const Icon = lucideFor(name)
  return <Icon data-slot="icon" aria-hidden="true" className={className} />
}

/* AtelierMark — the four-quadrant logo, used as the sidebar's brand. Kept
 * as an inline SVG (load-bearing geometry). */
function AtelierMark({ size = 24 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      data-slot="icon"
      className="size-6"
    >
      <rect x="3" y="3" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

/* Workspace display helpers.
 *
 * Workspace ids live lowercase in `atelier.config.json` (and in the URL); the
 * UI shows them with a capitalized first letter — `dev` → `Dev`, `global` →
 * `Global`. `capitalize` is idempotent for already-capitalized ids.
 *
 * Each workspace's avatar chip gets a stable color from a fixed palette, picked
 * by hashing the id so a given workspace always renders the same hue regardless
 * of order or how many exist. Strings are full literal utility classes (not
 * interpolated) so Tailwind's scanner picks them up. Light: solid -500/-600 +
 * white text; dark: brighter -400 + near-black text. */
function capitalize(s) {
  s = String(s || '')
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

const WORKSPACE_COLORS = [
  'bg-sky-500 text-white dark:bg-sky-400 dark:text-sky-950',
  'bg-violet-500 text-white dark:bg-violet-400 dark:text-violet-950',
  'bg-emerald-600 text-white dark:bg-emerald-400 dark:text-emerald-950',
  'bg-rose-500 text-white dark:bg-rose-400 dark:text-rose-950',
  'bg-cyan-600 text-white dark:bg-cyan-400 dark:text-cyan-950',
  'bg-fuchsia-500 text-white dark:bg-fuchsia-400 dark:text-fuchsia-950',
  'bg-indigo-500 text-white dark:bg-indigo-400 dark:text-indigo-950',
  'bg-teal-600 text-white dark:bg-teal-400 dark:text-teal-950',
]

function workspaceColor(id) {
  id = String(id || '')
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return WORKSPACE_COLORS[h % WORKSPACE_COLORS.length]
}

/* =========================================================================
 * ConnectionBanner — subscribes to the shell's `atelier:connection` event.
 * Sits inline at the top of the main content area when not 'online'.
 * ========================================================================= */
function ConnectionBanner() {
  const [state, setState] = useState('online')
  useEffect(() => {
    const onConn = (e) => setState(e.detail?.state ?? 'online')
    window.addEventListener('atelier:connection', onConn)
    return () => window.removeEventListener('atelier:connection', onConn)
  }, [])
  if (state === 'online') return null

  if (state === 'unauthed') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mb-4 flex items-center gap-3 rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200"
      >
        <ExclamationTriangleIcon className="size-4 fill-amber-600 dark:fill-amber-400" />
        <span className="font-medium">Session expired.</span>
        <span className="text-amber-900/70 dark:text-amber-200/70">Sign in again to continue.</span>
        <button
          onClick={() => window.location.reload()}
          className="ml-auto rounded-md border border-amber-500/30 bg-white/60 px-2 py-0.5 text-xs font-medium text-amber-900 hover:bg-white/90 dark:bg-zinc-900/60 dark:text-amber-100 dark:hover:bg-zinc-900/80"
        >
          Sign in
        </button>
      </div>
    )
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-4 flex items-center gap-3 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-900 dark:text-red-200"
    >
      <WifiIcon className="size-4 fill-red-600 dark:fill-red-400" />
      <span className="font-medium">Server unreachable.</span>
      <span className="text-red-900/70 dark:text-red-200/70">Data may be stale · reconnecting…</span>
      <ArrowPathIcon className="ml-auto size-3.5 animate-spin fill-red-600 dark:fill-red-300" />
    </div>
  )
}

/* =========================================================================
 * Module error boundary — keeps a single broken module from blanking the
 * whole shell. Reset on qid change.
 * ========================================================================= */
class ModuleErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { err: null }
  }
  static getDerivedStateFromError(err) {
    return { err }
  }
  componentDidCatch(err, info) {
    // eslint-disable-next-line no-console
    console.error('[catalyst-chrome] module render crashed:', err, info)
  }
  componentDidUpdate(prev) {
    if (prev.qid !== this.props.qid && this.state.err) {
      this.setState({ err: null })
    }
  }
  render() {
    if (this.state.err) {
      return (
        <div className="rounded-lg border border-red-500/30 bg-red-50 p-4 text-sm dark:bg-red-950/30">
          <div className="font-mono text-xs uppercase tracking-wide text-red-700 dark:text-red-300">
            {this.props.qid} · render error
          </div>
          <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs text-red-900/80 dark:text-red-200/80">
            {String(this.state.err?.stack || this.state.err?.message || this.state.err)}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

/* =========================================================================
 * Empty / loading / load-error body states
 * ========================================================================= */
function EmptyWorkspace({ workspace }) {
  const snippet = `export default function Module() {
  return <div className="p-8">hello</div>
}`
  return (
    <div className="flex flex-col items-start gap-6 py-4">
      <div className="font-mono text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        atelier{workspace ? ` · ${capitalize(workspace)}` : ''}
      </div>
      <h1 className="text-4xl font-medium tracking-tight text-zinc-950 sm:text-5xl dark:text-white">
        A quiet workspace<br />
        for loud thoughts.
      </h1>
      <p className="max-w-md text-base text-zinc-600 dark:text-zinc-300">
        The bench is clear. Pick a module from the sidebar — or scaffold a new one.
      </p>
      <div className="w-full max-w-xl rounded-lg border border-zinc-950/5 bg-zinc-50 p-4 dark:border-white/5 dark:bg-zinc-900/60">
        <div className="mb-2 font-mono text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          hello/frontend.jsx
        </div>
        <pre className="font-mono text-[12px] leading-snug text-zinc-700 dark:text-zinc-200">{snippet}</pre>
      </div>
    </div>
  )
}

// Subtle, on-brand module loader — the atelier four-quadrant mark with a soft
// staggered pulse, centered in the content card. Deliberately low-contrast: it
// only flashes for a moment while the (already-bundled) module mounts.
function LoadingBody() {
  const delays = ['0ms', '120ms', '360ms', '240ms']  // clockwise from top-left
  return (
    <div className="flex h-full min-h-[24rem] items-center justify-center" role="status" aria-label="Loading">
      <div className="grid grid-cols-2 gap-2">
        {delays.map((d, i) => (
          <span
            key={i}
            className="size-3 rounded-sm bg-zinc-400 dark:bg-zinc-600"
            style={{ animation: 'atelier-pulse 1.1s ease-in-out infinite', animationDelay: d }}
          />
        ))}
      </div>
    </div>
  )
}

function ErrorBody({ qid, err }) {
  return (
    <div className="rounded-lg border border-red-500/30 bg-red-50 p-4 dark:bg-red-950/30">
      <div className="font-mono text-xs uppercase tracking-wide text-red-700 dark:text-red-300">
        {qid} · failed to load
      </div>
      <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs text-red-900/80 dark:text-red-200/80">
        {String(err?.message || err)}
      </pre>
    </div>
  )
}

/* =========================================================================
 * User identity + theme (settings stored in localStorage)
 *
 * Tiny user-side preferences the chrome owns:
 *   • atelier:username — display name shown in the sidebar footer
 *   • atelier:theme    — 'light' | 'dark' | 'system'
 *
 * No backend. Same keys would be readable from any module that wants to
 * personalize itself. The Settings dialog below writes them.
 * ========================================================================= */

const THEMES = ['light', 'dark', 'system']

function readPref(key, fallback) {
  try {
    const v = localStorage.getItem(key)
    return v == null ? fallback : v
  } catch {
    return fallback
  }
}

function writePref(key, value) {
  try { localStorage.setItem(key, value) } catch {}
}

function applyTheme(pref) {
  if (typeof document === 'undefined') return
  const isDark =
    pref === 'dark' ||
    (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', isDark)
}

function initialsOf(name) {
  const s = (name || '').trim()
  if (!s) return '?'
  const parts = s.split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function SettingsDialog({ open, onClose, username, setUsername, authName, theme, setTheme }) {
  const locked = !!authName
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Settings</DialogTitle>
      <DialogBody>
        <Fieldset>
          <FieldGroup>
            <Field>
              <Label>Display name</Label>
              <Input
                name="username"
                placeholder="Your name"
                value={locked ? authName : username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={locked}
              />
              {locked && <Description>Set by your account — sign in elsewhere to change it.</Description>}
            </Field>
            <Field>
              <Label>Theme</Label>
              <RadioGroup value={theme} onChange={setTheme}>
                <RadioField>
                  <Radio value="light" />
                  <Label>Light</Label>
                </RadioField>
                <RadioField>
                  <Radio value="dark" />
                  <Label>Dark</Label>
                </RadioField>
                <RadioField>
                  <Radio value="system" />
                  <Label>System</Label>
                </RadioField>
              </RadioGroup>
            </Field>
          </FieldGroup>
        </Fieldset>
      </DialogBody>
      <DialogActions>
        <Button onClick={() => onClose(false)}>Done</Button>
      </DialogActions>
    </Dialog>
  )
}

/* =========================================================================
 * Documentation viewer — full-screen overlay that renders the atelier
 * shell's docs/*.md (served by this chrome's backend), split into a
 * per-section sidebar so the long files read as navigable subpages.
 * Read-only.
 * ========================================================================= */

function slugify(s) {
  return (
    String(s)
      .toLowerCase()
      .replace(/`/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section'
  )
}

/* Split markdown into subpages on H2 (`## `) boundaries — fence-aware, so a
 * `##` inside a fenced code block doesn't start a new section. Everything
 * before the first H2 (the H1 + intro) becomes the "Overview" subpage. Each
 * section is pre-rendered to HTML with marked. */
function splitSections(md) {
  const lines = String(md || '').split('\n')
  const out = []
  let cur = { title: 'Overview', lines: [] }
  let fence = null
  for (const line of lines) {
    const f = line.match(/^\s*(```|~~~)/)
    if (f) {
      if (!fence) fence = f[1]
      else if (line.trimStart().startsWith(fence)) fence = null
      cur.lines.push(line)
      continue
    }
    const h = !fence && line.match(/^##\s+(.+?)\s*$/)
    if (h) {
      out.push(cur)
      cur = { title: h[1].replace(/`/g, ''), lines: [line] }
      continue
    }
    cur.lines.push(line)
  }
  out.push(cur)
  const seen = {}
  return out
    .filter((s, i) => !(i === 0 && s.lines.join('').trim() === ''))
    .map((s) => {
      let id = slugify(s.title)
      if (seen[id] != null) id = `${id}-${++seen[id]}`
      else seen[id] = 0
      return { id, title: s.title, html: marked.parse(s.lines.join('\n'), { gfm: true }) }
    })
}

function DocsViewer({ open, onClose }) {
  const [docs, setDocs] = useState(null) // null = loading, [] = none, [...] = loaded
  const [err, setErr] = useState(null)
  const [active, setActive] = useState(null) // { docId, secId }
  const contentRef = useRef(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setDocs(null)
    setErr(null)
    fetch(`${CHROME_API}/docs`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        if (cancelled) return
        const parsed = (d.docs || []).map((doc) => ({
          id: doc.id,
          title: doc.title,
          singlePage: !!doc.singlePage,
          sections: doc.singlePage
            ? [{ id: 'all', title: doc.title, html: marked.parse(doc.markdown, { gfm: true }) }]
            : splitSections(doc.markdown),
        }))
        setDocs(parsed)
        const first = parsed[0]
        if (first?.sections[0]) setActive({ docId: first.id, secId: first.sections[0].id })
      })
      .catch((e) => {
        if (!cancelled) setErr(e)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  // Reset scroll to the top whenever the active subpage changes.
  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0
  }, [active])

  const activeDoc = docs?.find((d) => d.id === active?.docId)
  const activeSec = activeDoc?.sections.find((s) => s.id === active?.secId)

  const navItemClass = (current) =>
    'block w-full truncate rounded-md px-2 py-1 text-left text-sm transition ' +
    (current
      ? 'bg-zinc-200/70 font-medium text-zinc-950 dark:bg-white/10 dark:text-white'
      : 'text-zinc-600 hover:bg-zinc-200/40 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100')

  return (
    <Headless.Dialog open={open} onClose={onClose} className="relative z-50">
      <Headless.DialogBackdrop
        transition
        className="fixed inset-0 bg-zinc-950/30 backdrop-blur-sm transition duration-100 data-closed:opacity-0 dark:bg-zinc-950/60"
      />
      <div className="fixed inset-0 flex items-stretch justify-center sm:p-4 lg:p-8">
        <Headless.DialogPanel
          transition
          className="flex w-full max-w-6xl overflow-hidden bg-white shadow-2xl ring-1 ring-zinc-950/10 transition duration-100 data-closed:scale-[0.99] data-closed:opacity-0 sm:rounded-2xl dark:bg-zinc-900 dark:ring-white/10"
        >
          {/* Table of contents */}
          <nav className="hidden w-64 shrink-0 flex-col overflow-y-auto border-r border-zinc-950/5 bg-zinc-50 p-4 sm:flex dark:border-white/5 dark:bg-zinc-950/40">
            <div className="mb-3 flex items-center gap-2 px-1">
              <BookOpenIcon className="size-4 fill-zinc-500 dark:fill-zinc-400" />
              <span className="text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                Documentation
              </span>
            </div>
            {docs?.map((doc) =>
              doc.singlePage ? (
                <div key={doc.id} className="mb-4">
                  <button
                    onClick={() => setActive({ docId: doc.id, secId: doc.sections[0].id })}
                    className={navItemClass(active?.docId === doc.id)}
                  >
                    {doc.title}
                  </button>
                </div>
              ) : (
                <div key={doc.id} className="mb-4">
                  <div className="px-2 py-1 text-[11px] font-semibold tracking-wide text-zinc-400 uppercase dark:text-zinc-500">
                    {doc.title}
                  </div>
                  <ul>
                    {doc.sections.map((sec) => {
                      const current = active?.docId === doc.id && active?.secId === sec.id
                      return (
                        <li key={sec.id}>
                          <button
                            onClick={() => setActive({ docId: doc.id, secId: sec.id })}
                            className={navItemClass(current)}
                          >
                            {sec.title}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
            )}
          </nav>

          {/* Content — the selected section as its own page */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-zinc-950/5 px-5 py-3 dark:border-white/5">
              <span className="truncate font-mono text-xs text-zinc-500 dark:text-zinc-400">
                {activeDoc
                  ? activeDoc.singlePage
                    ? activeDoc.title
                    : `${activeDoc.title}${activeSec ? ' · ' + activeSec.title : ''}`
                  : 'Documentation'}
              </span>
              <button
                onClick={() => onClose(false)}
                className="-mr-1 rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
                aria-label="Close documentation"
              >
                <XMarkIcon className="size-5" />
              </button>
            </div>
            <div ref={contentRef} className="flex-1 overflow-y-auto px-5 py-6 sm:px-8">
              {err ? (
                <div className="mx-auto max-w-3xl rounded-lg border border-red-500/30 bg-red-50 p-4 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-200">
                  Couldn’t load docs: {String(err.message || err)}
                </div>
              ) : docs == null ? (
                <div className="flex items-center gap-3 py-8 text-sm text-zinc-500 dark:text-zinc-400">
                  <ArrowPathIcon className="size-4 animate-spin fill-zinc-400" />
                  <span className="font-mono">loading docs…</span>
                </div>
              ) : docs.length === 0 ? (
                <div className="py-8 text-sm text-zinc-500 dark:text-zinc-400">
                  No docs found.
                </div>
              ) : (
                <article
                  className="atelier-doc-prose mx-auto max-w-3xl"
                  dangerouslySetInnerHTML={{ __html: activeSec?.html || '' }}
                />
              )}
            </div>
          </div>
        </Headless.DialogPanel>
      </div>
    </Headless.Dialog>
  )
}

/* =========================================================================
 * Command palette — ⌘K / Ctrl+K, Spotlight-style. Type to filter every
 * workspace and every visible module (across all workspaces); ↑↓ moves,
 * ↵ jumps, ⌘↵ / ⌘-click opens in (and switches to) a new tab. A Headless
 * Combobox inside a centered Dialog — the same shape
 * as tailwindcss.com's palette. Rows reuse the chrome's own atoms:
 * workspace Avatar chips and lucide rail icons.
 * ========================================================================= */
function CommandPalette({ open, onClose, workspaces, modules, onPick }) {
  const [query, setQuery] = useState('')
  // The dialog unmounts its children when closed, but this component stays
  // mounted — reset the query on every open so the palette starts blank.
  useEffect(() => { if (open) setQuery('') }, [open])

  const toks = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const matches = (hay) => toks.every((t) => hay.includes(t))
  const wsHits = workspaces.filter((w) => matches(`${w.id} workspace`.toLowerCase()))
  const modHits = modules.filter((m) => matches(`${m.name} ${m.qid}`.toLowerCase()))

  const pick = (item, newTab = false) => {
    if (!item) return
    onClose(false)
    onPick(item, newTab)
  }

  // ⌘/Ctrl-click on a row — open it in a new tab. Headless selects on
  // mousedown (not click), so intercept there; preventDefault skips its own
  // handler (merged handlers stop once defaultPrevented).
  const newTabClick = (item) => (e) => {
    if ((e.metaKey || e.ctrlKey) && e.button === 0) {
      e.preventDefault()
      pick(item, true)
    }
  }

  const groupHeading = (label) => (
    <div className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-zinc-400 uppercase dark:text-zinc-500">
      {label}
    </div>
  )
  const optionClass =
    'flex cursor-default items-center gap-3 rounded-lg px-3 py-2 select-none data-focus:bg-zinc-950/5 dark:data-focus:bg-white/10'

  return (
    <Headless.Dialog open={open} onClose={onClose} className="relative z-50">
      <Headless.DialogBackdrop
        transition
        className="fixed inset-0 bg-white/40 backdrop-blur-lg backdrop-saturate-150 transition duration-100 data-closed:opacity-0 dark:bg-zinc-950/40"
      />
      <div className="fixed inset-0 flex items-start justify-center p-4 pt-[18vh]">
        <Headless.DialogPanel
          transition
          className="w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-zinc-950/10 transition duration-100 data-closed:scale-[0.98] data-closed:opacity-0 dark:bg-zinc-900 dark:ring-white/10"
        >
          <Headless.Combobox onChange={pick}>
            {({ activeOption }) => (<>
            <div className="flex items-center gap-3 border-b border-zinc-950/5 px-4 dark:border-white/5">
              <MagnifyingGlassIcon className="size-4 shrink-0 fill-zinc-500 dark:fill-zinc-400" />
              <Headless.ComboboxInput
                autoFocus
                placeholder="Jump to workspace or module…"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  // ⌘↵ / Ctrl+↵ — open the focused result in a new tab.
                  // preventDefault also skips Headless's own Enter select
                  // (merged handlers stop once defaultPrevented).
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault()
                    pick(activeOption, true)
                  }
                }}
                className="h-12 w-full border-0 bg-transparent text-base text-zinc-950 placeholder:text-zinc-400 focus:outline-hidden dark:text-white dark:placeholder:text-zinc-500"
              />
              <kbd className="rounded border border-zinc-950/10 px-1.5 py-0.5 font-sans text-[10px] text-zinc-400 dark:border-white/10 dark:text-zinc-500">
                esc
              </kbd>
            </div>
            {wsHits.length + modHits.length > 0 ? (
              <Headless.ComboboxOptions static className="max-h-80 overflow-y-auto p-2">
                {wsHits.length > 0 && groupHeading('Workspaces')}
                {wsHits.map((w) => (
                  <Headless.ComboboxOption
                    key={`ws:${w.id}`}
                    value={{ kind: 'workspace', id: w.id }}
                    onMouseDown={newTabClick({ kind: 'workspace', id: w.id })}
                    className={optionClass}
                  >
                    <Avatar
                      initials={w.id[0]?.toUpperCase()}
                      className={'size-5 shrink-0 ' + workspaceColor(w.id)}
                    />
                    <span className="min-w-0 truncate text-sm font-medium text-zinc-950 dark:text-white">
                      {capitalize(w.id)}
                    </span>
                    <span className="ml-auto text-xs text-zinc-400 dark:text-zinc-500">Workspace</span>
                  </Headless.ComboboxOption>
                ))}
                {modHits.length > 0 && groupHeading('Modules')}
                {modHits.map((m) => (
                  <Headless.ComboboxOption
                    key={m.qid}
                    value={{ kind: 'module', qid: m.qid }}
                    onMouseDown={newTabClick({ kind: 'module', qid: m.qid })}
                    className={optionClass}
                  >
                    <ModIcon name={m.icon} className="size-4 shrink-0" />
                    <span className="min-w-0 truncate text-sm text-zinc-950 dark:text-white">{m.name}</span>
                    <span className="ml-auto text-xs text-zinc-400 dark:text-zinc-500">
                      {capitalize(m.workspace)}
                    </span>
                  </Headless.ComboboxOption>
                ))}
              </Headless.ComboboxOptions>
            ) : (
              <p className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                {toks.length ? `No matches for “${query.trim()}”.` : 'Nothing to jump to.'}
              </p>
            )}
            </>)}
          </Headless.Combobox>
        </Headless.DialogPanel>
      </div>
    </Headless.Dialog>
  )
}

/* =========================================================================
 * The chrome slot itself
 * ========================================================================= */
export function chrome({
  boot,
  user,
  modules,
  workspaces,
  workspace,
  activeQid,
  active,
  loadedModules,
  navigate,
  pickWorkspace,
}) {
  /* ---- user identity + theme ----
   * The pre-paint IIFE at module load already applied the persisted theme
   * before React mounted (no flash). Below: keep state in sync as the user
   * changes preferences from the settings dialog, persist to localStorage,
   * and re-listen to the system color-scheme change event when `system` is
   * selected. */
  const [username, setUsername] = useState(() => readPref('atelier:username', ''))
  // When an auth module supplies a real identity, its name wins over the local
  // `atelier:username` preference and the rename field is locked — you don't get
  // to rename your authenticated self. Ungated/local dev keeps the editable pref
  // (`user.id === 'local'` is the shell's ungated sentinel; see buildDefaultUser).
  const authName = user && user.id && user.id !== 'local' && !user.anonymous ? (user.name || '') : ''
  const displayName = authName || username
  // The auth module advertises its logout URL on the user; derive its account
  // page qid from it (`/api/<qid>/logout` → `<qid>`) so "My account" can link there.
  const accountQid = user?.logout ? user.logout.replace(/^\/api\//, '').replace(/\/logout$/, '') : null
  const [theme, setTheme] = useState(() => {
    const v = readPref('atelier:theme', 'system')
    return THEMES.includes(v) ? v : 'system'
  })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [docsOpen, setDocsOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  // ⌘K / Ctrl+K toggles the command palette. Capture-phase so it works even
  // while a module's input has focus (Spotlight-style: from anywhere), and
  // stopPropagation so a module's own ⌘K handler never double-fires.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        e.stopPropagation()
        setPaletteOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [])

  useEffect(() => { writePref('atelier:username', username) }, [username])
  useEffect(() => {
    writePref('atelier:theme', theme)
    applyTheme(theme)
  }, [theme])
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  // TopBarCenter slot — scoped to the current workspace only. `global` is a
  // normal workspace now, so its modules' slots don't bleed into others. First
  // eligible module wins.
  let TopBarCenterSlot = null
  const candidates = modules.filter((m) => m.workspace === workspace)
  for (const m of candidates) {
    const e = loadedModules[m.qid]
    if (e?.status !== 'ok' || !e.TopBarCenter) continue
    TopBarCenterSlot = e.TopBarCenter
    break
  }

  // Rail composition — only the current workspace's own modules. `global` is a
  // normal workspace, so its modules show in the rail only when you're in
  // global, not in every workspace. Hidden + chrome modules excluded.
  //
  // Unlike the builtin chrome we do NOT split by `meta.group` — catalyst
  // sidebars are flat-by-default (the demo at catalyst-demo.tailwindui.com
  // only uses SidebarHeading for the secondary "Upcoming events" block).
  // So `meta.group` is ignored here; modules sort alphabetically into one
  // section.
  // Ordered rail (visible modules) for any workspace — the same order the
  // sidebar shows: hidden/chrome and ambient-only modules dropped, primary
  // modules first, then alphabetical. Used both for the current rail and to
  // resolve a workspace's "first module" when switching into it.
  const railFor = (wsId) => {
    const byId = new Map()
    for (const m of modules) {
      if (m.workspace !== wsId) continue
      const loadedMeta = loadedModules[m.qid]?.meta || {}
      const merged = { ...(m.meta || {}), ...loadedMeta }
      if (merged.hidden || merged.isChrome) continue
      byId.set(m.id, { ...m, meta: merged })
    }
    return [...byId.values()]
      .filter((m) => {
        const loaded = loadedModules[m.qid]
        // Skip ambient-only modules (slot exports without a default Module).
        return !(loaded?.status === 'ok' && !loaded.hasDefault)
      })
      .map((m) => ({
        id: m.id,
        qid: m.qid,
        workspace: m.workspace,
        name: (m.meta?.name) || m.id,
        icon: (m.meta?.icon) || 'square',
        primary: !!m.meta?.primary,
      }))
      .sort((a, b) => {
        if (a.primary !== b.primary) return a.primary ? -1 : 1
        return a.name.localeCompare(b.name)
      })
  }
  // A bare Option *tap* previews another workspace's rail without navigating
  // (see the keyboard section). `displayWs` is what the sidebar shows — the
  // preview if active, otherwise the real current workspace.
  const [previewWs, setPreviewWs] = useState(null)
  // After an Option tap, a brief window where a BARE number (no Option) also
  // navigates — shown as a depleting countdown that expires before the preview
  // reverts. `quickNav` is a generation counter (0 = closed; bumping it restarts
  // the countdown animation).
  const [quickNav, setQuickNav] = useState(0)
  const QUICKNAV_MS = 3000
  const displayWs = previewWs || workspace
  const railItems = railFor(displayWs)

  // Every workspace with at least one visible module is a picker destination —
  // `global` included (it's a normal workspace now, not a hidden baseline).
  // `w.modules` already excludes hidden/chrome modules (server-side).
  const pickerWorkspaces = (workspaces || []).filter((w) => (w.modules?.length ?? 0) > 0)
  const showPicker = pickerWorkspaces.length >= 1

  // ⌘K palette candidates — every visible module across every accessible
  // workspace, in rail order, the current workspace's own modules first.
  // (railFor items already carry their workspace.)
  const paletteModules = [
    ...railFor(workspace),
    ...pickerWorkspaces.filter((w) => w.id !== workspace).flatMap((w) => railFor(w.id)),
  ]

  // ── Keyboard navigation ───────────────────────────────────────────────────
  //   • Option (tap)   → preview the NEXT workspace in the rail (cycling, wraps
  //                      to the first). Just a preview — nothing navigates yet.
  //   • Option + 1–9   → load module N of the workspace shown in the rail (the
  //                      preview if active, else the current one). This commits.
  //   • Option+Shift   → open the workspace bar; then a plain 1–9 picks that
  //                      workspace (landing on its first module).
  // A preview reverts to the real workspace on click-outside / Esc / inactivity.
  // Hints: while Option is held, rail modules show their number; while the
  // workspace bar is open, each workspace shows its number. We read e.code
  // (Digit1…) since Option+number emits glyphs on macOS, not digits.
  const [altHeld, setAltHeld] = useState(false)
  const altLabel = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌥' : 'Alt'
  // Mirror the workspace bar's open/closed state into React (Headless tracks it
  // on the button's aria-expanded). While it's open, a number picks a workspace
  // — not a module — so the rail's ⌥N hints would be lying; we hide them then.
  const [wsOpen, setWsOpen] = useState(false)
  useEffect(() => {
    const btn = document.querySelector('[data-ws-picker]')
    if (!btn) return
    const sync = () => setWsOpen(btn.getAttribute('aria-expanded') === 'true')
    sync()
    const obs = new MutationObserver(sync)
    obs.observe(btn, { attributes: true, attributeFilter: ['aria-expanded'] })
    return () => obs.disconnect()
  }, [showPicker])

  // Switch workspace AND land on its first module (per the nav spec); fall back
  // to the workspace home only if it has no visible modules.
  const goToWorkspace = (wsId) => {
    const first = railFor(wsId)[0]
    navigate(first ? first.qid : `${wsId}/`)
  }

  const navRef = useRef(null)
  const previewRevert = useRef(null)
  const quickNavTimer = useRef(null)
  // Stamped by a quick-nav digit just before it navigates — tells the
  // workspace-change effect below that this navigation is part of a
  // number-hopping chain, so the (already-refreshed) window survives it.
  const keepWindowUntil = useRef(0)
  navRef.current = { rail: railItems, navigate, showPicker, list: pickerWorkspaces, workspace, previewWs, setPreviewWs, quickNav }
  // A real workspace change (commit, or any navigation) clears preview + window
  // — unless a quick-nav digit just committed it (see keepWindowUntil): then
  // the window stays alive so you can keep hopping by number.
  useEffect(() => {
    setPreviewWs(null)
    clearTimeout(previewRevert.current)
    if (Date.now() < keepWindowUntil.current) return
    setQuickNav(0)
    clearTimeout(quickNavTimer.current)
  }, [workspace])
  useEffect(() => {
    // Tap-vs-modifier tracking for the Option key (kept in a plain object, not
    // state, so it never triggers a render). `hintTimer` reveals the rail hints
    // only if Option is held past the threshold — so a quick tap doesn't flash
    // them, and "released before the hints showed" is exactly what a tap is.
    const tap = { used: false, hintsShown: false, navigated: false, hintTimer: null }
    const TAP_MS = 200
    // The workspace picker button (a Headless MenuButton). Found by data attr,
    // not a React ref — DropdownButton isn't a forwardRef, so a ref won't attach.
    const wsBtn = () => document.querySelector('[data-ws-picker]')
    const wsBarOpen = () => wsBtn()?.getAttribute('aria-expanded') === 'true'
    const armRevert = () => {
      clearTimeout(previewRevert.current)
      previewRevert.current = setTimeout(() => navRef.current.setPreviewWs(null), 4000)
    }
    // Option tap → preview the next workspace (cycling). Landing back on the
    // real current workspace clears the preview rather than marking one.
    // Open / refresh the bare-number quick-nav window (and restart its loader).
    // It's shorter than the revert, so the numbers lapse before the sidebar
    // snaps back. Does NOT change the workspace.
    const openWindow = () => {
      clearTimeout(quickNavTimer.current)
      setQuickNav((g) => g + 1)
      quickNavTimer.current = setTimeout(() => setQuickNav(0), QUICKNAV_MS)
    }
    const cyclePreview = () => {
      const { list, workspace, previewWs, setPreviewWs } = navRef.current
      if (!list || list.length < 2) { openWindow(); return }
      const cur = previewWs || workspace
      const idx = list.findIndex((w) => w.id === cur)
      const next = list[(idx + 1) % list.length]
      setPreviewWs(next.id === workspace ? null : next.id)
      openWindow()
    }
    // A digit that commits a jump REFRESHES the quick-nav window: the
    // countdown restarts on every jump, so you can keep hitting numbers to
    // hop around and the window only lapses once you stay put. The stamp
    // lets the [workspace] effect know the navigation came from a digit
    // (keep the window) rather than a click (clear it).
    const refreshWindow = () => {
      keepWindowUntil.current = Date.now() + 500
      openWindow()
    }
    const onKey = (e) => {
      const t = e.target
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return

      // Any non-Alt key while Option is held = Option used as a modifier (not a
      // tap); it also cancels the pending hint reveal.
      if (e.altKey && e.key !== 'Alt') { tap.used = true; clearTimeout(tap.hintTimer) }
      // Option down → start a potential tap; reveal hints only if held past the
      // threshold so a quick tap stays clean.
      if (e.key === 'Alt' && !e.repeat) {
        tap.used = false
        tap.hintsShown = false
        clearTimeout(previewRevert.current)   // pause the revert countdown while Option is engaged
        clearTimeout(tap.hintTimer)
        tap.hintTimer = setTimeout(() => {
          setAltHeld(true)
          tap.hintsShown = true
          // Holding freezes the countdown: the loader switches to a static full
          // bar (the altHeld branch below) to show you're holding this view.
          // Stop the running expiry so it can't lapse mid-hold; releasing Option
          // (onKeyUp) restarts the depleting countdown.
          clearTimeout(quickNavTimer.current)
          setQuickNav(0)
        }, TAP_MS)
      }
      // Esc cancels a preview / quick-nav window (still lets Headless close its menus).
      if (e.key === 'Escape' && (navRef.current.previewWs || navRef.current.quickNav)) {
        navRef.current.setPreviewWs(null); clearTimeout(quickNavTimer.current); setQuickNav(0)
      }

      const { rail, navigate, showPicker } = navRef.current

      // Option+Shift → toggle the workspace bar (open if closed, close if open).
      if (e.altKey && e.shiftKey && (e.key === 'Alt' || e.key === 'Shift')) {
        if (showPicker && !e.repeat) { e.preventDefault(); wsBtn()?.click() }
        return
      }

      const digit = /^Digit([1-9])$/.exec(e.code)
      if (!digit) return
      const n = Number(digit[1])

      // Workspace bar open → number picks that workspace (and closes the bar).
      // Capture phase + stopPropagation so Headless's menu typeahead never sees it.
      if (wsBarOpen()) {
        e.preventDefault()
        e.stopPropagation()
        const menuId = wsBtn()?.getAttribute('aria-controls')
        const menu = menuId ? document.getElementById(menuId) : null
        const items = menu ? [...menu.querySelectorAll('[role="menuitem"]')] : []
        const target = items[n - 1]
        if (target) { target.click(); refreshWindow() }   // goToWorkspace onClick + closes the menu
        return
      }

      // Option + number → load module N of the workspace shown in the rail.
      // `rail` already reflects the preview, so this commits to the previewed ws.
      if (e.altKey && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        const item = rail[n - 1]
        if (item) { tap.navigated = true; refreshWindow(); navigate(item.qid) }
        return
      }

      // Bare number during the quick-nav window (just after an Option tap) →
      // same as Option+N, no modifier needed.
      if (navRef.current.quickNav && !e.altKey && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.repeat) {
        e.preventDefault()
        const item = rail[n - 1]
        if (item) { refreshWindow(); navigate(item.qid) }
      }
    }
    const onKeyUp = (e) => {
      if (e.key !== 'Alt') return
      clearTimeout(tap.hintTimer)
      const wasTap = !tap.used && !tap.hintsShown
      const navigated = tap.navigated
      setAltHeld(false)
      tap.hintsShown = false
      tap.navigated = false
      // ⌥N already jumped to a module — don't arm a lingering window over it.
      if (navigated) return
      // Workspace bar open → a plain number there picks a workspace; let the bar
      // own numbers and don't arm the rail's module window.
      if (wsBarOpen()) { armRevert(); return }
      // Otherwise, releasing Option leaves you in the rail's bare-number window:
      // the rail shows each module's number and a plain number selects it, while
      // the countdown ticks down before the preview reverts.
      //   • quick tap  → first cycle the preview to the NEXT workspace
      //   • hold / ⌥⇧  → keep the current rail, just (re)start the countdown
      if (wasTap && (navRef.current.previewWs || navRef.current.quickNav)) cyclePreview()
      else openWindow()
      // Start the revert countdown on release, so holding Option keeps the
      // preview alive and the timeout only runs once you let go.
      armRevert()
    }
    const onBlur = () => { setAltHeld(false); clearTimeout(tap.hintTimer) }
    // Clicking outside the sidebar reverts a preview.
    const onPointerDown = (e) => {
      if (e.target?.closest?.('nav')) return
      if (navRef.current.previewWs) navRef.current.setPreviewWs(null)
      if (navRef.current.quickNav) { clearTimeout(quickNavTimer.current); setQuickNav(0) }
    }
    document.addEventListener('keydown', onKey, true)   // capture: beat Headless typeahead
    document.addEventListener('keyup', onKeyUp)
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('keyup', onKeyUp)
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('blur', onBlur)
      clearTimeout(tap.hintTimer)
      clearTimeout(previewRevert.current)
      clearTimeout(quickNavTimer.current)
    }
  }, [])

  // Title.
  const activeMeta = activeQid ? loadedModules[activeQid]?.meta || {} : {}
  const activeMod = activeQid ? modules.find((m) => m.qid === activeQid) : null
  const activeName = activeMeta.name || activeMod?.meta?.name || activeMod?.id
  // Chrome owns the page title — catalyst's web convention is
  // "Page — App", so use that order with an em-dash.
  useEffect(() => {
    document.title = activeName ? `${activeName} — Atelier` : 'Atelier'
  }, [activeName])

  // Browser-tab favicon follows the active module's rail icon. The icon is
  // rendered into the hidden node in the returned tree (so it's the exact same
  // heroicon as the rail); this effect reads it after commit and swaps the
  // favicon. No active module (workspace home) → back to the atelier mark.
  const faviconSrcRef = useRef(null)
  const activeIconName = activeMod ? (activeMeta.icon || activeMod.meta?.icon || 'square') : null
  // Track the OS color scheme so the tab favicon flips black↔white live (not
  // just on reload) when the system theme changes morning/evening.
  const [favDark, setFavDark] = useState(systemPrefersDark)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setFavDark(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  const favColor = faviconColor(favDark)
  useEffect(() => {
    if (typeof document === 'undefined') return
    if (!activeIconName) { applyFavicon(atelierMarkSvg(favColor)); return }
    const svg = faviconSrcRef.current?.querySelector('svg')
    if (svg) applyFavicon(moduleIconFavicon(svg, favColor))
  }, [activeIconName, favColor])

  // SPA-aware rail item — intercepts plain left-click, lets modified clicks
  // through (cmd/ctrl/middle-click open in new tab as expected).
  const onItemClick = (e, qid) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    navigate(qid)
  }

  // Body content from active state.
  let body
  if (active.kind === 'none') {
    body = <EmptyWorkspace workspace={workspace || ''} />
  } else if (active.kind === 'loading') {
    body = <LoadingBody qid={active.qid} />
  } else if (active.kind === 'error') {
    body = <ErrorBody qid={active.qid} err={active.err} />
  } else {
    body = <ModuleErrorBoundary qid={active.qid}>{active.element}</ModuleErrorBoundary>
  }

  const railItem = (item, idx) => (
    <SidebarItem
      key={item.qid}
      href={`/${item.qid}`}
      current={activeQid === item.qid}
      onClick={(e) => onItemClick(e, item.qid)}
    >
      <ModIcon name={item.icon} />
      <SidebarLabel>{item.name}</SidebarLabel>
      {!wsOpen && idx < 9 && altHeld && (
        <kbd className="ml-auto font-sans text-xs text-zinc-400 dark:text-zinc-500">{altLabel}{idx + 1}</kbd>
      )}
      {/* Quick-nav number — same kbd style as the ⌥N hints (bare digit). The
          countdown is a single shared loader below the workspace chip. */}
      {!wsOpen && idx < 9 && !altHeld && quickNav > 0 && (
        <kbd className="ml-auto font-sans text-xs text-zinc-400 dark:text-zinc-500">{idx + 1}</kbd>
      )}
    </SidebarItem>
  )

  return (
    <SidebarLayout
      navbar={
        <Navbar>
          <NavbarSection>
            <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
              {capitalize(workspace)}
              {activeName ? <> · <span className="text-zinc-700 dark:text-zinc-200">{activeName}</span></> : null}
            </span>
          </NavbarSection>
          <NavbarSpacer />
          {TopBarCenterSlot && (
            <NavbarSection>
              <TopBarCenterSlot />
            </NavbarSection>
          )}
          {boot?.label && (
            <NavbarSection>
              <Badge color="zinc">{boot.label}</Badge>
            </NavbarSection>
          )}
        </Navbar>
      }
      sidebar={
        <Sidebar>
          <SidebarHeader className="relative">
            {showPicker ? (
              <Dropdown>
                <DropdownButton as={SidebarItem} data-ws-picker="true">
                  <Avatar
                    slot="icon"
                    initials={(displayWs || '?')[0]?.toUpperCase()}
                    className={workspaceColor(displayWs)}
                  />
                  <SidebarLabel>{capitalize(displayWs) || 'atelier'}</SidebarLabel>
                  {altHeld ? (
                    <kbd className="ml-auto font-sans text-xs text-zinc-400 dark:text-zinc-500">{altLabel}⇧</kbd>
                  ) : (
                    <ChevronDownIcon />
                  )}
                </DropdownButton>
                <DropdownMenu className="min-w-64" anchor="bottom start">
                  {pickerWorkspaces.map((w, i) => (
                    <DropdownItem key={w.id} onClick={() => goToWorkspace(w.id)}>
                      <Avatar
                        slot="icon"
                        initials={w.id[0]?.toUpperCase()}
                        className={workspaceColor(w.id)}
                      />
                      <DropdownLabel>{capitalize(w.id)}</DropdownLabel>
                      {i < 9 && <DropdownShortcut keys={[String(i + 1)]} />}
                    </DropdownItem>
                  ))}
                </DropdownMenu>
              </Dropdown>
            ) : (
              <SidebarItem href="/">
                <AtelierMark />
                <SidebarLabel>atelier</SidebarLabel>
              </SidebarItem>
            )}
            {/* Quick-nav countdown — overlays the header's bottom border (absolute,
                so it adds no height and never shifts the rail). While Option is HELD
                it's a static full bar (you're in the view, paused); on release it
                depletes over the window, revealing the border as it empties. The
                rail numbers stay live until it empties. */}
            {altHeld ? (
              <span className="absolute inset-x-0 -bottom-px h-px bg-zinc-950/5 dark:bg-white/5" />
            ) : quickNav > 0 ? (
              <span
                key={quickNav}
                className="absolute inset-x-0 -bottom-px h-px origin-left bg-zinc-950/5 dark:bg-white/5"
                style={{ animation: `atelier-deplete ${QUICKNAV_MS}ms linear forwards` }}
              />
            ) : null}
          </SidebarHeader>

          <SidebarBody>
            <SidebarSection>
              {railItems.length === 0 ? (
                <div className="px-2 py-1 text-sm text-zinc-500 dark:text-zinc-400">
                  No modules yet.
                </div>
              ) : (
                railItems.map(railItem)
              )}
            </SidebarSection>

            <SidebarSpacer />

            <SidebarSection>
              <SidebarItem onClick={() => navigate(`${workspace || 'global'}/`)}>
                <PlusIcon data-slot="icon" />
                <SidebarLabel>Add module</SidebarLabel>
              </SidebarItem>
            </SidebarSection>
          </SidebarBody>

          <SidebarFooter className="max-lg:hidden">
            <Dropdown>
              <DropdownButton as={SidebarItem}>
                <span className="flex min-w-0 items-center gap-3">
                  <Avatar
                    initials={initialsOf(displayName)}
                    square
                    className="size-10 bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm/5 font-medium text-zinc-950 dark:text-white">
                      {displayName || 'Anonymous'}
                    </span>
                    <span className="block truncate text-xs/5 font-normal text-zinc-500 dark:text-zinc-400">
                      {theme === 'system' ? 'System theme' : theme === 'dark' ? 'Dark theme' : 'Light theme'}
                    </span>
                  </span>
                </span>
                <ChevronUpIcon />
              </DropdownButton>
              <DropdownMenu className="min-w-64" anchor="top start">
                {accountQid && (
                  <>
                    <DropdownItem onClick={() => navigate(accountQid)}>
                      <UserCircleIcon />
                      <DropdownLabel>My account</DropdownLabel>
                    </DropdownItem>
                    <DropdownDivider />
                  </>
                )}
                <DropdownItem onClick={() => setDocsOpen(true)}>
                  <BookOpenIcon />
                  <DropdownLabel>Documentation…</DropdownLabel>
                </DropdownItem>
                <DropdownItem onClick={() => setSettingsOpen(true)}>
                  <Cog8ToothIcon />
                  <DropdownLabel>Settings…</DropdownLabel>
                </DropdownItem>
                {user?.logout && (
                  <>
                    <DropdownDivider />
                    <DropdownItem
                      onClick={async () => {
                        try { await fetch(user.logout, { method: 'POST' }) } finally { window.location.href = '/' }
                      }}
                    >
                      <ArrowRightStartOnRectangleIcon />
                      <DropdownLabel>Sign out</DropdownLabel>
                    </DropdownItem>
                  </>
                )}
              </DropdownMenu>
            </Dropdown>
          </SidebarFooter>
        </Sidebar>
      }
    >
      <ConnectionBanner />
      {/* Hidden source for the tab favicon — the active module's rail icon,
          read by the favicon effect above. */}
      <span ref={faviconSrcRef} aria-hidden="true" style={{ display: 'none' }}>
        {activeIconName && <ModIcon name={activeIconName} />}
      </span>
      {body}
      <SettingsDialog
        open={settingsOpen}
        onClose={setSettingsOpen}
        username={username}
        setUsername={setUsername}
        authName={authName}
        theme={theme}
        setTheme={setTheme}
      />
      <DocsViewer open={docsOpen} onClose={setDocsOpen} />
      <CommandPalette
        open={paletteOpen}
        onClose={setPaletteOpen}
        workspaces={pickerWorkspaces}
        modules={paletteModules}
        onPick={(item, newTab) => {
          if (newTab) {
            // Same destination goToWorkspace/navigate would use, in a fresh
            // tab. Deferred out of the gesture: Chrome copies the gesture's
            // ⌘/Ctrl modifier into window.open's disposition (background
            // tab); a deferred call keeps the transient activation but not
            // the modifiers, so the new tab opens focused.
            const qid = item.kind === 'workspace' ? (railFor(item.id)[0]?.qid ?? `${item.id}/`) : item.qid
            setTimeout(() => window.open(`/${qid}`, '_blank')?.focus(), 0)
          } else if (item.kind === 'workspace') goToWorkspace(item.id)
          else navigate(item.qid)
        }}
      />
    </SidebarLayout>
  )
}
