/* claude/lib.jsx — shared design system, in the DOCK design language.
 *
 * Inter-first (the chrome's sans), white rounded cards on zinc, the signature
 * blue→indigo→violet gradient, and dock's squircle app-icons. Monospace is
 * reserved for code/terminal snippets only. Everything cross-cutting lives here:
 * the session-codename engine, the live-data hooks, the squircle + Lucide
 * primitives, and the small building blocks every chapter reuses.
 *
 * Per-file transform — no `import React`; JSX compiles to the global React.
 */

const { useState, useEffect, useRef, useCallback } = React
export const cn = (...p) => p.filter(Boolean).join(' ')

/* ───────────────────────── codename engine ───────────────────────────────
 * FNV-1a (32-bit) over the full session id + a finalizer. Byte-identical to
 * projects/statusline.sh and the dashboard so the emoji/colour/callsign here
 * MATCH the terminal, the dashboard card, and the browser tab group. */
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
const STYLE_ID = 'claude-onboarding-styles'
const CSS = `
.cl-root{ --horse:#34d399; --agent:#7c5cff; --cream:#faf9f5; --paper:#f0eee6; --ink:#141413; --coral:#d97757; --coral-deep:#c15f3c; }
.cl-mono{ font-family: var(--font-mono, ui-monospace,'SF Mono',Menlo,monospace); font-feature-settings:'tnum' 1; }
/* Claude brand display serif (Tiempos-like; falls back to Georgia, Claude's own fallback) */
.cl-serif{ font-family:'Newsreader', Georgia, 'Times New Roman', serif; font-optical-sizing:auto; }

.cl-reveal{ opacity:0; transform:translateY(14px); transition:opacity .7s cubic-bezier(.16,1,.3,1),transform .7s cubic-bezier(.16,1,.3,1); will-change:opacity,transform; }
.cl-reveal.is-in{ opacity:1; transform:none; }

.cl-draw{ stroke-dasharray:var(--len,400); stroke-dashoffset:var(--len,400); }
.is-in .cl-draw{ animation:cl-dash 1.4s cubic-bezier(.16,1,.3,1) forwards; animation-delay:var(--d,0s); }
@keyframes cl-dash{ to{ stroke-dashoffset:0; } }

/* the only repeating animation kept: a terminal cursor (idiomatic, tiny) */
@keyframes cl-blink{ 0%,48%{opacity:1} 49%,100%{opacity:0} }
.cl-cursor{ animation:cl-blink 1.1s step-end infinite; }
@keyframes cl-blink-slow{ 0%,100%{opacity:1} 50%{opacity:.25} }
.cl-blink-slow{ animation:cl-blink-slow 1.5s ease-in-out infinite; }

@keyframes cl-ink{ from{ clip-path:inset(0 100% 0 0); filter:saturate(.5) brightness(.7);} to{ clip-path:inset(0 0 0 0); filter:none;} }
.is-in .cl-ink{ animation:cl-ink 1.8s cubic-bezier(.16,1,.3,1) forwards; }

@keyframes cl-slam{ 0%{transform:translateY(8px) scale(.98); opacity:.6} 60%{transform:translateY(-4px) scale(1.01)} 100%{transform:none; opacity:1} }
.cl-slam{ animation:cl-slam .5s cubic-bezier(.16,1,.3,1); }

@keyframes cl-pop{ from{ opacity:0; transform:translateY(4px) scale(.96);} to{ opacity:1; transform:none;} }
.cl-pop{ animation:cl-pop .35s cubic-bezier(.16,1,.3,1) both; }

/* a slow beacon pulse to pull the eye to a primary call-to-action */
@keyframes cl-beacon{ 0%{ box-shadow:0 0 0 0 var(--bc, rgba(139,92,246,.5)); } 70%,100%{ box-shadow:0 0 0 12px transparent; } }
.cl-beacon{ animation:cl-beacon 2.1s cubic-bezier(.4,0,.6,1) infinite; }

/* a tab fading into the wall as its agent joins (scroll + cursor are JS-driven) */
@keyframes cl-tabin{ 0%{opacity:0;transform:scale(.965)} 100%{opacity:1;transform:scale(1)} }
.cl-tabin{ animation:cl-tabin .5s ease-out both; }
/* a click ripple where an agent taps a button */
@keyframes cl-ripple{ 0%{transform:translate(-50%,-50%) scale(.35);opacity:.72} 100%{transform:translate(-50%,-50%) scale(1.7);opacity:0} }
.cl-ripple{ animation:cl-ripple .6s ease-out forwards; }

.cl-chev{ transition:transform .2s ease; }
.cl-aside[open] .cl-chev{ transform:rotate(180deg); }

@media (prefers-reduced-motion: reduce){
  .cl-reveal{ opacity:1 !important; transform:none !important; transition:none !important; }
  .cl-draw{ stroke-dashoffset:0 !important; animation:none !important; }
  .cl-cursor,.cl-blink-slow,.cl-tabin,.cl-ripple,.is-in .cl-ink,.cl-slam,.cl-pop,.cl-beacon{ animation:none !important; }
  .cl-ink{ clip-path:none !important; filter:none !important; }
  .cl-root *,.cl-root *::before,.cl-root *::after{ animation-duration:.001ms !important; transition-duration:.001ms !important; scroll-behavior:auto !important; }
}
`
export function useChromeStyles() {
  useEffect(() => {
    if (!document.getElementById('cl-fonts')) {
      const l = document.createElement('link'); l.id = 'cl-fonts'; l.rel = 'stylesheet'
      l.href = 'https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&display=swap'
      document.head.appendChild(l)
    }
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

/* ───────────────────────── Lucide + squircle (dock signatures) ────────────── */
export function Icon({ name, size = 16, strokeWidth = 1.85, className = '', style }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!name || !ref.current) return
    ref.current.innerHTML = ''
    const i = document.createElement('i'); i.setAttribute('data-lucide', name)
    ref.current.appendChild(i)
    try { window.lucide?.createIcons({ attrs: { width: size, height: size, 'stroke-width': strokeWidth } }) } catch {}
  }, [name, size, strokeWidth])
  return <span ref={ref} aria-hidden="true" className={cn('inline-flex shrink-0 items-center justify-center', className)} style={{ width: size, height: size, ...style }} />
}

// catalyst-style modal: a blurred light backdrop that fades in, and a panel that scales/slides
// in *separately* (animating the whole overlay was what made the old one "flip"). The render-prop
// hands children a `close` that plays the leave animation before the parent unmounts it.
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

// A SYSTEM's mark — deliberately NOT the filled squircle app-tile (that identity
// is reserved for modules). An outline, accent-tinted box with a line icon.
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
 *    Every chapter reads the same way: ChapterIntro (the big idea + why it matters,
 *    in plain language) → Step…Step (one idea at a time, labeled) → ChapterClose
 *    (the payoff + the next chapter). `dark` flips the palette for chapter 04. */
const T = (dark) => ({
  prog: dark ? 'text-white/45' : 'text-zinc-400', idea: dark ? 'text-white' : 'text-zinc-950',
  why: dark ? 'text-white/70' : 'text-zinc-600', label: dark ? 'text-white/55' : 'text-zinc-400',
  title: dark ? 'text-white' : 'text-zinc-950', lead: dark ? 'text-white/70' : 'text-zinc-600',
  rule: dark ? 'bg-white/25' : 'bg-zinc-300',
})

// the repeated chapter opener: progress · icon · kicker · BIG IDEA · plain WHY
export function ChapterIntro({ n, total = 5, icon, color = '#3b82f6', kicker, idea, why, dark }) {
  const dk = dark || useDark()
  const t = T(dk)
  return (
    <div>
      <div className={cn('cl-mono mb-5 flex items-center gap-2.5 text-[12px] font-medium tracking-wide', t.prog)}>
        <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: dk ? 'rgba(217,119,87,0.22)' : 'rgba(217,119,87,0.14)', color: dk ? '#eab69e' : '#b8502f' }}>+1 IQ</span>
        <span>System {n} of 0{total}</span>
      </div>
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
export function Step({ label, color = '#3b82f6', title, lead, children, dark, className }) {
  const t = T(dark || useDark())
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

// the repeated chapter close — confidence (what you gained) + the path forward
export function ChapterClose({ color = '#3b82f6', gained, onNext, nextTitle, dark }) {
  const dk = dark || useDark()
  return (
    <div className={cn('mt-14 flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6', dk ? 'border-white/10 bg-white/[0.04]' : 'border-zinc-950/10 bg-zinc-50')}>
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full text-white" style={{ background: color }}><Icon name="check" size={18} /></span>
        <div>
          <div className="flex items-center gap-2">
            <span className={cn('text-[15px] font-semibold', dk ? 'text-white' : 'text-zinc-950')}>You’ve got it</span>
            <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: '#d97757' }}>+1 IQ banked</span>
          </div>
          <p className={cn('mt-0.5 max-w-md text-[14px] leading-relaxed', dk ? 'text-white/60' : 'text-zinc-500')}>{gained}</p>
        </div>
      </div>
      {onNext && nextTitle && (
        <button onClick={onNext} className={cn('inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg px-4 py-2.5 text-[13px] font-semibold transition sm:self-auto', dk ? 'bg-white text-zinc-900 hover:bg-white/90' : 'bg-zinc-900 text-white hover:bg-zinc-700')}>
          Next: {nextTitle} <Icon name="arrow-right" size={15} />
        </button>
      )}
    </div>
  )
}

// A live streaming console — the dock code-window, dark, for action WS logs.
export function ActionConsole({ entry, title = 'output' }) {
  const ref = useRef(null)
  useEffect(() => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight }, [entry && entry.logs && entry.logs.length])
  if (!entry || !entry.logs || (!entry.logs.length && entry.status === 'idle')) return null
  const color = (s) => s === 'ok' ? 'text-emerald-400' : s === 'stderr' ? 'text-rose-400' : s === 'cmd' ? 'text-sky-300' : 'text-zinc-300'
  return (
    <div className="cl-pop mt-3 overflow-hidden rounded-xl border border-zinc-950/10 shadow-sm dark:border-white/10">
      <div className="flex items-center gap-1.5 border-b border-white/10 bg-zinc-900 px-3 py-2">
        <span className="size-2.5 rounded-full bg-red-400/70" /><span className="size-2.5 rounded-full bg-amber-400/70" /><span className="size-2.5 rounded-full bg-green-400/70" />
        <span className="cl-mono ml-2 text-[10.5px] text-zinc-400">{title}{entry.status === 'running' ? ' · running…' : entry.status === 'done' ? ' · done' : entry.status === 'failed' ? ' · failed' : ''}</span>
      </div>
      <div ref={ref} className="cl-mono max-h-56 overflow-auto bg-zinc-950 p-3 text-[11.5px] leading-relaxed">
        {entry.logs.map((l, i) => <div key={i} className={cn('whitespace-pre-wrap break-words', color(l.stream))}>{l.line}</div>)}
        {entry.status === 'running' && <div className="text-zinc-600">▌</div>}
      </div>
    </div>
  )
}
