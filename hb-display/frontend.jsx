/* hb-display — the Horse Browser's display & health page.
 *
 * The lid-closed story: agents keep browsing with the display asleep, but
 * screenshots need pixels — and waking a closed lid is worse (macOS re-blanks
 * ~10s later and Chrome drops every CDP websocket on the flap; measured).
 * The page: the horse banner → the idea → the story + a live DeskPad status
 * card (installed / running / virtual display / compositing, one-click brew
 * install) → the launcher's health journal (heal.log with why-context).
 */

import { Reveal, ChapterIntro, Step, Icon, ActionConsole, cn, useChromeStyles, useSnapshot, useActions } from './lib.jsx'

const { useState, useEffect } = React

// meta must be a pure object literal — the shell reads it statically.
export const meta = { chrome: 'catalyst-chrome', icon: 'monitor', name: 'HB Display' }

const ACCENT = '#10b981'

// a copyable shell command — click to copy, with the one-click button beside it
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

/* the compositing check — the page's headline question, answered for real:
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
  const v = checking ? { tone: 'zinc', head: 'taking a real screenshot…', sub: 'a 1×1 capture through the Horse Browser, timed' }
    : !res || !probe ? { tone: 'zinc', head: 'check failed', sub: 'could not reach the module backend — recheck in a moment' }
    : probe.status === 'ok' ? { tone: 'emerald', head: 'Screenshots work right now', sub: `a real 1×1 capture came back in ${probe.ms} ms` }
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

/* ──────────────────────────────── module ─────────────────────────────────── */
export default function Module() {
  useChromeStyles()
  const self = window.__atelier.self(import.meta.url)
  const { snap } = useSnapshot(self)
  const actions = useActions(self)
  const img = (nm) => self.api + '/images/' + nm
  const { byId, run } = actions || {}

  return (
    // same night-console surface as the horse-browser module: negative margins
    // eat the chrome card's padding; equal padding puts the content back.
    <div className="cl-root relative -m-6 bg-zinc-950 p-6 text-zinc-200 lg:-m-10 lg:p-10">
      {/* the horse rides on top — same banner, this page is its display wing */}
      <Reveal className="relative -mx-6 -mt-6 mb-9 lg:-mx-10 lg:-mt-10">
        <img src={img('horse-banner.jpg')} loading="lazy" alt="horse-browser — a celestial navigation trail of session tokens" className="cl-ink w-full" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent" />
        <span className="absolute bottom-4 left-6 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-100 ring-1 ring-white/15 lg:left-10">display &amp; health</span>
      </Reveal>

      <Reveal>
        <ChapterIntro dark icon="monitor" color={ACCENT} kicker="Horse Browser · Display"
          idea="Screenshots need pixels — even from a MacBook in a drawer."
          why="A closed-lid Mac, kept awake over SSH, is a perfect agent box: agents keep browsing, clicking, and reading pages with the display asleep. But vision — screenshots, challenge-solving — needs a display that is actually drawing. This page watches that story live and fixes the missing piece." />
      </Reveal>

      {/* the headline question, answered with a real probe on every page open */}
      <Reveal>
        <div className="mt-8">
          <CompositingCheck self={self} />
        </div>
      </Reveal>

      {/* the story + the live card */}
      <Reveal className="@container">
        <div className="mt-12 grid grid-cols-1 items-start gap-x-12 gap-y-9 @4xl:mt-14 @4xl:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)]">
          <Step dark label="Lid closed" color={ACCENT} title="Why waking the display is the wrong fix" className="!mt-0"
            lead="The moment a Mac’s last display sleeps, macOS stops drawing. DOM automation keeps working over a perfectly stable connection — but a screenshot needs a composited frame, so it just… waits. Forever.">
            <div className="space-y-3.5 text-[14px] leading-relaxed text-zinc-300">
              <p>The obvious fix makes things worse. Waking the panel works for about ten seconds — then macOS force-blanks a closed lid no matter what, and on that flap <span className="text-zinc-100">Chrome drops every live agent connection in the browser</span>. Measured, not theory: one wake, one delayed massacre. The horse-browser launcher therefore never touches a sleeping display — it skips its paint check, notes the episode in the journal below, and moves on.</p>
              <p>The clean fix is a display that never sleeps because it isn’t real. <span className="text-zinc-100">DeskPad</span> creates a virtual screen; WindowServer keeps compositing around the clock, and screenshots, vision, and challenge-solving all come back — lid open or shut. A $5 HDMI dummy plug does the same job in hardware, if you prefer zero software.</p>
            </div>
          </Step>
          <DeskPadCard snap={snap} byId={byId} run={run} />
        </div>
      </Reveal>

      {/* the launcher's own incident journal */}
      <Reveal>
        <div className="mt-12 sm:mt-16">
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">The health journal</div>
          <p className="mb-5 max-w-2xl text-[14px] leading-relaxed text-zinc-400">Every incident the launcher self-heals lands in <code className="cl-mono text-[12.5px]">heal.log</code> with why-context — GPU wedges after sleep, forced relaunches out of software-GL fallback, display-asleep episodes. Patterns show up here long before they show up on your battery.</p>
          <HealLog self={self} />
        </div>
      </Reveal>
    </div>
  )
}
