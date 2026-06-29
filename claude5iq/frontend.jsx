/* Claude 5IQ — a guided setup for the systems that make Claude Code sharper.
 *
 * "IQ" is the brand (a playful score, not a literal intelligence claim), "5" is
 * this pack (the number of systems, so it grows on its own), and this one is for
 * Claude. The hero wears Claude's own identity — warm cream, the coral accent, a
 * serif display — over the dock base the rest of the page keeps. The right side
 * of the hero is a live column of system cards: a checklist before setup, a
 * dashboard after. Shared system in lib.jsx.
 */

import { useChromeStyles, useSnapshot, useActions, ActionConsole, Icon, SystemIcon, cn, ACCOUNT_COLORS, useDark, inkFor } from './lib.jsx'
import Codes from './sections/codes.jsx'
import StatusBar from './sections/statusbar.jsx'
import ClaudeMd from './sections/claudemd.jsx'
import Browser from './sections/browser.jsx'
import Gwx from './sections/gwx.jsx'

const { useState, useEffect, useRef } = React

const CHAPTERS = [
  { slug: 'codes',     n: '01', title: 'Session Codes',  icon: 'fingerprint', color: '#8b5cf6', teaser: 'A name tag for every conversation.', Comp: Codes },
  { slug: 'statusbar', n: '02', title: 'The Status Bar', icon: 'terminal',    color: '#3b82f6', teaser: 'A line that says where you are.', Comp: StatusBar },
  { slug: 'browser',   n: '03', title: 'The Horse Browser', icon: 'compass',  color: '#10b981', teaser: 'A browser your agents quietly share.', Comp: Browser },
  { slug: 'gwx',       n: '04', title: 'gwx',            icon: 'mails',       color: '#f59e0b', teaser: 'Every inbox, one safe command.', Comp: Gwx },
  { slug: 'claudemd',  n: '05', title: 'CLAUDE.md',      icon: 'layers',      color: '#d946ef', teaser: 'Notes that teach Claude your way.', Comp: ClaudeMd },
]
const SLUGS = CHAPTERS.map((c) => c.slug)
const IQ = CHAPTERS.length

// dev preview: synthesize the CLAUDE.md status — installed shows our four chapters; uninstalled
// simulates a fresh machine where no global notes exist at all.
function previewClaudeMd(g, installed) {
  if (!installed) return { path: (g && g.path) || '~/.claude/CLAUDE.md', exists: false, hasOurs: false, hasFourChapters: false, bytes: 0, chapters: [], sections: [] }
  const base = ((g && g.sections) || []).filter((s) => !s.ours)
  return { ...(g || {}), path: (g && g.path) || '~/.claude/CLAUDE.md', exists: true, hasOurs: true, hasFourChapters: true, chapters: ['Think Before Coding', 'Simplicity First', 'Surgical Changes', 'Goal-Driven Execution'], sections: [{ title: 'Instructions', ours: true }, ...base] }
}

export const meta = { chrome: 'atelier-chrome', icon: 'sparkles', name: `Claude ${IQ}IQ` }

// is a system on? (drives the little health dot on the left)
function systemOn(slug, snap) {
  const cdp = snap?.cdp || {}, sl = snap?.statusline || {}, cmd = snap?.claudemd?.global || {}, gwx = snap?.gwx || {}
  switch (slug) {
    case 'codes': return true
    case 'statusbar': return !!sl.wired
    case 'claudemd': return !!cmd.exists
    case 'browser': return !!cdp.up
    case 'gwx': return !!(gwx.installed && (gwx.authed || []).length)
    default: return false
  }
}

// the install action(s) that set up each system (Session Codes needs none — it just works)
const INSTALL_ACTIONS = {
  statusbar: ['install-statusbar'],
  claudemd: ['install-global-claudemd'],
  browser: ['install-browser-harness', 'install-horse-browser'],
  gwx: ['install-gwx'],
}

// action id → short label for the hero install console
const ACTION_LABEL = {
  'install-statusbar': 'the Status Bar',
  'install-global-claudemd': 'CLAUDE.md',
  'install-browser-harness': 'browser-harness',
  'install-horse-browser': 'horse-browser',
  'install-gwx': 'gwx',
}

const Overflow = ({ n }) => n > 0 ? <span className="cl-mono text-[11px] text-[#141413]/45 dark:text-zinc-500">+{n}</span> : null

// the explicit, labelled readout for each system — easy to follow, with long
// lists collapsing to the first few + "+N". Off → a plain "set it up" prompt.
function SystemData({ slug, snap, teaser }) {
  const dark = useDark()
  const cdp = snap?.cdp || {}, sess = snap?.sessions || {}, sl = snap?.statusline || {}, cmd = snap?.claudemd?.global || {}, gwx = snap?.gwx || { accounts: [] }
  const todo = <span className="text-[#141413]/60 dark:text-zinc-400">{teaser} <span className="font-medium text-[#c15f3c]">Set it up →</span></span>

  if (slug === 'codes') {
    const running = (sess.running || []).slice().sort((a, b) => (a.callsign || '').localeCompare(b.callsign || ''))
    if (!running.length) return <span className="text-[#141413]/60 dark:text-zinc-400">No sessions open right now.</span>
    const working = running.filter((s) => s.active).length
    const show = running.slice(0, 6), rest = running.length - show.length
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="font-medium text-[#141413] dark:text-zinc-50">{running.length} {running.length === 1 ? 'session' : 'sessions'} open{working ? ` · ${working} working now` : ' · all idle'}:</span>
        {show.map((s) => <span key={s.id} className="cl-mono inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]" style={{ borderColor: (s.hex || '#999') + (s.active ? '66' : '33'), background: (s.hex || '#999') + (s.active ? '22' : '12') }}><span>{s.emoji}</span><span className="font-semibold" style={{ color: inkFor(s.color, dark) || s.hex }}>{s.callsign}</span>{s.active && <span className="size-1.5 rounded-full bg-emerald-500" title="working now" />}</span>)}
        <Overflow n={rest} />
      </div>
    )
  }
  if (slug === 'statusbar') {
    if (!sl.wired) return todo
    return <div><span className="font-medium text-[#141413] dark:text-zinc-50">Wired up</span> — the {sl.flavor} statusline <span className="cl-mono text-[#141413]/45 dark:text-zinc-500">({(sl.command || '').split('/').pop()})</span></div>
  }
  if (slug === 'claudemd') {
    if (!cmd.exists) return todo
    const kb = cmd.bytes ? `${(cmd.bytes / 1000).toFixed(1)} kB` : ''
    return cmd.hasFourChapters
      ? <div><span className="font-medium text-[#141413] dark:text-zinc-50">Your global notes are installed</span> — all 4 of our chapters present{kb && <span className="cl-mono text-[#141413]/45 dark:text-zinc-500"> · {kb}</span>}</div>
      : <div><span className="font-medium text-[#141413] dark:text-zinc-50">Global notes found</span> — {(cmd.chapters || []).length} of our 4 chapters{kb && <span className="cl-mono text-[#141413]/45 dark:text-zinc-500"> · {kb}</span>}</div>
  }
  if (slug === 'browser') {
    if (!cdp.up) return todo
    const show = (cdp.tabSample || []).slice(0, 2)
    const ver = (cdp.browser || '').replace('Chrome/', 'Chrome ').split('.')[0]
    const harness = snap?.harness || {}
    const trunc = (s) => s.length > 30 ? s.slice(0, 29) + '…' : s
    return (
      <div>
        <div><span className="font-medium text-[#141413] dark:text-zinc-50">Up and running</span> — {ver} on :9223{cdp.pids?.[0] ? <span className="cl-mono text-[#141413]/45 dark:text-zinc-500"> · pid {cdp.pids[0]}</span> : null}</div>
        {show.length > 0 && <div className="mt-1 text-[12px]"><span className="text-[#141413]/50 dark:text-zinc-500">{cdp.tabs} tabs open: </span><span className="cl-mono text-[#141413]/65 dark:text-zinc-400">{show.map((t) => trunc((t.domain || '') + (t.path || '')) || 'tab').join('  ·  ')}</span></div>}
        <div className="mt-1 text-[12px] text-[#141413]/55 dark:text-zinc-400">browser-harness {harness.installed ? 'installed ✓' : 'not installed'}{harness.sessions ? ` · ${harness.sessions} agent ${harness.sessions === 1 ? 'session' : 'sessions'} connected` : ''}</div>
      </div>
    )
  }
  if (slug === 'gwx') {
    const accts = gwx.accounts || [], authed = new Set(gwx.authed || [])
    if (!gwx.installed || !accts.length) return todo
    const show = accts.slice(0, 4), rest = accts.length - show.length
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="font-medium text-[#141413] dark:text-zinc-50">{accts.length} Google {accts.length === 1 ? 'account' : 'accounts'} · {authed.size} signed in:</span>
        {show.map((a, i) => { const ok = authed.has(a); return <span key={a} title={ok ? 'signed in' : 'not signed in — run gwx login'} className={cn('inline-flex items-center gap-1 rounded-md border border-[#141413]/10 bg-white/60 px-1.5 py-0.5 text-[11px] dark:border-white/10 dark:bg-white/[0.05]', !ok && 'opacity-40')}><span className="size-1.5 rounded-full" style={{ background: ACCOUNT_COLORS[i % 8] }} />{a}</span> })}
        <Overflow n={rest} />
      </div>
    )
  }
  return todo
}

function SystemCard({ c, snap, onJump, actions, onInstall }) {
  const on = systemOn(c.slug, snap)
  const acts = INSTALL_ACTIONS[c.slug]
  const byId = actions?.byId
  const running = acts ? acts.some((a) => byId?.[a]?.status === 'running') : false
  const done = acts ? acts.length > 0 && acts.every((a) => byId?.[a]?.status === 'done') : false
  return (
    <div className="group block w-full rounded-2xl border border-[#141413]/12 bg-white/25 p-4 backdrop-blur transition hover:border-[#141413]/25 hover:bg-white/55 dark:border-white/10 dark:bg-white/[0.05] dark:hover:border-white/20 dark:hover:bg-white/[0.08]">
      <div className="flex items-center gap-3">
        <SystemIcon icon={c.icon} color={c.color} size={34} />
        <button onClick={() => onJump(c.slug)} className="min-w-0 flex-1 truncate text-left text-[14.5px] font-semibold text-[#141413] dark:text-zinc-50">{c.title}</button>
        {!on && acts ? (
          <button onClick={() => onInstall(acts)} disabled={running} className="shrink-0 rounded-full bg-[#d97757] px-3 py-1 text-[11.5px] font-semibold text-white shadow-sm transition hover:bg-[#c15f3c] disabled:opacity-70">{running ? 'Installing…' : done ? '✓ Installed' : 'Install'}</button>
        ) : (
          <button onClick={() => onJump(c.slug)} className="shrink-0"><Icon name="arrow-right" size={14} className="text-[#141413]/25 transition group-hover:translate-x-0.5 group-hover:text-[#141413]/55 dark:text-zinc-600 dark:group-hover:text-zinc-400" /></button>
        )}
      </div>
      <div className="mt-2.5 flex items-start gap-2.5">
        <span className={cn('mt-[6px] size-2 shrink-0 rounded-full', on ? 'bg-emerald-500' : 'bg-amber-400')} title={on ? 'on' : 'not set up'} />
        <div className="min-w-0 flex-1 text-[13px] leading-relaxed text-[#141413]/70 dark:text-zinc-300"><SystemData slug={c.slug} snap={snap} teaser={c.teaser} /></div>
      </div>
    </div>
  )
}

/* ── full-height hero — Claude's warm identity over the dock base ───────────── */
function Hero({ snap, onJump, actions }) {
  const byId = actions?.byId, run = actions?.run
  const [consoleActs, setConsoleActs] = useState([])
  const consoleRef = useRef(null)
  // run install actions AND surface their logs in the hero's own console (not just the chapters)
  const heroInstall = (ids) => {
    if (!ids || !ids.length) return
    setConsoleActs((prev) => [...new Set([...prev, ...ids])])
    ids.forEach((a) => run && run(a, { confirm: true }))
  }
  useEffect(() => { if (consoleActs.length && consoleRef.current) consoleRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, [consoleActs.length])
  const installable = CHAPTERS.filter((c) => INSTALL_ACTIONS[c.slug] && !systemOn(c.slug, snap))
  const allActs = installable.flatMap((c) => INSTALL_ACTIONS[c.slug])
  const installingAll = allActs.some((a) => byId?.[a]?.status === 'running')
  // one merged console for everything kicked off from up here, each line tagged by system
  const heroEntry = consoleActs.length ? {
    status: consoleActs.some((a) => byId?.[a]?.status === 'running') ? 'running'
          : consoleActs.some((a) => byId?.[a]?.status === 'failed') ? 'failed'
          : consoleActs.every((a) => byId?.[a]?.status === 'done') ? 'done' : 'running',
    logs: consoleActs.flatMap((a) => (byId?.[a]?.logs || []).map((l) => ({ stream: l.stream, line: consoleActs.length > 1 ? `${ACTION_LABEL[a] || a} · ${l.line}` : l.line }))),
  } : null
  return (
    <header className="relative isolate -mx-6 -mt-6 mb-12 flex min-h-[100svh] flex-col overflow-hidden bg-[#faf9f5] text-[#141413] lg:-mx-10 lg:-mt-10 dark:bg-[#14100c] dark:text-zinc-50">
      {/* warm coral wash — Claude's atmosphere, very soft */}
      <div className="pointer-events-none absolute -left-32 -top-40 -z-10 h-[34rem] w-[34rem] rounded-full bg-[#d97757]/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-44 -right-12 -z-10 h-[42rem] w-[42rem] rounded-full bg-[#e9a87c]/25 blur-3xl" />
      <div className="pointer-events-none absolute left-1/3 top-[30%] -z-10 h-[26rem] w-[26rem] rounded-full bg-[#f0c9a8]/30 blur-3xl" />

      <div className="flex items-center px-6 pt-6 lg:px-10 lg:pt-8">
        <span className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span className="grid size-6 place-items-center rounded-md bg-[#d97757]/15"><Icon name="sparkles" size={14} className="text-[#c15f3c]" /></span>
          Claude <span className="rounded-md bg-[#d97757] px-1.5 py-0.5 text-[12px] font-bold tracking-tight text-white">{IQ}IQ</span>
        </span>
      </div>

      <div className="relative flex flex-1 flex-col justify-center px-6 py-12 lg:px-10">
        <div className="grid items-center gap-x-12 gap-y-10 lg:grid-cols-[1.05fr_0.95fr]">
          {/* left — the message */}
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-[#d97757]/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#c15f3c]">
              <span className="rounded-full bg-[#d97757] px-1.5 py-0.5 text-[11px] font-bold tracking-normal text-white">{IQ}IQ</span> five systems for Claude Code
            </span>
            <h1 className="cl-serif mt-5 text-[clamp(44px,6.6vw,88px)] font-medium leading-[0.98] tracking-[-0.015em] text-[#141413] dark:text-zinc-50">A smarter<br /><span className="text-[#c15f3c]">Claude.</span></h1>
            <p className="mt-6 max-w-lg text-[15.5px] leading-relaxed text-[#141413]/70 dark:text-zinc-300">Five systems take Claude Code from a smart helper to a genuinely useful agent — the kind that makes you <span className="font-semibold text-[#141413] dark:text-zinc-50">100× more productive</span> and keeps you ahead of the curve. Keep an overview while you run several at once, give them a real browser to search and act on the web, and hand them safe access to your <span className="font-semibold text-[#141413] dark:text-zinc-50">whole GSuite</span> — not just email, but documents and redlines, across every account.</p>
          </div>

          {/* right — the systems: a checklist before setup, a live dashboard after */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#141413]/45 dark:text-zinc-500">the five systems</span>
              <span className="cl-mono inline-flex items-center gap-1.5 text-[11px] text-[#141413]/45 dark:text-zinc-500"><span className={cn('size-1.5 rounded-full', snap?.cdp?.up ? 'bg-emerald-500' : 'bg-zinc-300')} /> live on your machine</span>
            </div>
            <div className="space-y-2">
              {CHAPTERS.map((c) => <SystemCard key={c.slug} c={c} snap={snap} onJump={onJump} actions={actions} onInstall={heroInstall} />)}
            </div>
            {installable.length > 0 && (
              <button onClick={() => heroInstall(allActs)} disabled={installingAll} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#d97757] px-4 py-3 text-[14px] font-semibold text-white shadow-[0_10px_24px_-10px_rgba(217,119,87,0.6)] transition hover:bg-[#c15f3c] disabled:opacity-70">
                <Icon name="sparkles" size={16} /> {installingAll ? 'Installing everything…' : `Install all ${installable.length} systems`}
              </button>
            )}
          </div>
        </div>
      </div>

      {heroEntry ? (
        <div ref={consoleRef} className="mx-auto mb-7 w-full max-w-2xl px-6 lg:px-10">
          <ActionConsole entry={heroEntry} title={consoleActs.length > 1 ? `installing ${consoleActs.length} systems` : `installing ${ACTION_LABEL[consoleActs[0]] || consoleActs[0]}`} />
        </div>
      ) : (
        <button onClick={() => onJump('codes')} className="relative mx-auto mb-7 flex cursor-pointer items-center gap-1.5 text-[12px] font-medium text-[#141413]/45 transition hover:text-[#141413] dark:text-zinc-500 dark:hover:text-zinc-50">scroll to begin <Icon name="chevron-down" size={16} /></button>
      )}
    </header>
  )
}


/* ── slim dock-style chapter nav (sticky) ──────────────────────────────────── */
function ChapterNav({ active, condensed, onJump, slPreview, setSlPreview, dev }) {
  const cycleSl = () => setSlPreview((p) => p === 'auto' ? 'installed' : p === 'installed' ? 'uninstalled' : 'auto')
  return (
    <div className="sticky top-3 z-30 mb-10 flex justify-center">
      <div className={cn('flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-zinc-950/10 bg-white/85 p-1.5 shadow-lg shadow-zinc-950/[0.04] backdrop-blur-md dark:border-white/10 dark:bg-white/[0.05]', condensed && 'scale-[0.98]')}>
        {CHAPTERS.map((c) => (
          <button key={c.slug} onClick={() => onJump(c.slug)}
            className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12.5px] font-medium transition-colors', active === c.slug ? 'bg-zinc-950/[0.06] text-zinc-950 dark:bg-white/10 dark:text-zinc-50' : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50')}>
            <Icon name={c.icon} size={15} style={{ color: c.color }} />
            <span className="hidden sm:inline">{c.title}</span><span className="sm:hidden">{c.n}</span>
          </button>
        ))}
        {dev && (
          <button onClick={cycleSl} title="dev only — preview the status bar as uninstalled / installed / auto (the real state)"
            className="cl-mono ml-1 shrink-0 rounded-full border border-dashed border-zinc-950/25 px-2.5 py-1.5 text-[11px] font-medium text-zinc-400 transition-colors hover:text-zinc-700 dark:border-white/25 dark:text-zinc-500 dark:hover:text-zinc-200">
            preview:{slPreview}
          </button>
        )}
      </div>
    </div>
  )
}

/* ──────────────────────────────── module ─────────────────────────────────── */
export default function Module() {
  useChromeStyles()
  const self = window.__atelier.self(import.meta.url)
  const { path, navigate } = window.__atelier.useRoute()
  const { snap, refresh } = useSnapshot(self)
  const actions = useActions(self)

  const [active, setActive] = useState('')
  const [condensed, setCondensed] = useState(false)
  const [slPreview, setSlPreview] = useState('auto')   // dev-only: preview the status bar as un/installed
  const activeRef = useRef('')
  const navRef = useRef(navigate); navRef.current = navigate
  const firstScroll = useRef(true)
  const topSentinel = useRef(null)

  useEffect(() => {
    const el = topSentinel.current; if (!el) return
    const io = new IntersectionObserver(([e]) => setCondensed(!e.isIntersecting), { threshold: 0 })
    io.observe(el); return () => io.disconnect()
  }, [])

  useEffect(() => {
    const targets = ['ch-', ...SLUGS.map((s) => 'ch-' + s)].map((id) => document.getElementById(id)).filter(Boolean)
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)
      if (!vis[0]) return
      const slug = vis[0].target.dataset.slug || ''
      if (slug !== activeRef.current) { activeRef.current = slug; setActive(slug); navRef.current(slug, { replace: true }) }
    }, { rootMargin: '-45% 0px -45% 0px', threshold: [0, 0.2, 0.6, 1] })
    targets.forEach((t) => io.observe(t)); return () => io.disconnect()
  }, [])

  useEffect(() => {
    const want = path || ''
    if (want === activeRef.current) return
    const el = document.getElementById('ch-' + want)
    if (!el) return
    activeRef.current = want; setActive(want)
    el.scrollIntoView({ behavior: firstScroll.current ? 'auto' : 'smooth', block: 'start' })
    firstScroll.current = false
  }, [path])

  const onJump = (slug) => { firstScroll.current = false; navRef.current(slug) }

  // dev-only (localhost): override the live statusline state so the chapter can be
  // previewed as uninstalled / installed without changing the real machine.
  const dev = typeof location !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  // 'installed' shows everything set up; 'uninstalled' simulates a fresh machine where nothing
  // exists yet — the live systems (running browser, daemons, accounts, sessions) blanked too.
  const inst = slPreview === 'installed'
  const blankCdp = { up: false, browser: null, protocol: null, tabs: 0, tabSample: [], pids: [] }
  const viewSnap = (!snap || slPreview === 'auto') ? snap : {
    ...snap,
    statusline: { ...(snap.statusline || {}), wired: inst, flavor: inst ? (snap.statusline?.flavor || 'codename') : null, command: inst ? (snap.statusline?.command || '~/.claude/statusline.sh') : null },
    claudemd: { ...(snap.claudemd || {}), global: previewClaudeMd(snap.claudemd?.global, inst) },
    harness: { ...(snap.harness || {}), installed: inst, sessions: inst ? (snap.harness?.sessions || 3) : 0, daemons: inst ? (snap.harness?.daemons || []) : [] },
    tools: Object.fromEntries(Object.entries(snap.tools || {}).map(([k, v]) => [k, { ...v, installed: inst }])),
    cdp: inst ? (snap.cdp?.up ? snap.cdp : { ...blankCdp, up: true, browser: snap.cdp?.browser || 'Chrome/150.0.0.0' }) : blankCdp,
    gwx: inst ? (snap.gwx?.accounts?.length ? snap.gwx : { installed: true, accounts: ['work', 'personal'], authed: ['work', 'personal'] }) : { installed: false, accounts: [], authed: [] },
    sessions: inst ? snap.sessions : { running: [], runningCount: 0, active: 0, total: 0, top: [] },
  }

  return (
    <div className="cl-root relative">
      <div ref={topSentinel} className="pointer-events-none absolute left-0 top-0 h-px w-full" />
      <Hero snap={viewSnap} onJump={onJump} actions={actions} />
      <ChapterNav active={active} condensed={condensed} onJump={onJump} slPreview={slPreview} setSlPreview={setSlPreview} dev={dev} />
      <div id="ch-" data-slug="" className="h-px" />
      {CHAPTERS.map((c, i) => {
        const next = CHAPTERS[i + 1]
        return (
          <section key={c.slug} id={'ch-' + c.slug} data-slug={c.slug} className="scroll-mt-24 py-12 sm:py-20">
            <c.Comp self={self} snap={viewSnap} actions={actions} refresh={refresh} accent={c.color} icon={c.icon} n={c.n}
              onNext={next ? () => onJump(next.slug) : null} nextTitle={next ? next.title : null} />
          </section>
        )
      })}
      <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-950/10 py-8 text-[13px] text-zinc-400 dark:border-white/10 dark:text-zinc-500">
        <span className="inline-flex items-center gap-2"><Icon name="sparkles" size={13} className="text-[#c15f3c]" /> Claude {IQ}IQ</span>
        <span>a smarter Claude, one system at a time</span>
      </footer>
    </div>
  )
}
