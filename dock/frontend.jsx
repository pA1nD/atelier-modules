// marketplace — discover, browse, and manage Atelier app marketplaces.
//
// Three views, URL-routed via window.__atelier.useRoute():
//   ''                       → the catalog (featured + search + sections of App-Store rows)
//   'app/<uplink>/<id>'      → the app preview (the detail page)
//   'uplinks'                → manage marketplaces (add / remove / scan)
// Visuals use @atelier/kit + the chrome's zinc/blue tokens; theme-aware.
// App icons are filled, colored rounded squares (a signature "squircle" later).

import { Button, Input, Heading, Text, Badge, Field, Label } from '@atelier/kit'
import { parseModules } from './config-util.mjs'
import { cushionPath, getSquircleEngine } from './squircle.js'

const { useState, useEffect, useRef, useCallback } = React
const cn = (...p) => p.filter(Boolean).join(' ')
const self = window.__atelier.self(import.meta.url)

// Per-category accent, used when an app declares no accent of its own.
const CATCOLOR = {
  Tools: '#f59e0b', Dev: '#3b82f6', Reading: '#f43f5e', Data: '#06b6d4', Docs: '#10b981',
  Lab: '#14b8a6', AI: '#8b5cf6', Fun: '#ec4899', Media: '#a855f7', Voice: '#f97316', System: '#71717a',
}
const accentOf = (a) => a.accent || CATCOLOR[a.category] || '#71717a'
const tint = (hex, a) => hex + a

// Lighten (amt>0) / darken (amt<0) a hex color toward white / black.
function shade(hex, amt) {
  let h = (hex || '#71717a').replace('#', '')
  if (h.length === 3) h = h.split('').map((x) => x + x).join('')
  const ch = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  const mix = (c) => (amt >= 0 ? Math.round(c + (255 - c) * amt) : Math.round(c * (1 + amt)))
  return '#' + ch.map((c) => ('0' + mix(c).toString(16)).slice(-2)).join('')
}

/* Lucide icon — color is currentColor, so set text-* (or style color) on the parent. */
function Icon({ name, size = 16, strokeWidth = 1.75, className = '', style }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!name || !ref.current) return
    ref.current.innerHTML = ''
    const i = document.createElement('i')
    i.setAttribute('data-lucide', name)
    ref.current.appendChild(i)
    try { window.lucide?.createIcons({ attrs: { width: size, height: size, 'stroke-width': strokeWidth } }) } catch {}
  }, [name, size, strokeWidth])
  return <span ref={ref} aria-hidden="true" className={cn('inline-flex shrink-0 items-center justify-center', className)} style={{ width: size, height: size, ...style }} />
}

/* The signature app-icon: the golden squircle cushion — a vivid, gently-animated diagonal gradient
 * masked to the cushion silhouette, with a white glyph. All tiles share ONE WebGL context via the
 * inlined engine (squircle.js); falls back to a static gradient when WebGL / motion isn't available. */
function IconTile({ app, size = 56 }) {
  const c = accentOf(app)
  const ref = useRef(null)
  const idRef = useRef(null)
  const [live, setLive] = useState(true)
  useEffect(() => {
    const eng = getSquircleEngine(), cv = ref.current
    if (!eng || !cv) { setLive(false); return }
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    cv.width = cv.height = Math.max(1, Math.round(size * dpr))
    const id = eng.register({ color: c, target: cv })
    if (id == null) { setLive(false); return }
    idRef.current = id; setLive(true)
    return () => { eng.unregister(id); idRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size])
  useEffect(() => { if (idRef.current != null) getSquircleEngine().update(idRef.current, c) }, [c])
  const clip = `path('${cushionPath(size)}')`
  const shadow = 'drop-shadow(0 1px 2px rgba(0,0,0,.22))'
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {/* always render the canvas so the ref exists; hide it if we fall back to static */}
      <canvas ref={ref} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: size, height: size,
        display: live ? 'block' : 'none', clipPath: clip, WebkitClipPath: clip, filter: shadow }} />
      {!live && <div className="absolute inset-0" style={{ clipPath: clip, WebkitClipPath: clip, filter: shadow,
        background: `linear-gradient(155deg, ${shade(c, 0.24)}, ${shade(c, -0.16)})` }} />}
      <div className="absolute inset-0 grid place-items-center text-white"><Icon name={app.icon} size={Math.round(size * 0.46)} strokeWidth={2} /></div>
    </div>
  )
}

function StatusBadge({ app }) {
  if (app.hasUpdate) return <Badge color="blue"><Icon name="arrow-up" size={11} /> Update</Badge>
  if (app.isNew) return <Badge color="green">New</Badge>
  return null
}

function Loading({ label = 'Loading…' }) {
  return <div className="flex items-center justify-center gap-2 py-20 text-sm text-zinc-500 dark:text-zinc-400"><Icon name="loader-circle" size={16} className="animate-spin" /> {label}</div>
}

/* ---- App-Store-style row -------------------------------------------------- */
function AppRow({ app, onOpen, divider }) {
  return (
    <div onClick={() => onOpen(app.uplink, app.id)} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(app.uplink, app.id) }}
      className="group flex cursor-pointer items-center gap-4">
      <IconTile app={app} size={56} />
      <div className={cn('flex min-w-0 flex-1 items-center justify-between gap-3 py-4', divider && 'border-b border-zinc-950/10 dark:border-white/10')}>
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold text-zinc-950 dark:text-white">{app.name}</div>
          <div className="truncate text-[13px] text-zinc-500 dark:text-zinc-400">{app.tagline || app.category}</div>
        </div>
        <div className="flex shrink-0 flex-col items-center gap-1">
          <button onClick={(e) => { e.stopPropagation(); onOpen(app.uplink, app.id) }}
            className={cn('rounded-full px-5 py-1.5 text-[13px] font-semibold transition-colors',
              app.installed && !app.updatable ? 'bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 dark:text-emerald-400' : 'bg-zinc-950/[0.06] text-blue-600 hover:bg-zinc-950/10 dark:bg-white/10 dark:text-blue-400 dark:hover:bg-white/15')}>
            {app.installed ? (app.updatable ? 'Update' : 'Installed') : 'Get'}
          </button>
          {app.isNew && !app.installed && <span className="text-[10px] font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">New</span>}
        </div>
      </div>
    </div>
  )
}

/* A grid of rows (2 columns on wide), with inset dividers except the last row. */
function RowGrid({ apps, onOpen }) {
  const n = apps.length
  const lastRowFrom = n - (n % 2 === 0 ? 2 : 1)
  return (
    <div className="grid grid-cols-1 gap-x-12 md:grid-cols-2">
      {apps.map((a, i) => <AppRow key={a.uplink + '/' + a.id} app={a} onOpen={onOpen} divider={i < lastRowFrom} />)}
    </div>
  )
}

/* ---- featured banner ------------------------------------------------------ */
function Featured({ app, onOpen }) {
  if (!app) return null
  const c = accentOf(app)
  return (
    <section className="relative h-full overflow-hidden rounded-2xl border border-zinc-950/10 bg-white p-6 dark:border-white/10 dark:bg-white/[0.02]">
      <div className="pointer-events-none absolute -top-20 -right-12 h-56 w-56 rounded-full blur-3xl" style={{ background: tint(c, '20') }} />
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="sm:flex-1">
          <Badge color="blue"><Icon name="sparkles" size={12} /> Featured</Badge>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">{app.name}</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500 dark:text-zinc-400">{app.tagline}</p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <Button onClick={() => onOpen(app.uplink, app.id)}><Icon name="arrow-right" size={16} /> {app.installed ? 'Open' : 'View details'}</Button>
            <Button variant="outline" onClick={() => onOpen(app.uplink, app.id)}>From {app.uplinkName}</Button>
          </div>
        </div>
        <div className="grid h-28 w-full shrink-0 place-items-center overflow-hidden rounded-xl border border-zinc-950/10 dark:border-white/10 sm:h-32 sm:w-44"
          style={{ background: `linear-gradient(135deg, ${tint(c, '26')}, transparent 80%)` }}>
          <IconTile app={app} size={76} radius={0.28} />
        </div>
      </div>
    </section>
  )
}

/* ---- empty state (no marketplaces configured) ----------------------------- */
const EMPTY_TILES = [
  { icon: 'boxes', c: '#14b8a6' },
  { icon: 'sparkles', c: '#a855f7' },
  { icon: 'store', c: '#3b82f6' },
  { icon: 'package', c: '#f59e0b' },
  { icon: 'blocks', c: '#ec4899' },
]
function EmptyState({ onManage, onDocs }) {
  return (
    <div className="relative mt-6 overflow-hidden rounded-3xl border border-zinc-950/10 px-6 py-16 text-center dark:border-white/10"
      style={{ background: 'linear-gradient(to bottom, rgba(59,130,246,.06), transparent 62%)' }}>
      <div className="pointer-events-none absolute left-1/2 -top-12 h-64 w-[42rem] max-w-full -translate-x-1/2 rounded-full bg-blue-500/10 blur-3xl" />
      <div className="relative mx-auto max-w-[30rem]">
        <div className="mb-9 flex items-end justify-center gap-2.5">
          {EMPTY_TILES.map((t, i) => {
            const center = i === 2
            const off = Math.abs(i - 2)
            return (
              <div key={i} style={{ transform: `translateY(${center ? -10 : off * 7}px) rotate(${(i - 2) * 6}deg)`, zIndex: center ? 10 : 5 - off, opacity: center ? 1 : 0.9 }}>
                {center
                  ? <div className="mp-sway"><div className="mp-tilt"><IconTile app={{ icon: t.icon, accent: t.c }} size={74} radius={0.28} /></div></div>
                  : <div className="mp-drift" style={{ animationDuration: `${4 + off * 0.4}s`, animationDelay: `${i * 0.2}s` }}><IconTile app={{ icon: t.icon, accent: t.c }} size={52} radius={0.28} /></div>}
              </div>
            )
          })}
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">A quiet shelf, ready for your tools.</h2>
        <p className="mx-auto mt-2.5 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
          Add a marketplace — a GitHub repo or a local folder of Atelier modules — and its apps land right here, ready to browse and install.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-2.5">
          <Button onClick={onManage}><Icon name="plus" size={16} /> Add a marketplace</Button>
          <Button variant="outline" onClick={onDocs}><Icon name="book-open" size={15} /> Read the Quickstart</Button>
        </div>
        <div className="mt-9 grid grid-cols-1 gap-3 text-left sm:grid-cols-3">
          {[
            { n: 1, icon: 'store', t: 'Add a marketplace', d: 'A GitHub repo or a local folder of modules.' },
            { n: 2, icon: 'download', t: 'Install an app', d: 'Hit Get — it lands in its own workspace.' },
            { n: 3, icon: 'arrow-up-right', t: 'Open it', d: 'Use it right here inside Atelier.' },
          ].map((s, i) => (
            <div key={s.n} className={cn('rounded-xl border p-3.5', i === 0 ? 'border-blue-500/40 bg-blue-500/[0.05]' : 'border-zinc-950/10 dark:border-white/10')}>
              <div className="flex items-center gap-2">
                <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold', i === 0 ? 'bg-blue-600 text-white' : 'bg-zinc-500/15 text-zinc-500 dark:text-zinc-400')}>{s.n}</span>
                <Icon name={s.icon} size={14} className="text-zinc-400" />
              </div>
              <div className="mt-2 text-[13px] font-semibold text-zinc-900 dark:text-white">{s.t}</div>
              <div className="mt-0.5 text-[11.5px] leading-[1.45] text-zinc-500 dark:text-zinc-400">{s.d}</div>
            </div>
          ))}
        </div>
        <p className="mt-6 text-xs text-zinc-400 dark:text-zinc-500">
          Tip: add a GitHub repo like <code className="rounded bg-zinc-950/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-zinc-600 dark:bg-white/10 dark:text-zinc-300">owner/repo</code>, or any local folder of modules.
        </p>
      </div>
    </div>
  )
}

function MktBadge({ m, size = 36 }) {
  return (
    <span className="grid shrink-0 place-items-center text-white" style={{
      width: size, height: size, borderRadius: Math.round(size * 0.28),
      background: `linear-gradient(155deg, ${shade(m.accent || '#2563eb', 0.2)}, ${shade(m.accent || '#2563eb', -0.12)})`,
    }}><Icon name={m.icon} size={Math.round(size * 0.5)} strokeWidth={2} /></span>
  )
}

/* ---- Atelier intro hero --------------------------------------------------- */
const MODULE_SNIPPET = `<span class="tok-com">// frontend.jsx — that's the whole module</span>
<span class="tok-kw">export const</span> meta = { name: <span class="tok-str">'Hello'</span>, icon: <span class="tok-str">'sparkles'</span> }

<span class="tok-kw">export default function</span> <span class="tok-fn">Module</span>() {
  <span class="tok-kw">return</span> <span class="tok-tag">&lt;p&gt;</span>Hello, Atelier 👋<span class="tok-tag">&lt;/p&gt;</span>
}`

// Full-bleed hero — breaks out of the chrome card's p-6/lg:p-10 padding so it
// reaches the card's top/left/right edges (the card clips to its own radius).
const HERO_BLEED = '-mx-6 -mt-6 mb-12 overflow-hidden lg:-mx-10 lg:-mt-10'

function Wordmark({ tone = 'dark' }) {
  const box = tone === 'light' ? 'bg-white/20 text-white' : tone === 'invert' ? 'bg-white text-zinc-950' : 'bg-blue-600 text-white'
  const txt = tone === 'light' ? 'text-white' : 'text-zinc-950 dark:text-white'
  return <span className={cn('flex items-center gap-2 text-sm font-semibold tracking-tight', txt)}><span className={cn('grid h-6 w-6 place-items-center rounded-md', box)}><Icon name="boxes" size={14} /></span> Atelier</span>
}

function CodeCard({ className }) {
  return (
    <div className={cn('overflow-hidden rounded-xl border', className)}>
      <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" /><span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" /><span className="h-2.5 w-2.5 rounded-full bg-green-400/70" />
        <span className="ml-2 font-mono text-[11px] text-zinc-400">frontend.jsx</span>
      </div>
      <pre className="mp-json m-0 overflow-x-auto px-4 py-3.5 text-[13px] text-zinc-300" dangerouslySetInnerHTML={{ __html: MODULE_SNIPPET }} />
    </div>
  )
}

function Hero({ onDocs, onConfigure }) {
  return (
    <header className={cn(HERO_BLEED, 'relative bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 text-white')}>
      <div className="pointer-events-none absolute -left-24 -top-28 h-80 w-80 rounded-full bg-white/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 right-24 h-80 w-80 rounded-full bg-fuchsia-400/25 blur-3xl" />
      <div className="relative flex items-center justify-between px-6 pt-5 lg:px-10 lg:pt-7">
        <Wordmark tone="light" />
        <div className="flex gap-1.5">
          <button onClick={() => onDocs()} className="cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/15"><Icon name="book-open" size={15} className="mr-1.5 inline" />Docs</button>
          <button onClick={onConfigure} className="cursor-pointer rounded-lg bg-white/15 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/25"><Icon name="settings-2" size={15} className="mr-1.5 inline" />Configure</button>
        </div>
      </div>
      <div className="relative grid items-center gap-8 px-6 pb-12 pt-8 md:grid-cols-2 lg:px-10 lg:pb-16 lg:pt-10">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide"><Icon name="sparkles" size={12} /> The Atelier way</span>
          <h2 className="mt-4 text-4xl font-bold leading-[1.05] tracking-tight lg:text-5xl">Atelier is<br />yours to build.</h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/85">Most Atelier apps are ones you write yourself — a single <code className="rounded bg-white/15 px-1 py-0.5 font-mono text-[13px]">frontend.jsx</code> is a whole module. The apps below are starting grounds: fork one, or just install and go.</p>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <button onClick={() => onDocs('build-first-module')} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 shadow-sm transition hover:bg-white/90"><Icon name="rocket" size={15} /> Build your first module</button>
            <button onClick={() => onDocs('reference')} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/40 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"><Icon name="book-open" size={15} /> Read the spec</button>
          </div>
        </div>
        <CodeCard className="border-white/15 bg-zinc-950/80 shadow-2xl backdrop-blur" />
      </div>
    </header>
  )
}

/* ---- catalog view --------------------------------------------------------- */
function Catalog({ cat, onOpen, onManage, onDocs, onConfigure }) {
  const [mkt, setMkt] = useState('all')
  const [category, setCategory] = useState('All')
  const [q, setQ] = useState('')

  const apps = cat?.apps || []
  const query = q.trim().toLowerCase()
  const filtered = apps.filter((a) =>
    (mkt === 'all' || a.uplink === mkt) &&
    (category === 'All' || a.category === category) &&
    (!query || (a.name + ' ' + a.tagline + ' ' + a.category + ' ' + (a.tags || []).join(' ')).toLowerCase().includes(query)))
  const filtering = mkt !== 'all' || category !== 'All' || !!query

  return (
    <div>
      <Hero onDocs={onDocs} onConfigure={onConfigure} />

      {apps.length > 0 && (
        <>
          <div className="grid gap-6 md:grid-cols-2 md:items-center">
            <div>
              <h2 className="text-2xl/8 font-semibold tracking-tight text-zinc-950 dark:text-white">Marketplace</h2>
              <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{cat ? `${(cat.marketplaces || []).length} ${(cat.marketplaces || []).length === 1 ? 'marketplace' : 'marketplaces'} · ${apps.length} ${apps.length === 1 ? 'app' : 'apps'}` : 'Loading…'}</p>
              <div className="relative mt-4">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"><Icon name="search" size={16} /></span>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${apps.length} apps…`}
                  className="w-full rounded-lg border border-zinc-950/15 bg-white py-2.5 pl-9 pr-3 text-sm/6 text-zinc-950 shadow-sm transition-colors placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-white/15 dark:bg-white/5 dark:text-white" />
              </div>
              <div className="mt-3.5 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px]">
                {['All', ...((cat?.categories || []).map((c) => c.name))].map((c) => (
                  <button key={c} onClick={() => setCategory(c)} className={cn('cursor-pointer transition-colors',
                    category === c ? 'font-semibold text-blue-600 dark:text-blue-400' : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white')}>{c}</button>
                ))}
              </div>
            </div>
            {cat?.featured ? <Featured app={cat.featured} onOpen={onOpen} /> : <div />}
          </div>
        </>
      )}

      {!cat && <Loading label="Loading marketplaces…" />}

      {cat && !apps.length && <EmptyState onManage={onManage} onDocs={onDocs} />}

      {/* filtered → flat results */}
      {cat && filtering && (
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">{mkt !== 'all' ? ((cat.marketplaces || []).find((m) => m.key === mkt)?.name || mkt) : 'Results'} <span className="text-zinc-400 dark:text-zinc-500">· {filtered.length}</span></p>
            <button onClick={() => { setMkt('all'); setCategory('All'); setQ('') }} className="cursor-pointer text-xs text-blue-600 hover:text-blue-500 dark:text-blue-400">Clear filters</button>
          </div>
          {filtered.length ? <RowGrid apps={filtered} onOpen={onOpen} /> : <div className="py-20 text-center text-sm text-zinc-500 dark:text-zinc-400">No apps match your search.</div>}
        </div>
      )}

      {/* unfiltered → per-marketplace sections */}
      {cat && !filtering && (cat.marketplaces || []).map((m) => {
        const list = apps.filter((a) => a.uplink === m.key)
        if (!list.length) return null
        const single = (cat.marketplaces || []).length === 1
        return (
          <div key={m.key} className="mt-9">
            <div className="mb-3 flex items-end justify-between">
              <div className="flex items-center gap-3">
                <MktBadge m={m} />
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-white">{m.name}</h2>
                    <span className="rounded-md bg-zinc-500/15 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-300">{m.appCount}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-500">{m.description}</p>
                </div>
              </div>
              {!single && list.length > 6 && <button onClick={() => setMkt(m.key)} className="shrink-0 cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400">See All</button>}
            </div>
            <RowGrid apps={single ? list : list.slice(0, 6)} onOpen={onOpen} />
          </div>
        )
      })}
    </div>
  )
}

/* ---- app detail / preview ------------------------------------------------- */
function Spec({ k, v }) {
  return <div className="flex justify-between border-b border-zinc-950/10 px-4 py-2.5 text-[13px] last:border-0 dark:border-white/10"><span className="text-zinc-500 dark:text-zinc-500">{k}</span><span className="font-medium text-zinc-950 dark:text-white">{v}</span></div>
}

/* Requirements: what Get installs automatically (npm/uv) and the host steps the
 * operator must apply by hand (brew/uvtool/script/note). copy-to-clipboard on cmds. */
const STEP_ICON = { brew: 'beer', uvtool: 'terminal', script: 'file-code', note: 'info' }
function CopyCmd({ cmd }) {
  const [state, setState] = useState(null)   // 'ok' | 'fail' | null
  const copy = async () => {
    try { await navigator.clipboard.writeText(cmd); setState('ok') }
    catch { setState('fail') }
    setTimeout(() => setState(null), 1600)
  }
  return (
    <button onClick={copy}
      className="group inline-flex max-w-full items-center gap-2 rounded-md bg-zinc-950/[0.05] px-2 py-1 font-mono text-[12px] text-zinc-700 transition-colors hover:bg-zinc-950/10 dark:bg-white/10 dark:text-zinc-200 dark:hover:bg-white/15" title={state === 'fail' ? 'Copy failed — select and copy manually' : 'Copy command'}>
      <span className="truncate">{cmd}</span>
      <Icon name={state === 'ok' ? 'check' : state === 'fail' ? 'x' : 'copy'} size={12} className={cn('shrink-0', state === 'ok' ? 'text-emerald-500' : state === 'fail' ? 'text-red-500' : 'text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300')} />
    </button>
  )
}
function Requirements({ app, installed }) {
  const auto = app.deps || {}
  const steps = app.systemSteps || []
  const rec = app.install || null
  const hasAuto = auto.npm || auto.uv
  if (!hasAuto && !steps.length) return null
  return (
    <div className="mt-6">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Requirements</h3>
      {hasAuto && (
        <div className="mt-2 flex flex-wrap gap-2">
          {auto.npm && <span className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-950/10 bg-zinc-950/[0.02] px-2.5 py-1 text-[12px] text-zinc-600 dark:border-white/10 dark:bg-white/[0.02] dark:text-zinc-300"><Icon name="package" size={13} /> Node deps <span className="text-zinc-400">— {installed && rec ? (rec.deps?.npm?.ok ? 'installed' : 'failed') : 'installed on Get (npm)'}</span></span>}
          {auto.uv && <span className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-950/10 bg-zinc-950/[0.02] px-2.5 py-1 text-[12px] text-zinc-600 dark:border-white/10 dark:bg-white/[0.02] dark:text-zinc-300"><Icon name="snake" size={13} /> Python venv <span className="text-zinc-400">— {installed && rec ? (rec.deps?.uv?.ok ? 'installed' : 'failed') : 'installed on Get (uv)'}</span></span>}
        </div>
      )}
      {steps.length > 0 && (
        <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-amber-700 dark:text-amber-400"><Icon name="triangle-alert" size={15} /> Manual system steps</div>
          <p className="mt-1 text-[12px] text-zinc-600 dark:text-zinc-400">These touch your machine, so {installed ? 'they aren’t run for you' : 'Get won’t run them'} — apply them yourself with consent.</p>
          <ul className="mt-3 space-y-2.5">
            {steps.map((s, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[13px]">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400"><Icon name={STEP_ICON[s.kind] || 'info'} size={13} /></span>
                <div className="min-w-0">
                  <div className="text-zinc-700 dark:text-zinc-200">{s.label}</div>
                  {s.cmd && <div className="mt-1"><CopyCmd cmd={s.cmd} /></div>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function AppDetail({ uplink, id, onBack }) {
  const [app, setApp] = useState(null)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const [depErr, setDepErr] = useState(null)   // a failed npm/uv apply (don't reload — keep it visible)
  // Install/update/uninstall write atelier.config.json → the shell reloads the
  // page, which re-fetches this app's state. A timed reload is a safety fallback.
  // Install/update first run any npm/uv dependency apply (which can take a while);
  // if that failed we stay on the page so the error is seen rather than reloaded away.
  const act = async (route, body) => {
    setBusy(true); setErr(null); setDepErr(null)
    try {
      const r = await (await fetch(`${self.api}/${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json()
      if (r.error) { setErr(r.error); setBusy(false) }
      else if (r.depsOk === false) { setDepErr('Some dependencies failed to install — check the Activity log. The app was installed but may not run until they’re fixed.'); setBusy(false) }
      else setTimeout(() => { try { location.reload() } catch {} }, 1500)
    } catch (e) { setErr(String(e)); setBusy(false) }
  }

  useEffect(() => {
    setApp(null); setErr(null)
    fetch(`${self.api}/app?uplink=${encodeURIComponent(uplink)}&id=${encodeURIComponent(id)}`)
      .then((r) => r.json()).then((d) => (d.error ? setErr(d.error) : setApp(d))).catch((e) => setErr(String(e)))
  }, [uplink, id])

  const back = (
    <button onClick={onBack} className="-ml-2 mb-5 inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-zinc-500 transition-colors hover:bg-zinc-950/[0.04] hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[0.06] dark:hover:text-white">
      <Icon name="chevron-left" size={16} /> Atelier
    </button>
  )
  if (err && !app) return <div>{back}<Text>Couldn’t load this app: {err}</Text></div>
  if (!app) return <div>{back}<Loading /></div>

  const c = accentOf(app)
  return (
    <div>
      {back}
      <div className="overflow-hidden rounded-2xl border border-zinc-950/10 dark:border-white/10">
        <div className="p-6" style={{ background: `linear-gradient(135deg, ${tint(c, '22')}, transparent 70%)` }}>
          <div className="flex items-start gap-4">
            <IconTile app={app} size={72} radius={0.28} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Heading>{app.name}</Heading>
                <StatusBadge app={app} />
              </div>
              <p className="mt-1 text-sm leading-[1.5] text-zinc-600 dark:text-zinc-300">{app.tagline}</p>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-zinc-500 dark:text-zinc-400">
                <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full" style={{ background: c }} />{app.category}</span>
                <span className="text-zinc-300 dark:text-zinc-600">·</span><span className="tabular-nums">v{app.version}</span>
                <span className="text-zinc-300 dark:text-zinc-600">·</span><span>{app.uplinkName}</span>
                {app.author && <><span className="text-zinc-300 dark:text-zinc-600">·</span><span>by {app.author}</span></>}
              </div>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            {app.installed ? (
              <>
                <Button onClick={() => { try { location.assign('/' + (app.workspace || 'global') + '/' + id) } catch {} }}><Icon name="arrow-up-right" size={16} /> Open</Button>
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-2 text-sm font-medium text-emerald-600 dark:text-emerald-400"><Icon name="circle-check" size={16} /> Installed{app.workspace ? ` · ${app.workspace}` : ''}</span>
                {app.updatable && <Button variant="outline" onClick={() => act('update', { uplink, id })} disabled={busy}><Icon name="arrow-up" size={16} /> {busy ? 'Working…' : 'Update'}</Button>}
                <Button variant="outline" onClick={() => { if (!window.confirm(`Uninstall ${app.name}? Its files in dock are removed (its data is kept).`)) return; act('uninstall', { id, wipeData: false }) }} disabled={busy}><Icon name="trash-2" size={15} /> Uninstall</Button>
              </>
            ) : (
              <Button onClick={() => act('install', { uplink, id })} disabled={busy}><Icon name="download" size={16} /> {busy ? 'Installing…' : 'Get'}</Button>
            )}
            {app.homepage && <Button variant="outline" href={app.homepage} target="_blank" rel="noopener noreferrer"><Icon name="github" size={16} /> Source</Button>}
          </div>
          {err && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{err}</p>}
          {depErr && <p className="mt-3 inline-flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-400"><Icon name="triangle-alert" size={15} className="mt-0.5 shrink-0" /> {depErr}</p>}
        </div>

        {app.screenshots?.length > 0 && (
          <div className="mp-shots flex gap-4 overflow-x-auto border-t border-zinc-950/10 px-6 py-6 dark:border-white/10">
            {app.screenshots.map((s, i) => (
              <img key={i} src={s} alt="" className="h-64 w-auto shrink-0 rounded-xl border border-zinc-950/10 bg-[#0a0f1c] object-cover dark:border-white/10" />
            ))}
          </div>
        )}

        <div className="grid gap-6 p-6 lg:grid-cols-[1fr_260px]">
          <div className="min-w-0">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">About</h3>
            {app.descriptionHtml
              ? <div className="mp-prose mt-2 text-sm text-zinc-700 dark:text-zinc-300" dangerouslySetInnerHTML={{ __html: app.descriptionHtml }} />
              : <Text className="mt-2">{app.tagline}</Text>}

            <h3 className="mt-6 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">What it adds</h3>
            <div className="mt-2 flex items-center gap-3 rounded-xl border border-zinc-950/10 bg-zinc-950/[0.02] px-4 py-3 text-sm dark:border-white/10 dark:bg-white/[0.02]">
              <IconTile app={app} size={32} radius={0.3} />
              <span className="text-zinc-600 dark:text-zinc-300">A rail entry <span className="font-medium text-zinc-950 dark:text-white">{app.name}</span> in the <span className="font-medium text-zinc-950 dark:text-white">{app.category}</span> group.</span>
            </div>

            <Requirements app={app} installed={app.installed} />

            {app.tags?.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-1.5">
                {app.tags.map((t) => <span key={t} className="rounded-md bg-zinc-500/15 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-300">#{t}</span>)}
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-zinc-950/10 dark:border-white/10">
            <Spec k="Publisher" v={app.author || '—'} />
            <Spec k="Version" v={'v' + app.version} />
            <Spec k="Category" v={app.category} />
            <Spec k="Surfaces" v={(app.surfaces || []).join(' · ') || '—'} />
            <Spec k="Requires" v={(() => {
              const parts = []
              if (app.deps?.npm) parts.push('npm')
              if (app.deps?.uv) parts.push('uv')
              for (const s of (app.systemSteps || [])) parts.push(s.kind === 'note' ? s.label : s.kind)
              return parts.length ? parts.join(', ') : 'None'
            })()} />
            <Spec k="Marketplace" v={app.uplinkName} />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---- manage marketplaces -------------------------------------------------- */
function Uplinks({ reload, navigate }) {
  const [list, setList] = useState(null)
  const [mode, setMode] = useState('git')
  const [source, setSource] = useState('')
  const [busy, setBusy] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [removing, setRemoving] = useState(() => new Set())   // sources mid-removal
  const [err, setErr] = useState(null)
  const [done, setDone] = useState(null)
  const doneTimer = useRef(null)

  const load = useCallback(() => fetch(`${self.api}/uplinks`).then((r) => r.json()).then((d) => setList(d.uplinks || [])).catch(() => setList([])), [])
  useEffect(() => { load() }, [load])
  useEffect(() => () => clearTimeout(doneTimer.current), [])

  const flashDone = (msg) => { setDone(msg); clearTimeout(doneTimer.current); doneTimer.current = setTimeout(() => setDone(null), 4200) }

  const add = async () => {
    setErr(null); setBusy(true)
    try {
      const r = await (await fetch(`${self.api}/uplinks/add`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source: source.trim() }) })).json()
      if (r.error) setErr(r.error)
      else {
        setSource(''); flashDone({ name: r.name, appCount: r.appCount })
        await load(); reload()
      }
    } catch (e) { setErr(String(e)) } finally { setBusy(false) }
  }
  const remove = async (src) => {
    setErr(null); setRemoving((p) => new Set(p).add(src))
    try {
      const r = await (await fetch(`${self.api}/uplinks/remove`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source: src }) })).json()
      if (r && r.error) setErr(r.error)
      else { await load(); reload() }
    } catch (e) { setErr(String(e)) } finally { setRemoving((p) => { const n = new Set(p); n.delete(src); return n }) }
  }
  const scan = async () => {
    setErr(null); setScanning(true)
    try {
      const r = await (await fetch(`${self.api}/scan`, { method: 'POST' })).json()
      if (r && r.error) setErr(r.error)
      else { await load(); reload(); flashDone({ scanned: true, appCount: r && r.total }) }
    } catch (e) { setErr(String(e)) } finally { setScanning(false) }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <Text>Marketplaces are Git repos (GitHub or local) or local folders, shaped per the <button onClick={() => navigate('docs/reference')} className="cursor-pointer font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400">publishing spec</button>. They’re re-scanned for new and updated apps. New here? <button onClick={() => navigate('docs/quickstart')} className="cursor-pointer font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400">Read the Quickstart →</button></Text>
        <button onClick={scan} disabled={scanning || busy} className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-950/15 px-2.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-950/5 disabled:opacity-50 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/10"><Icon name="refresh-cw" size={13} className={scanning ? 'animate-spin' : ''} /> {scanning ? 'Scanning…' : 'Scan all'}</button>
      </div>
      {err && <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/[0.06] px-3 py-2 text-sm text-red-600 dark:text-red-400">{err}</p>}

      <div className="mt-5 space-y-2">
        {(list || []).map((u) => (
          <div key={u.source} className="flex items-center gap-4 rounded-xl border border-zinc-950/10 bg-white p-4 dark:border-white/10 dark:bg-white/[0.02]">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-zinc-500/15 text-zinc-600 dark:text-zinc-300"><Icon name={/^(\/|~|\.\/)/.test(u.source) ? 'folder' : u.kind === 'bundled' ? 'package' : 'github'} size={18} /></span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-zinc-950 dark:text-white">{u.name || u.source}</div>
              {u.name && <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">{u.source}</div>}
              {u.chromes?.length > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  {u.chromes.map((c) => (
                    <span key={c.id} className="inline-flex items-center gap-1 rounded-md bg-zinc-500/15 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:text-zinc-300"><Icon name={c.icon || 'palette'} size={11} /> {c.name}</span>
                  ))}
                </div>
              )}
              {u.error && <div className="mt-0.5 text-xs text-red-600 dark:text-red-400">⚠ {u.error}</div>}
            </div>
            <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">{u.appCount} apps</span>
            <button onClick={() => remove(u.source)} disabled={removing.has(u.source)} title="Remove" className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-zinc-400 transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:cursor-default disabled:opacity-50"><Icon name={removing.has(u.source) ? 'loader-circle' : 'trash-2'} size={15} className={removing.has(u.source) ? 'animate-spin' : ''} /></button>
          </div>
        ))}
        {list && !list.length && <Text>No marketplaces configured.</Text>}
      </div>

      {done && (
        <div className="mp-success mt-6 flex items-center gap-3.5 rounded-xl border border-green-500/30 bg-green-500/[0.08] px-4 py-3.5">
          <svg viewBox="0 0 52 52" className="h-9 w-9 shrink-0 text-green-600 dark:text-green-400">
            <circle className="mp-ring" cx="26" cy="26" r="24" fill="none" stroke="currentColor" strokeWidth="2.5" />
            <path className="mp-tick" d="M16 27 l7 7 l13 -16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div>
            <div className="text-sm font-semibold text-zinc-950 dark:text-white">{done.scanned ? 'Scan complete' : `Added ${done.name}`}</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">{done.appCount != null ? <>{done.appCount} app{done.appCount === 1 ? '' : 's'} {done.scanned ? 'across your marketplaces.' : 'now available.'}</> : 'Marketplaces re-scanned.'}</div>
          </div>
        </div>
      )}

      <div className="mt-6 rounded-xl border border-zinc-950/10 bg-zinc-950/[0.02] p-5 dark:border-white/10 dark:bg-white/[0.02]">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-zinc-950 dark:text-white">Add a marketplace</h3>
          <div className="inline-flex rounded-lg border border-zinc-950/15 p-0.5 dark:border-white/15">
            <button onClick={() => setMode('git')} className={cn('inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors', mode === 'git' ? 'bg-zinc-950/[0.06] text-zinc-950 dark:bg-white/10 dark:text-white' : 'text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white')}><Icon name="github" size={13} /> Git repo</button>
            <button onClick={() => setMode('local')} className={cn('inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors', mode === 'local' ? 'bg-zinc-950/[0.06] text-zinc-950 dark:bg-white/10 dark:text-white' : 'text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white')}><Icon name="folder" size={13} /> Local folder</button>
          </div>
        </div>
        <Field className="mt-3">
          <Label>{mode === 'git' ? 'Repository' : 'Folder path'}</Label>
          <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder={mode === 'git' ? 'owner/repo or https://github.com/…' : '/path/to/marketplace or ~/folder'} />
        </Field>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{mode === 'git' ? 'A GitHub repo (owner/repo) or any git URL.' : 'An absolute or ~ path to a local marketplace folder.'} Adding scans it immediately.</p>
        {err && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{err}</p>}
        <div className="mt-3"><Button onClick={add} disabled={busy || !source.trim()}><Icon name="plus" size={16} /> {busy ? 'Scanning…' : 'Add & scan'}</Button></div>
      </div>
    </div>
  )
}

/* ---- configure (atelier.config.json) -------------------------------------- */
function Toggle({ on, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
      className={cn('relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors', on ? 'bg-blue-600' : 'bg-zinc-950/15 dark:bg-white/15')}>
      <span className={cn('inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform', on ? 'translate-x-5' : 'translate-x-0.5')} />
    </button>
  )
}

const CONFIG_FIELDS = [
  { key: 'label', group: 'Identity', label: 'Instance name', icon: 'tag', type: 'text', accent: '#3b82f6', placeholder: 'My Atelier',
    help: 'A friendly name for this Atelier. Your theme can show it in the corner.' },
  { key: 'defaultChrome', group: 'Identity', label: 'Default theme', icon: 'palette', type: 'chrome', accent: '#a855f7', placeholder: 'atelier-chrome', restart: true,
    help: 'The theme (a “chrome”) Atelier uses by default. Apps can pin their own with meta.chrome.' },
  { key: 'port', group: 'Network', label: 'Port', icon: 'plug', type: 'number', accent: '#06b6d4', placeholder: '1844', restart: true,
    help: 'The local web port — you’ll open Atelier at http://localhost:<port>.' },
  { key: 'baseUrl', group: 'Network', label: 'Public address', icon: 'globe', type: 'text', accent: '#10b981', placeholder: 'https://atelier.example.com', restart: true,
    help: 'Only needed behind a domain or tunnel — the address others use to reach this Atelier.' },
  { key: 'hotReload', group: 'Behavior', label: 'Live reload', icon: 'refresh-cw', type: 'bool', accent: '#f59e0b', restart: true,
    help: 'Auto-refresh while you edit modules. Great while building; turn off once deployed.' },
  { key: 'auth', group: 'Behavior', label: 'Require sign-in', icon: 'lock', type: 'auth', accent: '#f43f5e', restart: true,
    help: 'Keep Atelier private behind a login. Leave empty for open access, or enter an auth module’s id.' },
]
const FIELD_GROUPS = ['Identity', 'Network', 'Behavior']
const CONFIG_TABS = [
  { id: 'general', label: 'General', icon: 'sliders-horizontal', desc: 'Identity, network & behavior' },
  { id: 'apps', label: 'Apps & Workspaces', icon: 'blocks', desc: 'What’s installed, and where' },
  { id: 'marketplaces', label: 'Marketplaces', icon: 'store', desc: 'Sources for new apps' },
  { id: 'system', label: 'System check', icon: 'stethoscope', desc: 'Required tools & versions' },
  { id: 'daemon', label: 'Start at login', icon: 'log-in', desc: 'Keep this instance running' },
  { id: 'logs', label: 'Activity', icon: 'scroll-text', desc: 'Live server output' },
]
const RESTART_LABELS = Object.fromEntries(CONFIG_FIELDS.map((f) => [f.key, f.label]))

/* ---- system check (are the required tools installed?) --------------------- */
function DepRow({ name, version, present, sub, hint, badge, mono }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg', present ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/15 text-red-500 dark:text-red-400')}>
        <Icon name={present ? 'check' : 'x'} size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className={cn('truncate text-sm font-medium text-zinc-900 dark:text-white', mono && 'font-mono')}>{name}</span>
          {badge && <span className="rounded bg-zinc-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{badge}</span>}
          {present && version && <span className="tabular-nums text-xs text-zinc-400 dark:text-zinc-500">v{version}</span>}
        </div>
        {sub && <div className="truncate text-xs text-zinc-400 dark:text-zinc-500">{sub}</div>}
      </div>
      <span className="shrink-0 text-right text-xs">
        {present
          ? <span className="font-medium text-emerald-600 dark:text-emerald-400">Installed</span>
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
  const missing = data.managers.filter((m) => !m.present).length + (data.tools || []).filter((t) => !t.present).length
  const toolHint = (t) => (t.manager === 'brew' ? `brew install ${t.name}` : `uv tool install ${t.name}`)

  return (
    <div className="max-w-2xl space-y-8">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Heading level={2} className="!text-lg">System check</Heading>
          <Text className="!mt-0.5 !text-[13px]">{missing ? `${missing} thing${missing === 1 ? '' : 's'} missing — install ${missing === 1 ? 'it' : 'them'} to unblock installs.` : 'Everything the marketplace needs is installed.'}</Text>
        </div>
        <button onClick={load} disabled={busy} className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-950/10 px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-950/[0.04] disabled:opacity-60 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/[0.06]">
          <Icon name={busy ? 'loader' : 'refresh-cw'} size={14} className={busy ? 'animate-spin' : ''} /> {busy ? 'Checking…' : 'Re-check'}
        </button>
      </div>

      <section>
        <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-400 dark:text-zinc-500">Package managers</div>
        <div className="divide-y divide-zinc-950/[0.06] overflow-hidden rounded-2xl border border-zinc-950/10 dark:divide-white/[0.06] dark:border-white/10">
          {data.managers.map((m) => <DepRow key={m.key} name={m.label} version={m.version} present={m.present} sub={m.why} hint={m.install} />)}
        </div>
      </section>

      <section>
        <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-400 dark:text-zinc-500">App requirements</div>
        {data.tools && data.tools.length ? (
          <div className="divide-y divide-zinc-950/[0.06] overflow-hidden rounded-2xl border border-zinc-950/10 dark:divide-white/[0.06] dark:border-white/10">
            {data.tools.map((t) => <DepRow key={t.manager + t.name} name={t.name} version={t.version} present={t.present} mono badge={t.manager} sub={`needed by ${t.neededBy.join(', ')}`} hint={toolHint(t)} />)}
          </div>
        ) : (
          <Text className="!text-[13px]">No app declares a system tool yet — add apps with <code className="rounded bg-zinc-950/[0.06] px-1 py-0.5 text-[12px] dark:bg-white/10">requires</code> and they’ll show here.</Text>
        )}
      </section>
    </div>
  )
}

/* ---- start at login (macOS launchd LaunchAgent) --------------------------- */
/* Ported from the 003 devops module: run THIS Atelier instance as a managed user
 * LaunchAgent (gui/<uid>, no sudo) that starts at login and restarts on crash,
 * plus a read-only inventory of every ~/Library/LaunchAgents plist. */
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
            <Button variant="outline" onClick={() => act('restart')} disabled={busy}>Restart</Button>
            <Button variant="outline" onClick={() => act('stop')} disabled={busy}>Stop</Button>
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

// Live tail of a managed agent's logs — the "why" behind a crash-loop. Polls so a
// fresh crash surfaces without a manual refresh.
function PlistLogs({ label, daemon }) {
  const [logs, setLogs] = useState(null)
  const [showOut, setShowOut] = useState(false)
  useEffect(() => {
    let live = true
    const tick = () => fetch(`${self.api}/plists/${encodeURIComponent(label)}/logs`, { cache: 'no-store' })
      .then((r) => r.json()).then((b) => { if (live) setLogs(b) }).catch(() => {})
    tick()
    const t = setInterval(tick, 5000)
    return () => { live = false; clearInterval(t) }
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
  // takes the port down briefly and a poll landing in that window would otherwise
  // wipe the card to an empty state.
  const load = useCallback(async () => {
    try {
      const r = await fetch(`${self.api}/plists`, { cache: 'no-store' })
      const b = await r.json()
      setData({ managed: b.managed || [], installed: b.installed || [] })
      return true
    } catch { setData((prev) => prev || { managed: [], installed: [] }); return false }
  }, [])
  // Poll so launchd status tracks install/start/stop live.
  useEffect(() => { load(); const t = setInterval(load, 12000); return () => clearInterval(t) }, [load])
  // After the install handoff reloads the page, show a one-time success note.
  useEffect(() => {
    let t
    try {
      if (sessionStorage.getItem('dock:service-installed')) {
        sessionStorage.removeItem('dock:service-installed')
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
      try { sessionStorage.setItem('dock:service-installed', label) } catch {}
      // The handoff kills the current server (this very process) ~0.8s after it
      // responds. So the POST normally returns {ok:true} first; only a real error
      // body (no managed plist / spawn failure) means the handoff never started —
      // surface that immediately instead of waiting out the full timeout. A dropped
      // connection (the genuine self-kill) throws and falls through to the wait.
      try {
        const r = await fetch(`${self.api}/plists/${encodeURIComponent(label)}/takeover`, { method: 'POST' })
        const body = await r.json().catch(() => ({}))
        if (body && body.ok === false) {
          try { sessionStorage.removeItem('dock:service-installed') } catch {}
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

const moduleLabel = (m) => {
  if (typeof m === 'string') return m.replace(/^!/, '').split('/').filter(Boolean).pop()
  if (m && m.path) return m.path.split('/').filter(Boolean).pop()
  if (m && m.workspace) return '$' + m.workspace
  if (m && m.id) return m.id
  return JSON.stringify(m)
}

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
        <p className="mt-0.5 text-xs leading-[1.5] text-zinc-500 dark:text-zinc-400">{f.help}</p>
      </div>
      <div className={cn('shrink-0', f.type === 'bool' ? 'sm:pr-1' : 'sm:w-64')}>{control}</div>
    </div>
  )
}

const CHROME_COLORS = ['#3b82f6', '#a855f7', '#f97316', '#14b8a6', '#ec4899', '#eab308', '#06b6d4', '#ef4444']
// parseModules / serializeModules are the same pure helpers the backend + tests use.

function AppsWorkspaces({ cfg, navigate, refresh }) {
  const [inst, setInst] = useState(null)
  const [wsName, setWsName] = useState('')
  const [wsBusy, setWsBusy] = useState(false)
  const [linkPath, setLinkPath] = useState('')
  const [linkWs, setLinkWs] = useState('global')
  const [wsErr, setWsErr] = useState(null)
  const [drag, setDrag] = useState(null)   // index of the app being dragged
  const [over, setOver] = useState(null)   // workspace lane being dragged over
  const [confirm, setConfirm] = useState(null)   // index of the app awaiting uninstall confirm
  const [wipeData, setWipeData] = useState(false)   // "also delete data" checkbox (installed only)
  const [renaming, setRenaming] = useState(null)   // workspace being renamed
  const [renameVal, setRenameVal] = useState('')
  const [updating, setUpdating] = useState(() => new Set())   // app ids mid-update

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
  // Kind is computed PER ENTRY from its path (not the id-keyed meta), so the same
  // app id can be linked in one workspace and installed in another without confusion.
  const roots = inst.roots || {}
  const rawPath = (raw) => { const p = typeof raw === 'string' ? raw.replace(/^!/, '') : (raw && raw.path) || ''; return !p ? '' : p[0] === '~' ? (roots.home || '') + p.slice(1) : p }
  const inPath = (p, base) => !!base && (p === base || p.startsWith(base + '/'))
  const kindOf = (it) => { if (moduleLabel(it.raw) === self.id) return 'system'; const p = rawPath(it.raw); if (inPath(p, roots.atelier)) return 'system'; if (inPath(p, roots.data)) return 'installed'; return 'linked' }
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
  // (read-modify-write, like install) — never staged — so they can't be clobbered
  // by a later install. The write makes the shell reload; we also reload as a
  // fallback and refresh the form so the view is always fresh.
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
  const doUninstall = async (it) => {
    setConfirm(null); const wipe = wipeData; setWipeData(false)
    if (kindOf(it) === 'installed') await persist('uninstall', { id: moduleLabel(it.raw), wipeData: wipe })  // deletes the copy
    else await persist('unlink', { raw: it.raw })   // just drops the path-mount
  }
  const doLink = async () => { if (linkPath.trim() && await persist('link', { path: linkPath.trim(), ws: linkWs })) setLinkPath('') }
  const doOpen = (it) => { try { location.assign('/' + (it.ws || 'global') + '/' + moduleLabel(it.raw)) } catch {} }
  const doUpdate = async (it) => {
    const up = metaOf(it.raw).updateUplink; if (!up) return
    const id = moduleLabel(it.raw)
    setWsErr(null); setUpdating((p) => new Set(p).add(id))
    try {
      const r = await (await fetch(`${self.api}/update`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ uplink: up, id }) })).json()
      if (r && r.error) { setWsErr(r.error); setUpdating((p) => { const n = new Set(p); n.delete(id); return n }); return }
      if (r && r.depsOk === false) { setWsErr(`Updated “${id}”, but some dependencies failed — check the Activity log.`); setUpdating((p) => { const n = new Set(p); n.delete(id); return n }); return }
      setTimeout(() => { try { location.reload() } catch {} }, 1200)   // success → reload to remount
    } catch (e) { setWsErr(String(e)); setUpdating((p) => { const n = new Set(p); n.delete(id); return n }) }
  }

  // The destructive confirm panel — shared by apps and unused chromes.
  const renderConfirm = (it) => {
    const id = moduleLabel(it.raw); const m = metaOf(it.raw); const installed = kindOf(it) === 'installed'; const kindWord = m.isChrome ? 'theme' : 'app'
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/[0.05] p-3">
        <div className="flex items-start gap-2.5">
          <Icon name="circle-alert" size={16} className="mt-0.5 shrink-0 text-red-500" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">{installed ? 'Uninstall' : 'Unlink'} {m.name || id}?</div>
            <p className="mt-0.5 text-xs leading-[1.5] text-zinc-500 dark:text-zinc-400">
              {installed
                ? <>Removes this {kindWord} from Atelier. The installed copy stays in dock’s data folder unless you also delete its data.</>
                : <>It’s <span className="font-medium text-amber-600 dark:text-amber-400">linked</span> from <code className="rounded bg-zinc-950/10 px-1 text-[11px] dark:bg-white/10">{rawSource(it.raw)}</code> — only the link is removed. Its files &amp; data are left untouched.</>}
            </p>
            {installed && (
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                <input type="checkbox" checked={wipeData} onChange={(e) => setWipeData(e.target.checked)} className="h-3.5 w-3.5 cursor-pointer accent-red-600" />
                Also delete its data — <span className="font-medium text-red-500">can’t be undone</span>
              </label>
            )}
            <div className="mt-2.5 flex gap-2">
              <button onClick={() => { setConfirm(null); setWipeData(false) }} className="cursor-pointer rounded-lg px-3 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-950/[0.06] dark:text-zinc-300 dark:hover:bg-white/10">Cancel</button>
              <button onClick={() => doUninstall(it)} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-red-500"><Icon name={installed ? 'trash-2' : 'unlink'} size={13} /> {installed ? (wipeData ? 'Uninstall & delete data' : 'Uninstall') : 'Unlink'}</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Errors from move / update / unlink / link surface here, at the top. */}
      {wsErr && <p className="rounded-lg border border-red-500/30 bg-red-500/[0.06] px-3 py-2 text-sm text-red-600 dark:text-red-400">{wsErr}</p>}

      {/* Themes / chromes */}
      <div className="rounded-2xl border border-zinc-950/10 bg-white p-4 shadow-sm shadow-zinc-950/[0.03] dark:border-white/10 dark:bg-white/[0.02] dark:shadow-none">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-500"><Icon name="palette" size={17} /></span>
          <div>
            <div className="text-sm font-semibold text-zinc-950 dark:text-white">Themes</div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">The skins your apps render in. Managed for you — an unused theme is removed automatically once the last app using it is gone.</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {chromeItems.map((it) => {
            const id = moduleLabel(it.raw); const m = metaOf(it.raw); const isDefault = id === inst.defaultChrome
            const users = appItems.filter((a) => metaOf(a.raw).chrome === id).length
            const removable = !isDefault && m.kind !== 'system' && users === 0
            return (
              <div key={it.i} className={cn('flex items-center gap-2 rounded-lg border py-1.5 pl-2 pr-2.5 dark:border-white/10', confirm === it.i ? 'border-red-500/40' : 'border-zinc-950/10')}>
                <span className="h-4 w-4 rounded-[5px] ring-1 ring-inset ring-black/10" style={{ background: colorOf(id) }} />
                <span className="text-sm text-zinc-800 dark:text-zinc-200">{m.name || id}</span>
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-zinc-400 dark:text-zinc-500"><Icon name={kindOf(it) === 'system' ? 'lock' : kindOf(it) === 'installed' ? 'package-check' : 'link-2'} size={10} />{kindOf(it)}</span>
                {isDefault
                  ? <span className="rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">default</span>
                  : users
                    ? <span className="rounded-md bg-zinc-500/15 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:text-zinc-400">in use · {users}</span>
                    : <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">unused</span>}
                {removable && <button onClick={() => { setConfirm(it.i); setWipeData(false) }} title={m.linked ? 'Unlink' : 'Uninstall'} className="-mr-1 grid h-5 w-5 cursor-pointer place-items-center rounded text-zinc-400 transition-colors hover:bg-red-500/10 hover:text-red-500"><Icon name="x" size={13} /></button>}
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
                    const k = kindOf(it); const sys = k === 'system'; const installed = k === 'installed'; const dragging = drag === it.i
                    if (confirm === it.i) return <div key={it.i}>{renderConfirm(it)}</div>
                    return (
                      <div key={it.i} draggable={!sys}
                        onDragStart={(e) => { setConfirm(null); setDrag(it.i); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(it.i)) } catch {} }}
                        onDragEnd={() => { setDrag(null); setOver(null) }}
                        className={cn('group flex items-center gap-2.5 rounded-xl border bg-white p-2 transition dark:bg-zinc-900/40',
                          sys ? 'border-zinc-950/10 dark:border-white/10' : 'cursor-grab border-zinc-950/10 hover:border-zinc-950/20 hover:shadow-sm active:cursor-grabbing dark:border-white/10 dark:hover:border-white/20',
                          dragging && 'opacity-40')}>
                        <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: colorOf(ch) }} title={ch ? `uses ${ch}` : ''} />
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-zinc-500/10 text-zinc-500"><Icon name={m.icon || 'box'} size={16} /></span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{m.name || id}</span>
                            {sys
                              ? <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-zinc-500/15 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:text-zinc-400"><Icon name="lock" size={10} /> system</span>
                              : installed
                                ? (m.orphaned
                                    ? <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400"><Icon name="unplug" size={10} /> source missing</span>
                                    : <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400"><Icon name="package-check" size={10} /> installed</span>)
                                : <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400"><Icon name="link-2" size={10} /> linked</span>}
                            {m.updatable && <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400"><Icon name="arrow-up" size={10} /> update</span>}
                          </div>
                          {ch && <span className="flex items-center gap-1 text-[10.5px] text-zinc-400 dark:text-zinc-500"><span className="h-1.5 w-1.5 rounded-full" style={{ background: colorOf(ch) }} />{ch}</span>}
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5">
                          {m.updatable && <button onClick={() => doUpdate(it)} disabled={updating.has(id)} title="Update" className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-500/10 disabled:opacity-60 dark:text-blue-400">{updating.has(id) && <Icon name="loader-circle" size={12} className="animate-spin" />}{updating.has(id) ? 'Updating…' : 'Update'}</button>}
                          {!sys && <button onClick={() => doOpen(it)} title="Open" className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-950/[0.06] hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"><Icon name="external-link" size={14} /></button>}
                          {!sys && <button onClick={() => { setConfirm(it.i); setWipeData(false) }} className="cursor-pointer rounded-lg px-2.5 py-1 text-xs font-medium text-zinc-400 transition-colors hover:bg-red-500/10 hover:text-red-500">{installed ? 'Uninstall' : 'Unlink'}</button>}
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
        {wsErr && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{wsErr}</p>}
      </div>
    </div>
  )
}

// A small, safe JSON editor: highlighted overlay + transparent textarea.
function JsonEditor({ text, onChange, error }) {
  const taRef = useRef(null), preRef = useRef(null)
  const sync = () => { const t = taRef.current, p = preRef.current; if (t && p) { p.scrollTop = t.scrollTop; p.scrollLeft = t.scrollLeft } }
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-950/10 bg-zinc-950 shadow-sm dark:border-white/10">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <span className="flex items-center gap-2 text-xs font-medium text-zinc-400"><Icon name="file-json" size={14} /> atelier.config.json</span>
        {error
          ? <span className="flex items-center gap-1.5 text-xs font-medium text-red-400"><Icon name="circle-x" size={13} /> {error}</span>
          : <span className="flex items-center gap-1.5 text-xs font-medium text-green-400"><Icon name="circle-check" size={13} /> Valid JSON</span>}
      </div>
      <div className="relative">
        <pre ref={preRef} aria-hidden className="mp-json pointer-events-none m-0 max-h-[60vh] overflow-auto px-4 py-3 text-zinc-300" dangerouslySetInnerHTML={{ __html: highlightJson(text) + '\n' }} />
        <textarea ref={taRef} value={text} onChange={(e) => onChange(e.target.value)} onScroll={sync} spellCheck={false} autoCapitalize="off" autoCorrect="off"
          className="mp-json absolute inset-0 resize-none overflow-auto bg-transparent px-4 py-3 text-transparent caret-white outline-none" />
      </div>
    </div>
  )
}

const LOG_LV = { info: { c: '#60a5fa', t: 'INFO' }, ok: { c: '#4ade80', t: 'OK' }, warn: { c: '#fbbf24', t: 'WARN' }, error: { c: '#f87171', t: 'ERR' } }

const LOG_SRC = { server: { icon: 'server', t: 'server' }, dock: { icon: 'box', t: 'dock' } }

function Logs() {
  const [logs, setLogs] = useState(null)
  const [q, setQ] = useState('')
  const [lv, setLv] = useState({ info: true, ok: true, warn: true, error: true })
  const [src, setSrc] = useState({ server: true, dock: true })
  const [follow, setFollow] = useState(true)
  const endRef = useRef(null)

  useEffect(() => {
    fetch(`${self.api}/logs`).then((r) => r.json()).then((d) => setLogs(d.logs || [])).catch(() => setLogs([]))
    const unsub = self.subscribe((f) => { if (f && f.type === 'log' && f.entry) setLogs((l) => [...(l || []), f.entry].slice(-500)) })
    return unsub
  }, [])
  useEffect(() => { if (follow) endRef.current?.scrollIntoView({ block: 'end' }) }, [logs, follow])

  const srcOf = (e) => (e.src === 'dock' ? 'dock' : 'server')
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

      <div className="flex flex-col overflow-hidden rounded-2xl border border-zinc-950/10 bg-zinc-950 shadow-sm dark:border-white/10" style={{ height: 'calc(100vh - 12rem)', minHeight: '22rem' }}>
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
              <span className={cn('w-12 shrink-0 truncate text-[11px]', srcOf(e) === 'dock' ? 'text-blue-400/70' : 'text-zinc-600')} title={srcOf(e) === 'dock' ? 'dock event' : 'server output'}>{srcOf(e)}</span>
              <span className="min-w-0 flex-1 break-words text-zinc-200">{e.msg}</span>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </div>
    </div>
  )
}

function Configure({ sub, navigate, reload, onBack }) {
  const tab = ['apps', 'marketplaces', 'system', 'daemon', 'logs'].includes(sub) ? sub : 'general'
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
      const f = sessionStorage.getItem('dock:saved')
      if (f) { sessionStorage.removeItem('dock:saved'); setSavedRestart(f === 'restart'); t = setTimeout(() => setSavedRestart(null), 4500) }
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
      else { try { sessionStorage.setItem('dock:saved', needed ? 'restart' : 'ok') } catch {}; setOrig(out); setCfg(out); setSavedRestart(needed === true) }
    } catch (e) { setErr(String(e)) } finally { setBusy(false) }
  }

  const active = CONFIG_TABS.find((t) => t.id === tab) || CONFIG_TABS[0]

  return (
    <div className={cn('mx-auto', tab === 'logs' ? 'max-w-none' : 'max-w-6xl')}>
      <button onClick={onBack} className="-ml-2 mb-6 inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-zinc-500 transition-colors hover:bg-zinc-950/[0.04] hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[0.06] dark:hover:text-white"><Icon name="chevron-left" size={16} /> Atelier</button>

      <header>
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-600/90 dark:text-blue-400/90">{(cfg && cfg.label) || 'Atelier'}</div>
        <h1 className="mt-1.5 text-[30px] font-semibold leading-none tracking-tight text-zinc-950 dark:text-white">Settings</h1>
        <p className="mt-2.5 max-w-xl text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">Everything that defines your Atelier — identity, apps &amp; themes, and where new apps come from. It all lives in <code className="rounded bg-zinc-950/[0.06] px-1 py-0.5 text-[12px] font-medium text-zinc-600 dark:bg-white/10 dark:text-zinc-300">atelier.config.json</code>.</p>
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
                <button key={t.id} onClick={() => navigate(t.id === 'general' ? 'config' : 'config/' + t.id)}
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
          {tab !== 'marketplaces' && err && <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/[0.06] px-3 py-2 text-sm text-red-600 dark:text-red-400">{err}</p>}
          {tab !== 'marketplaces' && !cfg && <Loading />}

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
                <AppsWorkspaces cfg={cfg} navigate={navigate} refresh={refresh} />
              )}
            </div>
          )}

          {tab === 'marketplaces' && <Uplinks navigate={navigate} reload={reload} />}

          {tab === 'system' && <SystemCheck />}

          {tab === 'daemon' && <Daemon />}

          {tab === 'logs' && <Logs />}
        </div>
      </div>

      {(tab === 'general' || tab === 'apps') && (dirty || savedRestart !== null) && (
        <div className="pointer-events-none sticky bottom-5 z-20 mt-10 flex justify-center">
          {dirty ? (
            <div className="mp-savebar pointer-events-auto flex items-center gap-3 rounded-2xl border border-zinc-950/10 bg-white/85 py-2 pl-4 pr-2 shadow-xl shadow-zinc-950/10 backdrop-blur-md dark:border-white/10 dark:bg-zinc-900/85">
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
            <div className="mp-savebar pointer-events-auto flex items-center gap-2.5 rounded-2xl border border-green-500/30 bg-green-500/[0.12] px-4 py-2.5 text-sm font-medium text-green-700 shadow-lg backdrop-blur-md dark:text-green-300">
              <Icon name="check" size={16} /> Saved{savedRestart ? ' — restart Atelier to apply' : ''}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ---- docs viewer ---------------------------------------------------------- */
const DOC_META = {
  'build-first-module': { icon: 'sparkles', desc: 'Hello world, then go big' },
  quickstart: { icon: 'rocket', desc: 'Publish in 7 steps' },
  reference: { icon: 'book-open', desc: 'Marketplace format' },
  'atelier-readme': { icon: 'layout-dashboard', name: 'Overview', desc: 'The shell & how it runs' },
  'atelier-modules': { icon: 'boxes', name: 'Modules', desc: 'Building a module' },
  'atelier-workspaces': { icon: 'folders', name: 'Workspaces', desc: 'The multi-tenant model' },
  'atelier-auth': { icon: 'shield', name: 'Auth', desc: 'Identity & gating' },
}
const DOC_GROUPS = [['guide', 'Guides'], ['atelier', 'Atelier reference']]

// The headline stack a module gets out of the box. Node/React/Tailwind use their
// brand marks (inline simple-icons paths); WebSockets has no logo → a lucide icon.
const TECHS = [
  { name: 'Node 24+', color: '#5FA04E', path: 'M11.998 24c-.321 0-.641-.084-.922-.247l-2.936-1.737c-.438-.245-.224-.332-.08-.383.585-.203.703-.25 1.328-.604.065-.037.151-.023.218.017l2.256 1.339c.082.045.197.045.272 0l8.795-5.076c.082-.047.134-.141.134-.238V6.921c0-.099-.053-.192-.137-.242l-8.791-5.072c-.081-.047-.189-.047-.271 0L3.075 6.68C2.99 6.729 2.936 6.825 2.936 6.921v10.146c0 .097.054.189.139.235l2.409 1.392c1.307.654 2.108-.116 2.108-.89V7.787c0-.142.114-.253.256-.253h1.115c.139 0 .255.112.255.253v10.021c0 1.745-.95 2.745-2.604 2.745-.508 0-.909 0-2.026-.551L2.28 18.675c-.57-.329-.922-.945-.922-1.604V6.921c0-.659.353-1.275.922-1.603l8.795-5.082c.557-.315 1.296-.315 1.848 0l8.794 5.082c.57.329.924.944.924 1.603v10.146c0 .659-.354 1.273-.924 1.604l-8.794 5.078c-.28.163-.599.247-.925.247zm7.101-10.007c0-1.9-1.284-2.406-3.987-2.763-2.731-.361-3.009-.548-3.009-1.187 0-.528.235-1.233 2.258-1.233 1.807 0 2.473.389 2.747 1.607.024.115.129.199.247.199h1.141c.071 0 .138-.031.186-.081.048-.054.074-.123.067-.196-.177-2.098-1.571-3.076-4.388-3.076-2.508 0-4.004 1.058-4.004 2.833 0 1.925 1.488 2.457 3.895 2.695 2.88.282 3.103.703 3.103 1.269 0 .983-.789 1.402-2.642 1.402-2.327 0-2.839-.584-3.011-1.742-.02-.124-.126-.215-.253-.215h-1.137c-.141 0-.254.112-.254.253 0 1.482.806 3.248 4.655 3.248 2.778 0 4.169-1.093 4.169-2.806z' },
  { name: 'React', color: '#61DAFB', path: 'M14.23 12.004a2.236 2.236 0 0 1-2.235 2.236 2.236 2.236 0 0 1-2.236-2.236 2.236 2.236 0 0 1 2.235-2.236 2.236 2.236 0 0 1 2.236 2.236zm2.648-10.69c-1.346 0-3.107.96-4.888 2.622-1.78-1.653-3.542-2.602-4.887-2.602-.41 0-.783.093-1.106.278-1.375.793-1.683 3.264-.973 6.365C1.98 8.917 0 10.42 0 12.004c0 1.59 1.99 3.097 5.043 4.03-.704 3.113-.39 5.588.988 6.38.32.187.69.275 1.102.275 1.345 0 3.107-.96 4.888-2.624 1.78 1.654 3.542 2.603 4.887 2.603.41 0 .783-.09 1.106-.275 1.374-.792 1.683-3.263.973-6.365C22.02 15.096 24 13.59 24 12.004c0-1.59-1.99-3.097-5.043-4.032.704-3.11.39-5.587-.988-6.38a2.167 2.167 0 0 0-1.092-.278zm-.005 1.09v.006c.225 0 .406.044.558.127.666.382.955 1.835.73 3.704-.054.46-.142.945-.25 1.44a23.476 23.476 0 0 0-3.107-.534A23.892 23.892 0 0 0 12.769 4.7c1.592-1.48 3.087-2.292 4.105-2.295zm-9.77.02c1.012 0 2.514.808 4.11 2.28-.686.72-1.37 1.537-2.02 2.442a22.73 22.73 0 0 0-3.113.538 15.02 15.02 0 0 1-.254-1.42c-.23-1.868.054-3.32.714-3.707.19-.09.4-.127.563-.132zm4.882 3.05c.455.468.91.992 1.36 1.564-.44-.02-.89-.034-1.345-.034-.46 0-.915.01-1.36.034.44-.572.895-1.096 1.345-1.565zM12 8.1c.74 0 1.477.034 2.202.093.406.582.802 1.203 1.183 1.86.372.64.71 1.29 1.018 1.946-.308.655-.646 1.31-1.013 1.95-.38.66-.773 1.288-1.18 1.87a25.64 25.64 0 0 1-4.412.005 26.64 26.64 0 0 1-1.183-1.86c-.372-.64-.71-1.29-1.018-1.946a25.17 25.17 0 0 1 1.013-1.954c.38-.66.773-1.286 1.18-1.868A25.245 25.245 0 0 1 12 8.098zm-3.635.254c-.24.377-.48.763-.704 1.16-.225.39-.435.782-.635 1.174-.265-.656-.49-1.31-.676-1.947.64-.15 1.315-.283 2.015-.386zm7.26 0c.695.103 1.365.23 2.006.387-.18.632-.405 1.282-.66 1.933a25.952 25.952 0 0 0-1.345-2.32zm3.063.675c.484.15.944.317 1.375.498 1.732.74 2.852 1.708 2.852 2.476-.005.768-1.125 1.74-2.857 2.475-.42.18-.88.342-1.355.493a23.966 23.966 0 0 0-1.1-2.98c.45-1.017.81-2.01 1.085-2.964zm-13.395.004c.278.96.645 1.957 1.1 2.98a23.142 23.142 0 0 0-1.086 2.964c-.484-.15-.944-.318-1.37-.5-1.732-.737-2.852-1.706-2.852-2.474 0-.768 1.12-1.742 2.852-2.476.42-.18.88-.342 1.356-.494zm11.678 4.28c.265.657.49 1.312.676 1.948-.64.157-1.316.29-2.016.39a25.819 25.819 0 0 0 1.341-2.338zm-9.945.02c.2.392.41.783.64 1.175.23.39.465.772.705 1.143a22.005 22.005 0 0 1-2.006-.386c.18-.63.406-1.282.66-1.932zM17.92 16.32c.112.493.2.968.254 1.423.23 1.868-.054 3.32-.714 3.708-.147.09-.338.128-.563.128-1.012 0-2.514-.807-4.11-2.28.686-.72 1.37-1.536 2.02-2.44 1.107-.118 2.154-.3 3.113-.54zm-11.83.01c.96.234 2.006.415 3.107.532.66.905 1.345 1.727 2.035 2.446-1.595 1.483-3.092 2.295-4.11 2.295a1.185 1.185 0 0 1-.553-.132c-.666-.38-.955-1.834-.73-3.703.054-.46.142-.944.25-1.438zm4.56.64c.44.02.89.034 1.345.034.46 0 .915-.01 1.36-.034-.44.572-.895 1.095-1.345 1.565-.455-.47-.91-.993-1.36-1.565z' },
  { name: 'Tailwind v4', color: '#38BDF8', path: 'M12.001 4.8c-3.2 0-5.2 1.6-6 4.8 1.2-1.6 2.6-2.2 4.2-1.8.913.228 1.565.89 2.288 1.624C13.666 10.618 15.027 12 18.001 12c3.2 0 5.2-1.6 6-4.8-1.2 1.6-2.6 2.2-4.2 1.8-.913-.228-1.565-.89-2.288-1.624C16.337 6.182 14.976 4.8 12.001 4.8zm-6 7.2c-3.2 0-5.2 1.6-6 4.8 1.2-1.6 2.6-2.2 4.2-1.8.913.228 1.565.89 2.288 1.624 1.177 1.194 2.538 2.576 5.512 2.576 3.2 0 5.2-1.6 6-4.8-1.2 1.6-2.6 2.2-4.2 1.8-.913-.228-1.565-.89-2.288-1.624C10.337 13.382 8.976 12 6.001 12z' },
  { name: 'WebSockets', color: '#8b5cf6', icon: 'webhook' },
]

function TechStrip() {
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {TECHS.map((t) => (
        <div key={t.name} className="group flex flex-col items-center gap-2.5 rounded-2xl border border-zinc-950/10 bg-white px-4 py-5 text-center shadow-sm shadow-zinc-950/[0.03] transition-colors hover:border-zinc-950/20 dark:border-white/10 dark:bg-white/[0.02] dark:shadow-none dark:hover:border-white/20">
          <span className="grid h-12 w-12 place-items-center rounded-xl transition-transform duration-200 group-hover:scale-110" style={{ background: t.color + '1f', color: t.color }}>
            {t.icon ? <Icon name={t.icon} size={26} /> : <svg viewBox="0 0 24 24" width="26" height="26" fill={t.color} aria-hidden="true"><path d={t.path} /></svg>}
          </span>
          <span className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-200">{t.name}</span>
        </div>
      ))}
    </div>
  )
}

function RefLinks({ navigate }) {
  const refs = ['atelier-readme', 'atelier-modules', 'atelier-workspaces', 'atelier-auth']
  return (
    <div className="mt-8">
      <div className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">Keep reading — the reference</div>
      <div className="grid gap-3 sm:grid-cols-2">
        {refs.map((slug) => {
          const dm = DOC_META[slug] || {}
          return (
            <button key={slug} onClick={() => navigate('docs/' + slug)} className="group flex items-center gap-3 rounded-xl border border-zinc-950/10 bg-white p-4 text-left shadow-sm shadow-zinc-950/[0.03] transition-colors hover:border-blue-500/40 dark:border-white/10 dark:bg-white/[0.02] dark:shadow-none dark:hover:border-blue-500/40">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400"><Icon name={dm.icon || 'file-text'} size={17} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-zinc-900 dark:text-white">{dm.name || slug}</span>
                {dm.desc && <span className="block truncate text-[12px] text-zinc-500 dark:text-zinc-400">{dm.desc}</span>}
              </span>
              <Icon name="arrow-right" size={15} className="shrink-0 text-zinc-300 transition-colors group-hover:text-blue-500 dark:text-zinc-600" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Docs({ slug, navigate, onBack }) {
  const [docs, setDocs] = useState(null)
  const [doc, setDoc] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => { fetch(`${self.api}/docs`).then((r) => r.json()).then((d) => setDocs(d.docs || [])).catch(() => setDocs([])) }, [])
  const active = slug || (docs && docs[0] && docs[0].slug) || ''
  useEffect(() => {
    if (!active) return
    setDoc(null); setErr(null)
    fetch(`${self.api}/doc?slug=${encodeURIComponent(active)}`).then((r) => r.json()).then((d) => (d.error ? setErr(d.error) : setDoc(d))).catch((e) => setErr(String(e)))
  }, [active])

  return (
    <div className="mx-auto max-w-5xl">
      <button onClick={onBack} className="-ml-2 mb-6 inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-zinc-500 transition-colors hover:bg-zinc-950/[0.04] hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[0.06] dark:hover:text-white"><Icon name="chevron-left" size={16} /> Atelier</button>

      <header>
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-600/90 dark:text-blue-400/90">Documentation</div>
        <h1 className="mt-1.5 text-[30px] font-semibold leading-none tracking-tight text-zinc-950 dark:text-white">{doc ? doc.title : 'Docs'}</h1>
        <p className="mt-2.5 max-w-xl text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">Build a module and publish a marketplace — the full guide, rendered right here.</p>
      </header>

      <div className="mt-8 grid gap-10 md:grid-cols-[230px_1fr]">
        <aside>
          {DOC_GROUPS.map(([g, label]) => {
            const items = (docs || []).filter((d) => (d.group || 'guide') === g)
            if (!items.length) return null
            return (
              <div key={g} className={g === 'guide' ? '' : 'mt-5'}>
                <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-400 dark:text-zinc-500">{label}</div>
                <nav className="space-y-1">
                  {items.map((d) => {
                    const on = d.slug === active; const dm = DOC_META[d.slug] || {}
                    return (
                      <button key={d.slug} onClick={() => navigate('docs/' + d.slug)}
                        className={cn('group relative flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors', on ? 'bg-zinc-950/[0.05] dark:bg-white/[0.07]' : 'hover:bg-zinc-950/[0.03] dark:hover:bg-white/[0.04]')}>
                        {on && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-blue-600" />}
                        <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors', on ? 'bg-blue-600 text-white shadow-sm' : 'bg-zinc-500/10 text-zinc-500 group-hover:text-zinc-700 dark:group-hover:text-zinc-300')}><Icon name={dm.icon || 'file-text'} size={15} /></span>
                        <span className="min-w-0">
                          <span className={cn('block truncate text-sm font-medium', on ? 'text-zinc-950 dark:text-white' : 'text-zinc-600 dark:text-zinc-300')}>{dm.name || d.title}</span>
                          {dm.desc && <span className="block truncate text-[11px] text-zinc-400 dark:text-zinc-500">{dm.desc}</span>}
                        </span>
                      </button>
                    )
                  })}
                </nav>
              </div>
            )
          })}
          <div className="mt-4 rounded-xl border border-zinc-950/10 bg-zinc-950/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.02]">
            <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Got a marketplace?</div>
            <p className="mt-0.5 text-[11px] leading-[1.5] text-zinc-500 dark:text-zinc-400">Add its repo or folder to start installing apps.</p>
            <button onClick={() => navigate('config/marketplaces')} className="mt-2 inline-flex cursor-pointer items-center gap-1 text-[11px] font-medium text-blue-600 transition-colors hover:text-blue-500 dark:text-blue-400">Manage marketplaces <Icon name="arrow-right" size={12} /></button>
          </div>
        </aside>

        <article className="min-w-0">
          {err && <p className="rounded-lg border border-red-500/30 bg-red-500/[0.06] px-3 py-2 text-sm text-red-600 dark:text-red-400">Couldn’t load this doc: {err}</p>}
          {!err && !doc && <Loading />}
          {doc && (
            <>
              {active === 'build-first-module' && <TechStrip />}
              <div className="rounded-2xl border border-zinc-950/10 bg-white p-7 shadow-sm shadow-zinc-950/[0.03] dark:border-white/10 dark:bg-white/[0.02] dark:shadow-none sm:p-9">
                <div className="mp-doc max-w-2xl text-zinc-700 dark:text-zinc-300" dangerouslySetInnerHTML={{ __html: doc.html }} />
              </div>
              {active === 'build-first-module' && <RefLinks navigate={navigate} />}
            </>
          )}
        </article>
      </div>
    </div>
  )
}

/* ---- root ----------------------------------------------------------------- */
export const meta = { name: 'Atelier', icon: 'store', primary: true }

export default function Module() {
  const { path, navigate } = window.__atelier.useRoute()
  const [cat, setCat] = useState(null)

  const loadCatalog = useCallback(() => { fetch(`${self.api}/catalog`).then((r) => r.json()).then(setCat).catch(() => {}) }, [])
  useEffect(() => {
    loadCatalog()
    const unsub = self.subscribe((f) => { if (f.type === 'scan') loadCatalog() })
    return unsub
  }, [loadCatalog])

  const openApp = (uplink, id) => navigate(`app/${encodeURIComponent(uplink)}/${encodeURIComponent(id)}`)

  let view
  if (path.startsWith('app/')) {
    const parts = path.split('/')
    view = <AppDetail uplink={decodeURIComponent(parts[1] || '')} id={decodeURIComponent(parts.slice(2).join('/'))} onBack={() => navigate('')} />
  } else if (path === 'docs' || path.startsWith('docs/')) {
    const slug = path.startsWith('docs/') ? decodeURIComponent(path.slice(5)) : ''
    view = <Docs slug={slug} navigate={navigate} onBack={() => navigate('')} />
  } else if (path === 'config' || path.startsWith('config/')) {
    const sub = path.startsWith('config/') ? path.slice(7) : ''
    view = <Configure sub={sub} navigate={navigate} reload={loadCatalog} onBack={() => navigate('')} />
  } else {
    view = <Catalog cat={cat} onOpen={openApp} onManage={() => navigate('config/marketplaces')} onDocs={(slug) => navigate(typeof slug === 'string' ? 'docs/' + slug : 'docs')} onConfigure={() => navigate('config')} />
  }

  return (
    <div className="text-zinc-950 dark:text-white">
      <style>{`
        @keyframes mp-sway { 0%,100%{transform:translateX(-4px)} 50%{transform:translateX(4px)} }
        @keyframes mp-tilt { 0%,100%{transform:rotate(-2.5deg)} 50%{transform:rotate(2.5deg)} }
        @keyframes mp-drift { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-2px)} }
        .mp-sway{ animation:mp-sway 5s ease-in-out infinite; will-change:transform }
        .mp-tilt{ animation:mp-tilt 7s ease-in-out infinite; will-change:transform }
        .mp-drift{ animation:mp-drift 4s ease-in-out infinite; will-change:transform }
        @media (prefers-reduced-motion: reduce){ .mp-sway,.mp-tilt,.mp-drift{ animation:none } }
        @keyframes mp-pop { 0%{transform:scale(.94);opacity:0} 55%{transform:scale(1.015)} 100%{transform:scale(1);opacity:1} }
        @keyframes mp-draw { to { stroke-dashoffset:0 } }
        .mp-success{ animation:mp-pop .34s cubic-bezier(.2,.8,.2,1) both }
        .mp-ring{ stroke-dasharray:151; stroke-dashoffset:151; animation:mp-draw .45s ease-out .05s forwards }
        .mp-tick{ stroke-dasharray:36; stroke-dashoffset:36; animation:mp-draw .26s ease-out .42s forwards }
        @media (prefers-reduced-motion: reduce){ .mp-success{animation:none} .mp-ring,.mp-tick{animation:none;stroke-dashoffset:0} }
        @keyframes mp-rise { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:none} }
        .mp-savebar{ animation:mp-rise .3s cubic-bezier(.22,1,.36,1) both }
        @media (prefers-reduced-motion: reduce){ .mp-savebar{animation:none} }
        .mp-json{ font-family:var(--font-mono, ui-monospace, monospace); font-size:12.5px; line-height:1.6; white-space:pre-wrap; word-break:break-word; tab-size:2; -moz-tab-size:2; }
        .mp-json .tok-key{ color:#7dd3fc } .mp-json .tok-str{ color:#86efac } .mp-json .tok-num{ color:#fca5a5 } .mp-json .tok-kw{ color:#c4b5fd }
        .mp-json .tok-com{ color:#6b7280 } .mp-json .tok-fn{ color:#fbbf24 } .mp-json .tok-tag{ color:#7dd3fc }
        .mp-prose h3,.mp-prose h4,.mp-prose h5{font-weight:600;color:inherit;margin:1.2em 0 .4em;font-size:.95rem}
        .mp-prose p{margin:.6em 0;line-height:1.6}
        .mp-prose ul,.mp-prose ol{margin:.6em 0;padding-left:1.3em}
        .mp-prose li{margin:.25em 0;line-height:1.55}
        .mp-prose ul{list-style:disc}.mp-prose ol{list-style:decimal}
        .mp-prose code{font-family:var(--font-mono,monospace);font-size:.82em;background:rgba(127,127,127,.16);border-radius:4px;padding:.1em .35em}
        .mp-prose pre{background:rgba(127,127,127,.12);border-radius:.6rem;padding:.85em 1em;overflow-x:auto;margin:.8em 0}
        .mp-prose pre code{background:none;padding:0}
        .mp-prose a{color:#3b82f6;text-decoration:underline;text-underline-offset:2px}
        .mp-prose blockquote{border-left:3px solid rgba(127,127,127,.4);padding-left:1em;margin:.8em 0;color:inherit;opacity:.85}
        .mp-prose strong{font-weight:600;color:inherit}
        .mp-prose hr{border:0;border-top:1px solid rgba(127,127,127,.25);margin:1.2em 0}
        .mp-prose img{max-width:100%;border-radius:.5rem;margin:.6em 0}
        .mp-prose table{width:100%;border-collapse:collapse;margin:.8em 0;font-size:.9em}
        .mp-prose th,.mp-prose td{text-align:left;padding:.4em .6em;border-bottom:1px solid rgba(127,127,127,.2);vertical-align:top}
        .mp-prose th{font-weight:600;color:inherit}

        .mp-doc{font-size:15px;line-height:1.65}
        .mp-doc h2{font-size:1.3rem;font-weight:700;letter-spacing:-.01em;color:inherit;margin:1.9em 0 .6em;padding-top:1.3em;border-top:1px solid rgba(127,127,127,.14)}
        .mp-doc h2:first-child,.mp-doc>:first-child{margin-top:0;padding-top:0;border-top:0}
        .mp-doc h2,.mp-doc h3{scroll-margin-top:1rem}
        .mp-doc h3{font-size:1.05rem;font-weight:600;color:inherit;margin:1.3em 0 .4em}
        .mp-doc p{margin:.75em 0}
        .mp-doc ul,.mp-doc ol{margin:.75em 0;padding-left:1.4em}
        .mp-doc li{margin:.3em 0}
        .mp-doc ul{list-style:disc}.mp-doc ol{list-style:decimal}
        .mp-doc code{font-family:var(--font-mono,monospace);font-size:.85em;background:rgba(127,127,127,.16);border-radius:5px;padding:.12em .4em}
        .mp-doc pre{background:rgba(127,127,127,.1);border:1px solid rgba(127,127,127,.14);border-radius:.7rem;padding:1em 1.1em;margin:1em 0;font-size:13px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}
        .mp-prose pre{white-space:pre-wrap;overflow-wrap:anywhere}
        .mp-doc pre code{background:none;padding:0}
        .mp-doc a{color:#3b82f6;text-decoration:underline;text-underline-offset:2px}
        .mp-doc blockquote{border-left:3px solid rgba(59,130,246,.5);padding:.1em 0 .1em 1em;margin:1em 0;opacity:.9}
        .mp-doc strong{font-weight:600;color:inherit}
        .mp-doc hr{border:0;border-top:1px solid rgba(127,127,127,.25);margin:1.6em 0}
        .mp-doc table{width:100%;border-collapse:collapse;margin:1.1em 0;font-size:13.5px}
        .mp-doc th,.mp-doc td{text-align:left;padding:.55em .75em;border-bottom:1px solid rgba(127,127,127,.22);vertical-align:top}
        .mp-doc th{font-weight:600;color:inherit;border-bottom-width:2px}
        .mp-doc img{max-width:100%;border-radius:.5rem;margin:.8em 0}
      `}</style>
      {view}
    </div>
  )
}
