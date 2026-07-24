/* claude-md — the note Claude reads first, as its own module.
 *
 * Extracted from claude5iq (retired): its CLAUDE.md chapter. Layout, top to
 * bottom: the Karpathy skill as a standalone box — the story (Karpathy's
 * observations → the multica-ai CLAUDE.md), its four rules, and the one-click
 * install into ~/.claude/rules/instructions.md (verbatim move + backups) —
 * then "On your machine": your ~/.claude/CLAUDE.md chapters AND every rule
 * file in ~/.claude/rules/ read live (rules load exactly like CLAUDE.md — one
 * owned file per concern), ours lit — stacked in load order; clicking any
 * chapter or rule file pretty-renders it in a focused reading modal.
 * Deliberately dumb: simple parsing of the folder + headlines, no knowledge
 * of the tools that own individual rule files.
 *
 * (The module id is `claude-md` — atelier ids can't contain dots — but the
 * rail shows the real name via meta.name.)
 */

import { Reveal, ChapterIntro, Card, Eyebrow, Step, Icon, ActionConsole, Modal, cn, useChromeStyles, useSnapshot, useActions } from './lib.jsx'

const { useState, useRef } = React

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
    const re = /(\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|`([^`]+)`)/g
    while ((m = re.exec(s))) {
      if (m.index > last) parts.push(s.slice(last, m.index))
      if (m[2]) parts.push(<strong key={i++} className="font-semibold text-zinc-950 dark:text-zinc-50">{m[2]}</strong>)
      else if (m[3]) parts.push(<em key={i++} className="italic text-zinc-700 dark:text-zinc-200">{m[3]}</em>)
      else parts.push(<code key={i++} className="cl-mono rounded bg-zinc-950/[0.06] px-1 py-0.5 text-[0.9em] dark:bg-white/10">{m[4]}</code>)
      last = m.index + m[0].length
    }
    if (last < s.length) parts.push(s.slice(last))
    return parts
  }
  // hard-wrapped source lines join into real paragraphs / list items
  const out = []; let list = null, code = null, para = null, k = 0
  const flushPara = () => { if (para != null) { out.push(<p key={k++} className="my-2 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">{inline(para)}</p>); para = null } }
  const flushList = () => {
    if (list) {
      out.push(<ul key={k++} className="my-2 space-y-1">{list.map((it, j) => (
        <li key={j} className="flex gap-2 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300"><span className="mt-px shrink-0 tabular-nums text-zinc-400">{it.marker}</span><span>{inline(it.text)}</span></li>
      ))}</ul>)
      list = null
    }
  }
  const flush = () => { flushPara(); flushList() }
  for (const line of (text || '').split('\n')) {
    if (/^```/.test(line)) {
      if (code === null) { flush(); code = [] }
      else { out.push(<pre key={k++} className="cl-mono my-3 overflow-auto rounded-lg bg-zinc-950 p-3 text-[12px] leading-relaxed text-zinc-300">{code.join('\n')}</pre>); code = null }
      continue
    }
    if (code !== null) { code.push(line); continue }
    if (/^<!--.*-->\s*$/.test(line)) continue   // owner markers on tool-managed rule files
    if (/^#\s+/.test(line)) { flush(); out.push(<h3 key={k++} className="mt-6 border-b border-zinc-950/10 pb-1.5 text-[18px] font-bold text-zinc-950 first:mt-0 dark:border-white/10 dark:text-zinc-50">{inline(line.replace(/^#\s+/, ''))}</h3>) }
    else if (/^##\s+/.test(line)) { flush(); out.push(<h4 key={k++} className="mt-4 text-[14.5px] font-semibold text-zinc-900 dark:text-zinc-100">{inline(line.replace(/^##\s+/, ''))}</h4>) }
    else if (/^###\s+/.test(line)) { flush(); out.push(<h5 key={k++} className="mt-3 text-[13px] font-semibold text-zinc-700 dark:text-zinc-300">{inline(line.replace(/^###\s+/, ''))}</h5>) }
    else if (/^-{3,}\s*$/.test(line)) { flush(); out.push(<div key={k++} className="my-4 border-t border-zinc-950/10 dark:border-white/10" />) }
    else if (/^[-*]\s+/.test(line)) { flushPara(); (list = list || []).push({ marker: '•', text: line.replace(/^[-*]\s+/, '') }) }
    else if (/^\d+\.\s+/.test(line)) { flushPara(); (list = list || []).push({ marker: /^(\d+)\./.exec(line)[1] + '.', text: line.replace(/^\d+\.\s+/, '') }) }
    else if (line.trim() === '') flush()
    else if (list && /^\s+\S/.test(line)) { list[list.length - 1].text += ' ' + line.trim() }
    else { flushList(); para = para == null ? line.trim() : para + ' ' + line.trim() }
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

// the reading modal — a clicked chapter or rule file, rendered for focus.
// The raw toggle shows the COMPLETE file verbatim (for a chapter: all of CLAUDE.md).
function DocModal({ sel, doc, onClose }) {
  const [raw, setRaw] = useState(false)
  const seg = (active) => cn('rounded-md px-2.5 py-1 text-[11px] font-semibold transition', active ? 'bg-white text-zinc-950 shadow-sm dark:bg-white/15 dark:text-zinc-50' : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200')
  return (
    <Modal onClose={onClose} size="max-w-3xl">
      {(close) => (
        <>
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-950/10 px-5 py-3.5 dark:border-white/10">
            <div className="flex min-w-0 items-center gap-2">
              <Icon name="file-text" size={15} className="shrink-0 text-zinc-400 dark:text-zinc-500" />
              <span className="cl-mono shrink-0 text-[13px] font-semibold text-zinc-950 dark:text-zinc-50">{raw || sel.kind !== 'chapter' ? (doc?.path || (sel.kind === 'chapter' ? '~/.claude/CLAUDE.md' : sel.file)) : `Chapter ${sel.i + 1} · ${sel.label}`}</span>
              {!raw && sel.kind === 'chapter' && <span className="cl-mono min-w-0 truncate text-[11px] text-zinc-400 dark:text-zinc-500">{doc?.path}</span>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {doc?.raw != null && (
                <span className="flex items-center gap-0.5 rounded-lg bg-zinc-950/[0.05] p-0.5 dark:bg-white/[0.08]">
                  <button onClick={() => setRaw(false)} className={seg(!raw)}>Pretty</button>
                  <button onClick={() => setRaw(true)} className={seg(raw)}>Raw</button>
                </span>
              )}
              <button onClick={close} className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-950/[0.06] hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"><Icon name="x" size={16} /></button>
            </div>
          </div>
          <div className="flex-1 overflow-auto px-6 py-5 sm:px-8 sm:py-6">
            {doc == null ? <div className="text-[13px] text-zinc-400">loading…</div>
              : doc.error ? <div className="text-[13px] text-rose-500">{doc.error}</div>
              : raw ? <pre className="cl-mono whitespace-pre-wrap break-words text-[12px] leading-relaxed text-zinc-700 dark:text-zinc-300">{doc.raw}</pre>
              : <Markdown text={doc.text} />}
          </div>
        </>
      )}
    </Modal>
  )
}

/* ──────────────────────────────── module ─────────────────────────────────── */
export default function Module() {
  useChromeStyles()
  const self = window.__atelier.self(import.meta.url)
  const { snap } = useSnapshot(self)
  const actions = useActions(self)
  const g = snap?.claudemd?.global || {}
  const rules = snap?.rules || []
  const oursRule = rules.find((r) => r.ours)
  const { byId, run } = actions || {}
  const entry = (byId && byId['install-global-claudemd']) || {}
  const [skill, setSkill] = useState(null)
  const [openModal, setOpenModal] = useState(false)

  // the reader pane — which document is open, and its fetched text
  const [sel, setSel] = useState(null)   // { kind:'chapter', i, label } | { kind:'rule', file }
  const [doc, setDoc] = useState(null)   // { path, text } | { error }
  const seqRef = useRef(0)
  const openDoc = async (s) => {
    const seq = ++seqRef.current
    setSel(s); setDoc(null)
    const url = s.kind === 'chapter' ? '/chapter/' + s.i : '/rule/' + encodeURIComponent(s.file)
    const r = await fetch(self.api + url).then((x) => x.json()).catch(() => null)
    if (seqRef.current !== seq) return
    setDoc(r && r.text != null ? r : { error: (r && r.error) || 'could not load' })
  }

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
      </Reveal>

      {/* the Karpathy skill — a standalone box: the story, the four rules, install */}
      <Reveal className="@container">
        <Card className="relative mt-8 overflow-hidden p-6 sm:p-8">
          <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: ACCENT }} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Eyebrow icon="star" color={ACCENT}>The Karpathy skill</Eyebrow>
            <span className="ml-auto inline-flex flex-wrap items-center gap-3">
              <a href={REPO_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-[13px] font-medium text-zinc-700 transition hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white">
                <Icon name="github" size={15} /> <span className="cl-mono">{REPO}</span>
              </a>
              <StarBadge />
              <span className="rounded border border-zinc-950/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-zinc-500 dark:border-white/15 dark:text-zinc-400">MIT</span>
            </span>
          </div>

          <div className="mt-6 grid grid-cols-1 items-start gap-x-12 gap-y-7 @3xl:grid-cols-2">
            {/* the story */}
            <div>
              <p className="text-[14.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                <span className="font-semibold text-zinc-950 dark:text-zinc-50">Andrej Karpathy</span> — former Director of AI at Tesla and a founding member of OpenAI — posted <a href={THREAD_URL} target="_blank" rel="noreferrer" className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-500 dark:text-zinc-100 dark:decoration-zinc-600">a thread on X</a> in January 2026: he’d flipped from writing ~80% of his code by hand to letting agents like Claude Code write ~80% of it. He also pinned down where agents fall short — they <span className="italic text-zinc-700 dark:text-zinc-200">“make wrong assumptions… and just run along with them without checking.”</span>
              </p>
              <p className="mt-3 text-[14.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                He never wrote a config file himself. The <span className="font-semibold text-zinc-950 dark:text-zinc-50">multica-ai</span> team distilled those observations into a single CLAUDE.md and <a href={REPO_URL} target="_blank" rel="noreferrer" className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-500 dark:text-zinc-100 dark:decoration-zinc-600">published it</a> under MIT — it went viral, and now sits at ~183K stars.
              </p>
            </div>

            {/* the four rules */}
            <div>
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">Its essence — four rules</div>
              <div className="space-y-2.5">
                {RULES.map((r, i) => (
                  <div key={r.t} className="flex gap-3">
                    <span className="mt-px grid size-5 shrink-0 place-items-center rounded-md text-[11px] font-bold" style={{ background: ACCENT + '1f', color: ACCENT }}>{i + 1}</span>
                    <div className="text-[13.5px] leading-relaxed"><span className="font-semibold text-zinc-950 dark:text-zinc-50">{r.t}</span> <span className="text-zinc-600 dark:text-zinc-300">— {r.d}</span></div>
                  </div>
                ))}
              </div>
              <div className="mt-5">
                <button onClick={readSkill} className="inline-flex items-center gap-1.5 rounded-full border border-zinc-950/15 px-4 py-2 text-[13px] font-semibold text-zinc-700 transition hover:bg-zinc-950/[0.04] dark:border-white/15 dark:text-zinc-200 dark:hover:bg-white/[0.06]"><Icon name="book-open" size={14} /> Read the full skill</button>
              </div>
            </div>
          </div>

          {/* install status + action — for this box's skill only */}
          {snap && (
            <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-zinc-950/[0.07] pt-5 dark:border-white/10">
              {oursRule ? (
                <span className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-emerald-600 dark:text-emerald-400">
                  <Icon name="check" size={15} /> Installed — the four rules live in <span className="cl-mono">{oursRule.path}</span>
                </span>
              ) : (
                <>
                  <button onClick={() => run && run('install-global-claudemd', { confirm: true })} className="cl-beacon inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-md transition hover:brightness-110" style={{ background: ACCENT, '--bc': ACCENT + '5c' }}>
                    <Icon name="plus" size={15} /> {g.hasOurs ? 'Move the rules to their own file' : 'Install the four rules'}
                  </button>
                  <span className="text-[11.5px] leading-relaxed text-zinc-400 dark:text-zinc-500">
                    Writes <code className="cl-mono">~/.claude/rules/instructions.md</code>{g.hasOurs ? ' — your CLAUDE.md chapter moves over verbatim, backups first.' : ' — backups saved first.'}
                  </span>
                </>
              )}
            </div>
          )}
          <ActionConsole entry={entry} title="installing the four rules" />
        </Card>
      </Reveal>

      {/* what's actually installed — the real files, straight from disk,
          stacked the way Claude loads them; click one → the reading modal */}
      <Reveal>
        <Step label="On your machine" color={ACCENT}>
          {!snap ? (
            <p className="inline-flex items-center gap-1.5 text-[12.5px] text-zinc-400 dark:text-zinc-500"><span className="size-1.5 animate-pulse rounded-full bg-amber-400" /> reading your machine…</p>
          ) : (
            <div>
              {/* 1 · the main file — loads first */}
              <Card className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="grid size-5 shrink-0 place-items-center rounded-md bg-zinc-950/[0.06] text-[11px] font-bold text-zinc-500 dark:bg-white/10 dark:text-zinc-400">1</span>
                  <Icon name="file-text" size={14} className="text-zinc-400 dark:text-zinc-500" />
                  <span className="cl-mono text-[12.5px] font-semibold text-zinc-800 dark:text-zinc-200">{g.path || '~/.claude/CLAUDE.md'}</span>
                  <span className="ml-auto shrink-0 rounded-full bg-zinc-950/[0.05] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:bg-white/[0.08] dark:text-zinc-400">loads first</span>
                </div>
                <p className="mb-3 mt-1.5 text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">Your free-form note — its chapters are read at the start of every conversation. Click one to read it:</p>

                {/* the file as a document: its # headings, with the bodies omitted */}
                {g.exists && g.sections?.length ? (
                  <div className="overflow-hidden rounded-xl border border-zinc-950/10 bg-white dark:border-white/10 dark:bg-zinc-950/40">
                    {g.sections.map((s, i) => (
                      <button key={i} type="button" onClick={() => openDoc({ kind: 'chapter', i, label: s.title })}
                        className="block w-full cursor-pointer border-b border-zinc-950/[0.06] px-3.5 py-2.5 text-left transition last:border-b-0 hover:bg-zinc-950/[0.03] dark:border-white/[0.06] dark:hover:bg-white/[0.05]"
                        style={s.ours ? { background: ACCENT + '12' } : undefined}>
                        <div className="flex items-center gap-2">
                          <span className="text-[13px]"><span className="font-medium text-zinc-400 dark:text-zinc-500">Chapter {i + 1}</span> <span className="text-zinc-300 dark:text-zinc-600">·</span> <span className={cn('font-semibold', !s.ours && 'text-zinc-800 dark:text-zinc-200')} style={s.ours ? { color: ACCENT } : undefined}>{s.title}</span></span>
                          {s.ours && <span className="ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: ACCENT + '22', color: ACCENT }}>these rules</span>}
                        </div>
                        <div className="mt-2 space-y-1 pl-4">
                          {OMIT[i % OMIT.length].map((w, j) => <div key={j} className="h-1 rounded-full bg-zinc-200/80 dark:bg-white/[0.07]" style={{ width: w }} />)}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-zinc-950/15 px-3.5 py-3 text-[12.5px] leading-relaxed text-zinc-500 dark:border-white/15 dark:text-zinc-400">No global CLAUDE.md — that’s fine; rule files load without it.</p>
                )}
              </Card>

              {/* the load order, made literal */}
              <div className="flex justify-center py-1 text-zinc-300 dark:text-zinc-600"><Icon name="arrow-down" size={15} /></div>

              {/* 2 · the rules folder — loads next, file by file */}
              <Card className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="grid size-5 shrink-0 place-items-center rounded-md bg-zinc-950/[0.06] text-[11px] font-bold text-zinc-500 dark:bg-white/10 dark:text-zinc-400">2</span>
                  <Icon name="folder" size={14} className="text-zinc-400 dark:text-zinc-500" />
                  <span className="cl-mono text-[12.5px] font-semibold text-zinc-800 dark:text-zinc-200">~/.claude/rules/</span>
                  <span className="ml-auto shrink-0 rounded-full bg-zinc-950/[0.05] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:bg-white/[0.08] dark:text-zinc-400">then, A→Z</span>
                </div>
                <p className="mb-2 mt-1.5 text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">One owned file per concern — each loads exactly like CLAUDE.md, <code className="cl-mono">@</code>-imports included, in filename order:</p>
                {rules.length ? (
                  <div className="overflow-hidden rounded-xl border border-zinc-950/10 bg-white dark:border-white/10 dark:bg-zinc-950/40">
                    {rules.map((r) => (
                      <button key={r.file} type="button" onClick={() => openDoc({ kind: 'rule', file: r.file })}
                        className="block w-full cursor-pointer border-b border-zinc-950/[0.06] px-3.5 py-2.5 text-left transition last:border-b-0 hover:bg-zinc-950/[0.03] dark:border-white/[0.06] dark:hover:bg-white/[0.05]"
                        style={r.ours ? { background: ACCENT + '12' } : undefined}>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <Icon name="file-text" size={13} className="shrink-0 text-zinc-400 dark:text-zinc-500" />
                          <span className={cn('cl-mono text-[12.5px] font-semibold', !r.ours && 'text-zinc-800 dark:text-zinc-200')} style={r.ours ? { color: ACCENT } : undefined}>{r.file}</span>
                          <span className="text-[12px] text-zinc-500 dark:text-zinc-400"># {r.title}</span>
                          {r.ours && <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: ACCENT + '22', color: ACCENT }}>these rules</span>}
                          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide', r.managedBy ? 'bg-zinc-950/[0.05] text-zinc-500 dark:bg-white/[0.08] dark:text-zinc-400' : 'border border-zinc-950/15 text-zinc-500 dark:border-white/15 dark:text-zinc-400')}>{r.managedBy ? 'tool-managed' : 'yours'}</span>
                          <span className="ml-auto cl-mono shrink-0 text-[10.5px] text-zinc-400 dark:text-zinc-500">{(r.bytes / 1000).toFixed(1)} kB{r.imports.length ? ` · ${r.imports.length} @-import${r.imports.length > 1 ? 's' : ''}` : ''}</span>
                        </div>
                        {r.managedBy && <div className="mt-1 truncate pl-[21px] text-[11px] text-zinc-400 dark:text-zinc-500">{r.managedBy}</div>}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-zinc-950/15 px-3.5 py-3 text-[12.5px] leading-relaxed text-zinc-500 dark:border-white/15 dark:text-zinc-400">No rule files yet — installing the four rules above creates the folder.</p>
                )}
              </Card>
            </div>
          )}
        </Step>
      </Reveal>

      {openModal && <SkillModal text={skill} onClose={() => setOpenModal(false)} />}
      {sel && <DocModal sel={sel} doc={doc} onClose={() => { setSel(null); setDoc(null) }} />}
    </div>
  )
}
