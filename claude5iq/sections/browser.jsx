/* Chapter 04 — The Browser · the dark interlude, told as a story.
 * Big idea → the problem made visible (diptych) → watch them all → it's running →
 * the toolkit → set it up. Same scaffold as the light chapters, dark palette. */

import { Reveal, ChapterIntro, Step, Icon, ActionConsole, inkFor, cn } from '../lib.jsx'

const { useState, useEffect, useRef } = React

// ── the agent browser, faked: the signature group-sidebar + a 4-up monitor of live sites ──
const GROUPS = [
  { emoji: '🐯', code: '9C52', line: '#e07b2f', head: '#f0b487', tabs: [
    { kind: 'atelier', title: 'Atelier · Claude 5IQ' },
  ] },
  { emoji: '🐢', code: 'C366', line: '#46985a', head: '#a8d6a0', tabs: [
    { kind: 'emoji', e: '🌐', title: 'Example Domain' },
    { kind: 'letter', ch: 'W', bg: '#fff', fg: '#111', serif: true, title: 'Wikipedia, the free encyclop…' },
    { kind: 'letter', ch: 'Y', bg: '#ff6600', fg: '#fff', title: 'Hacker News' },
    { kind: 'emoji', e: '🐙', title: 'GitHub · Change is constant…' },
    { kind: 'emoji', e: '🍎', title: 'Apple' },
    { kind: 'letter', ch: '▽', bg: '#5100ff', fg: '#fff', title: 'The Verge', agent: true },
    { kind: 'bbc', title: 'BBC News – Breaking news,' },
    { kind: 'letter', ch: 'M', bg: '#000', fg: '#fff', title: 'MDN Web Docs', agent: true },
  ] },
]
// the pool agents browse — most scroll; the ones with a button (x,y in the 1280-wide shot) get clicked
const SITES = [
  { key: 'example',   img: 'grid-example.jpg',   btn: null },
  { key: 'wikipedia', img: 'grid-wikipedia.jpg', btn: { x: 142, y: 334 } },
  { key: 'hn',        img: 'grid-hn.jpg',         btn: null },
  { key: 'github',    img: 'grid-github.jpg',     btn: { x: 876, y: 436 } },
  { key: 'apple',     img: 'grid-apple.jpg',      btn: { x: 595, y: 237 } },
  { key: 'verge',     img: 'grid-verge.jpg',      btn: { x: 883, y: 318 } },
  { key: 'bbc',       img: 'grid-bbc.jpg',        btn: { x: 370, y: 102 } },
  { key: 'mdn',       img: 'grid-mdn.jpg',        btn: { x: 383, y: 883 } },
]
const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
const rnd = (a, b) => a + Math.random() * (b - a)

function TabFav({ t }) {
  if (t.kind === 'emoji') return <span className="w-[15px] shrink-0 text-center text-[12px] leading-none">{t.e}</span>
  if (t.kind === 'atelier') return (
    <span className="grid size-[15px] shrink-0 grid-cols-2 gap-px rounded-[3px] bg-white/[0.08] p-[2.5px]">
      <i className="rounded-[1px] bg-zinc-400" /><i className="rounded-[1px] bg-blue-500" /><i className="rounded-[1px] bg-zinc-500" /><i className="rounded-[1px] bg-zinc-400" />
    </span>
  )
  if (t.kind === 'bbc') return <span className="grid size-[15px] shrink-0 place-items-center rounded-[3px] bg-black text-[6px] font-black tracking-tighter text-white">BBC</span>
  return <span className={cn('grid size-[15px] shrink-0 place-items-center rounded-[3px] text-[9px] font-bold leading-none', t.serif && 'font-serif')} style={{ background: t.bg, color: t.fg }}>{t.ch}</span>
}

function TabGroup({ g }) {
  return (
    <div className="mb-2">
      <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-[7px] text-[12px] font-semibold" style={{ background: g.head, color: '#1f1813' }}>
        <span className="text-[12px] leading-none">{g.emoji}</span><span className="tabular-nums tracking-wide">{g.code}</span>
        <Icon name="chevron-up" size={13} className="ml-auto opacity-60" />
      </div>
      <div className="mt-1 space-y-px py-0.5 pl-2.5" style={{ boxShadow: `inset 2px 0 0 ${g.line}` }}>
        {g.tabs.map((t, i) => (
          <div key={i} className="flex items-center gap-2 rounded-md px-1.5 py-[5px] text-[11.5px] text-zinc-300">
            <TabFav t={t} />
            <span className="truncate">{t.agent && '🐴 '}{t.title}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// a classic macOS arrow cursor
function Cursor() {
  return (
    <svg viewBox="0 0 14 20" className="size-[18px]" style={{ filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,.6))' }}>
      <path d="M2 2 L2 16 L6 12.4 L8.6 18 L11 16.9 L8.4 11.3 L13 11.3 Z" fill="#fff" stroke="#1c1c1e" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}

function Waiting() {
  return (
    <div className="grid h-full place-items-center">
      <span className="inline-flex items-center gap-1.5 text-[10px] text-zinc-600"><span className="cl-blink-slow size-1.5 rounded-full bg-zinc-600" /> waiting for an agent</span>
    </div>
  )
}

// a live tab: its agent either scrolls the page in bursts, or walks the cursor to a button and taps it
function LiveTab({ site, mode, idx, img }) {
  const cellRef = useRef(null)
  const imgRef = useRef(null)
  const geo = useRef({ aspect: 1.33, maxFrac: 0.72 })
  const [scroll, setScroll] = useState(0)
  const [cursor, setCursor] = useState({ x: 48, y: 56, down: false })
  const [ripples, setRipples] = useState([])

  // measure from the laid-out cell + the image's natural size — how far we can scroll, and the cell aspect
  const measure = () => {
    const cell = cellRef.current, im = imgRef.current
    if (!cell || !im) return
    const ch = cell.clientHeight, iw = cell.clientWidth
    if (!ch || !iw) return
    geo.current.aspect = iw / ch
    if (im.naturalHeight) {
      const ih = (iw * im.naturalHeight) / im.naturalWidth
      geo.current.maxFrac = ih > ch ? Math.max(0, Math.min(0.85, 1 - ch / ih)) : 0
    }
  }
  useEffect(() => { const r = requestAnimationFrame(() => requestAnimationFrame(measure)); return () => cancelAnimationFrame(r) }, [])

  // scroll mode — burst down the page, with a slow cursor drift
  useEffect(() => {
    if (mode !== 'scroll' || reduced()) return
    let alive = true; const ts = []
    const burst = () => { if (!alive) return; setScroll((p) => Math.min(geo.current.maxFrac, p + rnd(0.1, 0.27))); ts.push(setTimeout(burst, rnd(1200, 3200))) }
    const drift = () => { if (!alive) return; setCursor({ x: rnd(32, 74), y: rnd(36, 76), down: false }); ts.push(setTimeout(drift, rnd(2600, 5200))) }
    setCursor({ x: rnd(42, 62), y: rnd(48, 70), down: false })
    ts.push(setTimeout(burst, rnd(500, 1300)))
    ts.push(setTimeout(drift, rnd(1600, 3000)))
    return () => { alive = false; ts.forEach(clearTimeout) }
  }, [mode])

  // click mode — walk to the button, tap (ripple), pause, repeat. no scrolling.
  useEffect(() => {
    if (mode !== 'click' || !site.btn || reduced()) return
    let alive = true; const ts = []
    const target = () => ({ x: Math.min(94, (site.btn.x / 1280) * 100), y: Math.min(92, (site.btn.y / 1280) * geo.current.aspect * 100) })
    const seq = () => {
      if (!alive) return
      const t = target()
      const jx = Math.max(5, Math.min(95, t.x + rnd(-3, 3))), jy = Math.max(7, Math.min(93, t.y + rnd(-2.5, 2.5)))
      setCursor({ x: jx, y: jy, down: false })
      ts.push(setTimeout(() => {
        if (!alive) return
        setCursor((c) => ({ ...c, down: true }))
        setRipples((rs) => [...rs.slice(-3), { key: Math.random(), x: jx, y: jy }])
        ts.push(setTimeout(() => { if (alive) setCursor((c) => ({ ...c, down: false })) }, 150))
        ts.push(setTimeout(seq, rnd(2400, 5200)))
      }, 1250))
    }
    setCursor({ x: rnd(26, 52), y: rnd(64, 82), down: false })
    ts.push(setTimeout(seq, rnd(700, 1400)))
    return () => { alive = false; ts.forEach(clearTimeout) }
  }, [mode])

  return (
    <div ref={cellRef} className="cl-tabin absolute inset-0 overflow-hidden">
      <img ref={imgRef} src={img(site.img)} alt="" onLoad={measure} className="absolute inset-x-0 top-0 w-full" style={{ transform: `translateY(${-scroll * 100}%)`, transition: 'transform .85s cubic-bezier(.33,0,.18,1)' }} />
      <span className="pointer-events-none absolute z-20" style={{ left: cursor.x + '%', top: cursor.y + '%', transition: 'left 1.15s cubic-bezier(.4,0,.2,1), top 1.15s cubic-bezier(.4,0,.2,1), transform .15s ease', transform: cursor.down ? 'scale(.82)' : 'none' }}><Cursor /></span>
      {ripples.map((r) => <span key={r.key} className="cl-ripple pointer-events-none absolute z-10 size-7 rounded-full" style={{ left: r.x + '%', top: r.y + '%', border: '2px solid rgba(255,255,255,.85)' }} />)}
      <span className="absolute left-1.5 top-1.5 z-20 inline-flex items-center gap-1 rounded bg-black/55 px-1.5 py-0.5 text-[9px] font-semibold text-white backdrop-blur-sm"><span className="size-1.5 rounded-full bg-emerald-400" />{idx + 1}</span>
    </div>
  )
}

// the live wall — agents spawn into random tabs at random times (≤2 of any page); some scroll, some click
function Monitor({ img }) {
  const [, force] = useState(0)
  const slots = useRef([
    { phase: 'active', site: 5, mode: 'scroll', gen: 1 },
    { phase: 'empty', site: null, mode: null, gen: 0 },
    { phase: 'empty', site: null, mode: null, gen: 0 },
    { phase: 'empty', site: null, mode: null, gen: 0 },
  ])
  useEffect(() => {
    if (reduced()) {
      slots.current = [5, 6, 7, 3].map((site, i) => ({ phase: 'active', site, mode: 'scroll', gen: i + 1 }))
      force((x) => x + 1); return
    }
    let alive = true, t
    const tick = () => {
      if (!alive) return
      const s = slots.current.map((x) => ({ ...x }))
      const activeIdx = s.map((x, i) => i).filter((i) => s[i].phase === 'active')
      const emptyIdx = s.map((x, i) => i).filter((i) => s[i].phase === 'empty')
      const action = activeIdx.length <= 1 ? 'spawn' : activeIdx.length >= 4 ? 'retire' : (Math.random() < 0.6 ? 'spawn' : 'retire')
      if (action === 'spawn' && emptyIdx.length) {
        const i = emptyIdx[Math.floor(Math.random() * emptyIdx.length)]
        const counts = {}; s.forEach((x, j) => { if (j !== i && x.phase === 'active') counts[x.site] = (counts[x.site] || 0) + 1 })
        const avail = SITES.map((_, k) => k).filter((k) => (counts[k] || 0) < 2)
        const site = avail[Math.floor(Math.random() * avail.length)]
        const mode = SITES[site].btn && Math.random() < 0.42 ? 'click' : 'scroll'
        s[i] = { phase: 'active', site, mode, gen: s[i].gen + 1 }
      } else if (action === 'retire' && activeIdx.length > 1) {
        const i = activeIdx[Math.floor(Math.random() * activeIdx.length)]
        s[i] = { phase: 'empty', site: null, mode: null, gen: s[i].gen + 1 }
      }
      slots.current = s; force((x) => x + 1)
      t = setTimeout(tick, rnd(2400, 6200))
    }
    t = setTimeout(tick, rnd(2400, 4200))
    return () => { alive = false; clearTimeout(t) }
  }, [])
  const live = slots.current.filter((x) => x.phase === 'active').length
  return (
    <div className="relative grid flex-1 grid-cols-2 grid-rows-2 gap-[3px] bg-black/40 p-[3px]">
      {slots.current.map((slot, i) => (
        <div key={i} className="relative overflow-hidden rounded-[4px] bg-[#0d0d0f]">
          {slot.phase === 'active' ? <LiveTab key={slot.gen} site={SITES[slot.site]} mode={slot.mode} idx={i} img={img} /> : <Waiting />}
        </div>
      ))}
      <span className="absolute bottom-2 right-2 z-30 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-medium text-zinc-200 backdrop-blur-sm">
        <span className="size-1.5 rounded-full bg-emerald-400" />{live} agent{live === 1 ? '' : 's'} browsing
      </span>
    </div>
  )
}

function FakeBrowser({ img }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 shadow-[0_30px_70px_-30px_rgba(0,0,0,0.7)]">
      <div className="flex h-[450px] sm:h-[512px]">
        {/* ── sidebar column: its own top (window dots + sidebar controls) ── */}
        <div className="flex w-[202px] shrink-0 flex-col border-r border-black/40 bg-[#161618] sm:w-[240px]">
          <div className="flex items-center justify-between px-3.5 pb-2 pt-3.5">
            <div className="flex items-center gap-3">
              <div className="flex gap-[7px]">
                <span className="size-3 rounded-full bg-zinc-600" /><span className="size-3 rounded-full bg-zinc-600" /><span className="size-3 rounded-full bg-zinc-600" />
              </div>
              <Icon name="panel-left-close" size={16} className="text-zinc-400" />
            </div>
            <div className="flex items-center gap-0.5 rounded-lg bg-white/[0.04] p-0.5">
              <span className="rounded-md bg-white/[0.09] p-1 text-zinc-100"><Icon name="layout-grid" size={14} /></span>
              <span className="rounded-md p-1 text-zinc-400"><Icon name="search" size={14} /></span>
            </div>
          </div>
          <div className="flex flex-1 flex-col overflow-hidden px-2.5 pb-2.5">
            <div className="mb-3 flex items-center justify-center rounded-lg bg-white/[0.05] py-2"><span className="grid size-6 place-items-center rounded-[6px] text-[12px]" style={{ background: '#3a7d4a' }}>🐴</span></div>
            {GROUPS.map((g) => <TabGroup key={g.code} g={g} />)}
            <div className="mt-2 flex items-center justify-center rounded-lg bg-white/[0.05] py-2 text-zinc-400"><Icon name="plus" size={15} /></div>
          </div>
        </div>
        {/* ── main column: its own top (back / forward / reload + the address pill) ── */}
        <div className="flex flex-1 flex-col bg-[#252528]">
          <div className="flex items-center gap-2.5 px-3 pb-2.5 pt-3.5">
            <div className="flex items-center gap-1.5">
              <Icon name="arrow-left" size={18} className="text-zinc-400" />
              <Icon name="arrow-right" size={18} className="text-zinc-600" />
              <Icon name="rotate-cw" size={15} className="ml-0.5 text-zinc-400" />
            </div>
            <div className="flex flex-1 items-center gap-2 overflow-hidden rounded-full bg-white/[0.07] px-3.5 py-2 text-[13px] font-medium text-zinc-100">
              <span className="grid size-[16px] shrink-0 place-items-center rounded-[5px] border-[1.5px] border-zinc-300/85"><span className="size-[5px] rounded-[1.5px] bg-zinc-300/85" /></span>
              <span className="shrink-0">Agent Tab Grouper</span>
              <span className="cl-mono ml-0.5 truncate text-[11px] font-normal text-zinc-500">· monitor.html</span>
            </div>
          </div>
          <Monitor img={img} />
        </div>
      </div>
    </div>
  )
}

// one piece of the stack in the "On your machine" card — installed, or installable from GitHub
function ToolRow({ installed, name, desc, accent, onInstall }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className={cn('mt-1.5 inline-block size-2.5 shrink-0 rounded-full', installed ? 'bg-emerald-400' : 'bg-zinc-600')} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <code className="cl-mono text-[13.5px] font-semibold text-zinc-100">{name}</code>
          <span className={cn('text-[12px]', installed ? 'text-emerald-400' : 'text-zinc-500')}>{installed ? 'installed' : 'not installed'}</span>
          {!installed && <button onClick={onInstall} className="ml-auto shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm transition hover:brightness-110" style={{ background: accent }}>Install from GitHub</button>}
        </div>
        <div className="mt-0.5 text-[12px] leading-relaxed text-zinc-500">{desc}</div>
      </div>
    </div>
  )
}

// one column of the running-stack wall, with a status dot + line on top
// the live stack as ONE table — agent sessions (the primary sort) · harness daemons · Horse Browser
// tabs — the rows spanning all three columns (polls /processes)
const wallDot = (ok) => ok === true ? 'bg-emerald-400' : ok === false ? 'bg-amber-400' : 'bg-zinc-600'

// one column of the live stack — a status header + its own spaced list (each column is its own truth;
// Chrome doesn't expose the tab→session group, and daemons are shared lanes, so they aren't row-joined)
function StackCol({ title, ok, status, children }) {
  return (
    <div className="px-4 py-4">
      <div className="mb-1 flex items-center gap-2">
        <span className={cn('inline-block size-2 shrink-0 rounded-full', wallDot(ok))} />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-300">{title}</span>
      </div>
      <div className="mb-4 text-[10.5px] leading-relaxed text-zinc-500">{status}</div>
      <div className="space-y-2.5">{children}</div>
    </div>
  )
}

function ProcessWall({ self }) {
  const [p, setP] = useState(null)
  useEffect(() => {
    let alive = true
    const load = () => fetch(self.api + '/processes').then((r) => r.json()).then((d) => { if (alive) setP(d) }).catch(() => {})
    load(); const id = setInterval(load, 5000)
    return () => { alive = false; clearInterval(id) }
  }, [])
  if (!p) return <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center text-[12px] text-zinc-500">reading the live stack…</div>
  const h = p.harness, c = p.chrome
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
      <div className="grid grid-cols-3 divide-x divide-white/[0.07]">
        <StackCol title="Agent sessions" ok={p.skill.installed ? true : null}
          status={p.skill.installed ? 'the browser-harness skill is installed' : 'the skill is not installed'}>
          {p.sessions.length ? p.sessions.map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-[12px]">
              <span>{s.emoji}</span>
              <span className="cl-mono shrink-0 font-bold" style={{ color: inkFor(s.color, true) }}>{s.callsign}</span>
              <span className="truncate text-zinc-500">{s.cwd ? s.cwd.split('/').filter(Boolean).pop() : ''}</span>
            </div>
          )) : <div className="text-[11px] text-zinc-600">no agents right now</div>}
        </StackCol>

        <StackCol title="Harness daemons" ok={h.running ? (h.upToDate === false ? false : true) : null}
          status={!h.running ? 'not running' : h.upToDate === false ? `persistent lanes · update ${h.version} → ${h.latest}` : `persistent lanes · up to date (v${h.version || '?'})`}>
          {h.daemons.length ? h.daemons.map((d) => (
            <div key={d.pid} className="flex items-center gap-2 text-[12px] text-zinc-400">
              <span className={cn('size-1.5 shrink-0 rounded-full', d.name ? 'bg-emerald-400/70' : 'bg-zinc-500')} />
              <span className="cl-mono">{d.name || 'default'}</span>
              <span className="ml-auto shrink-0 cl-mono text-[10px] text-zinc-600">#{d.pid}</span>
            </div>
          )) : <div className="text-[11px] text-zinc-600">no instances</div>}
        </StackCol>

        <StackCol title="Horse Browser tabs" ok={c.running ? (c.upToDate === false ? false : true) : null}
          status={!c.running ? 'not running' : `${c.version || 'Chrome'}${c.pid ? ` · #${c.pid}` : ''}${c.upToDate === false ? ' · update available' : c.upToDate ? ' · up to date' : ''}`}>
          {p.tabs.length ? p.tabs.map((t, i) => (
            <div key={i} className="flex items-center gap-2 text-[12px]">
              {t.agent && <span className="shrink-0">🐴</span>}
              <span className="truncate text-zinc-300">{t.title.replace(/^🐴\s*/, '')}</span>
              <span className="ml-auto shrink-0 cl-mono text-[10px] text-zinc-600">{t.domain}</span>
            </div>
          )) : <div className="text-[11px] text-zinc-600">no tabs open</div>}
        </StackCol>
      </div>
    </div>
  )
}

export default function Browser({ self, snap, actions, accent, icon, n }) {
  const img = (nm) => self.api + '/images/' + nm
  const harness = snap?.harness || {}
  const horseInstalled = !!snap?.tools?.['horse-browser']?.installed
  const { byId, run } = actions || {}

  return (
    <div className="relative overflow-hidden rounded-3xl bg-zinc-950 p-6 text-zinc-200 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.6)] sm:p-10">
      {/* cinematic banner — pure visual, the chapter opens beneath it */}
      <Reveal className="relative -mx-6 -mt-6 mb-9 sm:-mx-10 sm:-mt-10">
        <img src={img('horse-banner.jpg')} loading="lazy" alt="horse-browser — a celestial navigation trail of session tokens" className="cl-ink w-full" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent" />
        <span className="absolute bottom-4 left-6 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-100 ring-1 ring-white/15 sm:left-10">the night console</span>
      </Reveal>

      <Reveal>
        <ChapterIntro dark n={n} icon={icon} color={accent} kicker="The Horse Browser"
          idea="Give your agents a browser of their own — logged in, and never in your way."
          why="Agents often need to browse: research a page, check a dashboard, fill in a form. But a throwaway browser logs out constantly, and a normal one yanks your window to the front every few seconds. The fix is a second browser, just for agents — signed into your stuff once, quietly shared, that never steals your screen. It lets a hundred agents browse the web at the same time, without getting in each other’s way." />
      </Reveal>

      {/* merged with the intro — the live wall comes straight after the paragraph, standing alone */}
      <Reveal>
        <p className="mb-5 max-w-2xl text-[14.5px] leading-relaxed text-zinc-400">Each agent’s tabs land in their own colour group, and one wall shows them all browsing live — opening tabs quietly, in the background, while you keep working.</p>
        <div className="mx-auto my-7 max-w-[900px] sm:my-12">
          <FakeBrowser img={img} />
        </div>
      </Reveal>

      {/* the engine — browser-harness, the bitter-lesson harness behind it */}
      <Reveal className="@container">
        <div className="mt-12 grid items-start gap-x-12 gap-y-9 @4xl:mt-16 @4xl:grid-cols-[1.12fr_0.88fr]">
          <Step dark label="The engine" color={accent} title="600 lines, not a hundred thousand" className="!mt-0"
            lead="The Horse Browser runs on browser-harness. That’s where the name comes from: every tab an agent opens gets a 🐴 stamped on it — so this wall is where all those live tabs gather.">
            <div className="space-y-3.5 text-[14px] leading-relaxed text-zinc-300">
              <p>Older tools — Playwright, Selenium, even browser-use — hand the agent a giant box of pre-built buttons (<code className="cl-mono text-[12.5px] text-zinc-200">click()</code>, <code className="cl-mono text-[12.5px] text-zinc-200">type()</code>, <code className="cl-mono text-[12.5px] text-zinc-200">scroll()</code>, and thousands more) that a developer <em className="text-zinc-200">guessed</em> it would need. browser-harness does the opposite: it hands the agent the browser’s own raw controls and a screenshot, and lets it figure the rest out — the way a person would.</p>
              <p>That’s a staggering difference in size:</p>
            </div>
            <div className="my-5 space-y-2.5">
              {[{ name: 'Playwright', loc: 120000, w: '100%' }, { name: 'browser-use', loc: 72000, w: '60%' }, { name: 'browser-harness', loc: 600, w: '2%', us: true }].map((r) => (
                <div key={r.name} className="flex items-center gap-3 text-[12px]">
                  <span className={cn('w-28 shrink-0 cl-mono truncate', r.us ? 'font-semibold text-zinc-100' : 'text-zinc-400')}>{r.name}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <div className="h-full rounded-full" style={{ width: r.w, background: r.us ? accent : 'rgba(255,255,255,.22)' }} />
                  </div>
                  <span className="w-20 shrink-0 text-right tabular-nums" style={{ color: r.us ? accent : undefined }}>~{r.loc.toLocaleString()}</span>
                </div>
              ))}
            </div>
            <p className="text-[14px] leading-relaxed text-zinc-300">Every one of those hundred thousand lines is a developer trying to guess what an agent will need. A sharp, hard-working agent makes nearly all of them unnecessary — when something’s missing, it just writes that one trick mid-task and keeps it.</p>
            <div className="cl-mono mt-4 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
              <span className="rounded-md bg-white/5 px-2 py-1">a trick is missing</span><span className="text-zinc-600">→</span>
              <span className="rounded-md bg-white/5 px-2 py-1">the agent writes it</span><span className="text-zinc-600">→</span>
              <span className="rounded-md px-2 py-1" style={{ background: accent + '22', color: accent }}>it’s there next time</span>
            </div>
            <blockquote className="my-5 border-l-2 pl-4 text-[14.5px] italic text-zinc-200" style={{ borderColor: accent }}>
              “The bitter lesson of agent harnesses: your helpers are abstractions too.”
              <span className="mt-1.5 block text-[11.5px] not-italic text-zinc-500">— browser-use, on why a maximal action space beats hand-built wrappers</span>
            </blockquote>
            <div className="flex flex-wrap items-center gap-3">
              <a href="https://github.com/browser-use/browser-harness" target="_blank" rel="noreferrer" className="inline-flex items-stretch overflow-hidden rounded-md border border-white/15 text-[12px] font-semibold shadow-sm transition hover:-translate-y-px hover:border-white/30">
                <span className="inline-flex items-center gap-1.5 bg-white/[0.06] px-2.5 py-1.5 text-zinc-200"><Icon name="star" size={13} /> Star</span>
                <span className="inline-flex items-center border-l border-white/15 bg-white/[0.02] px-2.5 py-1.5 tabular-nums text-zinc-100">15.4k</span>
              </a>
              <a href="https://browser-use.com/posts/bitter-lesson-agent-harnesses" target="_blank" rel="noreferrer" className="text-[13px] font-medium text-zinc-300 underline decoration-white/25 underline-offset-2 transition hover:text-white hover:decoration-white/60">Read the write-up ↗</a>
            </div>
          </Step>

          {/* on your machine — the two pieces of the stack, each installable from GitHub */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="mb-3.5 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">On your machine</div>
            <div className="space-y-3.5">
              <ToolRow installed={harness.installed} name="browser-harness" accent={accent}
                desc="the engine — drives the browser straight from raw CDP."
                onInstall={() => run && run('install-browser-harness', { confirm: true })} />
              <ToolRow installed={horseInstalled} name="horse-browser" accent={accent}
                desc="the dedicated Chrome your agents share — cloned and built from GitHub."
                onInstall={() => run && run('install-horse-browser', { confirm: true })} />
            </div>
            {harness.installed && (
              <div className="mt-3.5 flex items-center gap-2 rounded-lg bg-white/[0.04] px-3 py-2 text-[12.5px] text-zinc-300">
                <span className="size-1.5 rounded-full bg-emerald-400" />
                {harness.sessions > 0
                  ? <span><span className="font-semibold text-zinc-100">{harness.sessions}</span> live session{harness.sessions === 1 ? '' : 's'} — agents driving it right now</span>
                  : <span>idle — no agents driving it this moment</span>}
              </div>
            )}
            <ActionConsole entry={(byId && byId['install-browser-harness']) || {}} title="installing browser-harness" />
            <ActionConsole entry={(byId && byId['install-horse-browser']) || {}} title="installing horse-browser" />
          </div>
        </div>
      </Reveal>

      {harness.installed && (
        <Reveal>
          <div className="mt-12 sm:mt-16">
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">Running right now</div>
            <p className="mb-5 max-w-2xl text-[14px] leading-relaxed text-zinc-400">The live stack on your machine — the agents browsing, the harness instances driving them, and the Horse Browser tabs they have open.</p>
            <ProcessWall self={self} />
          </div>
        </Reveal>
      )}
    </div>
  )
}
