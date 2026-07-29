/* horse-browser/lib.jsx — shared design system, fitted for the catalyst chrome.
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
@keyframes cl-cursor{ 0%,49%{opacity:1} 50%,100%{opacity:0} }
.cl-cursor{ animation:cl-cursor 1.1s step-end infinite; }

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
  .cl-blink-slow,.cl-cursor,.cl-pop,.cl-tabin,.cl-ripple,.is-in .cl-ink{ animation:none !important; }
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
// One HTTP fetch for initial state, then the shell WebSocket does the rest —
// the backend watches the machine server-side and pushes a full snapshot frame
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
  x: [['path', { d: 'M18 6 6 18' }], ['path', { d: 'm6 6 12 12' }]],
  monitor: [
    ['rect', { width: 20, height: 14, x: 2, y: 3, rx: 2 }],
    ['path', { d: 'M8 21h8' }],
    ['path', { d: 'M12 17v4' }],
  ],
  'shield-check': [
    ['path', { d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.5 3.81 17 5 19 5a1 1 0 0 1 1 1z' }],
    ['path', { d: 'm9 12 2 2 4-4' }],
  ],
  'file-text': [
    ['path', { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' }],
    ['path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' }],
    ['path', { d: 'M10 9H8' }],
    ['path', { d: 'M16 13H8' }],
    ['path', { d: 'M16 17H8' }],
  ],
  'book-open': [
    ['path', { d: 'M12 7v14' }],
    ['path', { d: 'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z' }],
  ],
  square: [['rect', { width: 18, height: 18, x: 3, y: 3, rx: 2 }]],
  activity: [['path', { d: 'M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2' }]],
  'key-round': [
    ['path', { d: 'M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z' }],
    ['circle', { cx: 16.5, cy: 7.5, r: 0.5, fill: 'currentColor' }],
  ],
  lock: [
    ['rect', { width: 18, height: 11, x: 3, y: 11, rx: 2, ry: 2 }],
    ['path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' }],
  ],
  'refresh-cw': [
    ['path', { d: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8' }],
    ['path', { d: 'M21 3v5h-5' }],
    ['path', { d: 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16' }],
    ['path', { d: 'M8 16H3v5' }],
  ],
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

// A focused reading overlay (copied from the claude-md module, dark-hardcoded —
// the night console owns its palette regardless of the chrome's theme).
export function Modal({ onClose, size = 'max-w-2xl', closeOnEsc = true, children }) {
  const [shown, setShown] = useState(false)
  const closing = useRef(false)
  const close = () => { if (closing.current) return; closing.current = true; setShown(false); setTimeout(onClose, 180) }
  useEffect(() => {
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden'
    const onKey = (e) => { if (e.key === 'Escape' && closeOnEsc) close() }
    document.addEventListener('keydown', onKey)
    return () => { cancelAnimationFrame(r); document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [])
  return (
    <div className="cl-root fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto px-3 py-6 sm:items-center sm:px-6 sm:py-12">
      <div onClick={close} className={cn('fixed inset-0 bg-zinc-950/60 backdrop-blur-lg backdrop-saturate-150 transition-opacity duration-200 ease-out', shown ? 'opacity-100' : 'opacity-0')} />
      <div className={cn('relative z-10 flex max-h-[86vh] w-full flex-col overflow-hidden rounded-2xl bg-zinc-900 shadow-2xl ring-1 ring-white/10 transition duration-200 ease-out will-change-transform', size, shown ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-4 scale-[0.97] opacity-0')}>
        {typeof children === 'function' ? children(close) : children}
      </div>
    </div>
  )
}

// Animated copy button — a celebratory "boom" on success: a checkmark draws in
// while particles, rings and sparks burst outward. The exact same element the
// sites module uses (uiverse.io neon checkbox, agent-violet #e8b04b). Keyframes
// injected once. Pass `value` (string or () => string) and an optional `title`.
const CB_PARTICLES = [[26, -22], [-26, -22], [24, 24], [-24, 24], [34, 2], [-34, 2], [2, 34], [-2, -34], [18, -30], [-18, 30], [30, 18], [-30, -18]]
const CB_RING_DELAYS = ['0s', '.08s', '.16s']
const CB_SPARKS = [0, 90, 180, 270]
const CB_CSS = `
.hb-cb__copy,.hb-cb__check{position:absolute;inset:0;width:100%;height:100%}
.hb-cb__copy{transition:opacity .18s ease,transform .18s ease}
.hb-cb__check{fill:none;stroke:#e8b04b;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:26;stroke-dashoffset:26;opacity:0;transform:scale(.5)}
.hb-cb.is-boom .hb-cb__copy{opacity:0;transform:scale(.4)}
.hb-cb.is-boom .hb-cb__check{opacity:1;transform:scale(1);stroke-dashoffset:0;transition:stroke-dashoffset .45s cubic-bezier(.16,1,.3,1) .06s,opacity .12s ease,transform .3s cubic-bezier(.16,1,.3,1)}
.hb-cb__fx{position:absolute;top:50%;left:50%;width:0;height:0;pointer-events:none}
.hb-cb__particles span,.hb-cb__rings span,.hb-cb__sparks span{position:absolute;top:0;left:0;opacity:0}
.hb-cb__particles span{width:5px;height:5px;margin:-2.5px;border-radius:50%;background:#e8b04b;box-shadow:0 0 7px #e8b04b}
.hb-cb.is-boom .hb-cb__particles span{animation:hbCbParticle .62s cubic-bezier(.16,1,.3,1) forwards}
.hb-cb__rings span{width:14px;height:14px;margin:-7px;border-radius:50%;border:1.5px solid #e8b04b}
.hb-cb.is-boom .hb-cb__rings span{animation:hbCbRing .6s ease-out var(--d,0s) forwards}
.hb-cb__sparks span{width:12px;height:1.5px;margin-top:-.75px;border-radius:1px;background:linear-gradient(90deg,#e8b04b,transparent);transform-origin:left center}
.hb-cb.is-boom .hb-cb__sparks span{animation:hbCbSpark .5s ease-out forwards}
@keyframes hbCbParticle{0%{transform:translate(0,0) scale(1);opacity:1}75%{opacity:1}100%{transform:translate(var(--x),var(--y)) scale(.6);opacity:0}}
@keyframes hbCbRing{0%{transform:scale(.2);opacity:.7}100%{transform:scale(2.6);opacity:0}}
@keyframes hbCbSpark{0%{transform:rotate(var(--r)) translateX(3px) scaleX(.7);opacity:1}100%{transform:rotate(var(--r)) translateX(20px) scaleX(0);opacity:0}}
@media(prefers-reduced-motion:reduce){.hb-cb__particles span,.hb-cb__rings span,.hb-cb__sparks span{animation:none!important}}
`
export function CopyBoom({ value, title = 'Copy', className, size, ink }) {
  const [boom, setBoom] = useState(false)
  useEffect(() => {
    if (document.getElementById('hb-boom-kf')) return
    const el = document.createElement('style')
    el.id = 'hb-boom-kf'
    el.textContent = CB_CSS
    document.head.appendChild(el)
  }, [])
  const onCopy = async (e) => {
    e.preventDefault(); e.stopPropagation()
    const v = typeof value === 'function' ? value() : value
    try { if (!navigator.clipboard) return; await navigator.clipboard.writeText(v) } catch { return }
    setBoom(false)
    requestAnimationFrame(() => requestAnimationFrame(() => setBoom(true)))
    setTimeout(() => setBoom(false), 1500)
  }
  return (
    <button type="button" onClick={onCopy} aria-label={title} title={boom ? 'Copied!' : title}
      style={{ ...(size ? { width: size, height: size } : null), ...(ink ? { color: ink } : null) }}
      className={cn('hb-cb relative inline-flex size-[15px] shrink-0 items-center justify-center align-[-3px] text-zinc-400 transition-colors hover:text-zinc-200', boom && 'is-boom', className)}>
      <svg className="hb-cb__copy" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="9" y="9" width="11" height="11" rx="2" />
        <path d="M5 15V5a2 2 0 0 1 2-2h10" />
      </svg>
      <svg className="hb-cb__check" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12.5l4.5 4.5L19 7" />
      </svg>
      <span className="hb-cb__fx" aria-hidden="true">
        <span className="hb-cb__particles">{CB_PARTICLES.map(([x, y], i) => <span key={i} style={{ '--x': `${x}px`, '--y': `${y}px` }} />)}</span>
        <span className="hb-cb__rings">{CB_RING_DELAYS.map((d, i) => <span key={i} style={{ '--d': d }} />)}</span>
        <span className="hb-cb__sparks">{CB_SPARKS.map((r, i) => <span key={i} style={{ '--r': `${r}deg` }} />)}</span>
      </span>
    </button>
  )
}

// A live streaming console — dark code-window for action WS logs.
export function ActionConsole({ entry, title = 'output', onClose, className }) {
  const ref = useRef(null)
  const [closed, setClosed] = useState(false)
  const status = entry && entry.status
  useEffect(() => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight }, [entry && entry.logs && entry.logs.length])
  // a fresh run re-opens the console; it never closes on its own — success and
  // failure both stay on screen until dismissed
  useEffect(() => { if (status === 'running') setClosed(false) }, [status])
  if (closed) return null
  if (!entry || !entry.logs || (!entry.logs.length && status === 'idle')) return null
  const color = (s) => s === 'ok' ? 'text-emerald-400' : s === 'stderr' ? 'text-rose-400' : s === 'cmd' ? 'text-sky-300' : 'text-zinc-300'
  return (
    <div className={cn('cl-pop mt-3 overflow-hidden rounded-xl border border-white/10 shadow-sm', className)}>
      <div className="flex items-center gap-1.5 border-b border-white/10 bg-zinc-900 px-3 py-2">
        <span className="size-2.5 rounded-full bg-red-400/70" /><span className="size-2.5 rounded-full bg-amber-400/70" /><span className="size-2.5 rounded-full bg-green-400/70" />
        <span className="cl-mono ml-2 text-[10.5px] text-zinc-400">{title}{status === 'running' ? ' · running…' : status === 'done' ? ' · done' : status === 'failed' ? ' · failed' : ''}</span>
      </div>
      <div ref={ref} className="cl-mono max-h-56 overflow-auto bg-zinc-950 px-3 pb-4 pt-3 text-[11.5px] leading-relaxed">
        {entry.logs.map((l, i) => <div key={i} className={cn('whitespace-pre-wrap break-words', color(l.stream))}>{l.line}</div>)}
        {status === 'running' && <div className="cl-cursor text-zinc-500">▌</div>}
      </div>
      {status === 'done' && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-emerald-500/25 bg-emerald-500/10 px-3.5 py-3">
          <span className="inline-flex items-center gap-2 text-[15px] font-bold text-emerald-400"><Icon name="check" size={18} /> All done — everything worked.</span>
          <button onClick={() => { setClosed(true); onClose && onClose() }} className="cl-mono text-[11px] text-zinc-400 underline decoration-zinc-600 underline-offset-2 transition-colors hover:text-zinc-200">close</button>
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
