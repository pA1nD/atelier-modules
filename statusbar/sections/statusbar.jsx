/* Chapter 02 — The Status Bar · told as a story (same shape as ch.01).
 * idea → with/without + what each part means (inline) → how it's wired. */

import { sessionCode, Reveal, ChapterIntro, Step, Card, Icon, ActionConsole, VersionTag, cn, useDark, inkFor } from '../lib.jsx'
import { TermFrame, TermBody, Cmd, Say, Tool, Res, Work, InputBox, AutoMode } from '../term.jsx'

const { useState, useEffect } = React
const CC = sessionCode('149ae0dc-9202-4774-85b6-b8254b599c52')
const PROMPT = 'wire the statusline so every terminal names itself'

/* A terminal whose status line is the one thing that appears & goes: it fades in
 * (and stays a while), fades out (briefly), and loops — so you can spot exactly
 * which line it is. The "Statusbar: on/off" readout reflects it; clicking flips it
 * and the loop simply carries on from there. */
function StatusTerminal({ accent }) {
  const [on, setOn] = useState(true)
  useEffect(() => {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setTimeout(() => setOn((o) => !o), on ? 11000 : 4000)
    return () => clearTimeout(t)
  }, [on])
  return (
    <div>
      <div className="mb-3 inline-flex select-none items-center gap-1.5 text-[13px]" onClick={() => setOn((o) => !o)} title="it loops on its own — click to flip it">
        <span className="text-zinc-500 dark:text-zinc-400">Statusbar:</span>
        <span className={cn('font-semibold transition-colors', !on && 'text-zinc-400 dark:text-zinc-500')} style={on ? { color: accent } : undefined}>{on ? 'on' : 'off'}</span>
      </div>

      <TermFrame>
        <TermBody>
          <Cmd>{PROMPT}</Cmd>
          <Say>Adding the statusLine entry to your settings — merged in, nothing else touched.</Say>
          <Tool name="Update" arg="~/.claude/settings.json" />
          <Res>Added 1 line, removed 0</Res>
          <Work>Reticulating… (4s · ↑ 1.2k tokens)</Work>
        </TermBody>
        <InputBox />
        {/* the status line — its row is always reserved (so the terminal never shifts);
            only the content fades in (a while) and out (briefly) on a slow loop. */}
        <div className={cn('flex items-baseline gap-3 px-4 py-1 transition-opacity duration-700', !on && 'opacity-0')}>
          <span className="shrink-0 text-cyan-400">~/code/my-app</span>
          {/* the model only fits when the terminal's own column is wide — container-based,
              like the real bash dropping segments in a narrow terminal */}
          <span className="hidden shrink-0 text-zinc-300 @6xl:inline">Opus 4.8 (1M context)</span>
          <span className="shrink-0 text-zinc-400">ctx:38%</span>
          <span className="shrink-0">{CC.emoji} <span className="font-bold" style={{ color: CC.hex }}>{CC.callsign}</span></span>
          <span className="min-w-0 flex-1 truncate text-zinc-500">❯ {PROMPT}</span>
        </div>
        <div className="px-4 pb-2 pt-1"><AutoMode /></div>
      </TermFrame>
    </div>
  )
}

// one of the two things we set up here (jq, the status bar) — distinct from a prerequisite.
// tone: 'ok' (green dot) | 'warn' (amber — something IS there, just not ours) | 'off' (grey).
function InstallRow({ tone = 'off', title, status, desc, v }) {
  const dot = tone === 'ok' ? 'bg-emerald-500' : tone === 'warn' ? 'bg-amber-400' : 'bg-zinc-300 dark:bg-white/20'
  return (
    <div className="flex items-start gap-2.5">
      <span className={cn('mt-[5px] inline-block size-2.5 shrink-0 rounded-full', dot)} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]"><span className="font-semibold text-zinc-950 dark:text-zinc-50">{title}</span> {v && v.installed ? <VersionTag v={v} /> : status}</div>
        <div className="mt-0.5 text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">{desc}</div>
      </div>
    </div>
  )
}

export default function StatusBar({ snap, accent, icon, n, actions }) {
  const dark = useDark()
  const sl = snap?.statusline || {}
  const jqOk = snap?.tools?.jq?.installed
  const brewOk = !!snap?.homebrew?.available
  // 'ours' | 'codename' (same script, another copy) | 'other' (a different statusline) | 'none'
  const slStatus = sl.status || (sl.wired ? 'other' : 'none')
  const effective = slStatus === 'ours' || slStatus === 'codename'   // the codename bar IS showing
  const allDone = jqOk && effective
  const { byId, run } = actions || {}
  const entry = (byId && byId['install-statusbar']) || {}
  const install = () => run && run('install-statusbar', { confirm: true })
  const pieces = [
    { chip: <span className="text-cyan-600 dark:text-cyan-400">~/code/my-app</span>, name: 'The folder', desc: 'where the agent boots up — and where it reads its instructions and identity from (the CLAUDE.md files there). It’s what makes this a specific agent, not a blank one.' },
    { chip: <span className="cl-mono whitespace-nowrap text-zinc-700 dark:text-zinc-200">Opus 4.8 (1M context)</span>, name: 'The model', desc: 'the model actually running — here the latest, with its full 1-million-token context. Context ≈ how many words it can hold in short-term memory before it starts forgetting (or has to compact things down).' },
    { chip: <span className="text-zinc-700 dark:text-zinc-200">ctx:38%</span>, name: 'How full it is', desc: 'how much of that million is in use right now. The sweet spot is well worked-in — lots to draw on — but not bloated; past ~50% (≈500,000 words held at once) it gets unwieldy.' },
    { chip: <span>{CC.emoji} <span className="font-bold" style={{ color: inkFor(CC.color, dark) }}>{CC.callsign}</span></span>, name: 'Its identity', desc: 'the session’s name — the same emoji + four-letter code from Session Codes, so this terminal and your dashboard always point at the same agent.' },
    { chip: <span className="text-zinc-500">❯ wire the statusline…</span>, name: 'Your last prompt', desc: 'what you last asked this one — handy when several agents are running at once and you can’t remember which is doing what, without scrolling up.' },
  ]
  return (
    <div>
      <Reveal>
        <ChapterIntro n={n} icon={icon} color={accent} kicker="The Status Bar"
          idea="One line at the bottom of your terminal that tells you everything at once." />
      </Reveal>

      {/* with vs without — and, below the paragraph, what each part means (inline) */}
      <Reveal className="@container">
        <div className="mt-8 grid grid-cols-1 items-center gap-x-12 gap-y-9 @4xl:mt-12 @4xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <Step label="What it is" color={accent} title="The line that appears, and what it means" className="!mt-0"
            lead="Run a few sessions and they’re identical — same prompt, same blinking cursor, no idea which is which. The status bar adds one line at the bottom that names the session. Watch it appear and disappear on the right — then here’s what each piece is telling you:">
            <div className="mt-5 divide-y divide-zinc-950/[0.07] border-t border-zinc-950/[0.07] dark:divide-white/10 dark:border-white/10">
              {pieces.map((p) => (
                <p key={p.name} className="py-2.5 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                  <span className="cl-mono text-[12px]">{p.chip}</span>
                  <span className="ml-2 font-semibold text-zinc-950 dark:text-zinc-50">{p.name}</span>
                  <span> — {p.desc}</span>
                </p>
              ))}
            </div>
          </Step>
          <StatusTerminal accent={accent} />
        </div>
      </Reveal>

      {/* how it's wired (left, plain text) · live state (right) */}
      <Reveal className="@container">
        <div className="mt-12 grid grid-cols-1 items-start gap-x-12 gap-y-9 @4xl:mt-16 @4xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <Step label="How it works" color={accent} title="One little script, wired in once" className="!mt-0"
            lead="It’s barely any setup. The status bar is one small script — statusline.sh — that ships right here in this module. After each turn Claude runs it, hands it the session details, and it prints the line. Two things wire it up:">
            <ol className="mt-5 space-y-3.5">
              {[
                <>Claude keeps its global settings in one file: <code className="cl-mono text-[12.5px] text-zinc-700 dark:text-zinc-200">~/.claude/settings.json</code>.</>,
                <>We add a single <code className="cl-mono text-[12.5px] text-zinc-700 dark:text-zinc-200">"command": "statusline.sh"</code> entry to it — and from then on, every Claude Code session runs the script and shows the bar.</>,
              ].map((t, i) => (
                <li key={i} className="flex gap-3 text-[13.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                  <span className="mt-px grid size-5 shrink-0 place-items-center rounded-md bg-zinc-950/[0.05] text-[11px] font-semibold text-zinc-500 dark:bg-white/[0.06] dark:text-zinc-400">{i + 1}</span>
                  <span>{t}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">It reads the session details with <code className="cl-mono">jq</code> — the one small thing to have installed — and the entry is merged in, so your other settings are left alone.</p>
          </Step>

          <Card className="p-5">
            <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">On your machine</div>

            {/* prerequisite — Homebrew (a dependency we don't install; shown subtly, on its own) */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-zinc-500 dark:text-zinc-400">
              <Icon name="package" size={13} className={brewOk ? 'text-zinc-400 dark:text-zinc-500' : 'text-amber-500'} />
              <span>Needs <code className="cl-mono">Homebrew</code> —</span>
              {brewOk
                ? <span className="text-zinc-600 dark:text-zinc-300">found on your machine</span>
                : <span className="text-amber-600 dark:text-amber-400">not found · <a href="https://brew.sh" target="_blank" rel="noreferrer" className="underline underline-offset-2">install it first</a></span>}
            </div>

            {/* the two things we set up here. The status-bar row tells the truth about
                WHAT is wired: ours · the same codename script from another copy · a
                different statusline · nothing. */}
            <div className="mt-4 space-y-3">
              <InstallRow tone={jqOk ? 'ok' : 'off'} title="jq" v={snap?.versions?.jq}
                status={<span className={jqOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400 dark:text-zinc-500'}>— {jqOk ? 'installed' : 'not yet'}</span>}
                desc="a tiny, ubiquitous JSON tool — the script uses it to read the session details (and it’s handy for any JSON work)." />
              {slStatus === 'ours' && <InstallRow tone="ok" title="the status bar"
                status={<span className="text-emerald-600 dark:text-emerald-400">— wired to this module</span>}
                desc={<>the <code className="cl-mono">statusLine</code> entry in settings.json points at this module’s <code className="cl-mono">statusline.sh</code>.</>} />}
              {slStatus === 'codename' && <InstallRow tone="ok" title="the status bar"
                status={<span className="text-emerald-600 dark:text-emerald-400">— wired · another copy of this script</span>}
                desc={<>the exact same codename statusline, running from <code className="cl-mono break-all">{sl.commandShort}</code>. The bar you see is already this one — <button onClick={install} className="font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-500 dark:text-zinc-200 dark:decoration-zinc-600">point it at this module’s copy</button> if you’d rather this module own it.</>} />}
              {slStatus === 'other' && <InstallRow tone="warn" title="the status bar"
                status={<span className="text-amber-600 dark:text-amber-400">— a different statusline is wired</span>}
                desc={<>settings.json currently runs <code className="cl-mono break-all">{sl.commandShort}</code> — not the codename statusline. Setting up replaces that entry (settings.json is backed up first); the old script file itself is left untouched.</>} />}
              {slStatus === 'none' && <InstallRow tone="off" title="the status bar"
                status={<span className="text-zinc-400 dark:text-zinc-500">— not yet</span>}
                desc={<>the <code className="cl-mono">statusLine</code> entry in settings.json, pointing at this module’s <code className="cl-mono">statusline.sh</code>.</>} />}
            </div>

            {/* the primary call-to-action — pulsing, only while there's something to do */}
            {!allDone && (jqOk || brewOk) && (
              <div className="mt-6 flex justify-center">
                <button onClick={install}
                  className="cl-beacon inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-md transition hover:brightness-110"
                  style={{ background: accent, '--bc': accent + '5c' }}>
                  <Icon name="sparkles" size={15} /> {slStatus === 'other' ? 'Replace it with the codename status bar' : 'Set up the status bar'}
                </button>
              </div>
            )}
            {allDone && <div className="mt-4 flex items-center gap-2 text-[13px] font-semibold text-emerald-600 dark:text-emerald-400"><Icon name="check" size={15} /> {slStatus === 'ours' ? 'All set — open a fresh terminal to see it.' : 'All set — the codename status bar is live.'}</div>}

            <ActionConsole entry={entry} title="setting up the status bar" />
          </Card>
        </div>
      </Reveal>
    </div>
  )
}
