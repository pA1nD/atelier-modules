/* horse-browser — the control board for the Horse Browser.
 *
 * A control board that doubles as a first-run setup guide. Nine routes
 * (window.__atelier.useRoute):
 *   ''           the BOARD — a compact hero (+ install/version box) → clickable
 *                live-status cards → the credentials & access dashboard (broker
 *                status, connection, agent integration, reachable-account
 *                stats, quick search, recent access). Every panel surfaces its
 *                own fix-it/setup state, so the board is the setup guide.
 *   story        the full cinematic narrative (banner → idea → the demo
 *                agent-browser wall → the engine, horse-harness), behind a
 *                "read the full story" link off the hero.
 *   runtime      the live ops view: compositing probe + DeskPad lid-closed
 *                vision, the process wall, and the launcher's heal journal.
 *   credentials  the Bitwarden broker settings panel (see ./credentials.jsx).
 *   skill        the "hand this to an agent" page — the login skill, pretty/raw,
 *                with the copyable one-line prompt.
 *   accounts     the full reachable-account list (own page).
 *   activity     the credential access log (own page).
 *   docs         how agents learn it — rules, the live verb tiers (from
 *                `horse-browser verbs --json`), the hint hook, systems.
 *   site-skills  the per-host playbook explorer (domain-skills/<host>/*.md).
 */

import { Reveal, ChapterIntro, Step, Icon, ActionConsole, Modal, inkFor, cn, useChromeStyles, useSnapshot, useActions } from './lib.jsx'
import { AuthPanel, Settings, Accounts, Activity, Skill } from './credentials.jsx'

const { useState, useEffect, useRef } = React

// meta must be a pure object literal — the shell reads it statically.
export const meta = { chrome: 'catalyst-chrome', icon: 'compass', name: 'Horse Browser' }

const ACCENT = '#10b981'

// ── the agent browser, faked: the signature group-sidebar + a 4-up monitor of live sites ──
const GROUPS = [
  { emoji: '🐯', code: '9C52', line: '#e07b2f', head: '#f0b487', tabs: [
    { kind: 'atelier', title: 'Atelier · Horse Browser' },
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
      {/* honesty tag — this wall is a simulation; the REAL wall is in the console below */}
      <span className="absolute bottom-2 left-2 z-30 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-medium text-zinc-400 backdrop-blur-sm">demo — the real wall is in the console below</span>
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
        {/* ── sidebar column: its own top (window dots + sidebar controls). Hidden on
            phones so the monitor wall keeps a usable width. ── */}
        <div className="hidden w-[202px] shrink-0 flex-col border-r border-black/40 bg-[#161618] sm:flex sm:w-[240px]">
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

/* ── the console's glance layer — four live tiles, one judgment each: the
 * browser, who's driving, the installed stack, what agents know. A fix-it
 * button (with its exact command in the open) appears only on a tile that
 * needs one; healthy tiles stay quiet. */
// A live-status card — inverted: the headline data big at the top, the secondary
// detail small below, and the label + click-through to the detail page pinned to
// the bottom (mt-auto, so paired cards' footers align). Browser + wiring share it.
function LiveCard({ dot, label, cta, big, small, onClick }) {
  return (
    <button onClick={onClick} className="group flex h-full w-full flex-col gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-white/20 hover:bg-white/[0.05]">
      <div className="text-[15px] leading-snug text-zinc-200">{big}</div>
      {small && <div className="space-y-1 text-[12px]">{small}</div>}
      <div className="mt-auto flex items-center gap-2 border-t border-white/[0.06] pt-3">
        <span className={cn('size-1.5 shrink-0 rounded-full', dot)} />
        <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-[0.13em] text-zinc-500">{label}</span>
        <span className="ml-auto inline-flex min-w-0 items-center gap-1.5 text-[11.5px] text-zinc-500 transition group-hover:text-zinc-300"><span className="truncate">{cta}</span><span className="shrink-0 transition group-hover:translate-x-0.5">→</span></span>
      </div>
    </button>
  )
}

// The browser card — headline: which Chrome on which port + how many sessions;
// detail: live screenshot health (a real 1×1 compositing probe) + tabs/pid/CDP.
function BrowserCard({ cdp, sessions, legacy, self, navigate }) {
  const [shot, setShot] = useState(null)   // /compositing probe: do screenshots work right now?
  useEffect(() => {
    let live = true
    fetch(self.api + '/compositing').then((r) => r.json()).then((d) => { if (live) setShot(d) }).catch(() => { if (live) setShot({ error: true }) })
    return () => { live = false }
  }, [self.api, cdp.up])
  const chromeLabel = (cdp.browser || '').replace('Chrome/', 'Chrome ').split('.')[0]
  const port = cdp.port || 9223
  const st = shot?.probe?.status
  const shots = !shot ? { dot: 'bg-zinc-600 animate-pulse', text: 'checking…', ink: 'text-zinc-500' }
    : shot.error ? { dot: 'bg-zinc-600', text: 'check failed', ink: 'text-zinc-500' }
    : st === 'ok' ? { dot: 'bg-emerald-400', text: `working · ${shot.probe.ms} ms`, ink: 'text-emerald-300' }
    : st === 'hang' ? { dot: 'bg-rose-400', text: 'would hang', ink: 'text-rose-300' }
    : st === 'no-page' ? { dot: 'bg-zinc-600', text: 'no tab to probe', ink: 'text-zinc-500' }
    : { dot: 'bg-zinc-600', text: 'browser off', ink: 'text-zinc-500' }
  // the /compositing probe also carries the DeskPad state — lid-closed vision
  const dp = shot?.deskpad
  const vd = !dp ? null
    : dp.running ? { text: 'running', ink: 'text-emerald-300' }
    : dp.installed ? { text: 'installed', ink: 'text-zinc-300' }
    : { text: 'not installed', ink: 'text-zinc-500' }
  const big = cdp.up
    ? <><span className="font-semibold text-zinc-50">{chromeLabel || 'Chrome'}</span> <span className="text-zinc-400">listening on</span> <span className="cl-mono text-zinc-100">:{port}</span> <span className="text-zinc-600">·</span> <span className="font-semibold text-zinc-50">{sessions}</span> <span className="text-zinc-400">{sessions === 1 ? 'session' : 'sessions'} active</span></>
    : <><span className="font-semibold text-zinc-50">Browser not running</span> <span className="text-zinc-400">— starts on the next agent task</span></>
  const small = cdp.up ? (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-zinc-500">
      <span className="inline-flex items-center gap-1.5">
        <span className={cn('size-1.5 shrink-0 rounded-full', shots.dot)} />
        screenshots <span className={cn('font-medium', shots.ink)}>{shots.text}</span>
      </span>
      <span className="text-zinc-700">·</span>
      <span className="cl-mono">{cdp.tabs} {cdp.tabs === 1 ? 'tab' : 'tabs'} · pid {cdp.pids?.[0] || '—'} · CDP {cdp.protocol || '—'}{legacy > 0 && <span className="text-amber-400"> · {legacy} legacy</span>}</span>
      {vd && <>
        <span className="text-zinc-700">·</span>
        <span>virtual display <span className={cn('font-medium', vd.ink)}>{vd.text}</span></span>
      </>}
    </div>
  ) : null
  return <LiveCard dot={cdp.up ? 'bg-emerald-400' : 'bg-zinc-600'} label="The browser" cta="open the live stack — sessions, daemons, vision & health" big={big} small={small} onClick={() => navigate('runtime')} />
}

// The install/version judgment for horse-browser itself — used by the InstallBox
// at the top of the board. ONE judgment (installed? venv built? current?); the
// npm command stays in the open in every state (install + update are the same).
const INSTALL_CMD = 'npm install -g @pa1nd/horse-browser'
function stackState(snap, run) {
  const harness = snap?.harness || {}
  const hb = (snap?.versions || {})['horse-browser']
  const horse = !!snap?.tools?.['horse-browser']?.installed
  const npmOk = !!snap?.tools?.npm?.installed
  return !horse
    ? { ok: false, value: 'not installed', sub: npmOk ? 'one npm package — the launcher, tab-grouper extension, and vendored harness' : <>needs Node.js first: <a href="https://nodejs.org" target="_blank" rel="noreferrer" className="underline underline-offset-2">nodejs.org</a></>, actionLabel: npmOk ? 'Install from npm' : null, onAction: npmOk ? () => run && run('install-horse-browser', { confirm: true }) : null, cmd: INSTALL_CMD }
    : !harness.installed
      ? { ok: false, value: (hb?.version ? 'v' + hb.version : 'installed') + ' · venv missing', sub: "the vendored driver's Python venv is missing (npm's postinstall builds it)", actionLabel: 'Build the venv', onAction: () => run && run('harness-setup', { confirm: true }), cmd: 'horse-browser harness-setup' }
      : hb?.latest && hb.upToDate === false
        ? { ok: false, value: `v${hb.version}`, sub: `v${hb.latest} available on npm — updating is a fresh install`, actionLabel: 'Update', onAction: () => run && run('install-horse-browser', { confirm: true }), cmd: INSTALL_CMD }
        : { ok: true, value: (hb?.version ? 'v' + hb.version : 'installed'), sub: hb?.upToDate === true ? 'up to date · launcher, extension & vendored harness in one package' : 'launcher, extension & vendored harness in one package', cmd: INSTALL_CMD }
}

// The install & version box — a distinct dark card on the hero's right, vertically centered.
function InstallBox({ snap, run }) {
  const [copied, setCopied] = useState(false)
  const s = snap ? stackState(snap, run) : null
  return (
    <div className="w-full rounded-2xl border border-white/10 bg-zinc-950/85 p-4 shadow-xl backdrop-blur-md sm:w-[21rem]">
      <div className="flex items-center gap-2">
        <span className={cn('size-2 shrink-0 rounded-full', !s ? 'bg-zinc-600' : s.ok === true ? 'bg-emerald-400' : 'bg-amber-400')} />
        <span className="cl-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">horse-browser · npm</span>
      </div>
      {!s ? (
        <div className="mt-2 text-[13px] text-zinc-500">reading your machine…</div>
      ) : (
        <>
          <div className="mt-1.5 text-[17px] font-semibold text-zinc-50">{s.value}</div>
          <div className="mt-0.5 text-[11.5px] leading-relaxed text-zinc-400">{s.sub}</div>
          <div className="mt-3 space-y-2">
            {s.onAction && <button onClick={s.onAction} className="rounded-full px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition hover:brightness-110" style={{ background: ACCENT }}>{s.actionLabel}</button>}
            {s.cmd && (
              <button onClick={() => { navigator.clipboard && navigator.clipboard.writeText(s.cmd).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400) }).catch(() => {}) }}
                className="cl-mono group flex w-full min-w-0 items-center gap-1.5 rounded-md bg-black/50 px-2 py-1.5 text-[10.5px] text-zinc-300 ring-1 ring-white/10 transition hover:ring-white/25" title="copy to clipboard">
                <span className="shrink-0 text-zinc-600">$</span><span className="truncate">{s.cmd}</span><span className={cn('ml-auto shrink-0 text-[9.5px]', copied ? 'text-emerald-400' : 'text-zinc-600 group-hover:text-zinc-400')}>{copied ? 'copied' : 'copy'}</span>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// the live status — one dense browser row (Chrome, port, screenshots, stats), then
// a slim "wired up" row below. Both click through to their detail page.
function ConsoleTiles({ snap, self, navigate }) {
  if (!snap) return (
    <div className="mt-4 inline-flex items-center gap-1.5 text-[12.5px] text-zinc-500"><span className="size-1.5 animate-pulse rounded-full bg-amber-400" /> reading your machine…</div>
  )
  const cdp = snap.cdp || {}
  const harness = snap.harness || {}
  const cfg = (snap.versions || {})['browser-config']
  const sessions = harness.sessions || 0
  const legacy = (harness.daemons || []).filter((d) => d.legacy).length
  const wired = !cfg?.scriptAvailable
    ? { dot: 'bg-zinc-600', big: 'Not wired up yet', line: 'install horse-browser — the always-on rule ships in the package' }
    : cfg.upToDate === true
      ? { dot: 'bg-emerald-400', big: 'Every agent knows it', line: <>the browser rule loads into <span className="text-zinc-400">every Claude Code session</span> on start — plus <code className="cl-mono">horse-browser skill</code> on demand</> }
      : { dot: 'bg-amber-400', big: 'Rule drifted', line: 'the installed rule differs from the package’s RULE.md — reapply it' }
  const ss = snap.siteSkills || { hostCount: 0, fileCount: 0, hosts: [] }
  const ssBig = ss.fileCount > 0
    ? <><span className="font-semibold text-zinc-50">{ss.fileCount}</span> <span className="text-zinc-400">{ss.fileCount === 1 ? 'site skill' : 'site skills'}</span> <span className="text-zinc-600">·</span> <span className="font-semibold text-zinc-50">{ss.hostCount}</span> <span className="text-zinc-400">{ss.hostCount === 1 ? 'site' : 'sites'}</span></>
    : <span className="font-semibold text-zinc-50">No site skills yet</span>
  const ssSmall = ss.fileCount > 0
    ? <div className="cl-mono truncate text-zinc-500">{ss.hosts.slice(0, 4).map((h) => h.host).join(' · ')}{ss.hosts.length > 4 ? ' · …' : ''}</div>
    : <div className="text-zinc-500">per-site playbooks agents read on arrival — quirks, selectors, login traps</div>
  return (
    <div className="mt-4 grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <BrowserCard cdp={cdp} sessions={sessions} legacy={legacy} self={self} navigate={navigate} />
      <LiveCard dot={wired.dot} label="Wired up" cta="read the exact rule + manual"
        big={<span className="font-semibold text-zinc-50">{wired.big}</span>}
        small={<div className="text-zinc-500">{wired.line}</div>}
        onClick={() => navigate('docs')} />
      <LiveCard dot={ss.fileCount > 0 ? 'bg-emerald-400' : 'bg-zinc-600'} label="Site skills" cta="browse the per-site playbooks"
        big={ssBig} small={ssSmall} onClick={() => navigate('site-skills')} />
    </div>
  )
}

/* ── agent vision & health ──── */

// a copyable shell command — click to copy, shown beside the one-click button
function CopyCmd({ cmd }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard && navigator.clipboard.writeText(cmd).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600) }).catch(() => {}) }}
      className="cl-mono group inline-flex max-w-full items-center gap-2 rounded-lg bg-black/40 px-2.5 py-1.5 text-[11px] text-zinc-300 ring-1 ring-white/10 transition hover:ring-white/25"
      title="copy to clipboard">
      <span className="text-zinc-600">$</span>
      <span className="truncate">{cmd}</span>
      <span className={cn('ml-0.5 text-[10px]', copied ? 'text-emerald-400' : 'text-zinc-600 group-hover:text-zinc-400')}>{copied ? 'copied' : 'copy'}</span>
    </button>
  )
}

/* the compositing check — "do screenshots work right now", answered for real:
 * a timed 1×1 Page.captureScreenshot through the Horse Browser. Runs when the
 * page opens; the Recheck button runs it again. */
function CompositingCheck({ self }) {
  const [res, setRes] = useState(null)
  const [checking, setChecking] = useState(true)
  const run = () => {
    setChecking(true)
    fetch(self.api + '/compositing').then((r) => r.json()).then((d) => { setRes(d); setChecking(false) }).catch(() => { setRes(null); setChecking(false) })
  }
  useEffect(run, [])
  const probe = res?.probe, d = res?.display || {}
  const dp = res?.deskpad || {}
  const virtualUp = (d.external || 0) > 0
  const lidProof = dp.installed && dp.running && virtualUp
  // A screenshot working NOW is a moment-in-time truth; whether it SURVIVES a closed lid
  // depends on a never-sleeping display. Surface that here — mirrors the DeskPad panel.
  const durability = probe?.status !== 'ok' ? null
    : lidProof ? { c: 'text-emerald-300/80', t: 'lid-proof — DeskPad keeps a virtual display compositing when the lid closes' }
    : virtualUp ? { c: 'text-zinc-400', t: `composited by ${d.external} external/virtual display${d.external === 1 ? '' : 's'} — survives a closed lid while they stay connected` }
    : dp.installed && dp.running ? { c: 'text-zinc-400', t: 'DeskPad running but not registering yet — see the panel below' }
    : dp.installed ? { c: 'text-amber-300/90', t: 'DeskPad installed but not running — a closed lid would stop screenshots' }
    : { c: 'text-amber-300/90', t: 'no virtual display — a closed lid would stop screenshots (install DeskPad below)' }
  const v = checking ? { tone: 'zinc', head: 'taking a real screenshot…', sub: 'a 1×1 capture through the Horse Browser, timed' }
    : !res || !probe ? { tone: 'zinc', head: 'check failed', sub: 'could not reach the module backend — recheck in a moment' }
    : probe.status === 'ok' ? { tone: 'emerald', head: 'Screenshots work right now', sub: `a real 1×1 capture came back in ${probe.ms} ms` }
    : probe.status === 'hang' ? { tone: 'rose', head: 'Screenshots would hang', sub: d.asleep ? `the display is asleep${d.clamshell ? ' behind a closed lid' : ''} — nothing is compositing, so the capture never returned` : 'the display looks awake but nothing painted back within 3.5s — possibly a wedged GPU; the launcher heals that on its next run' }
    : probe.status === 'no-page' ? { tone: 'zinc', head: 'Browser up, no tab to probe', sub: 'no page tab is open — open any page and recheck' }
    : { tone: 'zinc', head: 'The Horse Browser isn’t running', sub: 'nothing to capture from — the next agent task starts it, then recheck' }
  const tones = {
    emerald: { dot: 'bg-emerald-400', text: 'text-emerald-300', ring: 'border-emerald-400/25', bg: 'bg-emerald-400/[0.05]' },
    rose:    { dot: 'bg-rose-400',    text: 'text-rose-300',    ring: 'border-rose-400/25',    bg: 'bg-rose-400/[0.05]' },
    zinc:    { dot: 'bg-zinc-500',    text: 'text-zinc-300',    ring: 'border-white/10',       bg: 'bg-white/[0.02]' },
  }
  const t = tones[v.tone]
  const chips = res && probe ? [
    d.asleep === true ? 'display asleep' : d.asleep === false ? 'display awake' : null,
    d.clamshell === true ? 'lid closed' : d.clamshell === false ? 'lid open' : null,
    typeof d.online === 'number' ? `${d.online} display${d.online === 1 ? '' : 's'} online` : null,
    (d.external || 0) > 0 ? `${d.external} virtual/external` : null,
  ].filter(Boolean) : []
  return (
    <div className={cn('rounded-2xl border p-5', t.ring, t.bg)}>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <span className={cn('size-3 shrink-0 rounded-full', t.dot, checking && 'cl-blink-slow')} />
            <span className={cn('text-[17px] font-semibold tracking-tight', t.text)}>{v.head}</span>
          </div>
          <div className="mt-1 pl-[22px] text-[12.5px] leading-relaxed text-zinc-400">{v.sub}</div>
          {durability && <div className={cn('mt-1.5 pl-[22px] text-[12px] leading-relaxed', durability.c)}>{durability.t}</div>}
        </div>
        <button onClick={run} disabled={checking}
          className={cn('shrink-0 rounded-full border px-3.5 py-1.5 text-[11.5px] font-semibold transition', checking ? 'border-white/10 text-zinc-600' : 'border-white/20 text-zinc-200 hover:border-white/40 hover:bg-white/5')}>
          {checking ? 'checking…' : 'Recheck'}
        </button>
      </div>
      {chips.length > 0 && (
        <div className="cl-mono mt-3 flex flex-wrap gap-1.5 pl-[22px] text-[10.5px]">
          {chips.map((c) => <span key={c} className="rounded bg-white/[0.06] px-1.5 py-0.5 text-zinc-400">{c}</span>)}
        </div>
      )}
      <p className="mt-3.5 border-t border-white/[0.07] pt-3 text-[12px] leading-relaxed text-zinc-500">
        Compositing is macOS actually drawing frames. An agent screenshot is nothing more than the latest composited frame — so when the display sleeps, captures don’t fail, they <span className="text-zinc-300">hang</span>. This check takes a real 1×1 screenshot through the Horse Browser and times it; it runs every time you open this page.
      </p>
    </div>
  )
}

// the DeskPad side: what must be true for screenshots to survive a closed lid
function DeskPadCard({ snap, byId, run }) {
  const dp = snap?.deskpad
  const d = (dp && dp.display) || {}
  const virtualUp = (d.external || 0) > 0
  const lidProof = dp?.installed && dp?.running && virtualUp
  const verdict = !snap ? { c: 'text-zinc-500', t: 'reading the display state…' }
    : lidProof ? { c: 'text-emerald-400', t: 'lid-proof — screenshots survive a closed lid' }
    : d.asleep ? { c: 'text-amber-400', t: 'display asleep — screenshots hang until a virtual display is up' }
    : virtualUp ? { c: 'text-zinc-400', t: `composited by ${d.external} external/virtual display${d.external === 1 ? '' : 's'} — DeskPad optional while they stay connected` }
    : d.clamshell === false ? { c: 'text-zinc-400', t: 'display awake — fine now, not yet lid-proof' }
    : { c: 'text-amber-400', t: 'lid closed — set up the virtual display below' }
  const rows = [
    { ok: !!dp?.installed, label: 'DeskPad installed', hint: dp?.installed ? 'brew cask · notarized' : 'one click or one command' },
    { ok: !!dp?.running, label: 'DeskPad running', hint: dp?.running ? 'menu-bar app' : dp?.installed ? 'launch it below' : '—' },
    { ok: virtualUp, label: 'virtual display online', hint: virtualUp ? `${d.external} beyond the built-in panel` : 'after its one-time screen grant' },
  ]
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500"><Icon name="monitor" size={13} /> The virtual display</div>
      <div className={cn('mb-3.5 text-[12.5px] font-medium', verdict.c)}>{verdict.t}</div>
      <div className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline gap-2.5">
            <span className={cn('inline-block size-2.5 shrink-0 translate-y-px rounded-full', r.ok ? 'bg-emerald-400' : 'bg-zinc-600')} />
            <span className="text-[13px] text-zinc-200">{r.label}</span>
            <span className="ml-auto shrink-0 text-right text-[11px] text-zinc-500">{r.hint}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        {!dp?.installed && (
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => run && run('install-deskpad', { confirm: true })} className="rounded-full px-3 py-1.5 text-[11.5px] font-semibold text-white shadow-sm transition hover:brightness-110" style={{ background: ACCENT }}>Install via brew</button>
            <span className="text-[11px] text-zinc-600">or</span>
            <CopyCmd cmd="brew install --cask deskpad" />
          </div>
        )}
        {dp?.installed && !dp?.running && (
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => run && run('launch-deskpad')} className="rounded-full px-3 py-1.5 text-[11.5px] font-semibold text-white shadow-sm transition hover:brightness-110" style={{ background: ACCENT }}>Launch DeskPad</button>
            <span className="text-[11px] text-zinc-600">or</span>
            <CopyCmd cmd="open -a DeskPad" />
          </div>
        )}
        {dp?.running && !virtualUp && (
          <span className="block text-[11.5px] leading-snug text-amber-300/90">running, but its display isn’t registering — open its window once and approve the Screen Recording prompt.</span>
        )}
      </div>
      <div className="mt-4 flex items-start gap-2 rounded-lg bg-white/[0.04] px-3 py-2 text-[11.5px] leading-relaxed text-zinc-400">
        <Icon name="shield-check" size={14} className="mt-0.5 shrink-0 text-emerald-400/80" />
        <span>audited before recommending: <span className="text-zinc-300">436 lines, all read</span> — MIT, open source, App-Sandboxed with <span className="text-zinc-300">no network entitlement</span>, so macOS itself forbids it from phoning home. Its one permission (Screen Recording) mirrors only its own virtual display.</span>
      </div>
      <ActionConsole entry={(byId && byId['install-deskpad']) || {}} title="installing DeskPad via brew" />
      <ActionConsole entry={(byId && byId['launch-deskpad']) || {}} title="launching DeskPad" />
    </div>
  )
}

// the launcher's incident journal — heal.log rendered as evidence, newest first
const EVENT_INK = {
  'wedge-healed': '#f59e0b', 'wedge-heal-failed': '#f43f5e', 'wedge-heal-unverified': '#a1a1aa',
  'wedge-relaunch': '#fb923c', 'fallback-relaunch': '#f43f5e', 'relaunch-failed': '#f43f5e',
  'display-asleep': '#38bdf8',
}
function agoShort(ts) {
  const ms = Date.now() - Date.parse(ts)
  if (!isFinite(ms)) return ''
  const m = Math.round(ms / 60000)
  if (m < 60) return `${Math.max(m, 0)}m ago`
  const h = Math.round(m / 60)
  if (h < 48) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}
function HealLog({ self }) {
  const [log, setLog] = useState(null)
  const [showAll, setShowAll] = useState(false)
  useEffect(() => {
    let alive = true
    fetch(self.api + '/heal-log').then((r) => r.json()).then((d) => { if (alive) setLog(d) }).catch(() => {})
    // the backend watches heal.log and pushes the parsed tail on change
    const unsub = self.subscribe((f) => { if (f.type === 'heal-log' && f.log && alive) setLog(f.log) })
    return () => { alive = false; unsub && unsub() }
  }, [])
  const entries = (log && log.entries) || []
  const shown = showAll ? entries : entries.slice(0, 8)
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-white/[0.09] px-4 pb-2.5 pt-3">
        <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-300"><Icon name="file-text" size={13} /> Health journal</span>
        <span className="cl-mono text-[10.5px] text-zinc-600">{log ? log.path : ''}</span>
        <span className="ml-auto text-[10.5px] text-zinc-500">{log ? (log.total ? `${log.total} entries` : 'empty') : 'reading…'}</span>
      </div>
      {entries.length === 0 ? (
        <div className="px-4 py-5 text-[12px] text-zinc-500">no incidents recorded — every wedge heal, forced relaunch, and display-asleep episode the launcher handles lands here, with why-context (time since wake, GPU age, tabs saved).</div>
      ) : (
        <>
          <div className="divide-y divide-white/[0.05]">
            {shown.map((e, i) => (
              <div key={i} className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 px-4 py-2">
                <span className="cl-mono w-14 shrink-0 text-[10.5px] text-zinc-500" title={e.ts}>{agoShort(e.ts)}</span>
                <span className="cl-mono shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-semibold" style={{ background: (EVENT_INK[e.event] || '#a1a1aa') + '22', color: EVENT_INK[e.event] || '#a1a1aa' }}>{e.event}</span>
                <span className="cl-mono flex min-w-0 flex-wrap gap-x-2 gap-y-0.5 text-[10.5px] text-zinc-400">
                  {Object.keys(e.fields || {}).length
                    ? Object.entries(e.fields).map(([k, v]) => <span key={k}><span className="text-zinc-600">{k}=</span>{v}</span>)
                    : <span className="truncate">{e.detail}</span>}
                </span>
              </div>
            ))}
          </div>
          {entries.length > 8 && (
            <button onClick={() => setShowAll((x) => !x)} className="block w-full border-t border-white/[0.06] px-4 py-2 text-left text-[11px] text-zinc-500 transition hover:text-zinc-300">
              {showAll ? 'show fewer' : `show all ${entries.length}`}
            </button>
          )}
        </>
      )}
    </div>
  )
}

// the live stack as ONE table — agent sessions (the primary sort) · harness daemons ·
// Horse Browser tabs — the rows spanning all three columns. One fetch for
// initial state; after that the backend's watcher pushes 'processes' frames
// over the shell WS whenever the stack actually changed.
const wallDot = (ok) => ok === true ? 'bg-emerald-400' : ok === false ? 'bg-amber-400' : 'bg-zinc-600'

function ProcessWall({ self }) {
  const [p, setP] = useState(null)
  useEffect(() => {
    let alive = true
    fetch(self.api + '/processes').then((r) => r.json()).then((d) => { if (alive) setP(d) }).catch(() => {})
    const unsub = self.subscribe((f) => { if (f.type === 'processes' && f.processes) setP(f.processes) })
    return () => { alive = false; unsub && unsub() }
  }, [])
  if (!p) return <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center text-[12px] text-zinc-500">reading the live stack…</div>
  const h = p.harness, c = p.chrome
  const sessions = [...p.sessions].sort((a, b) => (a.callsign || '').localeCompare(b.callsign || ''))   // sorted by name
  const live = new Set(sessions.map((s) => s.callsign))
  const unmatchedDaemons = h.daemons.filter((d) => !d.callsign || !live.has(d.callsign))
  const looseTabs = p.tabs.filter((t) => !t.callsign || !live.has(t.callsign))
  // stack health is judged in the console tiles above — the harness header just
  // counts; Chrome keeps its up-to-date hint (the tiles don't track CfT releases)
  const cols = [
    { ok: sessions.length ? true : null, title: 'Agent sessions', status: `${sessions.length} running · sorted by name` },
    { ok: h.running ? true : null, title: 'Harness daemons', status: h.running ? `${h.count} running` : 'none' },
    { ok: c.running ? (c.upToDate === false ? false : true) : null, title: 'Browser tabs', status: !c.running ? 'browser off' : `Chrome ${c.version || ''} running · :${c.port || 9223}${c.upToDate === false ? ` · update → ${c.latest}` : c.upToDate ? ' · up to date' : ''}` },
  ]
  return (
    // the three-column wall needs real width — on phones it scrolls sideways inside its own card
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.02]">
      <div className="min-w-[640px]">
      {/* three column headers, each carrying its own status check */}
      <div className="grid grid-cols-3 divide-x divide-white/[0.07] border-b border-white/[0.09]">
        {cols.map((col) => (
          <div key={col.title} className="px-4 pb-2.5 pt-3">
            <div className="flex items-center gap-2"><span className={cn('size-2 shrink-0 rounded-full', wallDot(col.ok))} /><span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-300">{col.title}</span></div>
            <div className="mt-0.5 text-[10.5px] text-zinc-500">{col.status}</div>
          </div>
        ))}
      </div>

      {/* one row per agent (sorted), spanning the three columns: agent · its daemon(s) · its tab(s) */}
      <div className="divide-y divide-white/[0.05]">
        {sessions.length ? sessions.map((s) => {
          const ds = h.daemons.filter((d) => d.callsign === s.callsign)
          const ts = p.tabs.filter((t) => t.callsign === s.callsign)
          return (
            <div key={s.id} className="grid grid-cols-3 divide-x divide-white/[0.05]">
              <div className="flex min-w-0 items-center gap-2 px-4 py-2.5 text-[12px]">
                <span>{s.emoji}</span>
                <span className="cl-mono shrink-0 font-bold" style={{ color: inkFor(s.color, true) }}>{s.callsign}</span>
                <span className="truncate text-zinc-500">{s.cwd ? s.cwd.split('/').filter(Boolean).pop() : ''}</span>
                {s.active && <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" title="working now" />}
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 px-4 py-2.5 text-[12px]">
                {ds.length ? ds.map((d) => (
                  <span key={d.pid} className="inline-flex items-center gap-1.5"><span className={cn('size-1.5 rounded-full', d.legacy ? 'bg-amber-400/80' : 'bg-emerald-400/80')} /><span className="cl-mono text-[11px] text-zinc-300">harness #{d.pid}</span>{d.legacy && <span className="rounded bg-amber-400/10 px-1 text-[9px] font-semibold text-amber-400" title="a pre-0.9 browser_harness daemon — from before the vendored switchover">pre-0.9</span>}</span>
                )) : <span className="text-[11px] text-zinc-700">—</span>}
              </div>
              <div className="min-w-0 px-4 py-2.5 text-[12px]">
                {ts.length ? <div className="space-y-1">{ts.map((t, i) => (
                  <div key={i} className="flex items-center gap-1.5"><span className="truncate text-zinc-300">{t.title.replace(/^🐴\s*/, '')}</span><span className="cl-mono ml-auto shrink-0 text-[10px] text-zinc-600">{t.domain}</span></div>
                ))}</div> : <span className="text-[11px] text-zinc-700">—</span>}
              </div>
            </div>
          )
        }) : <div className="px-4 py-6 text-center text-[12px] text-zinc-600">no agents right now</div>}
      </div>

      {/* below: not tied to a live session — laid out in the SAME three columns, so each kind sits
          under the column it belongs to (orphaned daemons under daemons, loose tabs under tabs) */}
      {(looseTabs.length > 0 || unmatchedDaemons.length > 0) && (
        <div className="border-t border-white/[0.08] bg-white/[0.012]">
          <div className="px-4 pt-2.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Not matched to a live session <span className="normal-case tracking-normal text-zinc-600">— older sessions, other machines, or pre-0.9 leftovers</span></div>
          <div className="grid grid-cols-3 divide-x divide-white/[0.05] pb-2.5 pt-1">
            <div className="px-4 py-1.5 text-[11px] text-zinc-700">—</div>
            <div className="min-w-0 px-4 py-1.5">
              {unmatchedDaemons.length > 0
                ? <div className="space-y-1">{unmatchedDaemons.map((d) => (
                    <div key={d.pid} className="flex items-center gap-1.5 text-[12px] text-zinc-400"><span className="size-1.5 shrink-0 rounded-full bg-zinc-500" /><span className="cl-mono">{d.name || 'default'}</span>{d.legacy && <span className="rounded bg-amber-400/10 px-1 text-[9px] font-semibold text-amber-400" title="a pre-0.9 browser_harness daemon — from before the vendored switchover">pre-0.9</span>}<span className="cl-mono ml-auto shrink-0 text-[10px] text-zinc-600">#{d.pid}</span></div>
                  ))}</div>
                : <span className="text-[11px] text-zinc-700">—</span>}
            </div>
            <div className="min-w-0 px-4 py-1.5">
              {looseTabs.length > 0
                ? <div className="space-y-1">{looseTabs.map((t, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[12px]">{t.agent && <span className="shrink-0">🐴</span>}<span className="truncate text-zinc-400">{t.title.replace(/^🐴\s*/, '')}</span><span className="cl-mono ml-auto shrink-0 text-[10px] text-zinc-600">{t.domain}</span></div>
                  ))}</div>
                : <span className="text-[11px] text-zinc-700">—</span>}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

/* a tiny markdown renderer (copied from the claude-md module, dark-hardcoded)
 * — headings, lists, **bold**, `code`, ``` fences; enough for our own docs */
function Markdown({ text }) {
  const inline = (s) => {
    const parts = []; let last = 0, i = 0, m
    const re = /(\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|`([^`]+)`)/g
    while ((m = re.exec(s))) {
      if (m.index > last) parts.push(s.slice(last, m.index))
      if (m[2]) parts.push(<strong key={i++} className="font-semibold text-zinc-50">{m[2]}</strong>)
      else if (m[3]) parts.push(<em key={i++} className="italic text-zinc-200">{m[3]}</em>)
      else parts.push(<code key={i++} className="cl-mono rounded bg-white/10 px-1 py-0.5 text-[0.9em]">{m[4]}</code>)
      last = m.index + m[0].length
    }
    if (last < s.length) parts.push(s.slice(last))
    return parts
  }
  // hard-wrapped source lines join into real paragraphs / list items
  const out = []; let list = null, code = null, para = null, k = 0
  const flushPara = () => { if (para != null) { out.push(<p key={k++} className="my-2 text-[13px] leading-relaxed text-zinc-300">{inline(para)}</p>); para = null } }
  const flushList = () => {
    if (list) {
      out.push(<ul key={k++} className="my-2 space-y-1">{list.map((it, j) => (
        <li key={j} className="flex gap-2 text-[13px] leading-relaxed text-zinc-300"><span className="mt-px shrink-0 tabular-nums text-zinc-500">{it.marker}</span><span>{inline(it.text)}</span></li>
      ))}</ul>)
      list = null
    }
  }
  const flush = () => { flushPara(); flushList() }
  for (const line of (text || '').split('\n')) {
    if (/^```/.test(line)) {
      if (code === null) { flush(); code = [] }
      else { out.push(<pre key={k++} className="cl-mono my-3 overflow-auto rounded-lg bg-black/50 p-3 text-[12px] leading-relaxed text-zinc-300">{code.join('\n')}</pre>); code = null }
      continue
    }
    if (code !== null) { code.push(line); continue }
    if (/^<!--.*-->\s*$/.test(line)) continue   // owner markers on tool-managed rule files
    if (/^#\s+/.test(line)) { flush(); out.push(<h3 key={k++} className="mt-6 border-b border-white/10 pb-1.5 text-[18px] font-bold text-zinc-50 first:mt-0">{inline(line.replace(/^#\s+/, ''))}</h3>) }
    else if (/^##\s+/.test(line)) { flush(); out.push(<h4 key={k++} className="mt-4 text-[14.5px] font-semibold text-zinc-100">{inline(line.replace(/^##\s+/, ''))}</h4>) }
    else if (/^###\s+/.test(line)) { flush(); out.push(<h5 key={k++} className="mt-3 text-[13px] font-semibold text-zinc-300">{inline(line.replace(/^###\s+/, ''))}</h5>) }
    else if (/^-{3,}\s*$/.test(line)) { flush(); out.push(<div key={k++} className="my-4 border-t border-white/10" />) }
    else if (/^[-*]\s+/.test(line)) { flushPara(); (list = list || []).push({ marker: '•', text: line.replace(/^[-*]\s+/, '') }) }
    else if (/^\d+\.\s+/.test(line)) { flushPara(); (list = list || []).push({ marker: /^(\d+)\./.exec(line)[1] + '.', text: line.replace(/^\d+\.\s+/, '') }) }
    else if (line.trim() === '') flush()
    else if (list && /^\s+\S/.test(line)) { list[list.length - 1].text += ' ' + line.trim() }
    else { flushList(); para = para == null ? line.trim() : para + ' ' + line.trim() }
  }
  flush()
  return <div>{out}</div>
}

// the reading modal (pattern from the claude-md module) — Pretty renders the
// markdown for focus; Raw shows the exact bytes the agent gets.
function DocModal({ doc, self, onClose }) {
  const [raw, setRaw] = useState(() => !/\.md$/i.test(doc.path))   // code files (.py) open raw; markdown opens pretty
  const [content, setContent] = useState(null)
  useEffect(() => {
    let alive = true
    fetch(self.api + '/agent-doc?path=' + encodeURIComponent(doc.path)).then((r) => r.json())
      .then((d) => { if (alive) setContent(d.content || '(could not load this doc)') })
      .catch(() => { if (alive) setContent('(could not load this doc)') })
    return () => { alive = false }
  }, [doc.path])
  const accent = doc.kind === 'rule' || doc.kind === 'auth-rule'   // always-on rules get the accent badge
  const badgeLabel = doc.kind === 'manual' ? 'on demand — horse-browser skill' : doc.kind === 'verb-file' ? 'verb source' : 'always on — every session'
  const seg = (active) => cn('rounded-md px-2.5 py-1 text-[11px] font-semibold transition', active ? 'bg-white/15 text-zinc-50 shadow-sm' : 'text-zinc-400 hover:text-zinc-200')
  return (
    <Modal onClose={onClose} size="max-w-3xl">
      {(close) => (
        <>
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-5 py-3.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <Icon name="book-open" size={15} className="shrink-0 text-zinc-500" />
              <code className="cl-mono min-w-0 truncate text-[13px] font-semibold text-zinc-50">{doc.path}</code>
              <span className={cn('hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold sm:inline', !accent && 'bg-white/[0.07] text-zinc-300')} style={accent ? { background: ACCENT + '22', color: ACCENT } : undefined}>{badgeLabel}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="flex items-center gap-0.5 rounded-lg bg-white/[0.08] p-0.5">
                <button onClick={() => setRaw(false)} className={seg(!raw)}>Pretty</button>
                <button onClick={() => setRaw(true)} className={seg(raw)}>Raw</button>
              </span>
              <button onClick={close} className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-zinc-200"><Icon name="x" size={16} /></button>
            </div>
          </div>
          <div className="flex-1 overflow-auto px-6 py-5 sm:px-8 sm:py-6">
            {content == null ? <div className="text-[13px] text-zinc-400">loading…</div>
              : raw ? <pre className="cl-mono whitespace-pre-wrap break-words text-[12px] leading-relaxed text-zinc-300">{content}</pre>
              : <Markdown text={content} />}
          </div>
        </>
      )}
    </Modal>
  )
}

// the two entries agents actually get — each says WHAT it is and WHEN it
// reaches the agent; the text itself lives in the DocModal, one click away.
/* ──────────────────────────────── module ─────────────────────────────────── */
// small shared section header for the board
function SectionLabel({ children, hint }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: ACCENT }}>{children}</span>
      {hint && <span className="text-[12.5px] text-zinc-500">{hint}</span>}
    </div>
  )
}

/* ─────────────────────────────── the hero ──────────────────────────────────
 * The full-bleed banner: brand + a live indicator + the "read the full story"
 * link bottom-left, and the install/version box floated top-right (a distinct
 * dark card — install is kept separate from the live-status panels below). */
function Hero({ snap, navigate, img, run }) {
  return (
    <Reveal className="relative -mx-6 -mt-6 mb-12 overflow-hidden lg:-mx-10 lg:-mt-10">
      <div className="relative flex min-h-[24rem] items-center sm:min-h-[26rem]">
        <img src={img('horse-banner.jpg')} loading="lazy" alt="" className="absolute inset-0 h-full w-full object-cover object-[center_28%]" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/55 to-zinc-950/25" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-zinc-950/90 via-zinc-950/30 to-zinc-950/60" />
        {/* title (left) + install box (right) share one horizontal band — both vertically centered */}
        <div className="relative z-10 flex w-full flex-col gap-7 px-6 py-8 sm:flex-row sm:items-center sm:justify-between lg:px-10">
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-100/85">The Horse Browser</div>
            <h1 className="text-[26px] font-semibold leading-none tracking-tight text-white sm:text-[30px]">A browser your agents drive</h1>
            <p className="mt-2 max-w-md text-[13px] leading-snug text-zinc-300">Logged in, never in your way — a second browser just for agents. This is its control board.</p>
            <div className="mt-3.5">
              <button onClick={() => navigate('story')} className="group inline-flex items-center gap-1.5 text-[12.5px] font-medium text-zinc-300 transition hover:text-white">
                Read the full story <span className="text-zinc-500 transition group-hover:translate-x-0.5 group-hover:text-zinc-300">→</span>
              </button>
            </div>
          </div>
          <div className="shrink-0"><InstallBox snap={snap} run={run} /></div>
        </div>
      </div>
    </Reveal>
  )
}

/* ────────────────────────────── the board ──────────────────────────────────
 * The default route: a lean control board — a live-status row up top, then the
 * credentials/access dashboard. Each tile/link opens a detail page. */
function Board({ snap, self, navigate, actions, img }) {
  const { byId, run } = actions || {}

  return (
    <>
      {/* the hero carries the install/version box, top-right */}
      <Hero snap={snap} navigate={navigate} img={img} run={run} />

      {/* the action consoles for the install box's buttons live just under the hero */}
      <ActionConsole entry={(byId && byId['install-horse-browser']) || {}} title="installing horse-browser from npm" />
      <ActionConsole entry={(byId && byId['harness-setup']) || {}} title="building the harness venv" />

      {/* live status — clickable tiles into the detail pages */}
      <Reveal>
        <SectionLabel hint="live from this machine — click through for the detail">Live status</SectionLabel>
        <ConsoleTiles snap={snap} self={self} navigate={navigate} />
      </Reveal>

      {/* credentials & access — the whole auth system, live, on the board */}
      <Reveal>
        <div className="mt-12 sm:mt-14">
          <SectionLabel hint="how agents sign in — the secret never enters the model">Credentials &amp; access</SectionLabel>
          {/* AuthPanel warms/slides the vault on mount so hints are ready for agents. */}
          <AuthPanel self={self} navigate={navigate} />
          <ActionConsole entry={(byId && byId['install-browser-config']) || {}} title="applying the browser rule" />
        </div>
      </Reveal>
    </>
  )
}

/* ─────────────────────────── subpage: runtime ───────────────────────────────
 * The live operations view — moved off the board: can agents see (compositing
 * probe), the lid-closed fix (DeskPad), what's running (process wall), and the
 * launcher's self-heal journal. */
function Runtime({ snap, self, navigate, actions }) {
  const { byId, run } = actions || {}
  const horseInstalled = !!snap?.tools?.['horse-browser']?.installed
  return (
    <>
      <button onClick={() => navigate('')} className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-zinc-400 transition hover:text-zinc-100">← back to the board</button>

      <Reveal className="@container">
        <SectionLabel hint="can agents SEE right now — a real screenshot probe, even lid-closed">Agent vision</SectionLabel>
        <CompositingCheck self={self} />
        <div className="mt-6 grid grid-cols-1 items-start gap-x-12 gap-y-8 @4xl:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
          <DeskPadCard snap={snap} byId={byId} run={run} />
          {/* the closed-lid reasoning — it belongs here with vision, not in the marketing story */}
          <Step dark label="Lid closed" color={ACCENT} title="Why waking the display is the wrong fix" className="!mt-0"
            lead="The moment a Mac’s last display sleeps, macOS stops drawing. DOM automation keeps working over a perfectly stable connection — but a screenshot needs a composited frame, so it just… waits. Forever.">
            <div className="space-y-3.5 text-[14px] leading-relaxed text-zinc-300">
              <p>The obvious fix makes things worse. Waking the panel works for about ten seconds — then macOS force-blanks a closed lid no matter what, and on that flap <span className="text-zinc-100">Chrome drops every live agent connection in the browser</span>. Measured, not theory: one wake, one delayed massacre. The horse-browser launcher therefore never touches a sleeping display — it skips its paint check, notes the episode in the health journal below, and moves on.</p>
              <p>The clean fix is a display that never sleeps because it isn’t real. <span className="text-zinc-100">DeskPad</span> creates a virtual screen; WindowServer keeps compositing around the clock, and screenshots, vision, and challenge-solving all come back — lid open or shut. A $5 HDMI dummy plug does the same job in hardware, if you prefer zero software.</p>
            </div>
          </Step>
        </div>
      </Reveal>

      {horseInstalled && (
        <Reveal>
          <div className="mt-12 sm:mt-14">
            <SectionLabel hint="agents browsing · harness daemons · the tabs they have open">Running right now</SectionLabel>
            <ProcessWall self={self} />
          </div>
        </Reveal>
      )}

      <Reveal>
        <div className="mt-12 sm:mt-14">
          <SectionLabel hint="every wedge heal, forced relaunch, and display-asleep episode, with why-context">Health journal</SectionLabel>
          <HealLog self={self} />
        </div>
      </Reveal>

      <div className="mt-14"><button onClick={() => navigate('')} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-zinc-300 transition hover:text-white">← back to the board</button></div>
    </>
  )
}

/* ─── the docs page: the four layers an agent works through ──────────────────
 * general → specific — rules, verbs, site skills, systems. Centered (not a
 * left-corner column), origin-tagged, and framed as a scan ("where we look")
 * so it can go live later. L1 keeps the real Read-it modals; L4 collapses. */
const DOC_ORIGINS = {
  npm: { c: 'text-sky-300', bg: 'bg-sky-400/10' },
  module: { c: 'text-emerald-300', bg: 'bg-emerald-400/10' },
  you: { c: 'text-amber-300', bg: 'bg-amber-400/10' },
  system: { c: 'text-zinc-400', bg: 'bg-white/[0.07]' },
}
function Origin({ o }) {
  const m = DOC_ORIGINS[o] || DOC_ORIGINS.system
  return <span className={cn('cl-mono inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold', m.bg, m.c)}><span className="size-1.5 rounded-full bg-current" />{o}</span>
}
function ScanRow({ children }) {
  return <div className="cl-mono mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-500"><span className="rounded border border-white/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-500">where we look</span>{children}</div>
}
function DocLayer({ num, title, desc, scan, children }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
      <div className="border-b border-white/10 bg-white/[0.015] px-5 py-4 sm:px-6">
        <div className="flex items-start gap-3.5">
          <span className="cl-mono shrink-0 pt-1 text-[11px] font-bold tracking-[0.1em] text-zinc-600">{num}</span>
          <div className="min-w-0">
            <h3 className="text-[16.5px] font-semibold tracking-tight text-zinc-100">{title}</h3>
            <p className="mt-1 max-w-[70ch] text-[13px] leading-relaxed text-zinc-400">{desc}</p>
            {scan && <ScanRow>{scan}</ScanRow>}
          </div>
        </div>
      </div>
      <div className="px-5 py-3 sm:px-6">{children}</div>
    </section>
  )
}
function DocFolder({ children }) {
  return <div className="cl-mono mb-2 mt-7 text-[12px] leading-snug text-zinc-500 first:mt-1">{children}</div>
}
function DocNode({ last, name, verbs, desc, meta, warn, origin, action }) {
  return (
    <div className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-baseline gap-x-2.5 border-t border-white/[0.05] py-2.5 first:border-t-0">
      <span className="cl-mono select-none text-[13px] text-zinc-700">{last ? '└─' : '├─'}</span>
      <div className="min-w-0">
        <span className="cl-mono text-[13.5px] font-semibold text-zinc-100">{name}</span>
        {verbs && <VerbList items={verbs} />}
        {desc && <div className="mt-1 text-[12.5px] leading-snug text-zinc-400">{desc}</div>}
        {meta && <div className="cl-mono mt-1 truncate text-[10.5px] text-zinc-600">{meta}</div>}
        {warn && <div className="mt-1 text-[11.5px] text-amber-400">{warn}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2 self-center">{action}<Origin o={origin} /></div>
    </div>
  )
}
const SYSTEMS = [
  { n: 'horse-browser', o: 'npm', d: <>The package itself: the launcher, the tab-grouper Chrome extension, and the vendored CDP daemon (<code className="cl-mono text-[11px] text-zinc-300">horse_harness.daemon</code>) that drives tabs.</> },
  { n: 'Chrome', o: 'system', d: 'Chrome-for-Testing — the actual browser agents drive. A pinned build so the stealth mask matches its version.' },
  { n: 'CDP', o: 'system', d: 'Chrome DevTools Protocol — the wire between the daemon and Chrome. Every verb ultimately becomes a CDP call.' },
  { n: 'hb-broker', o: 'module', d: 'The signed local daemon holding the only vault session; types secrets over CDP, origin-checked and policy-gated. Lives in Application Support, outside every repo.' },
  { n: 'Bitwarden', o: 'system', d: <>The <code className="cl-mono text-[11px] text-zinc-300">bw</code> CLI + vault the broker reads from. Tiered per collection: auto / ask / never.</> },
  { n: 'DeskPad', o: 'system', d: 'Optional virtual display — keeps macOS compositing so screenshots survive a closed lid. Brew cask, sandboxed, no network.' },
]
// one-line description per verb — surfaced in a hover popup on the L2 verb lists
const VERB_DESC = {
  bh_open: 'Open (or reuse) your own tab and navigate it to a URL.',
  goto_url: 'Navigate the current tab to a URL.',
  js: 'Run a JavaScript expression in the page and return its result.',
  cdp: 'Send a raw Chrome DevTools Protocol command — the escape hatch under every verb.',
  page_info: 'The current tab’s URL, title, and viewport size.',
  wait_for_load: 'Wait for the page to finish loading.',
  capture_screenshot: 'A reliable PNG of your tab — works even backgrounded or occluded.',
  bh_list: 'List the tabs in your session.',
  click: 'Trusted click on a CSS selector — fires real mouse events, so the page’s listeners run.',
  click_xy: 'Trusted click at x, y coordinates.',
  type_into: 'Trusted typing into a field — fires real key events, so React/Vue state updates.',
  type_text: 'Type text at the current focus.',
  press: 'Press a named key — Enter, Tab, Escape…',
  press_hold: 'Press and hold a key or button for a duration — for press-&-hold challenges.',
  drag: 'Drag from one point or element to another — for slider challenges.',
  challenge_cleared: 'Check whether an anti-bot challenge has cleared.',
  type_secret: 'The broker types a vault password into a field — returns a char count, never the value.',
  type_totp: 'The broker types the current 2FA code into a field.',
  get_secret: 'Return a secret for non-web (CLI/env) use — a macOS approval each time; never print it.',
  get_totp: 'Return the current TOTP code for non-web use.',
  creds: 'List the logins you’re allowed to use — your allow-list.',
  obs_install: 'Install network + JS-error capture on the page.',
  obs_dump: 'Dump the captured network requests and console errors.',
  scroll_to: 'Scroll an element into view.',
  shot: 'Screenshot a single element.',
  ac_items: 'Read the page’s autocomplete suggestions.',
}
// verb chips with a hover popup. The tooltip is position:fixed so it escapes the
// layer card's overflow-hidden; positioned from the hovered chip's bounding rect.
function VerbList({ items }) {
  const [tip, setTip] = useState(null)
  const show = (e, desc) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ desc, x: r.left + r.width / 2, y: r.top }) }
  return (
    <div className="cl-mono mt-1 flex flex-wrap items-center gap-y-1 text-[11.5px] leading-relaxed">
      {items.map((v, i) => (
        <span key={v.name} className="inline-flex items-center">
          <span onMouseEnter={(e) => show(e, v.desc)} onMouseLeave={() => setTip(null)}
            className="cursor-help rounded px-1 py-0.5 text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100">{v.name}</span>
          {i < items.length - 1 && <span className="px-1 text-zinc-700">·</span>}
        </span>
      ))}
      {tip && ReactDOM.createPortal(
        <div className="pointer-events-none fixed z-[60] -translate-x-1/2 -translate-y-full" style={{ left: tip.x, top: tip.y - 9 }}>
          <div className="max-w-[250px] rounded-lg border border-white/15 bg-zinc-900 px-3 py-2 text-[12px] leading-snug text-zinc-100 shadow-xl" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif' }}>{tip.desc}</div>
          <div className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-white/15 bg-zinc-900" />
        </div>,
        document.body
      )}
    </div>
  )
}
function Docs({ snap, self, navigate }) {
  const ruleDoc = snap?.agentDocs?.docs?.find((d) => d.kind === 'rule')
  const authDoc = snap?.agentDocs?.docs?.find((d) => d.kind === 'auth-rule')
  const manualDoc = snap?.agentDocs?.docs?.find((d) => d.kind === 'manual')
  const verbFiles = (snap?.agentDocs?.docs || []).filter((d) => d.kind === 'verb-file')
  const docFor = (base) => verbFiles.find((d) => d.path.endsWith(base))
  const [reader, setReader] = useState(null)
  const [showSys, setShowSys] = useState(false)
  // the verbs come LIVE from the harness — `horse-browser verbs --json` (name, tier, docstring).
  // Nothing about them is hardcoded here; VERB_DESC is only a fallback for verbs with no docstring.
  const [verbRows, setVerbRows] = useState(null)
  useEffect(() => { fetch(self.api + '/verbs').then((r) => r.json()).then((v) => setVerbRows(Array.isArray(v) ? v : [])).catch(() => setVerbRows([])) }, [])
  const readBtn = (doc) => doc?.exists
    ? <button onClick={() => setReader(doc)} className="cl-mono shrink-0 rounded-full border border-white/15 px-2.5 py-0.5 text-[10.5px] font-semibold text-zinc-300 transition hover:border-white/30 hover:text-white">Read</button>
    : null
  const stat = (doc) => doc?.exists ? `${doc.lines} lines · ${(doc.bytes / 1000).toFixed(1)} kB` : null
  // group the introspected verbs by source file into the three tiers, ordered core → plugins → local
  const bucket = (t) => t === 'core' ? 'core' : t.startsWith('plugin') ? 'plugins' : 'local'
  const TIER_META = {
    core: { head: 'core', sub: 'shipped CDP verbs — read for reference (npm owns them)' },
    plugins: { head: 'plugins', sub: 'installable capability bundles — load between core and your file' },
    local: { head: 'local', sub: 'your own file — loaded last, so it always wins' },
  }
  const _fileMap = {}
  ;(verbRows || []).forEach((r) => {
    const g = _fileMap[r.file] || (_fileMap[r.file] = { file: r.file, base: r.file.split('/').pop(), tier: r.tier, verbs: [] })
    g.verbs.push({ name: r.name, desc: r.doc || VERB_DESC[r.name] || '' })
  })
  const rank = (g) => bucket(g.tier) === 'core' ? 0 : bucket(g.tier) === 'plugins' ? 1 : 2
  const verbGroups = Object.values(_fileMap).sort((a, b) => rank(a) - rank(b) || a.base.localeCompare(b.base))
  const l2body = []
  ;['core', 'plugins', 'local'].forEach((bk) => {
    const files = verbGroups.filter((g) => bucket(g.tier) === bk)
    if (!files.length) return
    const dir = files[0].file.slice(0, files[0].file.lastIndexOf('/') + 1)   // shared dir (shortened server-side)
    l2body.push(<DocFolder key={'f-' + bk}><b className="font-semibold text-zinc-400">{TIER_META[bk].head}</b> <code className="cl-mono rounded bg-white/[0.05] px-1.5 py-0.5 text-[10.5px] text-zinc-300">{dir}</code> — {TIER_META[bk].sub}</DocFolder>)
    files.forEach((g, i) => {
      const origin = bk === 'core' ? 'npm' : bk === 'local' ? 'you' : (g.base === 'atelier_login.py' ? 'module' : 'you')
      l2body.push(<DocNode key={g.file} last={i === files.length - 1} name={g.base} origin={origin} verbs={g.verbs} action={readBtn(docFor(g.base))} />)
    })
  })
  return (
    <>
      <button onClick={() => navigate('')} className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-zinc-400 transition hover:text-zinc-100">← back to the board</button>
      <div className="mx-auto max-w-4xl">
        <Reveal>
          <div className="cl-mono text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: ACCENT }}>what an agent works through</div>
          <h1 className="mt-2.5 text-[27px] font-semibold leading-tight tracking-tight text-zinc-50 sm:text-[32px]">Four layers, general to specific</h1>
          <p className="mt-3 max-w-[66ch] text-[15px] leading-relaxed text-zinc-400">Start with the <span className="text-zinc-200">rules</span> that tell an agent this exists, drop to the <span className="text-zinc-200">verbs</span> it can call, then the <span className="text-zinc-200">site skills</span> that fire on the page it's on, and finally the <span className="text-zinc-200">systems</span> running underneath. Each layer names where we look — so it can become a live scan of what's installed. Tags show each thing's origin.</p>

          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-[12.5px] text-zinc-400">
            <span className="cl-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">origin</span>
            <span className="inline-flex items-center gap-1.5"><Origin o="npm" /> the package</span>
            <span className="inline-flex items-center gap-1.5"><Origin o="module" /> this module</span>
            <span className="inline-flex items-center gap-1.5"><Origin o="you" /> hand-authored</span>
            <span className="inline-flex items-center gap-1.5"><Origin o="system" /> a running service</span>
          </div>
          <p className="mt-2.5 px-1 text-[12.5px] text-zinc-500">A file can live in <span className="text-zinc-300">more than one place</span> — the same verb name can load from several folders. Each layer lists every location it scans, most general first.</p>

          <div className="mt-6 space-y-6">
            <DocLayer num="L1" title="The rules — how an agent knows any of this exists"
              desc="Always-on: every Claude Code session loads the rules on start — no accounts, no secrets, just the protocol. One deeper manual waits behind a command, pulled only when needed."
              scan={<><span className="text-zinc-400">~/.claude/rules/</span><span className="text-zinc-600">·</span><code className="cl-mono rounded bg-white/[0.08] px-1.5 py-0.5 text-[10px] text-zinc-200">horse-browser skill</code></>}>
              <DocFolder><b className="font-semibold text-zinc-400">~/.claude/rules/</b> — always-on, loaded into every session</DocFolder>
              <DocNode name="horse-browser.md" origin="npm"
                desc="the browsing rule + the verb index — how to drive the browser, what the paved verbs are"
                meta={stat(ruleDoc)} warn={ruleDoc && !ruleDoc.exists ? 'not applied yet — apply it from the board’s “What agents know” tile' : null}
                action={readBtn(ruleDoc)} />
              <DocNode last name="horse-browser-auth.md" origin="module"
                desc="the credential rule — use the broker, never type a secret yourself; auto / ask / never is the broker’s call"
                meta={stat(authDoc)} warn={authDoc && !authDoc.exists ? 'not installed yet — set up the broker' : null}
                action={readBtn(authDoc)} />
              <DocFolder><b className="font-semibold text-zinc-400">on demand</b> · <code className="cl-mono rounded bg-white/[0.08] px-1.5 py-0.5 text-[11px] text-zinc-200">horse-browser skill</code> — pulled only when an agent needs the depth</DocFolder>
              <DocNode last name="MANUAL.md" origin="npm"
                desc="every verb with the raw CDP it runs, the challenge playbook, extension internals, diagnostics"
                meta={stat(manualDoc)} action={readBtn(manualDoc)} />
            </DocLayer>

            <DocLayer num="L2" title="The verbs — every command an agent can call"
              desc="The Python an agent actually calls — each verb is a thin wrapper over one Chrome DevTools Protocol command, so it drives Chrome directly rather than through pre-built buttons. Three tiers merge into one namespace, loaded last-wins: core, then plugins, then your own file."
              scan={<><code className="cl-mono rounded bg-white/[0.08] px-1.5 py-0.5 text-[10px] text-zinc-200">horse-browser verbs --json</code><span className="text-zinc-600">·</span><span className="text-zinc-400">live from the harness</span></>}>
              {verbRows == null ? <div className="py-3 text-[12.5px] text-zinc-500">reading the harness…</div>
                : l2body.length === 0 ? <div className="py-3 text-[12.5px] text-zinc-500">no verbs found — is horse-browser installed?</div>
                : l2body}
              <div className="mt-6 rounded-xl border border-white/[0.07] bg-white/[0.015] px-5 py-4 text-[12.5px] leading-relaxed text-zinc-400">
                <span className="font-semibold text-zinc-200">How they load &amp; who wins.</span> Each call loads <span className="text-zinc-300">core</span> first, then every <span className="text-zinc-300">plugin</span> in <code className="cl-mono text-[11.5px] text-zinc-300">plugins/</code>, then your <span className="text-zinc-300">local</span> <code className="cl-mono text-[11.5px] text-zinc-300">agent_helpers.py</code> — and the last definition of a name wins. So <span className="text-zinc-300">your file overrides anything</span>: write the one verb you need and it takes precedence. Safe even for the broker verbs — their security is enforced in the daemon, not in the Python.
                <div className="cl-mono mt-2.5 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 font-semibold text-zinc-200">core</span><span style={{ color: ACCENT }}>→</span>
                  <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 font-semibold text-zinc-200">plugins/*.py</span><span style={{ color: ACCENT }}>→</span>
                  <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 font-semibold text-zinc-200">agent_helpers.py <span className="text-amber-300">· wins</span></span>
                </div>
                <div className="mt-2.5">Ownership: <span className="text-zinc-200">core</span> is replaced by npm on update · <span className="text-zinc-200">plugins</span> are owned by whoever installed them (the broker plugin rewrites itself to canonical when it drifts) · <span className="text-zinc-200">your file</span> is written by no one but you.</div>
              </div>
            </DocLayer>

            <DocLayer num="L3" title="Site skills — context that fires on the page you’re on"
              desc="Not always loaded — triggered by where the agent navigates. A hook runs on every first navigation; domain notes surface when the host matches."
              scan={<><span className="text-zinc-400">~/.config/horse-browser/hints.d/</span><span className="text-zinc-600">·</span><span className="text-zinc-400">~/.config/browser-harness/agent-workspace/domain-skills/&lt;host&gt;/</span></>}>
              <DocFolder><b className="font-semibold text-zinc-400">~/.config/horse-browser/hints.d/</b> — every executable runs on first navigation (a plug point — add your own)</DocFolder>
              <DocNode last name="atelier-hb-auth" origin="module" desc="the per-site hint hook — asks the broker if this site has a saved login and prints “vault login available”" />
              <div className="mt-5 overflow-x-auto rounded-lg border border-white/10 bg-black/30 px-4 py-3 font-mono text-[11.5px] leading-relaxed text-zinc-300">🐴 vault login available · you@example.com <span className="text-amber-300">(ask — prompts you)</span> → type_secret(<span className="text-amber-300">"&lt;item-id&gt;"</span>, target) · 2FA: type_totp("&lt;item-id&gt;", target)</div>
              <p className="mt-2 text-[11.5px] leading-relaxed text-zinc-500">What an agent sees on a site with a saved login. The TOTP code is never in the hint — <code className="cl-mono text-zinc-400">type_totp</code> asks the broker to compute it at fill time.</p>
              <DocFolder><b className="font-semibold text-zinc-400">~/.config/browser-harness/agent-workspace/domain-skills/&lt;host&gt;/</b> — matched by hostname, surfaced on navigation</DocFolder>
              <DocNode last name="*.md" origin="you" desc="your per-site notes — quirks, selectors, login traps for a specific domain" />
            </DocLayer>

            <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
              <button onClick={() => setShowSys((s) => !s)} className="flex w-full items-start gap-3.5 px-5 py-4 text-left transition hover:bg-white/[0.01] sm:px-6">
                <span className="cl-mono shrink-0 pt-1 text-[11px] font-bold tracking-[0.1em] text-zinc-600">S</span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[16.5px] font-semibold tracking-tight text-zinc-100">Systems — what’s actually running underneath</h3>
                  <p className="mt-1 max-w-[70ch] text-[13px] leading-relaxed text-zinc-400">The substrate the three layers above ride on — the machinery, not the interface. {showSys ? 'Tap to collapse.' : 'Tap to expand.'}</p>
                </div>
                <span className={cn('shrink-0 pt-1 text-[13px] text-zinc-500 transition-transform', showSys && 'rotate-90')}>▸</span>
              </button>
              {showSys && (
                <div className="grid gap-3.5 border-t border-white/10 px-5 py-5 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
                  {SYSTEMS.map((s) => (
                    <div key={s.n} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                      <div className="mb-1.5 flex items-center gap-2"><span className="cl-mono text-[13px] font-bold text-zinc-100">{s.n}</span><span className="ml-auto"><Origin o={s.o} /></span></div>
                      <p className="text-[12px] leading-relaxed text-zinc-400">{s.d}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <p className="mt-8 text-[12.5px] leading-relaxed text-zinc-500">Only one layer is authored by <span className="text-amber-300">you</span> and shipped by nobody — your <code className="cl-mono text-[11.5px] text-zinc-400">agent_helpers.py</code> verbs and <code className="cl-mono text-[11.5px] text-zinc-400">domain-skills/</code> notes. Everything else regenerates from its origin; those don’t.</p>
        </Reveal>
      </div>
      {reader && <DocModal key={reader.path} doc={reader} self={self} onClose={() => setReader(null)} />}
      <div className="mx-auto mt-12 max-w-4xl"><button onClick={() => navigate('')} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-zinc-300 transition hover:text-white">← back to the board</button></div>
    </>
  )
}

/* ── site skills — the per-host playbooks explorer (domain-skills/<host>/*.md) ──
 * The board's third live tile opens this: every host that has a skill, each file
 * expandable to its raw markdown. Empty state teaches how to author the first one. */
function SiteSkills({ self, navigate, snap }) {
  const [tree, setTree] = useState(null)
  const [open, setOpen] = useState({})   // "host/name" -> expanded
  useEffect(() => {
    let live = true
    fetch(self.api + '/site-skills').then((r) => r.json()).then((d) => { if (live) setTree(d) }).catch(() => { if (live) setTree({ hosts: [], error: true }) })
    return () => { live = false }
  }, [self.api])
  const dir = tree?.dir || snap?.siteSkills?.dir || '~/.config/browser-harness/agent-workspace/domain-skills'
  const hosts = tree?.hosts || []
  const fileCount = hosts.reduce((n, h) => n + h.skills.length, 0)
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }))
  return (
    <>
      <button onClick={() => navigate('')} className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-zinc-400 transition hover:text-zinc-100">← back to the board</button>
      <div className="mx-auto max-w-4xl">
        <Reveal>
          <div className="cl-mono text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: ACCENT }}>per-site playbooks</div>
          <h1 className="mt-2.5 text-[27px] font-semibold leading-tight tracking-tight text-zinc-50 sm:text-[32px]">Site skills</h1>
          <p className="mt-3 max-w-[66ch] text-[15px] leading-relaxed text-zinc-400">A site skill is a note an agent reads the moment it lands on a host — the quirks, selectors, and login traps of that one site, plus any helpers written for it. It's also where an agent <span className="text-zinc-200">banks what it learned the hard way</span>: once it's worked out a site's flow, it writes that down here, so the next agent — or its own next session — starts from that knowledge instead of rediscovering it. On navigation the harness surfaces the matching skill; after a few visits with none, it nudges the agent to write one. Host is normalised to <code className="cl-mono text-zinc-300">domain.tld</code> — www, subdomain and path are ignored.</p>
          <div className="mt-4 inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-[12px] text-zinc-400">
            <span className="cl-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">where</span>
            <code className="cl-mono text-zinc-300">{dir}/&lt;domain.tld&gt;/&lt;name&gt;.md</code>
          </div>

          <div className="mt-6">
            {tree == null ? <div className="py-6 text-[13px] text-zinc-500">reading the workspace…</div>
              : fileCount === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.015] px-5 py-8 text-center">
                  <div className="text-[15px] font-medium text-zinc-200">No site skills yet</div>
                  <p className="mx-auto mt-2 max-w-[54ch] text-[13px] leading-relaxed text-zinc-500">Agents write these themselves. The first time one works out a site's quirks, it saves a markdown note here — and every later agent that lands on that host reads it. Nothing for you to set up; this list fills in as agents work.</p>
                  <div className="cl-mono mt-3 inline-block rounded-lg border border-white/10 bg-black/40 px-3.5 py-2.5 text-left text-[11.5px] leading-relaxed text-zinc-500">
                    <span className="text-zinc-600"># an agent writes, e.g.</span><br />
                    {dir}/<span className="text-amber-300">github.com</span>/<span className="text-amber-300">pr-review</span>.md
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {hosts.map((h) => (
                    <section key={h.host} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
                      <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-5 py-3">
                        <span className="size-1.5 shrink-0 rounded-full bg-emerald-400" />
                        <span className="cl-mono text-[13.5px] font-semibold text-zinc-100">{h.host}</span>
                        <span className="ml-auto text-[11px] text-zinc-500">{h.skills.length} {h.skills.length === 1 ? 'skill' : 'skills'}</span>
                      </div>
                      <div className="divide-y divide-white/[0.05]">
                        {h.skills.map((s) => {
                          const k = h.host + '/' + s.name
                          const isOpen = !!open[k]
                          return (
                            <div key={k}>
                              <button onClick={() => toggle(k)} className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-white/[0.02]">
                                <span className={cn('shrink-0 text-[12px] text-zinc-500 transition-transform', isOpen && 'rotate-90')}>▸</span>
                                <span className="min-w-0 flex-1 truncate">
                                  <span className="text-[13.5px] text-zinc-200">{s.title}</span>
                                  <span className="cl-mono ml-2 text-[11px] text-zinc-600">{s.name}</span>
                                </span>
                                <span className="shrink-0 text-[11px] text-zinc-600">{(s.bytes / 1000).toFixed(1)} kB</span>
                              </button>
                              {isOpen && (
                                <div className="border-t border-white/[0.05] bg-black/30 px-5 py-4">
                                  <pre className="cl-mono max-h-[26rem] overflow-auto whitespace-pre-wrap break-words text-[12px] leading-relaxed text-zinc-300">{s.body}</pre>
                                  <div className="cl-mono mt-2 text-[10.5px] text-zinc-600">{s.path}</div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              )}
          </div>
        </Reveal>
      </div>
      <div className="mx-auto mt-12 max-w-4xl"><button onClick={() => navigate('')} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-zinc-300 transition hover:text-white">← back to the board</button></div>
    </>
  )
}

/* ────────────────────────────── the story ──────────────────────────────────
 * The full cinematic narrative, moved behind the hero's "read the full story"
 * link: banner → idea → the demo agent-browser wall → the engine + bitter
 * lesson. (The lid-closed reasoning lives in Runtime, with agent vision — it's
 * ops, not part of the overall story.) */
function Story({ navigate, img }) {
  return (
    <>
      <Reveal className="relative -mx-6 -mt-6 mb-9 lg:-mx-10 lg:-mt-10">
        <img src={img('horse-banner.jpg')} loading="lazy" alt="horse-browser — a celestial navigation trail of session tokens" className="cl-ink w-full" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent" />
        <span className="absolute bottom-4 left-6 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-100 ring-1 ring-white/15 lg:left-10">the night console</span>
      </Reveal>

      <button onClick={() => navigate('')} className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-zinc-400 transition hover:text-zinc-100">← back to the board</button>

      <Reveal>
        <ChapterIntro dark icon="compass" color={ACCENT} kicker="The Horse Browser"
          idea="Give your agents a browser of their own — logged in, and never in your way."
          why="Agents often need to browse: research a page, check a dashboard, fill in a form. But a throwaway browser logs out constantly, and a normal one yanks your window to the front every few seconds. The fix is a second browser, just for agents — signed into your stuff once, quietly shared, that never steals your screen. It lets a hundred agents browse the web at the same time, without getting in each other’s way." />
      </Reveal>

      <Reveal>
        <p className="mb-5 mt-9 max-w-2xl text-[14.5px] leading-relaxed text-zinc-400">Each agent’s tabs land in their own colour group, and one wall shows them all browsing live — opening tabs quietly, in the background, while you keep working.</p>
        <div className="mx-auto my-7 max-w-[900px] sm:my-12">
          <FakeBrowser img={img} />
        </div>
      </Reveal>

      <Reveal className="@container">
        <div className="mt-12 max-w-3xl @4xl:mt-16">
          <Step dark label="The engine" color={ACCENT} title="2,500 lines, not a hundred thousand" className="!mt-0"
            lead="The Horse Browser runs on horse-harness — born from browser-use's browser-harness, now vendored inside the package itself. That’s where the name comes from: every tab an agent opens gets a 🐴 stamped on it — so this wall is where all those live tabs gather.">
            <div className="space-y-3.5 text-[14px] leading-relaxed text-zinc-300">
              <p>Older tools — Playwright, Selenium, even browser-use — hand the agent a giant box of pre-built buttons (<code className="cl-mono text-[12.5px] text-zinc-200">click()</code>, <code className="cl-mono text-[12.5px] text-zinc-200">type()</code>, <code className="cl-mono text-[12.5px] text-zinc-200">scroll()</code>, and thousands more) that a developer <em className="text-zinc-200">guessed</em> it would need. The harness does the opposite: it hands the agent the browser’s own raw controls and a screenshot, and lets it figure the rest out — the way a person would.</p>
              <p>That’s a staggering difference in size:</p>
            </div>
            <div className="my-5 space-y-2.5">
              {[{ name: 'Playwright', loc: 120000, w: '100%' }, { name: 'browser-use', loc: 72000, w: '60%' }, { name: 'horse-harness', loc: 2500, w: '2%', us: true }].map((r) => (
                <div key={r.name} className="flex items-center gap-3 text-[12px]">
                  <span className={cn('cl-mono w-28 shrink-0 truncate', r.us ? 'font-semibold text-zinc-100' : 'text-zinc-400')}>{r.name}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <div className="h-full rounded-full" style={{ width: r.w, background: r.us ? ACCENT : 'rgba(255,255,255,.22)' }} />
                  </div>
                  <span className="w-20 shrink-0 text-right tabular-nums" style={{ color: r.us ? ACCENT : undefined }}>~{r.loc.toLocaleString()}</span>
                </div>
              ))}
            </div>
            <p className="text-[14px] leading-relaxed text-zinc-300">Every one of those hundred thousand lines is a developer trying to guess what an agent will need. A sharp, hard-working agent makes nearly all of them unnecessary — when something’s missing, it just writes that one trick mid-task and keeps it.</p>
            <div className="cl-mono mt-4 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
              <span className="rounded-md bg-white/5 px-2 py-1">a trick is missing</span><span className="text-zinc-600">→</span>
              <span className="rounded-md bg-white/5 px-2 py-1">the agent writes it</span><span className="text-zinc-600">→</span>
              <span className="rounded-md px-2 py-1" style={{ background: ACCENT + '22', color: ACCENT }}>it’s there next time</span>
            </div>
            <blockquote className="my-5 border-l-2 pl-4 text-[14.5px] italic text-zinc-200" style={{ borderColor: ACCENT }}>
              “The bitter lesson of agent harnesses: your helpers are abstractions too.”
              <span className="mt-1.5 block text-[11.5px] not-italic text-zinc-500">— browser-use, on why a maximal action space beats hand-built wrappers</span>
            </blockquote>
            <p className="mb-5 text-[14px] leading-relaxed text-zinc-300">Since v0.9 that engine ships <em className="text-zinc-200">inside</em> horse-browser: one npm package carries the launcher, the tab-grouper extension, and the vendored harness core — the launcher builds and heals its own Python venv, so there’s no separate pip tool to keep in sync.</p>
            <div className="flex flex-wrap items-center gap-3">
              <a href="https://github.com/pA1nD/horse-browser" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-[12px] font-semibold text-zinc-200 shadow-sm transition hover:-translate-y-px hover:border-white/30"><Icon name="star" size={13} /> pA1nD/horse-browser</a>
              <a href="https://browser-use.com/posts/bitter-lesson-agent-harnesses" target="_blank" rel="noreferrer" className="text-[13px] font-medium text-zinc-300 underline decoration-white/25 underline-offset-2 transition hover:text-white hover:decoration-white/60">Read the write-up ↗</a>
            </div>
          </Step>
        </div>
      </Reveal>

      <div className="mt-14">
        <button onClick={() => navigate('')} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-zinc-300 transition hover:text-white">← back to the board</button>
      </div>
    </>
  )
}

export default function Module() {
  useChromeStyles()
  const { path, navigate } = window.__atelier.useRoute()
  const self = window.__atelier.self(import.meta.url)
  const { snap } = useSnapshot(self)
  const actions = useActions(self)
  const img = (nm) => self.api + '/images/' + nm

  let body
  if (path === 'story') body = <Story navigate={navigate} img={img} />
  else if (path === 'credentials') body = <Settings self={self} navigate={navigate} />
  else if (path === 'skill') body = <Skill self={self} navigate={navigate} />
  else if (path === 'accounts') body = <Accounts self={self} navigate={navigate} />
  else if (path === 'activity') body = <Activity self={self} navigate={navigate} />
  else if (path === 'runtime') body = <Runtime snap={snap} self={self} navigate={navigate} actions={actions} />
  else if (path === 'docs') body = <Docs snap={snap} self={self} navigate={navigate} />
  else if (path === 'site-skills') body = <SiteSkills snap={snap} self={self} navigate={navigate} />
  else body = <Board snap={snap} self={self} navigate={navigate} actions={actions} img={img} />

  return (
    // the control board fills the chrome's content card edge-to-edge: negative
    // margins eat the card's own padding (p-6, lg:p-10 — see catalyst's
    // sidebar-layout) and equal padding puts the content back where it was.
    <div className="cl-root relative -m-6 min-h-[calc(100vh-4rem)] bg-zinc-950 p-6 text-zinc-200 lg:-m-10 lg:min-h-[calc(100dvh-1rem)] lg:p-10">
      {body}
    </div>
  )
}
