// Atelier Config — the instance's settings panel, ported from the marketplace
// dock's Configure surface (004) minus everything marketplace. Five tabs, URL-
// routed via window.__atelier.useRoute():
//   ''        → General   (identity / network / behavior — form ⇄ raw JSON)
//   'apps'    → Apps & Workspaces (drag between workspaces, link/unlink, themes)
//   'system'  → System check (package managers + versions)
//   'daemon'  → Start at login (this instance as a launchd LaunchAgent)
//   'logs'    → Activity (live server output over the shell WS)
// Icons are inline lucide geometry (./icons.js) — catalyst exposes no icon runtime.

import { Button, Input, Heading, Text } from '@atelier/kit'
import { parseModules } from './config-util.mjs'
import { ICONS } from './icons.js'

export const meta = { name: 'Atelier Config', icon: 'settings-2', chrome: 'catalyst-chrome' }

const { useState, useEffect, useRef, useCallback } = React
const cn = (...p) => p.filter(Boolean).join(' ')
const self = window.__atelier.self(import.meta.url)

/* Inline lucide icon — color is currentColor, so set text-* (or style color) on the parent. */
function Icon({ name, size = 16, strokeWidth = 1.75, className = '', style }) {
  const nodes = ICONS[name] || ICONS.square
  return (
    <span aria-hidden="true" className={cn('inline-flex shrink-0 items-center justify-center', className)} style={{ width: size, height: size, ...style }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        {nodes.map(([tag, attrs], i) => React.createElement(tag, { key: i, ...attrs }))}
      </svg>
    </span>
  )
}

function Loading({ label = 'Loading…' }) {
  return <div className="flex items-center justify-center gap-2 py-20 text-sm text-zinc-500 dark:text-zinc-400"><Icon name="loader-circle" size={16} className="animate-spin" /> {label}</div>
}

function Toggle({ on, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
      className={cn('relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors', on ? 'bg-blue-600' : 'bg-zinc-950/15 dark:bg-white/15')}>
      <span className={cn('inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform', on ? 'translate-x-5' : 'translate-x-0.5')} />
    </button>
  )
}

/* ---- config form ----------------------------------------------------------- */
const CONFIG_FIELDS = [
  { key: 'label', group: 'Identity', label: 'Instance name', icon: 'tag', type: 'text', accent: '#3b82f6', placeholder: 'My Atelier', dflt: 'no name',
    help: 'A friendly name for this Atelier. Your theme can show it in the corner.' },
  { key: 'defaultChrome', group: 'Identity', label: 'Default theme', icon: 'palette', type: 'chrome', accent: '#a855f7', placeholder: 'catalyst-chrome', restart: true, dflt: 'first installed theme (a→z)',
    help: 'The theme (a “chrome”) Atelier uses by default. Apps can pin their own with meta.chrome.' },
  { key: 'port', group: 'Network', label: 'Port', icon: 'plug', type: 'number', accent: '#06b6d4', placeholder: '1844', restart: true, dflt: '1844',
    help: 'The local web port — you’ll open Atelier at http://localhost:<port>.' },
  { key: 'baseUrl', group: 'Network', label: 'Public address', icon: 'globe', type: 'text', accent: '#10b981', placeholder: 'https://atelier.example.com', restart: true, dflt: 'http://localhost:<port>',
    help: 'Only needed behind a domain or tunnel — the address others use to reach this Atelier.' },
  { key: 'hotReload', group: 'Behavior', label: 'Live reload', icon: 'refresh-cw', type: 'bool', accent: '#f59e0b', restart: true, dflt: 'on',
    help: 'Auto-refresh while you edit modules. Great while building; turn off once deployed.' },
  { key: 'auth', group: 'Behavior', label: 'Require sign-in', icon: 'lock', type: 'auth', accent: '#f43f5e', restart: true, dflt: 'open access',
    help: 'Keep Atelier private behind a login. Leave empty for open access, or enter an auth module’s id.' },
]
const FIELD_GROUPS = ['Identity', 'Network', 'Behavior']
const CONFIG_TABS = [
  { id: 'general', label: 'General', icon: 'sliders-horizontal', desc: 'Identity, network & behavior' },
  { id: 'apps', label: 'Apps & Workspaces', icon: 'blocks', desc: 'What’s mounted, and where' },
  { id: 'system', label: 'System check', icon: 'stethoscope', desc: 'Required tools & versions' },
  { id: 'daemon', label: 'Start at login', icon: 'log-in', desc: 'Keep this instance running' },
  { id: 'logs', label: 'Activity', icon: 'scroll-text', desc: 'Live server output' },
]
const RESTART_LABELS = Object.fromEntries(CONFIG_FIELDS.map((f) => [f.key, f.label]))

const FIELD_INPUT = 'w-full rounded-lg border border-zinc-950/15 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/15 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-zinc-500'

function ConfigField({ f, cfg, set, chromes }) {
  const v = f.key === 'hotReload' ? (cfg.hotReload === undefined ? true : !!cfg.hotReload) : cfg[f.key]
  let control
  if (f.type === 'bool') {
    control = <Toggle on={v} onChange={(x) => set(f.key, x)} />
  } else if (f.type === 'chrome' && chromes && chromes.length) {
    control = (
      <div className="relative w-full">
        <select value={cfg[f.key] || ''} onChange={(e) => set(f.key, e.target.value)} className={cn(FIELD_INPUT, 'cursor-pointer appearance-none pr-9')}>
          {!cfg[f.key] && <option value="">Select a theme…</option>}
          {chromes.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <Icon name="chevron-down" size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
      </div>
    )
  } else if (f.type === 'auth') {
    control = <input value={typeof cfg.auth === 'string' ? cfg.auth : ''} onChange={(e) => set('auth', e.target.value)} placeholder="(open access)" className={FIELD_INPUT} />
  } else {
    control = <input type={f.type === 'number' ? 'number' : 'text'} value={cfg[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} className={FIELD_INPUT} />
  }
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 ring-inset ring-black/[0.04]" style={{ background: f.accent + '22', color: f.accent }}><Icon name={f.icon} size={18} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13.5px] font-semibold text-zinc-950 dark:text-white">{f.label}</span>
          {f.restart && <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">restart</span>}
        </div>
        <p className="mt-0.5 text-xs leading-[1.5] text-zinc-500 dark:text-zinc-400">
          {f.help}
          {f.dflt && <span className="text-zinc-400 dark:text-zinc-500"> Empty → <span className="font-mono text-[11px]">{f.dflt}</span>.</span>}
        </p>
      </div>
      <div className={cn('shrink-0', f.type === 'bool' ? 'sm:pr-1' : 'sm:w-64')}>{control}</div>
    </div>
  )
}

/* ---- JSON editor ------------------------------------------------------------ */
const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
// Tiny JSON tokenizer → highlighted HTML for the editor overlay.
function highlightJson(src) {
  return escHtml(src).replace(/("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (m, str, colon, kw, num) => {
      if (str !== undefined) return colon ? `<span class="tok-key">${str}</span>${colon}` : `<span class="tok-str">${str}</span>`
      if (kw) return `<span class="tok-kw">${kw}</span>`
      if (num) return `<span class="tok-num">${num}</span>`
      return m
    })
}

// A small, safe JSON editor: highlighted overlay + transparent textarea.
function JsonEditor({ text, onChange, error }) {
  const taRef = useRef(null), preRef = useRef(null)
  const sync = () => { const t = taRef.current, p = preRef.current; if (t && p) { p.scrollTop = t.scrollTop; p.scrollLeft = t.scrollLeft } }
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-950/10 bg-zinc-950 shadow-sm dark:border-white/10">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <span className="flex items-center gap-2 text-xs font-medium text-zinc-400"><Icon name="braces" size={14} /> atelier.config.json</span>
        {error
          ? <span className="flex items-center gap-1.5 text-xs font-medium text-red-400"><Icon name="circle-x" size={13} /> {error}</span>
          : <span className="flex items-center gap-1.5 text-xs font-medium text-green-400"><Icon name="circle-check" size={13} /> Valid JSON</span>}
      </div>
      <div className="relative">
        <pre ref={preRef} aria-hidden className="ac-json pointer-events-none m-0 max-h-[60vh] overflow-auto px-4 py-3 text-zinc-300" dangerouslySetInnerHTML={{ __html: highlightJson(text) + '\n' }} />
        <textarea ref={taRef} value={text} onChange={(e) => onChange(e.target.value)} onScroll={sync} spellCheck={false} autoCapitalize="off" autoCorrect="off"
          className="ac-json absolute inset-0 resize-none overflow-auto bg-transparent px-4 py-3 text-transparent caret-white outline-none" />
      </div>
    </div>
  )
}

/* ---- apps & workspaces ------------------------------------------------------ */
const moduleLabel = (m) => {
  if (typeof m === 'string') return m.replace(/^!/, '').split('/').filter(Boolean).pop()
  if (m && m.path) return m.path.split('/').filter(Boolean).pop()
  if (m && m.workspace) return '$' + m.workspace
  if (m && m.id) return m.id
  return JSON.stringify(m)
}

const CHROME_COLORS = ['#3b82f6', '#a855f7', '#f97316', '#14b8a6', '#ec4899', '#eab308', '#06b6d4', '#ef4444']

function AppsWorkspaces({ cfg, refresh }) {
  const [inst, setInst] = useState(null)
  const [wsName, setWsName] = useState('')
  const [wsBusy, setWsBusy] = useState(false)
  const [linkPath, setLinkPath] = useState('')
  const [linkWs, setLinkWs] = useState('global')
  const [wsErr, setWsErr] = useState(null)
  const [drag, setDrag] = useState(null)   // index of the app being dragged
  const [over, setOver] = useState(null)   // workspace lane being dragged over
  const [confirm, setConfirm] = useState(null)   // index of the app awaiting unlink confirm
  const [renaming, setRenaming] = useState(null)   // workspace being renamed
  const [renameVal, setRenameVal] = useState('')

  const loadInst = useCallback(() => fetch(`${self.api}/instance`).then((r) => r.json()).then(setInst).catch(() => setInst({ defaultChrome: null, workspaces: ['global'], meta: {} })), [])
  useEffect(() => { loadInst() }, [loadInst])

  const createWs = async () => {
    setWsErr(null); setWsBusy(true)
    try {
      const r = await (await fetch(`${self.api}/workspaces/create`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: wsName.trim() }) })).json()
      if (r.error) setWsErr(r.error); else { setWsName(''); loadInst() }
    } catch (e) { setWsErr(String(e)) } finally { setWsBusy(false) }
  }
  // Rename/delete write atelier.config.json → the shell reloads to apply.
  const commitRename = async (from) => {
    const to = renameVal.trim(); setRenaming(null)
    if (!to || to === from) return
    setWsErr(null)
    try { const r = await (await fetch(`${self.api}/workspaces/rename`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ from, to }) })).json(); if (r.error) { setWsErr(r.error); loadInst() } } catch (e) { setWsErr(String(e)) }
  }
  const deleteWs = async (name) => {
    if (typeof window !== 'undefined' && !window.confirm(`Delete the empty “${name}” workspace?`)) return
    setWsErr(null)
    try { const r = await (await fetch(`${self.api}/workspaces/delete`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) })).json(); if (r.error) { setWsErr(r.error); loadInst() } } catch (e) { setWsErr(String(e)) }
  }

  if (!inst) return <Loading />

  const items = parseModules(cfg.modules).map((it, i) => ({ ...it, i }))
  const metaOf = (raw) => inst.meta[moduleLabel(raw)] || {}
  // Kind is computed PER ENTRY from its path: 'system' lives inside the shell
  // folder; everything else — including this settings module itself — is an
  // ordinary linked path-mount, and honestly labelled as one.
  const roots = inst.roots || {}
  const rawPath = (raw) => { const p = typeof raw === 'string' ? raw.replace(/^!/, '') : (raw && raw.path) || ''; return !p ? '' : p[0] === '~' ? (roots.home || '') + p.slice(1) : p }
  const inPath = (p, base) => !!base && (p === base || p.startsWith(base + '/'))
  const kindOf = (it) => { const p = rawPath(it.raw); if (inPath(p, roots.atelier)) return 'system'; return 'linked' }
  // Lanes = workspace dirs ∪ any workspace referenced by a config block, so apps
  // in a workspace whose $dir is missing still show (never silently disappear).
  const workspaces = [...new Set([...(inst.workspaces || ['global']), ...items.map((it) => it.ws)])]
  const chromeItems = items.filter((it) => metaOf(it.raw).isChrome)
  const appItems = items.filter((it) => !metaOf(it.raw).isChrome)
  const orderedChromes = [inst.defaultChrome, ...chromeItems.map((c) => moduleLabel(c.raw))].filter((v, i, a) => v && a.indexOf(v) === i)
  const colorOf = (chromeId) => CHROME_COLORS[Math.max(0, orderedChromes.indexOf(chromeId)) % CHROME_COLORS.length]
  const usedChrome = (raw) => metaOf(raw).chrome || inst.defaultChrome
  const rawSource = (raw) => (typeof raw === 'string' ? raw.replace(/^!/, '') : (raw && raw.path) || moduleLabel(raw))

  // Apps & Workspaces edits write atelier.config.json immediately on the server
  // (read-modify-write) — never staged. The write makes the shell reload; we also
  // reload as a fallback and refresh the form so the view is always fresh.
  const persist = async (route, body) => {
    setWsErr(null)
    try {
      const r = await (await fetch(`${self.api}/${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json()
      if (r.error) { setWsErr(r.error); return false }
    } catch (e) { setWsErr(String(e)); return false }
    refresh && refresh()
    setTimeout(() => { try { location.reload() } catch {} }, 700)
    return true
  }
  const dropOn = (w) => { setOver(null); const it = drag != null ? items[drag] : null; setDrag(null); if (it && it.ws !== w) persist('move', { raw: it.raw, to: w }) }
  const doUnlink = async (it) => { setConfirm(null); await persist('unlink', { raw: it.raw }) }
  const doLink = async () => { if (linkPath.trim() && await persist('link', { path: linkPath.trim(), ws: linkWs })) setLinkPath('') }
  const doOpen = (it) => { try { location.assign('/' + (it.ws || 'global') + '/' + moduleLabel(it.raw)) } catch {} }

  // The unlink confirm panel — shared by apps and unused chromes.
  const renderConfirm = (it) => {
    const id = moduleLabel(it.raw); const m = metaOf(it.raw); const kindWord = m.isChrome ? 'theme' : 'app'
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/[0.05] p-3">
        <div className="flex items-start gap-2.5">
          <Icon name="circle-alert" size={16} className="mt-0.5 shrink-0 text-red-500" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">Unlink {m.name || id}?</div>
            <p className="mt-0.5 text-xs leading-[1.5] text-zinc-500 dark:text-zinc-400">
              This {kindWord} is <span className="font-medium text-amber-600 dark:text-amber-400">linked</span> from <code className="rounded bg-zinc-950/10 px-1 text-[11px] dark:bg-white/10">{rawSource(it.raw)}</code> — only the link is removed. Its files &amp; data are left untouched.
            </p>
            <div className="mt-2.5 flex gap-2">
              <button onClick={() => setConfirm(null)} className="cursor-pointer rounded-lg px-3 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-950/[0.06] dark:text-zinc-300 dark:hover:bg-white/10">Cancel</button>
              <button onClick={() => doUnlink(it)} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-red-500"><Icon name="unlink" size={13} /> Unlink</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {wsErr && <p className="rounded-lg border border-red-500/30 bg-red-500/[0.06] px-3 py-2 text-sm text-red-600 dark:text-red-400">{wsErr}</p>}

      {/* Themes / chromes */}
      <div className="rounded-2xl border border-zinc-950/10 bg-white p-4 shadow-sm shadow-zinc-950/[0.03] dark:border-white/10 dark:bg-white/[0.02] dark:shadow-none">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-500"><Icon name="palette" size={17} /></span>
          <div>
            <div className="text-sm font-semibold text-zinc-950 dark:text-white">Themes</div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">The skins your apps render in. An unused theme (not the default, no app pins it) can be unlinked.</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {chromeItems.map((it) => {
            const id = moduleLabel(it.raw); const m = metaOf(it.raw); const isDefault = id === inst.defaultChrome
            const users = appItems.filter((a) => metaOf(a.raw).chrome === id).length
            const removable = !isDefault && kindOf(it) !== 'system' && users === 0
            return (
              <div key={it.i} className={cn('flex items-center gap-2 rounded-lg border py-1.5 pl-2 pr-2.5 dark:border-white/10', confirm === it.i ? 'border-red-500/40' : 'border-zinc-950/10')}>
                <span className="h-4 w-4 rounded-[5px] ring-1 ring-inset ring-black/10" style={{ background: colorOf(id) }} />
                <span className="text-sm text-zinc-800 dark:text-zinc-200">{m.name || id}</span>
                <span title={kindOf(it) === 'system' ? 'Ships inside the atelier/ shell folder — part of the runtime.' : 'Path-mounted from its own folder — unlinking removes only the config entry.'} className="inline-flex cursor-help items-center gap-1 text-[10px] font-medium text-zinc-400 dark:text-zinc-500"><Icon name={kindOf(it) === 'system' ? 'lock' : 'link-2'} size={10} />{kindOf(it)}</span>
                {isDefault
                  ? <span className="rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">default</span>
                  : users
                    ? <span className="rounded-md bg-zinc-500/15 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:text-zinc-400">in use · {users}</span>
                    : <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">unused</span>}
                {removable && <button onClick={() => setConfirm(it.i)} title="Unlink" className="-mr-1 grid h-5 w-5 cursor-pointer place-items-center rounded text-zinc-400 transition-colors hover:bg-red-500/10 hover:text-red-500"><Icon name="x" size={13} /></button>}
              </div>
            )
          })}
          {!chromeItems.length && <Text className="text-xs">No themes installed — apps use the default.</Text>}
        </div>
        {confirm != null && items[confirm] && metaOf(items[confirm].raw).isChrome && <div className="mt-3">{renderConfirm(items[confirm])}</div>}
      </div>

      <div className="flex items-center gap-2 px-1 text-xs text-zinc-500 dark:text-zinc-400">
        <Icon name="grip-vertical" size={14} className="text-zinc-400" /> Drag an app between workspaces to move it. Changes apply immediately.
      </div>

      {/* Workspace lanes — workspace identity on the left, apps stacked on the right */}
      <div className="space-y-3">
        {workspaces.map((w) => {
          const inWs = appItems.filter((it) => it.ws === w)
          const isOver = over === w
          return (
            <div key={w}
              onDragOver={(e) => { if (drag != null) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(w) } }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver((o) => (o === w ? null : o)) }}
              onDrop={(e) => { e.preventDefault(); dropOn(w) }}
              className={cn('rounded-2xl border p-4 transition-colors', isOver ? 'border-blue-500/60 bg-blue-500/[0.05] ring-2 ring-blue-500/20' : 'border-zinc-950/10 bg-white dark:border-white/10 dark:bg-white/[0.02]')}>
              <div className="flex flex-col gap-3 sm:flex-row sm:gap-5">
                <div className="group/ws flex items-start gap-2.5 sm:w-56 sm:shrink-0">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-zinc-500/10 text-zinc-500"><Icon name={w === 'global' ? 'globe' : 'layers'} size={17} /></span>
                  <div className="min-w-0">
                    {renaming === w ? (
                      <input autoFocus value={renameVal} onChange={(e) => setRenameVal(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitRename(w); if (e.key === 'Escape') setRenaming(null) }}
                        onBlur={() => commitRename(w)}
                        className="w-32 rounded-md border border-blue-500/50 bg-white px-1.5 py-0.5 text-sm font-semibold text-zinc-900 outline-none ring-2 ring-blue-500/20 dark:bg-white/5 dark:text-white" />
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-zinc-950 dark:text-white">{w}</span>
                        {w === 'global' && <span className="rounded-md bg-zinc-500/15 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:text-zinc-400">default</span>}
                        {w !== 'global' && (
                          <span className="inline-flex items-center gap-0.5 opacity-0 transition-opacity group-hover/ws:opacity-100">
                            <button onClick={() => { setRenaming(w); setRenameVal(w) }} title="Rename workspace" className="grid h-5 w-5 cursor-pointer place-items-center rounded text-zinc-400 hover:bg-zinc-950/[0.06] hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"><Icon name="pencil" size={12} /></button>
                            {inWs.length === 0 && <button onClick={() => deleteWs(w)} title="Delete workspace" className="grid h-5 w-5 cursor-pointer place-items-center rounded text-zinc-400 hover:bg-red-500/10 hover:text-red-500"><Icon name="trash-2" size={12} /></button>}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="mt-0.5 text-xs tabular-nums text-zinc-400 dark:text-zinc-500">{inWs.length} app{inWs.length === 1 ? '' : 's'}</div>
                  </div>
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  {inWs.map((it) => {
                    const id = moduleLabel(it.raw); const m = metaOf(it.raw); const ch = usedChrome(it.raw)
                    const sys = kindOf(it) === 'system'; const dragging = drag === it.i
                    if (confirm === it.i) return <div key={it.i}>{renderConfirm(it)}</div>
                    return (
                      <div key={it.i} draggable={!sys}
                        onDragStart={(e) => { setConfirm(null); setDrag(it.i); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(it.i)) } catch {} }}
                        onDragEnd={() => { setDrag(null); setOver(null) }}
                        className={cn('group flex items-center gap-2.5 rounded-xl border bg-white p-2 transition dark:bg-zinc-900/40',
                          sys ? 'border-zinc-950/10 dark:border-white/10' : 'cursor-grab border-zinc-950/10 hover:border-zinc-950/20 hover:shadow-sm active:cursor-grabbing dark:border-white/10 dark:hover:border-white/20',
                          dragging && 'opacity-40')}>
                        <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: colorOf(ch) }} title={ch ? `uses ${ch}` : ''} />
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-zinc-500/10 text-zinc-500"><Icon name={ICONS[m.icon] ? m.icon : 'box'} size={16} /></span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{m.name || id}</span>
                            {sys
                              ? <span title="Ships inside the atelier/ shell folder — part of the runtime, not removable from here."
                                  className="inline-flex shrink-0 cursor-help items-center gap-1 rounded-md bg-zinc-500/15 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:text-zinc-400"><Icon name="lock" size={10} /> system</span>
                              : <span title="Path-mounted from its own folder — Unlink removes only the config entry; the folder and its data stay untouched."
                                  className="inline-flex shrink-0 cursor-help items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400"><Icon name="link-2" size={10} /> linked</span>}
                          </div>
                          <span className="block truncate text-[10.5px] text-zinc-400 dark:text-zinc-500">{id}</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5">
                          {!sys && <button onClick={() => doOpen(it)} title="Open" className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-950/[0.06] hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"><Icon name="external-link" size={14} /></button>}
                          {!sys && (id === self.id
                            ? <span title="The settings app itself — it stays mounted so Settings is always reachable." className="cursor-help rounded-lg px-2.5 py-1 text-xs font-medium text-zinc-400 dark:text-zinc-500">this module</span>
                            : <button onClick={() => setConfirm(it.i)} className="cursor-pointer rounded-lg px-2.5 py-1 text-xs font-medium text-zinc-400 transition-colors hover:bg-red-500/10 hover:text-red-500">Unlink</button>)}
                        </div>
                      </div>
                    )
                  })}
                  {/* Both always mounted — only CSS display toggles. Mounting a node
                      into the dragged element's lane on drag-start aborts native DnD. */}
                  <div className={cn('place-items-center rounded-xl border border-dashed py-3 text-[11px] transition-colors', drag != null ? 'grid' : 'hidden', isOver ? 'border-blue-500/50 text-blue-500' : 'border-zinc-950/10 text-zinc-400 dark:border-white/10 dark:text-zinc-500')}>
                    {isOver ? 'Drop to move here' : 'Drop here'}
                  </div>
                  <div className={cn('py-4 text-center text-[11px] text-zinc-400 dark:text-zinc-500', drag == null && inWs.length === 0 ? 'block' : 'hidden')}>No apps here yet.</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Link a local module — mounts a folder in place (not copied) */}
      <div className="mb-3 rounded-2xl border border-dashed border-zinc-950/15 bg-zinc-950/[0.015] p-4 dark:border-white/15 dark:bg-white/[0.015]">
        <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
          <Icon name="link-2" size={15} /> <span className="text-sm font-semibold">Link a local module</span>
        </div>
        <p className="pb-2.5 pt-0.5 text-xs text-zinc-400 dark:text-zinc-500">Mounts a folder where it already lives — <span className="font-medium">not copied</span>. It shows as <span className="rounded bg-zinc-500/15 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide">linked</span>; edits to the source are live.</p>
        <div className="flex flex-wrap gap-2">
          <Input value={linkPath} onChange={(e) => setLinkPath(e.target.value)} placeholder="~/path/to/module" onKeyDown={(e) => { if (e.key === 'Enter' && linkPath.trim()) doLink() }} className="min-w-[16rem] flex-1" />
          <select value={linkWs} onChange={(e) => setLinkWs(e.target.value)} className="cursor-pointer rounded-lg border border-zinc-950/15 bg-white px-2.5 py-1.5 text-sm text-zinc-700 dark:border-white/15 dark:bg-white/5 dark:text-zinc-200">
            {workspaces.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
          <button onClick={doLink} disabled={!linkPath.trim()} className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-950/15 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-950/5 disabled:opacity-50 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/10"><Icon name="link" size={15} /> Link</button>
        </div>
      </div>

      {/* New workspace */}
      <div className="rounded-2xl border border-dashed border-zinc-950/15 bg-zinc-950/[0.015] p-4 dark:border-white/15 dark:bg-white/[0.015]">
        <div className="flex items-center gap-2 pb-2.5 text-zinc-500 dark:text-zinc-400">
          <Icon name="plus" size={15} /> <span className="text-sm font-semibold">New workspace</span>
        </div>
        <div className="flex gap-2">
          <Input value={wsName} onChange={(e) => setWsName(e.target.value)} placeholder="new-workspace" onKeyDown={(e) => { if (e.key === 'Enter' && wsName.trim()) createWs() }} className="max-w-xs" />
          <button onClick={createWs} disabled={wsBusy || !wsName.trim()} className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-950/15 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-950/5 disabled:opacity-50 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/10"><Icon name="plus" size={15} /> Create</button>
        </div>
      </div>
    </div>
  )
}

/* ---- system check ------------------------------------------------------------ */
function DepRow({ name, version, present, sub, hint, latest, channel, upToDate }) {
  // upstream verdict: green "latest LTS/stable" · amber "vX available" · nothing when the lookup failed (offline)
  const upstream = present && latest
    ? (upToDate
        ? <span className="font-medium text-emerald-600 dark:text-emerald-400">latest {channel}</span>
        : <span className="font-medium text-amber-600 dark:text-amber-400">v{latest} {channel} available</span>)
    : null
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg', !present ? 'bg-red-500/15 text-red-500 dark:text-red-400' : upToDate === false ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400')}>
        <Icon name={present ? 'check' : 'x'} size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="truncate text-sm font-medium text-zinc-900 dark:text-white">{name}</span>
          {present && version && <span className="tabular-nums text-xs text-zinc-400 dark:text-zinc-500">v{version}</span>}
        </div>
        {sub && <div className="truncate text-xs text-zinc-400 dark:text-zinc-500">{sub}</div>}
      </div>
      <span className="shrink-0 text-right text-xs">
        {present
          ? (upstream || <span className="font-medium text-emerald-600 dark:text-emerald-400">Installed</span>)
          : <span className="font-mono text-red-500 dark:text-red-400">{hint || 'missing'}</span>}
      </span>
    </div>
  )
}

function SystemCheck() {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => { setBusy(true); fetch(`${self.api}/doctor`).then((r) => r.json()).then((d) => { setData(d); setBusy(false) }).catch(() => setBusy(false)) }, [])
  useEffect(() => { load() }, [load])

  if (!data) return <Loading label="Checking your system…" />
  const missing = data.managers.filter((m) => !m.present).length
  const behind = data.managers.filter((m) => m.present && m.upToDate === false).length
  const summary = missing
    ? `${missing} thing${missing === 1 ? '' : 's'} missing — install ${missing === 1 ? 'it' : 'them'} to unblock module installs.`
    : behind
      ? `Everything is installed; ${behind} ${behind === 1 ? 'has' : 'have'} a newer upstream version.`
      : 'Everything is installed and current — checked against the latest LTS / stable upstream.'

  return (
    <div className="max-w-2xl space-y-8">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Heading level={2} className="!text-lg">System check</Heading>
          <Text className="!mt-0.5 !text-[13px]">{summary}</Text>
        </div>
        <button onClick={load} disabled={busy} className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-950/10 px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-950/[0.04] disabled:opacity-60 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/[0.06]">
          <Icon name={busy ? 'loader' : 'refresh-cw'} size={14} className={busy ? 'animate-spin' : ''} /> {busy ? 'Checking…' : 'Re-check'}
        </button>
      </div>

      <section>
        <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-400 dark:text-zinc-500">Package managers</div>
        <div className="divide-y divide-zinc-950/[0.06] overflow-hidden rounded-2xl border border-zinc-950/10 dark:divide-white/[0.06] dark:border-white/10">
          {data.managers.map((m) => <DepRow key={m.key} name={m.label} version={m.version} present={m.present} sub={m.why} hint={m.install} latest={m.latest} channel={m.channel} upToDate={m.upToDate} />)}
        </div>
      </section>
    </div>
  )
}

/* ---- start at login (macOS launchd LaunchAgent) ------------------------------- */
const DOT_BG = { emerald: 'bg-emerald-500', red: 'bg-red-500', amber: 'bg-amber-500', zinc: 'bg-zinc-400', blue: 'bg-blue-500' }
function Dot({ color = 'zinc', ping = false }) {
  const bg = DOT_BG[color] || DOT_BG.zinc
  return (
    <span className="relative inline-flex h-2 w-2 shrink-0">
      {ping && <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', bg)} />}
      <span className={cn('relative inline-flex h-2 w-2 rounded-full', bg)} />
    </span>
  )
}

// A non-zero last exit code ⇒ the program isn't staying up (a crash, not a clean stop).
function failedExit(d) {
  if (!d || d.lastExitCode == null) return null
  const n = Number(String(d.lastExitCode).trim())
  return Number.isInteger(n) && n !== 0 ? n : null
}

function daemonBadge(d) {
  if (!d) return { color: 'zinc', label: 'unknown' }
  if (d.running) return { color: 'emerald', label: 'running' }
  const failCode = failedExit(d)
  if (d.installed && d.loaded && failCode != null) {
    const looping = /spawn|waiting/i.test(d.state || '') || Number(d.runs) > 1
    const runs = Number(d.runs) > 1 ? ` · ${d.runs} runs` : ''
    return { color: 'red', label: `${looping ? 'crash-looping' : 'failed'} · exit ${failCode}${runs}` }
  }
  if (d.installed && d.loaded) return { color: 'amber', label: 'loaded · not running' }
  if (d.installed) return { color: 'zinc', label: 'installed · stopped' }
  return { color: 'zinc', label: 'not installed' }
}

// launchd status grid + install/start/stop/restart/uninstall controls.
function DaemonControls({ label, daemon, busy, onAction }) {
  if (!daemon) return null
  const b = daemonBadge(daemon)
  const rows = [
    ['state', daemon.state], ['pid', daemon.pid], ['last exit', daemon.lastExitCode],
    ['runs', daemon.runs], ['label', daemon.label], ['domain', daemon.domain],
    ['plist', daemon.plistPath], ['program', daemon.program],
  ].filter(([, v]) => v != null && v !== '')
  const act = (a) => onAction(label, a)
  return (
    <div className="mt-4 rounded-xl border border-zinc-950/[0.06] bg-zinc-950/[0.015] p-4 dark:border-white/10 dark:bg-white/[0.02]">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-400 dark:text-zinc-500">LaunchAgent</div>
        <span className="inline-flex items-center gap-1.5 text-xs">
          <Dot color={b.color} ping={b.color === 'emerald'} /><span className="text-zinc-600 dark:text-zinc-300">{b.label}</span>
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-[5rem_1fr] gap-x-3 gap-y-1 font-mono text-[11px]">
        {rows.map(([k, v]) => (
          <React.Fragment key={k}>
            <dt className="text-zinc-400 dark:text-zinc-500">{k}</dt>
            <dd className="truncate text-zinc-700 dark:text-zinc-300" title={String(v)}>{String(v)}</dd>
          </React.Fragment>
        ))}
      </dl>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {busy && <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400"><Icon name="loader" size={13} className="animate-spin" /> working…</span>}
        {!daemon.installed && <Button onClick={() => act('install')} disabled={busy}>Install &amp; start</Button>}
        {daemon.installed && daemon.running && (
          <>
            <Button outline onClick={() => act('restart')} disabled={busy}>Restart</Button>
            <Button outline onClick={() => act('stop')} disabled={busy}>Stop</Button>
          </>
        )}
        {daemon.installed && !daemon.running && <Button onClick={() => act('start')} disabled={busy}>Start</Button>}
        {daemon.installed && (
          <button onClick={() => act('uninstall')} disabled={busy} className="cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-950/[0.05] hover:text-zinc-800 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100">Uninstall</button>
        )}
      </div>
    </div>
  )
}

// Live tail of the managed agent's logs — the "why" behind a crash-loop. The
// backend watches the log files and pushes a `plist-logs` frame per write.
function PlistLogs({ label, daemon }) {
  const [logs, setLogs] = useState(null)
  const [showOut, setShowOut] = useState(false)
  useEffect(() => {
    let live = true
    fetch(`${self.api}/plists/${encodeURIComponent(label)}/logs`, { cache: 'no-store' })
      .then((r) => r.json()).then((b) => { if (live) setLogs(b) }).catch(() => {})
    const unsub = self.subscribe((f) => { if (f.type === 'plist-logs' && f.label === label && live) setLogs(f) })
    return () => { live = false; unsub() }
  }, [label])
  const failCode = failedExit(daemon)
  const err = (logs && logs.stderr) || []
  const out = (logs && logs.stdout) || []
  return (
    <div className="mt-4 border-t border-zinc-950/[0.06] pt-4 dark:border-white/10">
      {failCode != null && (
        <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-red-500/[0.08] px-3 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">
          <span className="font-semibold">Not staying up.</span>
          <span>last exit code <span className="font-mono">{daemon.lastExitCode}</span></span>
          {daemon.runs != null && <span>· <span className="font-mono">{daemon.runs}</span> launch attempts</span>}
          {daemon.state && <span>· <span className="font-mono">{daemon.state}</span></span>}
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-400 dark:text-zinc-500">
          Error log
          {logs && logs.stderrPath && <span className="font-mono text-zinc-300 dark:text-zinc-600">{logs.stderrPath}</span>}
        </div>
        {out.length > 0 && (
          <button onClick={() => setShowOut((s) => !s)} className="cursor-pointer text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
            {showOut ? 'hide output log' : 'show output log'}
          </button>
        )}
      </div>
      {logs == null ? (
        <p className="mt-2 animate-pulse text-sm text-zinc-400">reading logs…</p>
      ) : err.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">No errors logged.</p>
      ) : (
        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-amber-200/90 dark:bg-black">{err.join('\n')}</pre>
      )}
      {showOut && (
        <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-300 dark:bg-black">{out.join('\n') || '(empty)'}</pre>
      )}
    </div>
  )
}

// The command the agent runs, with a copy button.
function CmdBox({ code }) {
  const [state, setState] = useState(null)   // 'ok' | 'fail' | null
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setState('ok') }
    catch { setState('fail') }
    setTimeout(() => setState(null), 1400)
  }
  return (
    <div className="relative">
      <pre className="overflow-auto rounded-lg border border-zinc-950/10 bg-zinc-950/[0.03] py-2 pl-3 pr-9 font-mono text-[11px] leading-relaxed text-zinc-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300">{code}</pre>
      <button onClick={copy} title={state === 'fail' ? 'Copy failed — select manually' : 'Copy'} className="absolute right-1.5 top-1.5 cursor-pointer rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-950/[0.06] hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200">
        <Icon name={state === 'ok' ? 'check' : state === 'fail' ? 'x' : 'copy'} size={13} className={state === 'ok' ? 'text-emerald-500' : state === 'fail' ? 'text-red-500' : ''} />
      </button>
    </div>
  )
}

// A managed plist IS a user LaunchAgent — reuses DaemonControls for status + verbs,
// wrapped with its name, port, label, the command it runs, and (once installed) logs.
function ManagedPlistCard({ item, busy, onAction }) {
  const d = item.daemon
  return (
    <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 shadow-sm shadow-zinc-950/[0.03] dark:border-white/10 dark:bg-white/[0.02] dark:shadow-none">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Dot color={daemonBadge(d).color} ping={!!(d && d.running)} />
          <h3 className="truncate text-base font-semibold text-zinc-950 dark:text-white">{item.name}</h3>
          {item.port && <span className="shrink-0 rounded-full bg-zinc-500/[0.12] px-2 py-0.5 font-mono text-[11px] text-zinc-600 dark:bg-white/10 dark:text-zinc-300">:{item.port}</span>}
        </div>
        {item.desc && <p className="mt-1 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">{item.desc}</p>}
        <div className="mt-1 truncate font-mono text-[11px] text-zinc-400 dark:text-zinc-500" title={item.label}>{item.label}</div>
      </div>
      {item.command && (
        <div className="mt-4">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-400 dark:text-zinc-500">Runs</div>
          <CmdBox code={item.command} />
        </div>
      )}
      <DaemonControls label={item.label} daemon={d} busy={busy} onAction={onAction} />
      {d && d.installed && <PlistLogs label={item.label} daemon={d} />}
    </div>
  )
}

// One row in the read-only inventory of ~/Library/LaunchAgents.
function InstalledAgentRow({ row }) {
  const color = row.running ? 'emerald' : row.loaded ? 'amber' : 'zinc'
  const label = row.running ? 'running' : row.loaded ? 'loaded' : 'stopped'
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-mono text-sm text-zinc-800 dark:text-zinc-200">{row.label}</span>
          {row.managed && <span className="shrink-0 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">managed</span>}
        </div>
        {row.program && <div className="mt-0.5 truncate font-mono text-[11px] text-zinc-400 dark:text-zinc-500" title={row.program}>{row.program}</div>}
      </div>
      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs">
        <Dot color={color} ping={color === 'emerald'} />
        <span className="text-zinc-600 dark:text-zinc-300">{label}{row.pid ? ` · ${row.pid}` : ''}</span>
      </span>
    </div>
  )
}

function Daemon() {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(() => new Set())
  const [phase, setPhase] = useState(null)        // install handoff: { k:'work'|'error', msg } | null
  const [justInstalled, setJustInstalled] = useState(false)

  // On a failed fetch keep the prior data rather than blanking — a restart/handoff
  // takes the port down briefly and a fetch landing in that window would otherwise
  // wipe the card to an empty state.
  const load = useCallback(async () => {
    try {
      const r = await fetch(`${self.api}/plists`, { cache: 'no-store' })
      const b = await r.json()
      setData({ managed: b.managed || [], installed: b.installed || [] })
      return true
    } catch { setData((prev) => prev || { managed: [], installed: [] }); return false }
  }, [])
  // Fetch once; the backend probes launchd on its own timer and pushes a
  // `plists` frame when anything changes (install/start/stop, crash-loops).
  useEffect(() => {
    load()
    return self.subscribe((f) => { if (f.type === 'plists' && f.managed) setData({ managed: f.managed, installed: f.installed || [] }) })
  }, [load])
  // After the install handoff reloads the page, show a one-time success note.
  useEffect(() => {
    let t
    try {
      if (sessionStorage.getItem('atelier-config:service-installed')) {
        sessionStorage.removeItem('atelier-config:service-installed')
        setJustInstalled(true); t = setTimeout(() => setJustInstalled(false), 6000)
      }
    } catch {}
    return () => clearTimeout(t)
  }, [])

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const fetchManaged = async (label) => {
    const b = await (await fetch(`${self.api}/plists`, { cache: 'no-store' })).json()
    return (b.managed || []).find((x) => x.label === label) || null
  }

  // Classify the freshly-installed job over a few seconds: 'running' (bound cleanly,
  // no handoff needed), 'port' (crash-looping because the port is in use — confirmed
  // via the err log, so we don't kill blindly), or 'unknown' (don't take over).
  const confirmPortConflict = async (label) => {
    let running = 0
    for (let i = 0; i < 6; i++) {
      await sleep(1000)
      // The err log is the definitive signal: the shell prints "Port <n> is in use"
      // and crash-loops when the port is taken. Check it every poll.
      try {
        const logs = await (await fetch(`${self.api}/plists/${encodeURIComponent(label)}/logs`, { cache: 'no-store' })).json()
        if (/in use|eaddrinuse/i.test((logs.stderr || []).join('\n'))) return 'port'
      } catch {}
      // Only conclude "bound cleanly" after it stays running across two polls with no
      // in-use error (a crash-loop can flash 'running' for a moment between relaunches).
      let m; try { m = await fetchManaged(label) } catch { m = null }
      running = m && m.daemon && m.daemon.running ? running + 1 : 0
      if (running >= 2) return 'running'
    }
    return 'unknown'
  }

  // Poll the (new) server until it answers and reports the job running. ~30s, to
  // cover the cold node start + the shell's one-time client-bundle build.
  const waitForServerUp = async (label) => {
    for (let i = 0; i < 30; i++) {
      await sleep(1000)
      try { const m = await fetchManaged(label); if (m && m.daemon && m.daemon.running) return true } catch {}
    }
    return false
  }

  // "Install & start" is a guided handoff: install the LaunchAgent (it crash-loops
  // on EADDRINUSE because this dev server still holds the port) → confirm that's why
  // → ask the backend to kill the old server and kickstart the service onto the
  // freed port → reconnect to the new server → reload into a success state.
  const installService = async (label) => {
    setBusy((p) => new Set(p).add(label))
    try {
      setPhase({ k: 'work', msg: 'Installing the LaunchAgent…' })
      try { await fetch(`${self.api}/plists/${encodeURIComponent(label)}/install`, { method: 'POST' }) } catch {}
      setPhase({ k: 'work', msg: 'Checking whether the port is free…' })
      const why = await confirmPortConflict(label)
      if (why === 'running') { setPhase(null); await load(); return }   // bound cleanly — done
      if (why !== 'port') {
        setPhase({ k: 'error', msg: 'Installed, but it isn’t running — and not because the port is busy. Check the error log below.' })
        await load(); return
      }
      const m0 = (data?.managed || []).find((x) => x.label === label)
      const port = (m0 && m0.port) || ''
      setPhase({ k: 'work', msg: `Port ${port} is held by the running server — taking over…` })
      try { sessionStorage.setItem('atelier-config:service-installed', label) } catch {}
      // The handoff kills the current server (this very process) ~0.8s after it
      // responds. So the POST normally returns {ok:true} first; only a real error
      // body (no managed plist / spawn failure) means the handoff never started —
      // surface that immediately instead of waiting out the full timeout. A dropped
      // connection (the genuine self-kill) throws and falls through to the wait.
      try {
        const r = await fetch(`${self.api}/plists/${encodeURIComponent(label)}/takeover`, { method: 'POST' })
        const body = await r.json().catch(() => ({}))
        if (body && body.ok === false) {
          try { sessionStorage.removeItem('atelier-config:service-installed') } catch {}
          setPhase({ k: 'error', msg: `Couldn’t hand off the port: ${body.msg || 'takeover failed'}` })
          await load(); return
        }
      } catch {}
      setPhase({ k: 'work', msg: 'Reconnecting to the new server…' })
      if (await waitForServerUp(label)) { location.reload(); return }    // success → reload
      // Leave the success flag set: the server may just be slow to come up, and a
      // later reload should still show success rather than a false failure.
      setPhase({ k: 'error', msg: 'The service is taking a while to come up — reload in a moment, or check the error log.' })
      await load()
    } finally {
      setBusy((p) => { const n = new Set(p); n.delete(label); return n })
    }
  }

  const onAction = async (label, action) => {
    if (action === 'install') return installService(label)
    setBusy((p) => new Set(p).add(label))
    try { await fetch(`${self.api}/plists/${encodeURIComponent(label)}/${action}`, { method: 'POST' }) } catch {}
    // start/restart bounce the server briefly — poll until it answers again (~8s).
    const restarts = action === 'start' || action === 'restart'
    for (let i = 0, n = restarts ? 8 : 1; i < n; i++) { if (await load()) break; if (i < n - 1) await sleep(1000) }
    setBusy((p) => { const n = new Set(p); n.delete(label); return n })
  }

  if (!data) return <Loading label="Reading LaunchAgents…" />
  return (
    <div className="max-w-2xl space-y-8">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Heading level={2} className="!text-lg">Start at login</Heading>
          <Text className="!mt-0.5 !text-[13px]">Start this Atelier instance automatically when you log in and keep it running, via a macOS LaunchAgent — relaunch on crash, no sudo. It reads its port &amp; settings from <code className="rounded bg-zinc-950/[0.06] px-1 py-0.5 text-[12px] dark:bg-white/10">atelier.config.json</code>; installing hands the port off from your running <code className="rounded bg-zinc-950/[0.06] px-1 py-0.5 text-[12px] dark:bg-white/10">npm&nbsp;run&nbsp;dev</code>.</Text>
        </div>
        <button onClick={load} className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-950/10 px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-950/[0.04] dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/[0.06]">
          <Icon name="refresh-cw" size={14} /> Refresh
        </button>
      </div>

      {phase && phase.k === 'work' && (
        <div className="flex items-center gap-3 rounded-xl border border-blue-500/30 bg-blue-500/[0.08] px-4 py-3 text-sm text-blue-800 dark:text-blue-200">
          <Icon name="loader" size={16} className="animate-spin" /> {phase.msg}
        </div>
      )}
      {phase && phase.k === 'error' && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/[0.08] px-4 py-3 text-sm text-red-700 dark:text-red-300">
          <span className="flex items-center gap-2"><Icon name="triangle-alert" size={16} /> {phase.msg}</span>
          <button onClick={() => location.reload()} className="shrink-0 cursor-pointer rounded-lg border border-red-500/30 px-2.5 py-1 text-xs font-medium hover:bg-red-500/10">Reload</button>
        </div>
      )}
      {justInstalled && (
        <div className="flex items-center gap-2.5 rounded-xl border border-green-500/30 bg-green-500/[0.12] px-4 py-3 text-sm font-medium text-green-700 dark:text-green-300">
          <Icon name="check" size={16} /> Service installed — this instance now starts at login.
        </div>
      )}

      {data.managed.length > 0 && (
        <div className="grid grid-cols-1 gap-4">
          {data.managed.map((m) => <ManagedPlistCard key={m.label} item={m} busy={busy.has(m.label)} onAction={onAction} />)}
        </div>
      )}

      {data.installed.length > 0 && (
        <section>
          <div className="mb-2 flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-400 dark:text-zinc-500">
            Installed user LaunchAgents
            <span className="font-mono text-zinc-300 dark:text-zinc-600">~/Library/LaunchAgents</span>
          </div>
          <div className="divide-y divide-zinc-950/[0.06] rounded-2xl border border-zinc-950/10 px-4 dark:divide-white/[0.06] dark:border-white/10">
            {data.installed.map((row) => <InstalledAgentRow key={row.file} row={row} />)}
          </div>
        </section>
      )}
    </div>
  )
}

/* ---- activity (live server output) -------------------------------------------- */
const LOG_LV = { info: { c: '#60a5fa', t: 'INFO' }, ok: { c: '#4ade80', t: 'OK' }, warn: { c: '#fbbf24', t: 'WARN' }, error: { c: '#f87171', t: 'ERR' } }
const LOG_SRC = { server: { icon: 'server', t: 'server' }, config: { icon: 'settings-2', t: 'config' } }

function Logs() {
  const [logs, setLogs] = useState(null)
  const [q, setQ] = useState('')
  const [lv, setLv] = useState({ info: true, ok: true, warn: true, error: true })
  const [src, setSrc] = useState({ server: true, config: true })
  const [follow, setFollow] = useState(true)
  const endRef = useRef(null)
  const boxRef = useRef(null)

  // Size the console so ONLY it scrolls: measure where it starts, pin its
  // bottom to the viewport, then absorb whatever page overflow remains (the
  // chrome card's padding, which we can't know from here). Below the 22rem
  // minimum the page scrolls instead — the intended fallback on short windows.
  useEffect(() => {
    const MIN = 352   // 22rem
    const fit = () => {
      const el = boxRef.current
      if (!el) return
      el.style.height = '0px'
      const top = el.getBoundingClientRect().top + window.scrollY
      const h = Math.max(MIN, window.innerHeight - top - 24)
      el.style.height = h + 'px'
      const overflow = document.documentElement.scrollHeight - window.innerHeight
      if (overflow > 0) el.style.height = Math.max(MIN, h - overflow) + 'px'
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  useEffect(() => {
    fetch(`${self.api}/logs`).then((r) => r.json()).then((d) => setLogs(d.logs || [])).catch(() => setLogs([]))
    const unsub = self.subscribe((f) => { if (f && f.type === 'log' && f.entry) setLogs((l) => [...(l || []), f.entry].slice(-500)) })
    return unsub
  }, [])
  useEffect(() => { if (follow) endRef.current?.scrollIntoView({ block: 'end' }) }, [logs, follow])

  const srcOf = (e) => (e.src === 'config' ? 'config' : 'server')
  const counts = (logs || []).reduce((m, e) => ((m.lv[e.level] = (m.lv[e.level] || 0) + 1), (m.src[srcOf(e)] = (m.src[srcOf(e)] || 0) + 1), m), { lv: {}, src: {} })
  const filtered = (logs || []).filter((e) => lv[e.level] !== false && src[srcOf(e)] !== false && (!q || e.msg.toLowerCase().includes(q.toLowerCase())))
  const fmt = (t) => new Date(t).toTimeString().slice(0, 8)
  const anyOff = Object.values(lv).some((v) => v === false) || Object.values(src).some((v) => v === false)

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[150px] flex-1">
          <Icon name="search" size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" className={cn(FIELD_INPUT, 'pl-8')} />
        </div>
        {Object.keys(LOG_SRC).map((k) => (
          <button key={k} onClick={() => setSrc((s) => ({ ...s, [k]: !s[k] }))}
            className={cn('inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
              src[k] ? 'border-zinc-950/15 text-zinc-700 dark:border-white/15 dark:text-zinc-300' : 'border-transparent text-zinc-400 opacity-60 dark:text-zinc-500')}>
            <Icon name={LOG_SRC[k].icon} size={12} /> {LOG_SRC[k].t}{counts.src[k] ? <span className="text-zinc-400">{counts.src[k]}</span> : null}
          </button>
        ))}
        <span className="mx-0.5 h-5 w-px bg-zinc-950/10 dark:bg-white/10" />
        {Object.keys(LOG_LV).map((k) => (
          <button key={k} onClick={() => setLv((s) => ({ ...s, [k]: !(s[k] !== false) }))}
            className={cn('inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
              lv[k] !== false ? 'border-zinc-950/15 text-zinc-700 dark:border-white/15 dark:text-zinc-300' : 'border-transparent text-zinc-400 opacity-60 dark:text-zinc-500')}>
            <span className="h-2 w-2 rounded-full" style={{ background: LOG_LV[k].c }} /> {LOG_LV[k].t}{counts.lv[k] ? <span className="text-zinc-400">{counts.lv[k]}</span> : null}
          </button>
        ))}
        <button onClick={() => setFollow((v) => !v)} title="Auto-scroll to newest" className={cn('inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors', follow ? 'border-blue-500/40 text-blue-600 dark:text-blue-400' : 'border-zinc-950/15 text-zinc-500 dark:border-white/15 dark:text-zinc-400')}><Icon name="arrow-down-to-line" size={13} /> Follow</button>
      </div>

      <div ref={boxRef} className="flex flex-col overflow-hidden rounded-2xl border border-zinc-950/10 bg-zinc-950 shadow-sm dark:border-white/10" style={{ height: 'calc(100vh - 16rem)', minHeight: '22rem' }}>
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-xs text-zinc-400">
          <span className="flex items-center gap-2"><Icon name="scroll-text" size={14} /> Atelier · server output</span>
          <span className="flex items-center gap-1.5"><span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-70" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-400" /></span>live · {filtered.length}</span>
        </div>
        <div className="flex-1 overflow-auto px-1.5 py-1.5">
          {logs === null && <div className="px-3 py-12 text-center text-sm text-zinc-500">Loading…</div>}
          {logs && !filtered.length && <div className="px-3 py-12 text-center text-sm text-zinc-500">No output{q || anyOff ? ' matches your filter' : ' yet — server activity will stream here'}.</div>}
          {filtered.map((e, i) => (
            <div key={i} className="flex items-start gap-2.5 rounded-md px-2.5 py-1 font-mono text-[12.5px] leading-relaxed transition-colors hover:bg-white/[0.04]">
              <span className="shrink-0 tabular-nums text-zinc-600" title={new Date(e.t).toLocaleString()}>{fmt(e.t)}</span>
              <span className="mt-[5px] h-2 w-2 shrink-0 rounded-full" style={{ background: (LOG_LV[e.level] || LOG_LV.info).c }} />
              <span className={cn('w-12 shrink-0 truncate text-[11px]', srcOf(e) === 'config' ? 'text-blue-400/70' : 'text-zinc-600')} title={srcOf(e) === 'config' ? 'settings event' : 'server output'}>{srcOf(e)}</span>
              <span className="min-w-0 flex-1 break-words text-zinc-200">{e.msg}</span>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </div>
    </div>
  )
}

/* ---- the settings page --------------------------------------------------------- */
function Configure({ sub, navigate }) {
  const tab = ['apps', 'system', 'daemon', 'logs'].includes(sub) ? sub : 'general'
  const [orig, setOrig] = useState(null)
  const [cfg, setCfg] = useState(null)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const [savedRestart, setSavedRestart] = useState(null)
  const [chromes, setChromes] = useState([])
  const [restart, setRestart] = useState(null)
  const [restarting, setRestarting] = useState(false)
  const [warnings, setWarnings] = useState([])
  const [view, setView] = useState('form')   // 'form' | 'json'
  const [jsonText, setJsonText] = useState('')
  const [jsonErr, setJsonErr] = useState(null)

  useEffect(() => { fetch(`${self.api}/config`).then((r) => r.json()).then((d) => { setOrig(d.config || {}); setCfg(d.config || {}); setRestart(d.restart || null); setWarnings(d.warnings || []) }).catch((e) => setErr(String(e))) }, [])
  useEffect(() => { fetch(`${self.api}/instance`).then((r) => r.json()).then((d) => setChromes(Object.entries(d.meta || {}).filter(([, m]) => m.isChrome).map(([id]) => id))).catch(() => {}) }, [])

  // Saving writes atelier.config.json, which the shell watches → it reloads the
  // whole page, wiping in-memory state. Carry the "just saved" signal across that
  // reload via sessionStorage so the confirmation still appears.
  useEffect(() => {
    let t
    try {
      const f = sessionStorage.getItem('atelier-config:saved')
      if (f) { sessionStorage.removeItem('atelier-config:saved'); setSavedRestart(f === 'restart'); t = setTimeout(() => setSavedRestart(null), 4500) }
    } catch {}
    return () => clearTimeout(t)
  }, [])

  const set = (k, v) => { setSavedRestart(null); setCfg((c) => ({ ...c, [k]: v })) }
  // Re-read the on-disk config and reset the form to it (used after an immediate
  // apps edit, and to revert staged changes when the file changed underneath).
  const refresh = useCallback(async () => {
    try { const d = await (await fetch(`${self.api}/config`)).json(); setOrig(d.config || {}); setCfg(d.config || {}); setRestart(d.restart || null); setWarnings(d.warnings || []); setJsonErr(null) } catch (e) { setErr(String(e)) }
  }, [])
  const discard = () => { setSavedRestart(null); setCfg(orig); setJsonText(JSON.stringify(orig, null, 2)); setJsonErr(null) }
  const dirty = orig && JSON.stringify(orig) !== JSON.stringify(cfg)
  const restartNeeded = cfg && CONFIG_FIELDS.some((f) => f.restart && JSON.stringify((orig || {})[f.key]) !== JSON.stringify(cfg[f.key]))

  // Form ⇄ JSON. The cfg object stays the source of truth; valid JSON edits flow
  // straight back into it. Invalid JSON blocks save — never written to disk.
  const toJson = () => { setJsonText(JSON.stringify(cfg ?? {}, null, 2)); setJsonErr(null); setView('json') }
  const onJsonChange = (txt) => {
    setJsonText(txt); setSavedRestart(null)
    try {
      const parsed = JSON.parse(txt)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) { setJsonErr('Must be a JSON object'); return }
      setJsonErr(null); setCfg(parsed)
    } catch (e) { setJsonErr(String(e.message).replace(/^JSON\.parse:?\s*/i, '').slice(0, 90)) }
  }

  const restartNow = async () => {
    setRestarting(true)
    try { await fetch(`${self.api}/restart`, { method: 'POST' }) } catch {}
    setTimeout(() => { try { location.reload() } catch {} }, 2800)
  }

  const save = async () => {
    setBusy(true); setErr(null)
    const out = { ...cfg }
    if (out.port !== undefined && out.port !== '') out.port = Number(out.port); else delete out.port
    if (out.auth === '' || out.auth === undefined) out.auth = false
    for (const k of ['label', 'baseUrl', 'defaultChrome']) if (out[k] === '') delete out[k]
    const needed = restartNeeded
    try {
      // Send the base we loaded from so the server writes only the keys we changed
      // (patch-merge) and rejects if one of them drifted on disk in the meantime.
      const r = await (await fetch(`${self.api}/config`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ config: out, base: orig }) })).json()
      if (r.conflict) { await refresh(); setErr(r.error) }
      else if (r.error) setErr(r.error)
      else { try { sessionStorage.setItem('atelier-config:saved', needed ? 'restart' : 'ok') } catch {}; setOrig(out); setCfg(out); setSavedRestart(needed === true) }
    } catch (e) { setErr(String(e)) } finally { setBusy(false) }
  }

  return (
    <div className={cn('mx-auto', tab === 'logs' ? 'max-w-none' : 'max-w-6xl')}>
      <header>
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-600/90 dark:text-blue-400/90">{(cfg && cfg.label) || 'Atelier'}</div>
        <h1 className="mt-1.5 text-[30px] font-semibold leading-none tracking-tight text-zinc-950 dark:text-white">Settings</h1>
        <p className="mt-2.5 max-w-xl text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">Everything that defines your Atelier — identity, apps &amp; themes, and how it runs. It all lives in <code className="rounded bg-zinc-950/[0.06] px-1 py-0.5 text-[12px] font-medium text-zinc-600 dark:bg-white/10 dark:text-zinc-300">atelier.config.json</code>.</p>
      </header>

      {restart && restart.pending && (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.1] px-4 py-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400"><Icon name="power" size={18} /></span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-amber-800 dark:text-amber-200">Restart required to apply changes</div>
            <div className="text-xs text-amber-700/80 dark:text-amber-300/80">{restart.keys.map((k) => RESTART_LABELS[k] || k).join(', ')} {restart.keys.length === 1 ? 'was' : 'were'} changed since Atelier started.</div>
          </div>
          <button onClick={restartNow} disabled={restarting} className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-amber-500 disabled:opacity-60">
            <Icon name={restarting ? 'loader' : 'rotate-cw'} size={14} /> {restarting ? 'Restarting…' : 'Restart Atelier'}
          </button>
        </div>
      )}

      <div className="mt-8 grid gap-10 md:grid-cols-[230px_1fr]">
        <aside>
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-400 dark:text-zinc-500">Configure</div>
          <nav className="space-y-1">
            {CONFIG_TABS.map((t) => {
              const on = tab === t.id
              return (
                <button key={t.id} onClick={() => navigate(t.id === 'general' ? '' : t.id)}
                  className={cn('group relative flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                    on ? 'bg-zinc-950/[0.05] dark:bg-white/[0.07]' : 'hover:bg-zinc-950/[0.03] dark:hover:bg-white/[0.04]')}>
                  {on && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-blue-600" />}
                  <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors', on ? 'bg-blue-600 text-white shadow-sm' : 'bg-zinc-500/10 text-zinc-500 group-hover:text-zinc-700 dark:group-hover:text-zinc-300')}><Icon name={t.icon} size={15} /></span>
                  <span className="min-w-0">
                    <span className={cn('block truncate text-sm font-medium', on ? 'text-zinc-950 dark:text-white' : 'text-zinc-600 dark:text-zinc-300')}>{t.label}</span>
                    <span className="block truncate text-[11px] text-zinc-400 dark:text-zinc-500">{t.desc}</span>
                  </span>
                </button>
              )
            })}
          </nav>
        </aside>

        <div className="min-w-0">
          {err && <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/[0.06] px-3 py-2 text-sm text-red-600 dark:text-red-400">{err}</p>}
          {!cfg && (tab === 'general' || tab === 'apps') && <Loading />}

          {cfg && (tab === 'general' || tab === 'apps') && (
            <div>
              <div className="mb-3 flex items-center justify-end">
                <div className="inline-flex rounded-lg border border-zinc-950/10 p-0.5 dark:border-white/10">
                  {[['form', tab === 'apps' ? 'Visual' : 'Form'], ['json', 'JSON']].map(([m, lbl]) => (
                    <button key={m} onClick={() => (m === 'json' ? toJson() : setView('form'))}
                      className={cn('cursor-pointer rounded-md px-3 py-1 text-xs font-medium transition-colors', view === m ? 'bg-zinc-950/[0.06] text-zinc-950 dark:bg-white/10 dark:text-white' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200')}>{lbl}</button>
                  ))}
                </div>
              </div>
              {view === 'form' && tab === 'general' && warnings.length > 0 && (
                <div className="mb-3 space-y-1.5">
                  {warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/[0.08] px-3.5 py-2.5 text-xs text-amber-700 dark:text-amber-300">
                      <Icon name="triangle-alert" size={15} className="mt-px shrink-0" /> <span className="min-w-0">{w.msg}</span>
                    </div>
                  ))}
                </div>
              )}
              {view === 'json' ? (
                <JsonEditor text={jsonText} onChange={onJsonChange} error={jsonErr} />
              ) : tab === 'general' ? (
                <div className="overflow-hidden rounded-2xl border border-zinc-950/10 bg-white shadow-sm shadow-zinc-950/[0.03] dark:border-white/10 dark:bg-white/[0.02] dark:shadow-none">
                  {FIELD_GROUPS.map((g) => (
                    <section key={g} className="border-b border-zinc-950/[0.06] last:border-b-0 dark:border-white/[0.06]">
                      <div className="bg-zinc-950/[0.02] px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.09em] text-zinc-400 dark:bg-white/[0.02] dark:text-zinc-500">{g}</div>
                      <div className="divide-y divide-zinc-950/[0.06] dark:divide-white/[0.06]">
                        {CONFIG_FIELDS.filter((f) => f.group === g).map((f) => <ConfigField key={f.key} f={f} cfg={cfg} set={set} chromes={chromes} />)}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <AppsWorkspaces cfg={cfg} refresh={refresh} />
              )}
            </div>
          )}

          {tab === 'system' && <SystemCheck />}

          {tab === 'daemon' && <Daemon />}

          {tab === 'logs' && <Logs />}
        </div>
      </div>

      {(tab === 'general' || tab === 'apps') && (dirty || savedRestart !== null) && (
        <div className="pointer-events-none sticky bottom-5 z-20 mt-10 flex justify-center">
          {dirty ? (
            <div className="ac-savebar pointer-events-auto flex items-center gap-3 rounded-2xl border border-zinc-950/10 bg-white/85 py-2 pl-4 pr-2 shadow-xl shadow-zinc-950/10 backdrop-blur-md dark:border-white/10 dark:bg-zinc-900/85">
              <span className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                {jsonErr
                  ? <><Icon name="triangle-alert" size={15} className="text-red-500" /> <span className="text-red-600 dark:text-red-400">Invalid JSON</span></>
                  : <><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" /></span>Unsaved changes</>}
              </span>
              <div className="flex items-center gap-1">
                <button onClick={discard} disabled={busy} className="cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-950/[0.05] hover:text-zinc-800 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100">Discard</button>
                <button onClick={save} disabled={busy || !!jsonErr} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-500 disabled:opacity-60"><Icon name={busy ? 'loader' : 'check'} size={15} /> {busy ? 'Saving…' : 'Save changes'}</button>
              </div>
            </div>
          ) : (
            <div className="ac-savebar pointer-events-auto flex items-center gap-2.5 rounded-2xl border border-green-500/30 bg-green-500/[0.12] px-4 py-2.5 text-sm font-medium text-green-700 shadow-lg backdrop-blur-md dark:text-green-300">
              <Icon name="check" size={16} /> Saved{savedRestart ? ' — restart Atelier to apply' : ''}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ---- root ----------------------------------------------------------------------- */
export default function Module() {
  const { path, navigate } = window.__atelier.useRoute()
  return (
    <div className="text-zinc-950 dark:text-white">
      <style>{`
        @keyframes ac-rise { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:none} }
        .ac-savebar{ animation:ac-rise .3s cubic-bezier(.22,1,.36,1) both }
        @media (prefers-reduced-motion: reduce){ .ac-savebar{animation:none} }
        .ac-json{ font-family:var(--font-mono, ui-monospace, monospace); font-size:12.5px; line-height:1.6; white-space:pre-wrap; word-break:break-word; tab-size:2; -moz-tab-size:2; }
        .ac-json .tok-key{ color:#7dd3fc } .ac-json .tok-str{ color:#86efac } .ac-json .tok-num{ color:#fca5a5 } .ac-json .tok-kw{ color:#c4b5fd }
      `}</style>
      <Configure sub={path} navigate={navigate} />
    </div>
  )
}
