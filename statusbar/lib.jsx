/* statusbar/lib.jsx — shared design system (extracted from claude5iq's lib.jsx,
 * re-fitted for the catalyst chrome).
 *
 * Typography and dark mode ride the chrome's tokens: --font-sans (Inter) via the
 * body, --font-mono (JetBrains Mono) via .cl-mono, dark mode via html.dark.
 * White rounded cards on zinc match catalyst's zinc palette. Monospace is
 * reserved for code/terminal snippets only. Everything cross-cutting lives
 * here: the session-codename engine, the live-data hooks, the inline lucide
 * icons, and the small building blocks both chapters reuse.
 *
 * Per-file transform — no `import React`; JSX compiles to the global React.
 */

const { useState, useEffect, useRef, useCallback } = React
export const cn = (...p) => p.filter(Boolean).join(' ')

/* ───────────────────────── codename engine ───────────────────────────────
 * FNV-1a (32-bit) over the full session id + a finalizer. Byte-identical to
 * ./statusline.sh and the dashboard so the emoji/colour/callsign here MATCH
 * the terminal, the dashboard card, and the browser tab group. */
export const CODE_COLORS = { red: '#dc2626', orange: '#ea580c', yellow: '#ca8a04', green: '#16a34a', cyan: '#0891b2', blue: '#2563eb', purple: '#9333ea', pink: '#db2777' }
// AA-contrast text variants (~700 shades) for callsigns rendered as small text ON WHITE.
export const CODE_INK = { red: '#b91c1c', orange: '#c2410c', yellow: '#a16207', green: '#15803d', cyan: '#0e7490', blue: '#1d4ed8', purple: '#7e22ce', pink: '#be185d' }
// Lighter (~400) variants for callsigns rendered as small text ON DARK surfaces.
export const CODE_INK_DARK = { red: '#f87171', orange: '#fb923c', yellow: '#facc15', green: '#4ade80', cyan: '#22d3ee', blue: '#60a5fa', purple: '#c084fc', pink: '#f472b6' }
export const CODE_ORDER = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink']
export const CODES = [
  { e: '🔥', c: 'red' }, { e: '🍎', c: 'red' }, { e: '🍓', c: 'red' }, { e: '🍒', c: 'red' }, { e: '🌹', c: 'red' }, { e: '🐞', c: 'red' },
  { e: '🦊', c: 'orange' }, { e: '🍊', c: 'orange' }, { e: '🦁', c: 'orange' }, { e: '🐯', c: 'orange' }, { e: '🥕', c: 'orange' }, { e: '🏀', c: 'orange' },
  { e: '🍋', c: 'yellow' }, { e: '🌻', c: 'yellow' }, { e: '⭐', c: 'yellow' }, { e: '🐝', c: 'yellow' }, { e: '🍌', c: 'yellow' }, { e: '🐥', c: 'yellow' },
  { e: '🐸', c: 'green' }, { e: '🍀', c: 'green' }, { e: '🌵', c: 'green' }, { e: '🐢', c: 'green' }, { e: '🌲', c: 'green' }, { e: '🐍', c: 'green' },
  { e: '🐬', c: 'cyan' }, { e: '🌊', c: 'cyan' }, { e: '💎', c: 'cyan' }, { e: '🧊', c: 'cyan' }, { e: '🐳', c: 'cyan' }, { e: '💧', c: 'cyan' },
  { e: '🐧', c: 'blue' }, { e: '🫐', c: 'blue' }, { e: '🦋', c: 'blue' }, { e: '🌀', c: 'blue' }, { e: '🌐', c: 'blue' }, { e: '🐟', c: 'blue' },
  { e: '🦄', c: 'purple' }, { e: '🍇', c: 'purple' }, { e: '🔮', c: 'purple' }, { e: '🐙', c: 'purple' }, { e: '🍆', c: 'purple' }, { e: '👾', c: 'purple' },
  { e: '🌸', c: 'pink' }, { e: '🐷', c: 'pink' }, { e: '🦩', c: 'pink' }, { e: '🍑', c: 'pink' }, { e: '🌷', c: 'pink' }, { e: '🌺', c: 'pink' },
]
export function hash32(s) {
  let h = 0x811c9dc5
  for (let i = 0; i < (s || '').length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16
  return h >>> 0
}
export function hashStages(s) {
  let h = 0x811c9dc5 >>> 0
  for (let i = 0; i < (s || '').length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  const fnv = h >>> 0
  h ^= h >>> 16; const a = h >>> 0; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; const b = h >>> 0
  h = Math.imul(h, 0x846ca68b); h ^= h >>> 16; const fin = h >>> 0
  return { fnv, a, b, fin, slot: fin % 48 }
}
export function sessionCode(id) {
  const slot = CODES[hash32(id || '') % CODES.length]
  return { id, callsign: (id || '').slice(-4).toUpperCase(), emoji: slot.e, color: slot.c, hex: CODE_COLORS[slot.c], ink: CODE_INK[slot.c] }
}
// codename ink that stays legible in either mode (dark→lighter shade, light→darker shade)
export const inkFor = (color, dark) => dark ? (CODE_INK_DARK[color] || CODE_COLORS[color]) : (CODE_INK[color] || CODE_COLORS[color])

/* ───────────────────────── colour helpers (from dock) ────────────────────── */
export function shade(hex, amt) {
  let h = (hex || '#71717a').replace('#', '')
  if (h.length === 3) h = h.split('').map((x) => x + x).join('')
  const ch = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  const mix = (c) => (amt >= 0 ? Math.round(c + (255 - c) * amt) : Math.round(c * (1 + amt)))
  return '#' + ch.map((c) => ('0' + mix(c).toString(16)).slice(-2)).join('')
}
export const tint = (hex, a) => (hex || '#71717a') + a

/* ───────────────────────── injected stylesheet ───────────────────────────
 * Only the motion keyframes + a mono helper Tailwind can't express. Inter and
 * the colour tokens come from the chrome. Idempotent (id-guarded). */
const STYLE_ID = 'statusbar-module-styles'
const CSS = `
.cl-mono{ font-family: var(--font-mono, ui-monospace,'SF Mono',Menlo,monospace); font-feature-settings:'tnum' 1; }

.cl-reveal{ opacity:0; transform:translateY(14px); transition:opacity .7s cubic-bezier(.16,1,.3,1),transform .7s cubic-bezier(.16,1,.3,1); will-change:opacity,transform; }
.cl-reveal.is-in{ opacity:1; transform:none; }

/* the only repeating animation kept: a terminal cursor (idiomatic, tiny) */
@keyframes cl-blink{ 0%,48%{opacity:1} 49%,100%{opacity:0} }
.cl-cursor{ animation:cl-blink 1.1s step-end infinite; }
@keyframes cl-blink-slow{ 0%,100%{opacity:1} 50%{opacity:.25} }
.cl-blink-slow{ animation:cl-blink-slow 1.5s ease-in-out infinite; }

@keyframes cl-pop{ from{ opacity:0; transform:translateY(4px) scale(.96);} to{ opacity:1; transform:none;} }
.cl-pop{ animation:cl-pop .35s cubic-bezier(.16,1,.3,1) both; }

/* a slow beacon pulse to pull the eye to a primary call-to-action */
@keyframes cl-beacon{ 0%{ box-shadow:0 0 0 0 var(--bc, rgba(139,92,246,.5)); } 70%,100%{ box-shadow:0 0 0 12px transparent; } }
.cl-beacon{ animation:cl-beacon 2.1s cubic-bezier(.4,0,.6,1) infinite; }

@media (prefers-reduced-motion: reduce){
  .cl-reveal{ opacity:1 !important; transform:none !important; transition:none !important; }
  .cl-cursor,.cl-blink-slow,.cl-pop,.cl-beacon{ animation:none !important; }
  .cl-root *,.cl-root *::before,.cl-root *::after{ animation-duration:.001ms !important; transition-duration:.001ms !important; scroll-behavior:auto !important; }
}
`
export function useChromeStyles() {
  useEffect(() => {
    if (!document.getElementById(STYLE_ID)) {
      const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS
      document.head.appendChild(s)
    }
  }, [])
}

// Track the chrome's system dark mode (html.dark) so inline (non-class) colours —
// codename inks especially — can pick a dark-legible shade. Classes use `dark:`.
export function useDark() {
  const [dark, setDark] = useState(() => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const el = document.documentElement
    const sync = () => setDark(el.classList.contains('dark'))
    sync()
    const obs = new MutationObserver(sync); obs.observe(el, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return dark
}

/* ───────────────────────── live-data hooks ───────────────────────────────── */
// One HTTP fetch for initial state, then the shell WebSocket does the rest —
// the backend watches its sources server-side and pushes a full snapshot frame
// whenever anything changed. No client-side polling.
// Presence + freshness in ONE bounded loop: while the tab is VISIBLE, the
// snapshot is re-GET every 45s — that stamps the backend watcher awake (it
// idles within 90s otherwise) and heals any frame the WS lost across a
// reconnect. Flood-safe by construction: fixed cadence (failures never speed
// it up), single-flight, 10s abort, hidden tabs send nothing.
export function useSnapshot(self) {
  const [snap, setSnap] = useState(null)
  const busyRef = useRef(false)
  const lastRef = useRef(0)
  const refresh = useCallback(async () => {
    if (busyRef.current) return
    busyRef.current = true; lastRef.current = Date.now()
    try {
      const r = await fetch(self.api + '/snapshot', { signal: AbortSignal.timeout(10000) })
      if (r.ok) setSnap(await r.json())
    } catch {} finally { busyRef.current = false }
  }, [self.api])
  useEffect(() => {
    refresh()
    const unsub = self.subscribe((f) => { if (f.type === 'snapshot' && f.snapshot) setSnap(f.snapshot) })
    const t = setInterval(() => { if (!document.hidden) refresh() }, 45000)
    const onVis = () => { if (!document.hidden && Date.now() - lastRef.current > 5000) refresh() }
    document.addEventListener('visibilitychange', onVis)
    return () => { unsub(); clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
  }, [refresh])
  return { snap, refresh }
}

export function useActions(self) {
  const [byId, setById] = useState({})
  useEffect(() => self.subscribe((f) => {
    if (f.type === 'action-log') setById((s) => { const cur = s[f.actionId] || { status: 'running', logs: [] }; return { ...s, [f.actionId]: { ...cur, status: cur.status === 'idle' ? 'running' : cur.status, logs: [...cur.logs, { stream: f.stream, line: f.line }].slice(-400) } } })
    if (f.type === 'action-done') setById((s) => ({ ...s, [f.actionId]: { ...(s[f.actionId] || { logs: [] }), status: f.ok ? 'done' : 'failed' } }))
  }), [])
  const run = useCallback(async (id, body = {}) => {
    setById((s) => ({ ...s, [id]: { status: 'running', logs: [], needsConfirm: null } }))
    const r = await fetch(self.api + '/action/' + id, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((x) => x.json()).catch((e) => ({ ok: false, error: String(e) }))
    if (r && r.needsConfirm) setById((s) => ({ ...s, [id]: { status: 'confirm', logs: [], needsConfirm: r } }))
    return r
  }, [self.api])
  return { byId, run }
}

export function useReveal(opts = {}) {
  const ref = useRef(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const io = new IntersectionObserver((es) => { es.forEach((e) => { if (e.isIntersecting) { setInView(true); io.unobserve(el) } }) },
      { rootMargin: opts.rootMargin || '-10% 0px -10% 0px', threshold: opts.threshold || 0.12 })
    io.observe(el); return () => io.disconnect()
  }, [])
  return [ref, inView]
}

/* ───────────────────────── icons — inline lucide paths ─────────────────────
 * The catalyst chrome bundles lucide-react privately for the rail and exposes
 * no icon global, so (like the other modules in this instance) we inline the
 * handful of lucide paths we use. Path data extracted from the chrome's own
 * lucide-react version, so these match the rail stroke-for-stroke. */
const ICON_PATHS = {
  terminal: [['path', { d: 'M12 19h8' }], ['path', { d: 'm4 17 6-6-6-6' }]],
  check: [['path', { d: 'M20 6 9 17l-5-5' }]],
  fingerprint: [
    ['path', { d: 'M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4' }],
    ['path', { d: 'M14 13.12c0 2.38 0 6.38-1 8.88' }],
    ['path', { d: 'M17.29 21.02c.12-.6.43-2.3.5-3.02' }],
    ['path', { d: 'M2 12a10 10 0 0 1 18-6' }],
    ['path', { d: 'M2 16h.01' }],
    ['path', { d: 'M21.8 16c.2-2 .131-5.354 0-6' }],
    ['path', { d: 'M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2' }],
    ['path', { d: 'M8.65 22c.21-.66.45-1.32.57-2' }],
    ['path', { d: 'M9 6.8a6 6 0 0 1 9 5.2v2' }],
  ],
  'chevron-down': [['path', { d: 'm6 9 6 6 6-6' }]],
  'arrow-right': [['path', { d: 'M5 12h14' }], ['path', { d: 'm12 5 7 7-7 7' }]],
  'layout-dashboard': [
    ['rect', { width: 7, height: 9, x: 3, y: 3, rx: 1 }],
    ['rect', { width: 7, height: 5, x: 14, y: 3, rx: 1 }],
    ['rect', { width: 7, height: 9, x: 14, y: 12, rx: 1 }],
    ['rect', { width: 7, height: 5, x: 3, y: 16, rx: 1 }],
  ],
  globe: [
    ['circle', { cx: 12, cy: 12, r: 10 }],
    ['path', { d: 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20' }],
    ['path', { d: 'M2 12h20' }],
  ],
  package: [
    ['path', { d: 'M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z' }],
    ['path', { d: 'M12 22V12' }],
    ['polyline', { points: '3.29 7 12 12 20.71 7' }],
    ['path', { d: 'm7.5 4.27 9 5.15' }],
  ],
  sparkles: [
    ['path', { d: 'M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z' }],
    ['path', { d: 'M20 2v4' }],
    ['path', { d: 'M22 4h-4' }],
    ['circle', { cx: 4, cy: 20, r: 2 }],
  ],
  square: [['rect', { width: 18, height: 18, x: 3, y: 3, rx: 2 }]],
}
export function Icon({ name, size = 16, strokeWidth = 1.85, className = '', style }) {
  const nodes = ICON_PATHS[name] || ICON_PATHS.square
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      className={cn('inline-block shrink-0', className)} style={style}>
      {nodes.map(([Tag, attrs], i) => React.createElement(Tag, { key: i, ...attrs }))}
    </svg>
  )
}

// A chapter's mark — an outline, accent-tinted box with a line icon.
export function SystemIcon({ icon, color = '#71717a', size = 40, className }) {
  return (
    <span className={cn('grid shrink-0 place-items-center rounded-xl', className)}
      style={{ width: size, height: size, border: `1px solid ${color}40`, background: `${color}12`, color }}>
      <Icon name={icon} size={Math.round(size * 0.5)} strokeWidth={1.9} />
    </span>
  )
}

/* ───────────────────────── shared building blocks ────────────────────────── */
export function Reveal({ as = 'div', delay = 0, className = '', children, ...rest }) {
  const [ref, inView] = useReveal()
  const Tag = as
  return <Tag ref={ref} className={cn('cl-reveal', inView && 'is-in', className)} style={{ transitionDelay: `${delay}ms` }} {...rest}>{children}</Tag>
}

export function Card({ className, ...props }) {
  return <div className={cn('rounded-2xl border border-zinc-950/10 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-900', className)} {...props} />
}

// small accent pill — the dock "eyebrow"
export function Eyebrow({ icon, color = '#3b82f6', children }) {
  const dark = useDark()
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide" style={{ background: tint(color, dark ? '2b' : '1f'), color: shade(color, dark ? 0.4 : -0.25) }}>
      {icon && <Icon name={icon} size={12} />}{children}
    </span>
  )
}

/* ── narrative scaffold — the repeated elements that give the page a through-line.
 *    Both chapters read the same way: ChapterIntro (the big idea, in plain
 *    language) → Step…Step (one idea at a time, labeled). */
const T = (dark) => ({
  prog: dark ? 'text-white/45' : 'text-zinc-400', idea: dark ? 'text-white' : 'text-zinc-950',
  why: dark ? 'text-white/70' : 'text-zinc-600', label: dark ? 'text-white/55' : 'text-zinc-400',
  title: dark ? 'text-white' : 'text-zinc-950', lead: dark ? 'text-white/70' : 'text-zinc-600',
})

// the repeated chapter opener: progress · icon · kicker · BIG IDEA · plain WHY
export function ChapterIntro({ n, total = 2, icon, color = '#3b82f6', kicker, idea, why }) {
  const t = T(useDark())
  return (
    <div>
      <div className={cn('cl-mono mb-5 text-[12px] font-medium tracking-wide', t.prog)}>Part {n} of 0{total}</div>
      <div className="flex items-start gap-4">
        <SystemIcon icon={icon} color={color} size={52} className="mt-0.5" />
        <div>
          <Eyebrow color={color}>{kicker}</Eyebrow>
          <h2 className={cn('mt-2.5 max-w-2xl text-[27px] font-bold leading-[1.08] tracking-tight sm:text-[36px]', t.idea)}>{idea}</h2>
        </div>
      </div>
      {why && <p className={cn('mt-5 max-w-2xl text-[17px] leading-relaxed', t.why)}>{why}</p>}
    </div>
  )
}

// a repeated step inside a chapter — the labelled rhythm that orients the reader
export function Step({ label, color = '#3b82f6', title, lead, children, className }) {
  const t = T(useDark())
  return (
    <section className={cn('mt-12 sm:mt-16', className)}>
      {label && (
        <div className="mb-3 flex items-center gap-2.5">
          <span className="inline-block h-4 w-1 rounded-full" style={{ background: color }} />
          <span className={cn('text-[12px] font-semibold uppercase tracking-[0.14em]', t.label)}>{label}</span>
        </div>
      )}
      {title && <h3 className={cn('max-w-2xl text-[20px] font-semibold tracking-tight', t.title)}>{title}</h3>}
      {lead && <p className={cn('mt-2 max-w-2xl text-[15.5px] leading-relaxed', t.lead)}>{lead}</p>}
      <div className={cn(title || lead ? 'mt-5' : '')}>{children}</div>
    </section>
  )
}

// installed version tag — shown next to jq once it's on the machine.
export function VersionTag({ v, run, dark }) {
  if (!v || !v.installed) return null
  const update = v.latest && v.upToDate === false && v.action
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <code className={cn('cl-mono rounded px-1.5 py-0.5 text-[10.5px] font-medium', dark ? 'bg-white/10 text-zinc-400' : 'bg-zinc-950/[0.05] text-zinc-500 dark:bg-white/10 dark:text-zinc-400')}>{v.version ? 'v' + v.version : 'installed'}</code>
      {update ? (
        <>
          <span className={cn('text-[11px] font-medium', dark ? 'text-amber-400' : 'text-amber-600 dark:text-amber-400')}>v{v.latest} available</span>
          {run && <button onClick={() => run(v.action, { confirm: true })} className={cn('rounded-full border px-2 py-[3px] text-[10.5px] font-semibold transition', dark ? 'border-amber-400/40 text-amber-300 hover:bg-amber-400/10' : 'border-amber-500/40 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300')}>Update</button>}
        </>
      ) : v.upToDate === true ? (
        <span className={cn('text-[10.5px]', dark ? 'text-zinc-500' : 'text-zinc-400 dark:text-zinc-500')}>up to date</span>
      ) : null}
    </span>
  )
}

// A live streaming console — the dock code-window, dark, for action WS logs.
export function ActionConsole({ entry, title = 'output', onClose }) {
  const ref = useRef(null)
  const [closed, setClosed] = useState(false)
  const [count, setCount] = useState(5)
  const [autoClose, setAutoClose] = useState(true)
  const status = entry && entry.status
  useEffect(() => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight }, [entry && entry.logs && entry.logs.length])
  // a fresh run re-opens the console and re-arms the auto-close
  useEffect(() => { if (status === 'running') { setClosed(false); setAutoClose(true); setCount(5) } }, [status])
  // on success, count down from 5s then close (unless the user chose to keep it open); failures stay open
  useEffect(() => {
    if (status !== 'done' || !autoClose) return
    let c = 5; setCount(c)
    const iv = setInterval(() => { c -= 1; setCount(c); if (c <= 0) { clearInterval(iv); setClosed(true); onClose && onClose() } }, 1000)
    return () => clearInterval(iv)
  }, [status, autoClose])
  if (closed) return null
  if (!entry || !entry.logs || (!entry.logs.length && status === 'idle')) return null
  const color = (s) => s === 'ok' ? 'text-emerald-400' : s === 'stderr' ? 'text-rose-400' : s === 'cmd' ? 'text-sky-300' : 'text-zinc-300'
  return (
    <div className="cl-pop mt-3 overflow-hidden rounded-xl border border-zinc-950/10 shadow-sm dark:border-white/10">
      <div className="flex items-center gap-1.5 border-b border-white/10 bg-zinc-900 px-3 py-2">
        <span className="size-2.5 rounded-full bg-red-400/70" /><span className="size-2.5 rounded-full bg-amber-400/70" /><span className="size-2.5 rounded-full bg-green-400/70" />
        <span className="cl-mono ml-2 text-[10.5px] text-zinc-400">{title}{status === 'running' ? ' · running…' : status === 'done' ? ' · done' : status === 'failed' ? ' · failed' : ''}</span>
      </div>
      <div ref={ref} className="cl-mono max-h-56 overflow-auto bg-zinc-950 p-3 text-[11.5px] leading-relaxed">
        {entry.logs.map((l, i) => <div key={i} className={cn('whitespace-pre-wrap break-words', color(l.stream))}>{l.line}</div>)}
        {status === 'running' && <div className="text-zinc-600">▌</div>}
      </div>
      {status === 'done' && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-emerald-500/25 bg-emerald-500/10 px-3.5 py-3">
          <span className="inline-flex items-center gap-2 text-[15px] font-bold text-emerald-400"><Icon name="check" size={18} /> All done — everything worked.</span>
          {autoClose
            ? <span className="cl-mono text-[11px] text-zinc-400">closing in {count}s · <button onClick={() => setAutoClose(false)} className="underline decoration-zinc-600 underline-offset-2 transition-colors hover:text-zinc-200">keep open</button></span>
            : <button onClick={() => { setClosed(true); onClose && onClose() }} className="cl-mono text-[11px] text-zinc-400 underline decoration-zinc-600 underline-offset-2 transition-colors hover:text-zinc-200">close</button>}
        </div>
      )}
      {status === 'failed' && (
        <div className="flex items-center gap-2 border-t border-rose-500/25 bg-rose-500/10 px-3.5 py-2.5 text-[12.5px] font-semibold text-rose-300">
          <span className="size-2 shrink-0 rounded-full bg-rose-400" /> Didn’t finish — left open so you can see what happened.
        </div>
      )}
    </div>
  )
}
