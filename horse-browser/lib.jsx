/* horse-browser/lib.jsx — shared design system (extracted from claude5iq's
 * lib.jsx, re-fitted for the catalyst chrome — same lineage as the statusbar
 * module's lib).
 *
 * This module is the dark "night console", so ChapterIntro/Step keep their
 * dark-palette variants. Typography rides the chrome's tokens (--font-sans /
 * --font-mono); icons are inline lucide paths (catalyst exposes no icon
 * global), path data extracted from the chrome's own lucide-react.
 *
 * Per-file transform — no `import React`; JSX compiles to the global React.
 */

const { useState, useEffect, useRef, useCallback } = React
export const cn = (...p) => p.filter(Boolean).join(' ')

/* ───────────────────────── codename inks ──────────────────────────────────
 * The process wall paints session callsigns; same palette as the statusline. */
export const CODE_COLORS = { red: '#dc2626', orange: '#ea580c', yellow: '#ca8a04', green: '#16a34a', cyan: '#0891b2', blue: '#2563eb', purple: '#9333ea', pink: '#db2777' }
export const CODE_INK = { red: '#b91c1c', orange: '#c2410c', yellow: '#a16207', green: '#15803d', cyan: '#0e7490', blue: '#1d4ed8', purple: '#7e22ce', pink: '#be185d' }
export const CODE_INK_DARK = { red: '#f87171', orange: '#fb923c', yellow: '#facc15', green: '#4ade80', cyan: '#22d3ee', blue: '#60a5fa', purple: '#c084fc', pink: '#f472b6' }
export const inkFor = (color, dark) => dark ? (CODE_INK_DARK[color] || CODE_COLORS[color]) : (CODE_INK[color] || CODE_COLORS[color])

/* ───────────────────────── colour helpers ─────────────────────────────────── */
export function shade(hex, amt) {
  let h = (hex || '#71717a').replace('#', '')
  if (h.length === 3) h = h.split('').map((x) => x + x).join('')
  const ch = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  const mix = (c) => (amt >= 0 ? Math.round(c + (255 - c) * amt) : Math.round(c * (1 + amt)))
  return '#' + ch.map((c) => ('0' + mix(c).toString(16)).slice(-2)).join('')
}
export const tint = (hex, a) => (hex || '#71717a') + a

/* ───────────────────────── injected stylesheet ────────────────────────────── */
const STYLE_ID = 'horse-browser-module-styles'
const CSS = `
.cl-mono{ font-family: var(--font-mono, ui-monospace,'SF Mono',Menlo,monospace); font-feature-settings:'tnum' 1; }

.cl-reveal{ opacity:0; transform:translateY(14px); transition:opacity .7s cubic-bezier(.16,1,.3,1),transform .7s cubic-bezier(.16,1,.3,1); will-change:opacity,transform; }
.cl-reveal.is-in{ opacity:1; transform:none; }

@keyframes cl-blink-slow{ 0%,100%{opacity:1} 50%{opacity:.25} }
.cl-blink-slow{ animation:cl-blink-slow 1.5s ease-in-out infinite; }

@keyframes cl-pop{ from{ opacity:0; transform:translateY(4px) scale(.96);} to{ opacity:1; transform:none;} }
.cl-pop{ animation:cl-pop .35s cubic-bezier(.16,1,.3,1) both; }

/* the banner develops like a print coming up in the tray */
@keyframes cl-ink{ from{ clip-path:inset(0 100% 0 0); filter:saturate(.5) brightness(.7);} to{ clip-path:inset(0 0 0 0); filter:none;} }
.is-in .cl-ink{ animation:cl-ink 1.8s cubic-bezier(.16,1,.3,1) forwards; }

/* a tab fading into the wall as its agent joins (scroll + cursor are JS-driven) */
@keyframes cl-tabin{ 0%{opacity:0;transform:scale(.965)} 100%{opacity:1;transform:scale(1)} }
.cl-tabin{ animation:cl-tabin .5s ease-out both; }
/* a click ripple where an agent taps a button */
@keyframes cl-ripple{ 0%{transform:translate(-50%,-50%) scale(.35);opacity:.72} 100%{transform:translate(-50%,-50%) scale(1.7);opacity:0} }
.cl-ripple{ animation:cl-ripple .6s ease-out forwards; }

@media (prefers-reduced-motion: reduce){
  .cl-reveal{ opacity:1 !important; transform:none !important; transition:none !important; }
  .cl-blink-slow,.cl-pop,.cl-tabin,.cl-ripple,.is-in .cl-ink{ animation:none !important; }
  .cl-ink{ clip-path:none !important; filter:none !important; }
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

// Track the chrome's dark mode (html.dark) — inline codename inks pick a legible shade.
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
export function useSnapshot(self, intervalMs = 4500) {
  const [snap, setSnap] = useState(null)
  const refresh = useCallback(() => {
    fetch(self.api + '/snapshot').then((r) => r.json()).then(setSnap).catch(() => {})
  }, [self.api])
  useEffect(() => {
    refresh()
    const t = setInterval(refresh, intervalMs)
    const unsub = self.subscribe((f) => { if (f.type === 'snapshot-dirty') setTimeout(refresh, 250) })
    return () => { clearInterval(t); unsub && unsub() }
  }, [refresh, intervalMs])
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
 * Path data extracted from the catalyst chrome's own lucide-react version. */
const ICON_PATHS = {
  compass: [
    ['circle', { cx: 12, cy: 12, r: 10 }],
    ['path', { d: 'm16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z' }],
  ],
  'chevron-up': [['path', { d: 'm18 15-6-6-6 6' }]],
  'panel-left-close': [
    ['rect', { width: 18, height: 18, x: 3, y: 3, rx: 2 }],
    ['path', { d: 'M9 3v18' }],
    ['path', { d: 'm16 15-3-3 3-3' }],
  ],
  'layout-grid': [
    ['rect', { width: 7, height: 7, x: 3, y: 3, rx: 1 }],
    ['rect', { width: 7, height: 7, x: 14, y: 3, rx: 1 }],
    ['rect', { width: 7, height: 7, x: 14, y: 14, rx: 1 }],
    ['rect', { width: 7, height: 7, x: 3, y: 14, rx: 1 }],
  ],
  search: [['path', { d: 'm21 21-4.34-4.34' }], ['circle', { cx: 11, cy: 11, r: 8 }]],
  plus: [['path', { d: 'M5 12h14' }], ['path', { d: 'M12 5v14' }]],
  'arrow-left': [['path', { d: 'm12 19-7-7 7-7' }], ['path', { d: 'M19 12H5' }]],
  'arrow-right': [['path', { d: 'M5 12h14' }], ['path', { d: 'm12 5 7 7-7 7' }]],
  'rotate-cw': [
    ['path', { d: 'M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8' }],
    ['path', { d: 'M21 3v5h-5' }],
  ],
  star: [['path', { d: 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z' }]],
  check: [['path', { d: 'M20 6 9 17l-5-5' }]],
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

// small accent pill — the eyebrow
export function Eyebrow({ icon, color = '#3b82f6', dark, children }) {
  const dk = dark ?? useDark()
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide" style={{ background: tint(color, dk ? '2b' : '1f'), color: shade(color, dk ? 0.4 : -0.25) }}>
      {icon && <Icon name={icon} size={12} />}{children}
    </span>
  )
}

/* ── narrative scaffold — ChapterIntro (big idea + plain why) → Step…Step.
 *    `dark` pins the night-console palette regardless of the chrome's mode. */
const T = (dark) => ({
  idea: dark ? 'text-white' : 'text-zinc-950',
  why: dark ? 'text-white/70' : 'text-zinc-600', label: dark ? 'text-white/55' : 'text-zinc-400',
  title: dark ? 'text-white' : 'text-zinc-950', lead: dark ? 'text-white/70' : 'text-zinc-600',
})

export function ChapterIntro({ icon, color = '#3b82f6', kicker, idea, why, dark }) {
  const dk = dark ?? useDark()
  const t = T(dk)
  return (
    <div>
      <div className="flex items-start gap-4">
        <SystemIcon icon={icon} color={color} size={52} className="mt-0.5" />
        <div>
          <Eyebrow color={color} dark={dk}>{kicker}</Eyebrow>
          <h2 className={cn('mt-2.5 max-w-2xl text-[27px] font-bold leading-[1.08] tracking-tight sm:text-[36px]', t.idea)}>{idea}</h2>
        </div>
      </div>
      {why && <p className={cn('mt-5 max-w-2xl text-[17px] leading-relaxed', t.why)}>{why}</p>}
    </div>
  )
}

export function Step({ label, color = '#3b82f6', title, lead, children, dark, className }) {
  const t = T(dark ?? useDark())
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

// installed version + a clean "v{latest} available → Update" (an update is always a
// fresh install from the source of truth — npm / PyPI — never a kept copy).
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

// A live streaming console — dark code-window for action WS logs.
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
    <div className="cl-pop mt-3 overflow-hidden rounded-xl border border-white/10 shadow-sm">
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
