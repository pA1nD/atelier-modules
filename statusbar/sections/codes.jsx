/* Chapter 01 — Session Codes · the red line.
 * (a) why: many ultracoder agents at once → you need to tell them apart (real terminal)
 * (b) how: one long ID folds to a name — callsign + colour + emoji, the same everywhere
 * (c) the set: exactly 48, and the ones running right now (long id → short name)
 * (d) the payoff: one identity, identical across terminal, dashboard, and browser */

import { CODES, CODE_COLORS, CODE_INK, CODE_ORDER, sessionCode, hashStages, Reveal, ChapterIntro, Step, Card, Icon, cn, useDark, inkFor } from '../lib.jsx'
import { TermFrame, TermBody, Cmd, Say, Tool, Running, Res, Diff, Work, InputBox, AutoMode } from '../term.jsx'

const { useState, useEffect, useMemo, useRef } = React
const SAMPLE = '149ae0dc-9202-4774-85b6-b8254b599c52'

/* (a) — a Claude Code terminal mid-build: an ultracoder, two hours deep. No startup
 *    banner (long scrolled off); no statusline here — that lives in ch.02. */
function TerminalMock() {
  return (
    <TermFrame className="mx-auto w-full max-w-2xl shadow-lg">
      <TermBody>
        <Cmd><span className="font-medium" style={{ color: '#d97757' }}>/effort</span> ultracode</Cmd>
        <Cmd><span className="font-medium" style={{ color: '#d97757' }}>/goal</span> build a real-time finance dashboard, end to end</Cmd>
        <Say>Reconnecting the candlestick aggregator to the live tick stream — one small change to the socket fan-out.</Say>
        <Tool name="Update" arg="src/server/stream.ts" />
        <Res>Added 1 line, removed 1 line</Res>
        <Diff sign="-" line="123" code="socket.emit('tick', payload)" />
        <Diff sign="+" line="123" code="socket.volatile.emit('tick', payload)" />
        <Say>Now fan the ticks out over every open socket and re-run the stream suite.</Say>
        <Running name="Bash" arg="npm run test:stream --watch" />
        <Work>Transfiguring… (2h 11m · ↑ 189.9k tokens · esc to interrupt)</Work>
      </TermBody>
      <InputBox />
      <div className="px-4 py-2"><AutoMode /></div>
    </TermFrame>
  )
}


/* (b) — one of the three named components. */
function Component({ label, sub, children }) {
  return (
    <div className="rounded-xl border border-zinc-950/10 dark:border-white/10 bg-white dark:bg-zinc-900 p-4 text-center shadow-sm">
      <div className="text-[10.5px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{label}</div>
      <div className="mt-1.5">{children}</div>
      <div className="mt-1.5 text-[11px] leading-snug text-zinc-400 dark:text-zinc-500">{sub}</div>
    </div>
  )
}

/* (b) — the live decoder. The long ID slot-rolls to a fresh value every few seconds
 *    (each position flying through random hex, settling left→right), then the three
 *    parts pop to show what it folded to. No input — it runs itself. */
const DASH_AT = (i) => i === 8 || i === 13 || i === 18 || i === 23
function NameDecoder({ dark, onSlot }) {
  const HEX = '0123456789abcdef'
  const hexPos = useMemo(() => [...Array(36).keys()].filter((i) => !DASH_AT(i)), [])
  const rnd = () => HEX[(Math.random() * 16) | 0]
  const mkTarget = () => Array.from({ length: 36 }, (_, i) => DASH_AT(i) ? '-' : rnd())
  const [chars, setChars] = useState(() => SAMPLE.split(''))
  const [settledId, setSettledId] = useState(SAMPLE)
  const [rolling, setRolling] = useState(false)
  const raf = useRef(0), timer = useRef(0)

  useEffect(() => {
    let alive = true
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const BASE = 520, STEP = 32, GAP = 9000
    const settleAt = {}; hexPos.forEach((p, k) => { settleAt[p] = BASE + k * STEP })
    const maxT = BASE + (hexPos.length - 1) * STEP + 160
    const settle = (target) => { setChars(target); setSettledId(target.join('')); setRolling(false); timer.current = setTimeout(roll, GAP) }
    function roll() {
      const target = mkTarget()
      if (reduce) return settle(target)
      setRolling(true)
      const start = performance.now()
      const frame = (now) => {
        if (!alive) return
        const t = now - start
        setChars(Array.from({ length: 36 }, (_, i) => DASH_AT(i) ? '-' : (t >= settleAt[i] ? target[i] : rnd())))
        if (t < maxT) raf.current = requestAnimationFrame(frame)
        else settle(target)
      }
      raf.current = requestAnimationFrame(frame)
    }
    timer.current = setTimeout(roll, 2600)
    return () => { alive = false; cancelAnimationFrame(raf.current); clearTimeout(timer.current) }
  }, [hexPos])

  const cc = useMemo(() => sessionCode(settledId), [settledId])
  const slot = useMemo(() => hashStages(settledId).slot, [settledId])
  useEffect(() => { onSlot && onSlot(slot) }, [slot])
  const idStr = chars.join('')
  const pill = rolling
    ? { background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(24,24,27,0.05)', color: dark ? '#a1a1aa' : '#71717a' }
    : { background: cc.hex + '1f', color: inkFor(cc.color, dark) }

  return (
    <Card className="p-6 sm:p-8">
      <div className="text-center">
        <div className="cl-mono break-all text-[14px] leading-relaxed tracking-tight"><span className="text-zinc-400 dark:text-zinc-500">{idStr.slice(0, -4)}</span><span className="rounded-md px-1.5 py-0.5 font-semibold transition-colors" style={pill}>{idStr.slice(-4)}</span></div>
        <div className="mt-2 text-[10.5px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500">last 4 → callsign</div>
      </div>
      <div className="my-7 flex items-center gap-3">
        <span className="h-px flex-1 bg-zinc-950/10 dark:bg-white/10" />
        <span className="text-zinc-300 dark:text-zinc-600"><Icon name="chevron-down" size={16} /></span>
        <span className="cl-mono text-[10.5px] text-zinc-400 dark:text-zinc-500">one fold of the ID · #{slot} of 48</span>
        <span className="h-px flex-1 bg-zinc-950/10 dark:bg-white/10" />
      </div>
      <div key={settledId} className={cn('grid gap-3 sm:grid-cols-3', !rolling && 'cl-pop')}>
        <Component label="callsign" sub="the last 4, upper-cased"><div className="cl-mono text-2xl font-bold" style={{ color: inkFor(cc.color, dark) }}>{cc.callsign}</div></Component>
        <Component label="colour" sub="one of eight a browser can paint"><div className="flex items-center justify-center gap-2"><span className="size-5 rounded-md" style={{ background: cc.hex }} /><span className="text-[15px] font-semibold capitalize" style={{ color: inkFor(cc.color, dark) }}>{cc.color}</span></div></Component>
        <Component label="emoji" sub="a face to spot it by"><div className="text-3xl leading-none">{cc.emoji}</div></Component>
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-[11.5px] text-zinc-500 dark:text-zinc-400">
        <span>Same result, everywhere:</span>
        {[['terminal', 'terminal'], ['layout-dashboard', 'Atelier'], ['globe', 'horse browser']].map(([ic, l]) => <span key={l} className="inline-flex items-center gap-1 rounded-full border border-zinc-950/10 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.04] px-2 py-0.5"><Icon name={ic} size={12} /> {l}</span>)}
      </div>
    </Card>
  )
}

/* (c) — the full 48-name set, a compact colour-rowed table. The slot the decoder
 *    above currently shows lights up, fading in/out as it changes. */
function CodeTable({ dark, activeSlot }) {
  return (
    <Card className="w-fit max-w-full overflow-x-auto p-4 sm:p-5">
      <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">The 48 codenames</div>
      <div className="space-y-1.5">
        {CODE_ORDER.map((color) => {
          const hex = CODE_COLORS[color], row = CODES.map((c, gi) => ({ ...c, gi })).filter((c) => c.c === color)
          return (
            <div key={color} className="flex items-center gap-3">
              <div className="flex w-16 shrink-0 items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: hex }} />
                <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: inkFor(color, dark) }}>{color}</span>
              </div>
              <div className="flex gap-1.5">
                {row.map((c) => {
                  const on = c.gi === activeSlot
                  return (
                    <div key={c.gi} title={`#${c.gi} · ${color}`} className="grid size-9 place-items-center rounded-lg text-[15px] transition-all duration-700 ease-out"
                      style={on
                        ? { background: hex + (dark ? '33' : '24'), border: `1px solid ${hex}`, boxShadow: `0 0 0 1.5px ${hex}, 0 0 11px ${hex}77` }
                        : { background: hex + (dark ? '1c' : '14'), border: `1px solid ${hex}${dark ? '44' : '30'}`, boxShadow: `0 0 0 0 ${hex}00` }}>{c.e}</div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

export default function Codes({ snap, accent, icon, n, onNext, nextTitle }) {
  const dark = useDark()
  const [activeSlot, setActiveSlot] = useState(() => hashStages(SAMPLE).slot)
  const running = snap?.sessions?.running || []
  const rows = running.length ? running.slice().sort((a, b) => (a.callsign || '').localeCompare(b.callsign || '')) : [sessionCode(SAMPLE)]

  return (
    <div>
      <Reveal>
        <ChapterIntro n={n} icon={icon} color={accent} kicker="Session Codes"
          idea="When you run a roomful of agents, every one needs a name." />
      </Reveal>

      {/* (a) one agent at work — the narrative on the left, the live terminal on the right */}
      <Reveal className="@container">
        <div className="mt-8 grid grid-cols-1 items-start gap-x-12 gap-y-9 @4xl:mt-10 @4xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <div>
            <p className="max-w-xl text-[17px] leading-relaxed text-zinc-600 dark:text-zinc-300">You don’t run Claude one task at a time anymore. You hand a session an ambitious /goal, flip it to /effort ultracode — xhigh reasoning plus dynamic, multi-agent orchestration — and let it go: it can plan a whole build, spin up ~100 subagents, and stay on the problem for hours. So you open another. And another. Soon you’ve a wall of terminals that look exactly alike — same prompt, same spinner, same model line — and you’re typing into the wrong one. So each session quietly earns a tiny identity it wears everywhere.</p>
            <Step label="One agent at work" color={accent} title="An ultracoder, two hours deep" className="!mt-8"
              lead="A single session, mid-build: one /goal, xhigh reasoning, ~100 subagents fanning out, untouched for over two hours. Now picture a dozen of these open at once. They’re identical — that’s the problem Session Codes solve." />
          </div>
          <TerminalMock />
        </div>
      </Reveal>

      {/* (b) number → name — the text on the left, the live rolling decoder on the right */}
      <Reveal className="@container">
        <div className="mt-10 grid grid-cols-1 items-center gap-x-12 gap-y-10 @4xl:mt-16 @4xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
          <Step label="How the name is made" color={accent} title="From a long ID to a tiny name" className="!mt-0"
            lead="Every session starts as a long ID — basically a number. One small fold of that ID, run the exact same way in every tool, turns it into a name with three parts. Watch a fresh ID roll in and settle into its three." />
          <NameDecoder dark={dark} onSlot={setActiveSlot} />
        </div>
      </Reveal>

      {/* (c) the full set — the compact grid on the left, the text on the right */}
      <Reveal className="@container">
        <div className="flex flex-col items-start gap-8 @4xl:flex-row @4xl:items-center @4xl:gap-14">
          <CodeTable dark={dark} activeSlot={activeSlot} />
          <Step label="The full set" color={accent} title="Forty-eight names" className="!mt-0 @4xl:max-w-md"
            lead="There are exactly forty-eight: eight colours, six creatures each — eight because a browser tab group can only be painted one of eight colours, and that single limit caps the whole set." />
        </div>
      </Reveal>

      {/* (d) the payoff — the text on the left, the live ones (long ID → short name) on the right */}
      <Reveal className="@container">
        <div className="mt-10 grid grid-cols-1 items-center gap-x-12 gap-y-9 @4xl:mt-16 @4xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <Step label="The payoff" color={accent} title="One identity, in all three places" className="!mt-0"
            lead="Your terminal, your dashboard, and your browser never compare notes — each folds the same ID down to a name on its own. Same recipe, same answer. Follow one ID and watch the same name land in all three." />
          <Card className="w-fit max-w-full overflow-x-auto p-5">
            <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">{running.length ? 'Running right now — long ID → short name' : 'Example — how a stray ID resolves'}</div>
            <div className="divide-y divide-zinc-950/5 dark:divide-white/10">
              {rows.slice(0, 12).map((s) => {
                const ink = inkFor(s.color, dark)
                return (
                  <div key={s.id} className="flex items-center gap-3 py-2.5 text-[12px]">
                    {/* the grey prefix truncates on narrow screens; the coloured last-4 —
                        the part that matters — always stays visible */}
                    <span className="cl-mono flex min-w-0 flex-1 items-center text-[11px] text-zinc-400 dark:text-zinc-500"><span className="truncate">{s.id.slice(0, -4)}</span><span className="shrink-0 font-bold" style={{ color: ink }}>{s.id.slice(-4)}</span></span>
                    <Icon name="arrow-right" size={14} className="shrink-0 text-zinc-300 dark:text-zinc-600" />
                    <span className="cl-mono inline-flex shrink-0 items-center gap-1.5 font-semibold"><span>{s.emoji}</span><span style={{ color: ink }}>{s.callsign}</span></span>
                  </div>
                )
              })}
            </div>
            {rows.length > 12 && <p className="mt-2 text-[11px] text-zinc-400 dark:text-zinc-500">+{rows.length - 12} more running</p>}
            {!running.length && <p className="mt-3 text-[11px] text-zinc-400 dark:text-zinc-500">No sessions running — that’s a sample ID; the fold is the same either way.</p>}
          </Card>
        </div>
      </Reveal>

    </div>
  )
}
