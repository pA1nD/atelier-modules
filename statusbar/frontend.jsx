/* statusbar — agent identity + the status bar that wears it.
 *
 * Extracted from claude5iq (retired): its ch.01 (Session Codes — how a long
 * session id folds to callsign + colour + emoji) and ch.02 (the Claude Code
 * statusline, dissected and wired into ~/.claude/settings.json). Two chapters
 * on one page; sections/ keeps each copied chapter as its own file, and
 * lib.jsx + term.jsx are the shared primitives they were written against.
 */

import { useChromeStyles, useSnapshot, useActions, Icon, cn, useDark, inkFor } from './lib.jsx'
import Codes from './sections/codes.jsx'
import StatusBar from './sections/statusbar.jsx'

const { useState, useEffect, useRef } = React

const CHAPTERS = [
  { slug: 'codes',     n: '01', title: 'Session Codes',  icon: 'fingerprint', color: '#8b5cf6', Comp: Codes },
  { slug: 'statusbar', n: '02', title: 'The Status Bar', icon: 'terminal',    color: '#3b82f6', Comp: StatusBar },
]
const SLUGS = CHAPTERS.map((c) => c.slug)

// meta must be a pure object literal — the shell reads it statically.
export const meta = { chrome: 'catalyst-chrome', icon: 'terminal', name: 'Status Bar' }

/* ── compact header — the page in one breath, plus two live readouts ───────── */
function Header({ snap, onJump }) {
  const dark = useDark()
  const loading = !snap
  const sl = snap?.statusline || {}
  // 'ours' | 'codename' (same script, another copy) | 'other' (different statusline) | 'none'
  const slStatus = sl.status || (sl.wired ? 'other' : 'none')
  const running = (snap?.sessions?.running || []).slice().sort((a, b) => (a.callsign || '').localeCompare(b.callsign || ''))
  const working = running.filter((s) => s.active).length
  const show = running.slice(0, 6)
  return (
    <header className="mb-12">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">
        <Icon name="terminal" size={12} /> the status bar
      </span>
      <h1 className="mt-4 max-w-2xl text-[clamp(30px,4.5vw,44px)] font-bold leading-[1.05] tracking-tight text-zinc-950 dark:text-zinc-50">
        Every agent gets a name — and a line that wears it.
      </h1>
      <p className="mt-4 max-w-2xl text-[15.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">
        Run a few Claude Code sessions and the terminals look identical. This module sets up the two halves of the fix:
        the <button onClick={() => onJump('codes')} className="font-semibold text-zinc-950 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-500 dark:text-zinc-50 dark:decoration-zinc-600">identity</button> every
        session earns from its own id, and the <button onClick={() => onJump('statusbar')} className="font-semibold text-zinc-950 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-500 dark:text-zinc-50 dark:decoration-zinc-600">status bar</button> that
        shows it at the bottom of every terminal.
      </p>

      {/* live readouts — sessions open right now, and whether the bar is wired */}
      <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-[12.5px]">
        {loading ? (
          <span className="inline-flex items-center gap-1.5 text-zinc-400 dark:text-zinc-500"><span className="size-1.5 animate-pulse rounded-full bg-amber-400" /> reading your machine…</span>
        ) : (
          <>
            <span className="inline-flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
              <span className={cn('size-1.5 rounded-full', running.length ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600')} />
              {running.length ? `${running.length} ${running.length === 1 ? 'session' : 'sessions'} open${working ? ` · ${working} working now` : ''}` : 'no sessions open right now'}
            </span>
            {show.map((s) => (
              <span key={s.id} className="cl-mono inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]" style={{ borderColor: (s.hex || '#999') + (s.active ? '66' : '33'), background: (s.hex || '#999') + (s.active ? '22' : '12') }}>
                <span>{s.emoji}</span><span className="font-semibold" style={{ color: inkFor(s.color, dark) || s.hex }}>{s.callsign}</span>
                {s.active && <span className="size-1.5 rounded-full bg-emerald-500" title="working now" />}
              </span>
            ))}
            {running.length > show.length && <span className="cl-mono text-[11px] text-zinc-400 dark:text-zinc-500">+{running.length - show.length}</span>}
            <span className="text-zinc-300 dark:text-zinc-600">·</span>
            {slStatus === 'ours' && <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400"><Icon name="check" size={13} /> status bar wired</span>}
            {slStatus === 'codename' && <button onClick={() => onJump('statusbar')} title={`the same codename statusline, via ${sl.commandShort || 'another copy'}`} className="inline-flex items-center gap-1.5 font-medium text-emerald-600 hover:underline dark:text-emerald-400"><Icon name="check" size={13} /> status bar wired · another copy</button>}
            {slStatus === 'other' && <button onClick={() => onJump('statusbar')} title={sl.commandShort || ''} className="inline-flex items-center gap-1.5 font-semibold text-amber-600 hover:underline dark:text-amber-400"><span className="size-1.5 rounded-full bg-amber-400" /> a different status bar is wired →</button>}
            {slStatus === 'none' && <button onClick={() => onJump('statusbar')} className="inline-flex items-center gap-1.5 font-semibold text-amber-600 hover:underline dark:text-amber-400"><span className="size-1.5 rounded-full bg-amber-400" /> not wired yet — set it up →</button>}
          </>
        )}
      </div>
    </header>
  )
}

/* ── slim chapter nav — floats top-right beside the header's eyebrow, in a
 *    zero-height wrapper so it occupies no band of its own. (`sticky` is
 *    aspirational: the catalyst content card clips overflow, which disables
 *    sticking — under this chrome the pill simply lives at the top.) Titles
 *    collapse to the chapter numbers on small screens. */
function ChapterNav({ active, onJump }) {
  return (
    // items-start is load-bearing: the wrapper is h-0, and flex's default
    // align-items:stretch would squash the pill to zero height
    <div className="sticky top-3 z-30 flex h-0 items-start justify-end">
      <div className="flex items-center gap-1 rounded-full border border-zinc-950/10 bg-white/90 p-1 shadow-lg shadow-zinc-950/[0.06] backdrop-blur-md dark:border-white/10 dark:bg-zinc-900/90">
        {CHAPTERS.map((c) => (
          <button key={c.slug} onClick={() => onJump(c.slug)} title={c.title}
            className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-medium transition-colors', active === c.slug ? 'bg-zinc-950/[0.06] text-zinc-950 dark:bg-white/10 dark:text-zinc-50' : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50')}>
            <Icon name={c.icon} size={14} style={{ color: c.color }} />
            <span className="hidden md:inline">{c.title}</span><span className="cl-mono md:hidden">{c.n}</span>
          </button>
        ))}
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
  const activeRef = useRef('')
  const navRef = useRef(navigate); navRef.current = navigate
  const firstScroll = useRef(true)

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

  return (
    <div className="cl-root relative">
      <ChapterNav active={active} onJump={onJump} />
      <Header snap={snap} onJump={onJump} />
      <div id="ch-" data-slug="" className="h-px" />
      {CHAPTERS.map((c) => (
        <section key={c.slug} id={'ch-' + c.slug} data-slug={c.slug} className="scroll-mt-24 py-12 sm:py-20">
          <c.Comp self={self} snap={snap} actions={actions} refresh={refresh} accent={c.color} icon={c.icon} n={c.n} />
        </section>
      ))}
      <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-950/10 py-8 text-[13px] text-zinc-400 dark:border-white/10 dark:text-zinc-500">
        <span className="inline-flex items-center gap-2"><Icon name="terminal" size={13} /> Status Bar</span>
        <span>a name for every agent, a line that says where you are</span>
      </footer>
    </div>
  )
}
