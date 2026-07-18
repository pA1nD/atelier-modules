/* claude-md/lib.jsx — shared design system (extracted from claude5iq's lib.jsx,
 * re-fitted for the catalyst chrome — same lineage as the statusbar and
 * horse-browser modules' libs).
 *
 * Typography rides the chrome's tokens (--font-sans / --font-mono); dark mode
 * via html.dark; icons are inline lucide paths (catalyst exposes no icon
 * global), path data extracted from the chrome's own lucide-react.
 *
 * Per-file transform — no `import React`; JSX compiles to the global React.
 */

const { useState, useEffect, useRef, useCallback } = React
export const cn = (...p) => p.filter(Boolean).join(' ')

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
const STYLE_ID = 'claude-md-module-styles'
const CSS = `
.cl-mono{ font-family: var(--font-mono, ui-monospace,'SF Mono',Menlo,monospace); font-feature-settings:'tnum' 1; }

.cl-reveal{ opacity:0; transform:translateY(14px); transition:opacity .7s cubic-bezier(.16,1,.3,1),transform .7s cubic-bezier(.16,1,.3,1); will-change:opacity,transform; }
.cl-reveal.is-in{ opacity:1; transform:none; }

@keyframes cl-pop{ from{ opacity:0; transform:translateY(4px) scale(.96);} to{ opacity:1; transform:none;} }
.cl-pop{ animation:cl-pop .35s cubic-bezier(.16,1,.3,1) both; }

/* a slow beacon pulse to pull the eye to a primary call-to-action */
@keyframes cl-beacon{ 0%{ box-shadow:0 0 0 0 var(--bc, rgba(217,70,239,.5)); } 70%,100%{ box-shadow:0 0 0 12px transparent; } }
.cl-beacon{ animation:cl-beacon 2.1s cubic-bezier(.4,0,.6,1) infinite; }

@media (prefers-reduced-motion: reduce){
  .cl-reveal{ opacity:1 !important; transform:none !important; transition:none !important; }
  .cl-pop,.cl-beacon{ animation:none !important; }
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

// Track the chrome's dark mode (html.dark) so inline (non-class) colours can adapt.
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
export function useSnapshot(self) {
  const [snap, setSnap] = useState(null)
  const refresh = useCallback(() => {
    fetch(self.api + '/snapshot').then((r) => r.json()).then(setSnap).catch(() => {})
  }, [self.api])
  useEffect(() => {
    refresh()
    return self.subscribe((f) => { if (f.type === 'snapshot' && f.snapshot) setSnap(f.snapshot) })
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
 * Path data extracted from the catalyst chrome's own lucide-react version.
 * `github` is the standard GitHub mark (lucide dropped brand icons) — a fill
 * shape, so its node overrides fill/stroke. */
const ICON_PATHS = {
  layers: [
    ['path', { d: 'M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z' }],
    ['path', { d: 'M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12' }],
    ['path', { d: 'M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17' }],
  ],
  'file-text': [
    ['path', { d: 'M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z' }],
    ['path', { d: 'M14 2v5a1 1 0 0 0 1 1h5' }],
    ['path', { d: 'M10 9H8' }],
    ['path', { d: 'M16 13H8' }],
    ['path', { d: 'M16 17H8' }],
  ],
  x: [['path', { d: 'M18 6 6 18' }], ['path', { d: 'm6 6 12 12' }]],
  github: [['path', { fill: 'currentColor', stroke: 'none', d: 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12' }]],
  'book-open': [
    ['path', { d: 'M12 7v14' }],
    ['path', { d: 'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z' }],
  ],
  star: [['path', { d: 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z' }]],
  plus: [['path', { d: 'M5 12h14' }], ['path', { d: 'M12 5v14' }]],
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

export function Card({ className, ...props }) {
  return <div className={cn('rounded-2xl border border-zinc-950/10 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-900', className)} {...props} />
}

// small accent pill — the eyebrow
export function Eyebrow({ icon, color = '#3b82f6', children }) {
  const dark = useDark()
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide" style={{ background: tint(color, dark ? '2b' : '1f'), color: shade(color, dark ? 0.4 : -0.25) }}>
      {icon && <Icon name={icon} size={12} />}{children}
    </span>
  )
}

/* ── narrative scaffold — ChapterIntro (big idea + plain why) → Step…Step. */
const T = (dark) => ({
  idea: dark ? 'text-white' : 'text-zinc-950',
  why: dark ? 'text-white/70' : 'text-zinc-600', label: dark ? 'text-white/55' : 'text-zinc-400',
  title: dark ? 'text-white' : 'text-zinc-950', lead: dark ? 'text-white/70' : 'text-zinc-600',
})

export function ChapterIntro({ icon, color = '#3b82f6', kicker, idea, why }) {
  const t = T(useDark())
  return (
    <div>
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

// catalyst-style modal: a blurred backdrop that fades in, and a panel that scales/slides
// in separately. The render-prop hands children a `close` that plays the leave animation
// before the parent unmounts it.
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
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto px-3 py-6 sm:items-center sm:px-6 sm:py-12">
      <div onClick={close} className={cn('fixed inset-0 bg-white/40 backdrop-blur-lg backdrop-saturate-150 transition-opacity duration-200 ease-out dark:bg-zinc-950/55', shown ? 'opacity-100' : 'opacity-0')} />
      <div className={cn('relative z-10 flex max-h-[86vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-zinc-950/10 transition duration-200 ease-out will-change-transform dark:bg-zinc-900 dark:ring-white/10', size, shown ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-4 scale-[0.97] opacity-0')}>
        {typeof children === 'function' ? children(close) : children}
      </div>
    </div>
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
