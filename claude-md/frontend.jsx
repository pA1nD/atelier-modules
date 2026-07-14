/* claude-md — the note Claude reads first, as its own module.
 *
 * Extracted from claude5iq (retired): its CLAUDE.md chapter. The story (left):
 * Karpathy's observations → the multica-ai CLAUDE.md → the four rules. The
 * status (right): the top-level chapters of your ~/.claude/CLAUDE.md read live,
 * ours lit; add the rules with one click (append + backup, never clobber).
 * Plus the Horse Browser playbooks import that shares the same file.
 *
 * (The module id is `claude-md` — atelier ids can't contain dots — but the
 * rail shows the real name via meta.name.)
 */

import { Reveal, ChapterIntro, Card, Icon, ActionConsole, Modal, cn, useChromeStyles, useSnapshot, useActions } from './lib.jsx'

const { useState } = React

// meta must be a pure object literal — the shell reads it statically.
export const meta = { chrome: 'catalyst-chrome', icon: 'layers', name: 'CLAUDE.md' }

const ACCENT = '#d946ef'
const REPO = 'multica-ai/andrej-karpathy-skills'
const REPO_URL = 'https://github.com/' + REPO
const THREAD_URL = 'https://x.com/karpathy'
const RULES = [
  { t: 'Think Before Coding', d: 'state your assumptions and ask — instead of guessing.' },
  { t: 'Simplicity First', d: 'the minimum code that solves it; nothing speculative.' },
  { t: 'Surgical Changes', d: 'touch only what the task actually requires.' },
  { t: 'Goal-Driven Execution', d: 'define a verifiable success check, then loop until it passes.' },
]
// faint "omitted content" line widths, so each section reads as part of a document
const OMIT = [['72%', '48%', '64%'], ['58%', '46%'], ['66%', '54%', '40%']]

// a GitHub-style star badge: [★ Star | 183k]
function StarBadge() {
  return (
    <a href={REPO_URL} target="_blank" rel="noreferrer" className="inline-flex select-none items-stretch overflow-hidden rounded-md border border-zinc-950/15 text-[12px] font-semibold shadow-sm transition hover:-translate-y-px hover:border-zinc-950/30 dark:border-white/15 dark:hover:border-white/30">
      <span className="inline-flex items-center gap-1.5 bg-zinc-100 px-2.5 py-1.5 text-zinc-700 dark:bg-white/[0.08] dark:text-zinc-200"><Icon name="star" size={13} /> Star</span>
      <span className="inline-flex items-center border-l border-zinc-950/15 bg-white px-2.5 py-1.5 tabular-nums text-zinc-950 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-50">183k</span>
    </a>
  )
}

/* a tiny markdown renderer for our own CLAUDE.md template (headings, lists, **bold**, `code`, ``` fences) */
function Markdown({ text }) {
  const inline = (s) => {
    const parts = []; let last = 0, i = 0, m
    const re = /(\*\*([^*]+)\*\*|`([^`]+)`)/g
    while ((m = re.exec(s))) {
      if (m.index > last) parts.push(s.slice(last, m.index))
      if (m[2]) parts.push(<strong key={i++} className="font-semibold text-zinc-950 dark:text-zinc-50">{m[2]}</strong>)
      else parts.push(<code key={i++} className="cl-mono rounded bg-zinc-950/[0.06] px-1 py-0.5 text-[0.9em] dark:bg-white/10">{m[3]}</code>)
      last = m.index + m[0].length
    }
    if (last < s.length) parts.push(s.slice(last))
    return parts
  }
  const out = []; let list = null, code = null, k = 0
  const flush = () => { if (list) { out.push(<ul key={k++} className="my-2 space-y-1">{list}</ul>); list = null } }
  for (const line of (text || '').split('\n')) {
    if (/^```/.test(line)) {
      if (code === null) { flush(); code = [] }
      else { out.push(<pre key={k++} className="cl-mono my-3 overflow-auto rounded-lg bg-zinc-950 p-3 text-[12px] leading-relaxed text-zinc-300">{code.join('\n')}</pre>); code = null }
      continue
    }
    if (code !== null) { code.push(line); continue }
    if (/^#\s+/.test(line)) { flush(); out.push(<h3 key={k++} className="mt-6 border-b border-zinc-950/10 pb-1.5 text-[18px] font-bold text-zinc-950 first:mt-0 dark:border-white/10 dark:text-zinc-50">{inline(line.replace(/^#\s+/, ''))}</h3>) }
    else if (/^##\s+/.test(line)) { flush(); out.push(<h4 key={k++} className="mt-4 text-[14.5px] font-semibold text-zinc-900 dark:text-zinc-100">{inline(line.replace(/^##\s+/, ''))}</h4>) }
    else if (/^###\s+/.test(line)) { flush(); out.push(<h5 key={k++} className="mt-3 text-[13px] font-semibold text-zinc-700 dark:text-zinc-300">{inline(line.replace(/^###\s+/, ''))}</h5>) }
    else if (/^[-*]\s+/.test(line)) { (list = list || []).push(<li key={k++} className="flex gap-2 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300"><span className="mt-px text-zinc-400">•</span><span>{inline(line.replace(/^[-*]\s+/, ''))}</span></li>) }
    else if (line.trim() === '') flush()
    else { flush(); out.push(<p key={k++} className="my-2 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">{inline(line)}</p>) }
  }
  flush()
  return <div>{out}</div>
}

function SkillModal({ text, onClose }) {
  return (
    <Modal onClose={onClose} size="max-w-2xl">
      {(close) => (
        <>
          <div className="flex shrink-0 items-center justify-between border-b border-zinc-950/10 px-5 py-3.5 dark:border-white/10">
            <div className="flex items-center gap-2"><Icon name="file-text" size={15} className="text-emerald-600" /><span className="cl-mono text-[13px] font-semibold text-zinc-950 dark:text-zinc-50">CLAUDE.md · the skill</span><a href={REPO_URL} target="_blank" rel="noreferrer" className="cl-mono text-[11px] text-zinc-400 underline-offset-2 hover:underline dark:text-zinc-500">{REPO}</a></div>
            <button onClick={close} className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-950/[0.06] hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"><Icon name="x" size={16} /></button>
          </div>
          <div className="flex-1 overflow-auto px-6 py-5">{text == null ? <div className="text-[13px] text-zinc-400">loading…</div> : <Markdown text={text} />}</div>
        </>
      )}
    </Modal>
  )
}

// live readout under the intro — the real file, straight from disk
function StatusStrip({ snap }) {
  const g = snap?.claudemd?.global
  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-[12.5px]">
      {!snap ? (
        <span className="inline-flex items-center gap-1.5 text-zinc-400 dark:text-zinc-500"><span className="size-1.5 animate-pulse rounded-full bg-amber-400" /> reading your machine…</span>
      ) : g?.exists ? (
        <>
          <span className="inline-flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            <span className="cl-mono">{g.path}</span> · {(g.sections || []).length} {(g.sections || []).length === 1 ? 'chapter' : 'chapters'} · {(g.bytes / 1000).toFixed(1)} kB
          </span>
          <span className="text-zinc-300 dark:text-zinc-600">·</span>
          {g.hasOurs
            ? <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400"><Icon name="check" size={13} /> the four rules are in</span>
            : <span className="inline-flex items-center gap-1.5 font-semibold text-amber-600 dark:text-amber-400"><span className="size-1.5 rounded-full bg-amber-400" /> the four rules aren’t in yet</span>}
        </>
      ) : (
        <span className="inline-flex items-center gap-1.5 font-semibold text-amber-600 dark:text-amber-400"><span className="size-1.5 rounded-full bg-amber-400" /> no global CLAUDE.md yet — adding the rules creates it</span>
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
  const g = snap?.claudemd?.global || {}
  const { byId, run } = actions || {}
  const entry = (byId && byId['install-global-claudemd']) || {}
  const cfg = snap?.versions?.['browser-config']
  const cfgEntry = (byId && byId['install-browser-config']) || {}
  const [skill, setSkill] = useState(null)
  const [openModal, setOpenModal] = useState(false)

  const readSkill = async () => {
    if (skill == null) {
      const r = await fetch(self.api + '/templates/global').then((x) => x.json()).catch(() => null)
      setSkill((r && r.text) || '(could not load the skill)')
    }
    setOpenModal(true)
  }

  return (
    <div className="cl-root relative">
      <Reveal>
        <ChapterIntro icon="layers" color={ACCENT} kicker="CLAUDE.md"
          idea="A note Claude reads before it writes a line."
          why="Out of the box, Claude doesn’t know your habits or your project’s hard rules — so it guesses. A CLAUDE.md is a short note it reads at the start of every conversation. The most famous one is just four rules; here’s where they came from." />
        <StatusStrip snap={snap} />
      </Reveal>

      <Reveal className="@container">
        <div className="mt-8 grid grid-cols-1 items-start gap-x-12 gap-y-9 @4xl:mt-12 @4xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          {/* the story */}
          <div>
            <div className="mb-3 flex items-center gap-2.5">
              <span className="inline-block h-4 w-1 rounded-full" style={{ background: ACCENT }} />
              <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">Where it comes from</span>
            </div>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <a href={REPO_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-[13.5px] font-medium text-zinc-700 transition hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white">
                <Icon name="github" size={16} /> <span className="cl-mono">{REPO}</span>
              </a>
              <StarBadge />
              <span className="rounded border border-zinc-950/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-zinc-500 dark:border-white/15 dark:text-zinc-400">MIT</span>
            </div>

            <p className="text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-300">
              <span className="font-semibold text-zinc-950 dark:text-zinc-50">Andrej Karpathy</span> — former Director of AI at Tesla and a founding member of OpenAI — posted <a href={THREAD_URL} target="_blank" rel="noreferrer" className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-500 dark:text-zinc-100 dark:decoration-zinc-600">a thread on X</a> in January 2026: he’d flipped from writing ~80% of his code by hand to letting agents like Claude Code write ~80% of it. He also pinned down where agents fall short — they <span className="italic text-zinc-700 dark:text-zinc-200">“make wrong assumptions… and just run along with them without checking.”</span>
            </p>
            <p className="mt-3 text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-300">
              He never wrote a config file himself. The <span className="font-semibold text-zinc-950 dark:text-zinc-50">multica-ai</span> team distilled those observations into a single CLAUDE.md and <a href={REPO_URL} target="_blank" rel="noreferrer" className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-500 dark:text-zinc-100 dark:decoration-zinc-600">published it</a> under MIT — it went viral, and now sits at ~183K stars. Its essence is four rules:
            </p>

            <div className="mt-5 space-y-2.5">
              {RULES.map((r, i) => (
                <div key={r.t} className="flex gap-3">
                  <span className="mt-px grid size-5 shrink-0 place-items-center rounded-md text-[11px] font-bold" style={{ background: ACCENT + '1f', color: ACCENT }}>{i + 1}</span>
                  <div className="text-[13.5px] leading-relaxed"><span className="font-semibold text-zinc-950 dark:text-zinc-50">{r.t}</span> <span className="text-zinc-600 dark:text-zinc-300">— {r.d}</span></div>
                </div>
              ))}
            </div>
            <div className="mt-6">
              <button onClick={readSkill} className="inline-flex items-center gap-1.5 rounded-full border border-zinc-950/15 px-4 py-2 text-[13px] font-semibold text-zinc-700 transition hover:bg-zinc-950/[0.04] dark:border-white/15 dark:text-zinc-200 dark:hover:bg-white/[0.06]"><Icon name="book-open" size={14} /> Read the full skill</button>
            </div>
          </div>

          {/* On your machine — the same check style as the Status Bar's */}
          <Card className="p-5">
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">On your machine</div>
            <p className="mb-2 text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">The chapters currently in your notes — Claude reads them at the start of every conversation:</p>
            <div className="cl-mono mb-3 text-[11px] text-zinc-400 dark:text-zinc-500">{g.path || '~/.claude/CLAUDE.md'}</div>

            {/* the file as a document: its # headings, with the bodies omitted */}
            {g.exists && g.sections?.length ? (
              <div className="overflow-hidden rounded-xl border border-zinc-950/10 bg-white dark:border-white/10 dark:bg-zinc-950/40">
                {g.sections.map((s, i) => (
                  <div key={i} className="border-b border-zinc-950/[0.06] px-3.5 py-2.5 last:border-b-0 dark:border-white/[0.06]" style={s.ours ? { background: ACCENT + '12' } : undefined}>
                    <div className="flex items-center gap-2">
                      <span className="text-[13px]"><span className="font-medium text-zinc-400 dark:text-zinc-500">Chapter {i + 1}</span> <span className="text-zinc-300 dark:text-zinc-600">·</span> <span className={cn('font-semibold', !s.ours && 'text-zinc-800 dark:text-zinc-200')} style={s.ours ? { color: ACCENT } : undefined}>{s.title}</span></span>
                      {s.ours && <span className="ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: ACCENT + '22', color: ACCENT }}>these rules</span>}
                    </div>
                    <div className="mt-2 space-y-1 pl-4">
                      {OMIT[i % OMIT.length].map((w, j) => <div key={j} className="h-1 rounded-full bg-zinc-200/80 dark:bg-white/[0.07]" style={{ width: w }} />)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-zinc-950/15 px-3.5 py-3 text-[12.5px] leading-relaxed text-zinc-500 dark:border-white/15 dark:text-zinc-400">No global CLAUDE.md yet — adding the rules creates it.</p>
            )}

            <div className="mt-3 flex items-center gap-2 text-[13px] font-medium">
              <span className={cn('inline-block size-2.5 rounded-full', g.hasOurs ? 'bg-emerald-500' : 'bg-amber-400')} />
              <span className={g.hasOurs ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-600 dark:text-zinc-300'}>{g.hasOurs ? 'The four rules are in your notes' : 'Not in your notes yet'}</span>
            </div>

            {!g.hasOurs && (
              <div className="mt-5 flex justify-center">
                <button onClick={() => run && run('install-global-claudemd', { confirm: true })} className="cl-beacon inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-md transition hover:brightness-110" style={{ background: ACCENT, '--bc': ACCENT + '5c' }}><Icon name="plus" size={15} /> Add the rules to my CLAUDE.md</button>
              </div>
            )}
            {g.hasOurs && <div className="mt-4 flex items-center gap-2 text-[13px] font-semibold text-emerald-600 dark:text-emerald-400"><Icon name="check" size={15} /> All set — the four rules are in your notes.</div>}
            <p className="mt-3 text-[11.5px] leading-relaxed text-zinc-400 dark:text-zinc-500">Installing appends the whole block to the file — your other sections are kept, and a backup is saved first.</p>
            <ActionConsole entry={entry} title="adding the rules to your CLAUDE.md" />

            {/* horse-browser also keeps a block in this file — the @-import of its browser playbooks */}
            {cfg && (
              <div className="mt-5 border-t border-zinc-950/[0.07] pt-4 dark:border-white/10">
                <div className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
                  <span className={cn('inline-block size-2.5 shrink-0 rounded-full', cfg.upToDate ? 'bg-emerald-500' : cfg.scriptAvailable ? 'bg-amber-400' : 'bg-zinc-300 dark:bg-white/20')} />
                  <span className="text-zinc-700 dark:text-zinc-200">The Horse Browser playbooks</span>
                  {cfg.upToDate ? <span className="text-emerald-600 dark:text-emerald-400">— imported &amp; up to date</span>
                    : cfg.scriptAvailable ? <span className="text-zinc-600 dark:text-zinc-300">— not imported yet</span>
                    : <span className="text-zinc-400 dark:text-zinc-500">— install horse-browser first (the Horse Browser module)</span>}
                </div>
                <p className="mt-1 text-[11.5px] leading-relaxed text-zinc-400 dark:text-zinc-500">horse-browser adds an <code className="cl-mono">@</code>-import of its browser playbooks to this file, so agents know how to drive it. Its <code className="cl-mono">claude-md.sh</code> keeps that import aimed at the current skill — so the path can’t rot.</p>
                {cfg.scriptAvailable && cfg.upToDate === false && (
                  <div className="mt-3"><button onClick={() => run && run('install-browser-config', { confirm: true })} className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold text-white shadow-sm transition hover:brightness-110" style={{ background: ACCENT }}><Icon name="plus" size={13} /> Import the browser playbooks</button></div>
                )}
                <ActionConsole entry={cfgEntry} title="importing the browser playbooks" />
              </div>
            )}
          </Card>
        </div>
      </Reveal>

      {openModal && <SkillModal text={skill} onClose={() => setOpenModal(false)} />}
    </div>
  )
}
