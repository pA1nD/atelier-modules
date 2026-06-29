/* Chapter 04 — gwx · the whole Google Workspace, one safe multi-account command.
 * The suite it reaches → three features (accounts · requests · skills) → why a CLI + set it up. */

import { Reveal, ChapterIntro, Step, ActionConsole, Card, Icon, Modal, VersionTag, ACCOUNT_COLORS, cn } from '../lib.jsx'

const { useState, useEffect } = React

// the Google Workspace apps gwx reaches (brand-coloured tiles)
const SUITE = [
  { name: 'Gmail', c: '#EA4335', i: 'M', ex: ['Triage what needs a reply', 'Search a past thread', 'Send or draft a reply'] },
  { name: 'Calendar', c: '#4285F4', i: '31', ex: ['See today’s agenda', 'Find a free slot', 'Add an event'] },
  { name: 'Drive', c: '#1DA462', i: '△', ex: ['Find a recent file', 'Download a file', 'Share a folder'] },
  { name: 'Docs', c: '#4285F4', i: '≡', ex: ['Read a document', 'Append a section', 'Make one from a template'] },
  { name: 'Sheets', c: '#0F9D58', i: '⊞', ex: ['Read a range of cells', 'Append a row', 'Export a tab as CSV'] },
  { name: 'Slides', c: '#F4B400', i: '▭', ex: ['List your decks', 'Build a slide deck', 'Share a presentation'] },
  { name: 'Chat', c: '#00AC47', i: '◌', ex: ['Catch up on a space', 'Send a message', 'Start a thread'] },
  { name: 'Meet', c: '#00897B', i: '▷', ex: ['Create a meeting link', 'List upcoming meets', 'Review who joined'] },
  { name: 'Tasks', c: '#2563EB', i: '✓', ex: ['List what’s due', 'Add a task', 'Check one off'] },
  { name: 'Contacts', c: '#4285F4', i: '◍', ex: ['Look someone up', 'List your contacts', 'Sync them to a sheet'] },
  { name: 'Keep', c: '#FBBC04', i: '✦', ex: ['List your notes', 'Add a note', 'Find a note'] },
  { name: 'Forms', c: '#7248B9', i: '≣', ex: ['Collect responses', 'See the results', 'Build a feedback form'] },
]
const REQUESTS = [
  'gwx all gmail +triage',
  'gwx work calendar +agenda --today',
  'gwx personal drive list',
  'gwx work sheets read "Q3!A1:D20"',
]
const FEATURED = ['Weekly inbox digest', 'Find a free meeting slot', 'Daily standup report', 'Exec-assistant persona', 'Save an email to a Doc']
const KIND_LABEL = { api: 'API', workflow: 'Workflow', persona: 'Persona', recipe: 'Recipe' }
const KIND_COLOR = { api: '#3b82f6', workflow: '#8b5cf6', persona: '#ec4899', recipe: '#06b6d4' }

// group skills by the Google service they touch (read from the skill id, e.g. gws-gmail-send → Mail),
// folding the rare admin / API / Model-Armor ones together; recipes/personas/workflows keep their own tab.
const SVC_ORDER = ['Mail', 'Calendar', 'Drive', 'Docs', 'Sheets', 'Slides', 'Chat', 'Meet', 'Tasks', 'Contacts', 'Keep', 'Forms', 'Classroom', 'Admin', 'Workflows', 'Recipes', 'Personas', 'Other']
const SVC_MAP = { Gmail: 'Mail', People: 'Contacts', Workflow: 'Workflows', Workspace: 'Admin', Api: 'Admin', Events: 'Admin', Modelarmor: 'Admin', Script: 'Admin', Apps: 'Admin', Shared: 'Admin' }
function serviceOf(s) {
  const id = s.id || ''
  if (/^recipe-/.test(id) || s.kind === 'recipe') return 'Recipes'
  if (/^persona-/.test(id) || s.kind === 'persona') return 'Personas'
  const m = id.match(/^gws-([a-z]+)/)   // gws-gmail-send → gmail · gws-docs → docs
  if (m) { const svc = m[1][0].toUpperCase() + m[1].slice(1); return SVC_MAP[svc] || svc }
  if (s.kind === 'workflow') return 'Workflows'
  return 'Other'
}
const deriveName = (id) => { const s = id.replace(/^(gws-workflow-|gws-|recipe-|persona-)/, '').replace(/-/g, ' '); return s.charAt(0).toUpperCase() + s.slice(1) }

// a compact markdown renderer for a skill's SKILL.md (frontmatter stripped)
// a small but real markdown renderer: headings, code fences (w/ language), block-
// quotes, ordered + unordered lists, tables, rules, and inline code/bold/italic/links.
function Markdown({ text }) {
  const body = (text || '').replace(/^---\n[\s\S]*?\n---\n?/, '').trim()
  let key = 0
  const inline = (s) => {
    const out = []; let last = 0, m
    const re = /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*\n]+)\*/g
    while ((m = re.exec(s))) {
      if (m.index > last) out.push(s.slice(last, m.index))
      if (m[1] != null) out.push(<code key={key++} className="cl-mono rounded bg-zinc-950/[0.06] px-1 py-0.5 text-[0.86em] text-amber-700 dark:bg-white/10 dark:text-amber-300">{m[1]}</code>)
      else if (m[2] != null) out.push(<a key={key++} href={m[3]} target="_blank" rel="noreferrer" className="font-medium text-blue-600 underline decoration-blue-600/30 underline-offset-2 transition hover:decoration-blue-600 dark:text-blue-400">{m[2]}</a>)
      else if (m[4] != null) out.push(<strong key={key++} className="font-semibold text-zinc-900 dark:text-zinc-100">{m[4]}</strong>)
      else if (m[5] != null) out.push(<em key={key++} className="italic">{m[5]}</em>)
      last = m.index + m[0].length
    }
    if (last < s.length) out.push(s.slice(last))
    return out
  }
  const cells = (s) => s.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim())
  const lines = body.split('\n'); const out = []; let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim(); const buf = []; i++
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++ }
      i++
      out.push(
        <div key={key++} className="my-3 overflow-hidden rounded-lg border border-zinc-950/10 dark:border-white/10">
          {lang && <div className="cl-mono border-b border-zinc-950/10 bg-zinc-950/[0.03] px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:border-white/10 dark:bg-white/[0.03]">{lang}</div>}
          <pre className="cl-mono overflow-auto bg-zinc-950 p-3 text-[11.5px] leading-relaxed text-zinc-200">{buf.join('\n')}</pre>
        </div>
      )
      continue
    }
    if (/^>\s?/.test(line)) {
      const buf = []
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++ }
      out.push(<blockquote key={key++} className="my-3 rounded-r-md border-l-[3px] border-amber-400/60 bg-amber-400/[0.06] py-2 pl-3.5 pr-3 text-[12.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">{buf.map((b, j) => <div key={j} className={j ? 'mt-1' : ''}>{inline(b)}</div>)}</blockquote>)
      continue
    }
    if (line.includes('|') && i + 1 < lines.length && /^[\s|:-]+$/.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const head = cells(line); i += 2; const rows = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) { rows.push(cells(lines[i])); i++ }
      out.push(
        <div key={key++} className="my-3 overflow-auto rounded-lg border border-zinc-950/10 dark:border-white/10">
          <table className="w-full border-collapse text-[12px]">
            <thead><tr>{head.map((c, j) => <th key={j} className="border-b border-zinc-950/10 bg-zinc-950/[0.03] px-3 py-1.5 text-left font-semibold text-zinc-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200">{inline(c)}</th>)}</tr></thead>
            <tbody>{rows.map((r, j) => <tr key={j}>{r.map((c, l) => <td key={l} className="border-b border-zinc-950/[0.05] px-3 py-1.5 align-top text-zinc-600 last:border-0 dark:border-white/[0.05] dark:text-zinc-300">{inline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )
      continue
    }
    const h = line.match(/^(#{1,6})\s+(.*)/)
    if (h) {
      const lv = h[1].length, cls = lv <= 1 ? 'mt-5 text-[16.5px] font-bold' : lv === 2 ? 'mt-5 text-[14.5px] font-bold' : 'mt-4 text-[13px] font-semibold'
      out.push(<div key={key++} className={cn('text-zinc-950 first:mt-0 dark:text-zinc-50', cls)}>{inline(h[2])}</div>); i++; continue
    }
    if (/^(\s*[-*_]\s*){3,}$/.test(line)) { out.push(<hr key={key++} className="my-4 border-zinc-950/10 dark:border-white/10" />); i++; continue }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]/.test(line); const items = []
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, '')); i++ }
      out.push(<ul key={key++} className="my-2 space-y-1">{items.map((it, j) => <li key={j} className="flex gap-2 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300"><span className={cn('mt-px shrink-0 tabular-nums', ordered ? 'text-zinc-400 dark:text-zinc-500' : 'text-amber-500')}>{ordered ? `${j + 1}.` : '•'}</span><span className="min-w-0">{inline(it)}</span></li>)}</ul>)
      continue
    }
    if (line.trim() === '') { i++; continue }
    const buf = [line]; i++
    while (i < lines.length && lines[i].trim() && !/^(```|>|#{1,6}\s|\s*([-*+]|\d+[.)])\s|\|)/.test(lines[i]) && !/^(\s*[-*_]\s*){3,}$/.test(lines[i])) { buf.push(lines[i]); i++ }
    out.push(<p key={key++} className="my-2 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">{inline(buf.join(' '))}</p>)
  }
  return <div>{out}</div>
}

// a single terminal command line
function CmdLine({ cmd }) {
  return <div className="cl-mono rounded-lg bg-zinc-950 px-3.5 py-2.5 text-[12.5px] text-zinc-200"><span className="text-zinc-500">$ </span>{cmd}</div>
}

function FeatureCard({ n, title, lead, accent, children }) {
  return (
    <Card className="flex flex-col p-5">
      <div className="mb-2 flex items-center gap-2.5">
        <span className="grid size-6 shrink-0 place-items-center rounded-md text-[12px] font-bold" style={{ background: accent + '1f', color: accent }}>{n}</span>
        <span className="text-[15px] font-semibold text-zinc-950 dark:text-zinc-50">{title}</span>
      </div>
      <p className="mb-4 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">{lead}</p>
      <div className="mt-auto">{children}</div>
    </Card>
  )
}

// the full catalogue of gwx skills — a searchable, filterable sidebar + a detail pane
function SkillsPanel({ skills, count, self, close }) {
  const [q, setQ] = useState('')
  const [svc, setSvc] = useState('all')
  const [sel, setSel] = useState(null)
  const [content, setContent] = useState(null)
  const open = (id) => { setSel(id); setContent(null); fetch(self.api + '/gwx/skill/' + id).then((r) => r.json()).then((d) => setContent(d.content || '(could not load this skill)')).catch(() => setContent('(could not load this skill)')) }
  const ql = q.trim().toLowerCase()
  const filtered = skills.filter((s) => (svc === 'all' || serviceOf(s) === svc) && (!ql || (s.id + ' ' + deriveName(s.id) + ' ' + (s.desc || '')).toLowerCase().includes(ql)))
  const svcCount = {}; for (const s of skills) { const v = serviceOf(s); svcCount[v] = (svcCount[v] || 0) + 1 }
  const present = SVC_ORDER.filter((v) => svcCount[v]).concat(Object.keys(svcCount).filter((v) => !SVC_ORDER.includes(v)))
  const TABS = [['all', 'All'], ...present.map((v) => [v, v])]
  const sc = (k) => (k === 'all' ? skills.length : (svcCount[k] || 0))
  const cur = sel && skills.find((s) => s.id === sel)
  return (
    <>
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-950/10 px-5 py-3.5 dark:border-white/10">
        <Icon name="sparkles" size={16} className="text-amber-500" />
        <span className="text-[14px] font-semibold text-zinc-950 dark:text-zinc-50">gwx skills</span>
        <span className="rounded-full bg-zinc-950/[0.06] px-2 py-0.5 text-[11px] font-semibold text-zinc-500 dark:bg-white/10 dark:text-zinc-400">{count}</span>
        <button onClick={close} className="ml-auto shrink-0 rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-950/[0.06] hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"><Icon name="x" size={17} /></button>
      </div>
      <div className="flex h-[70vh] min-h-0">
        {/* sidebar — search + category filter + the list */}
        <div className="flex w-[300px] shrink-0 flex-col border-r border-zinc-950/10 dark:border-white/10">
          <div className="space-y-2.5 border-b border-zinc-950/10 p-3 dark:border-white/10">
            <div className="flex items-center gap-2 rounded-lg border border-zinc-950/10 bg-zinc-950/[0.02] px-2.5 py-1.5 focus-within:border-zinc-950/30 dark:border-white/10 dark:bg-white/[0.04] dark:focus-within:border-white/30">
              <Icon name="search" size={14} className="shrink-0 text-zinc-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search skills…" autoFocus className="min-w-0 flex-1 bg-transparent text-[12.5px] text-zinc-700 outline-none placeholder:text-zinc-400 dark:text-zinc-200" />
              {q && <button onClick={() => setQ('')} className="shrink-0 text-zinc-400 transition hover:text-zinc-700 dark:hover:text-zinc-200"><Icon name="x" size={13} /></button>}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {TABS.map(([k, label]) => (
                <button key={k} onClick={() => setSvc(k)} className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold transition', svc === k ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'bg-zinc-950/[0.04] text-zinc-500 hover:bg-zinc-950/[0.08] dark:bg-white/[0.06] dark:text-zinc-400 dark:hover:bg-white/[0.12]')}>{label} <span className="opacity-50">{sc(k)}</span></button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-auto p-1.5">
            {filtered.length ? filtered.map((s) => (
              <button key={s.id} onClick={() => open(s.id)} className={cn('mb-0.5 flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition', sel === s.id ? 'bg-amber-500/[0.12] ring-1 ring-inset ring-amber-500/30' : 'hover:bg-zinc-950/[0.04] dark:hover:bg-white/[0.05]')}>
                <span className="mt-[3px] size-2 shrink-0 rounded-full" style={{ background: KIND_COLOR[s.kind] || '#888' }} title={KIND_LABEL[s.kind] || s.kind} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-semibold text-zinc-800 dark:text-zinc-100">{deriveName(s.id)}</div>
                  {s.desc && <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">{s.desc}</div>}
                </div>
              </button>
            )) : <div className="px-4 py-8 text-center text-[12px] text-zinc-400">No skills match “{q}”.</div>}
          </div>
        </div>
        {/* detail */}
        <div className="min-w-0 flex-1 overflow-auto bg-zinc-50/70 dark:bg-zinc-950/40">
          {cur ? (
            <div key={sel} className="cl-fadein">
              <div className="sticky top-0 z-10 border-b border-zinc-950/10 bg-white/90 px-6 py-4 backdrop-blur dark:border-white/10 dark:bg-zinc-900/90">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide" style={{ background: (KIND_COLOR[cur.kind] || '#888') + '22', color: KIND_COLOR[cur.kind] || '#888' }}>{KIND_LABEL[cur.kind] || cur.kind}</span>
                  <span className="cl-mono text-[11.5px] text-zinc-400 dark:text-zinc-500">{sel}</span>
                </div>
                <div className="mt-1.5 text-[18px] font-semibold leading-tight text-zinc-950 dark:text-zinc-50">{deriveName(sel)}</div>
                {cur.desc && <div className="mt-1 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">{cur.desc}</div>}
              </div>
              <div className="px-6 py-5">
                {content == null
                  ? <div className="animate-pulse space-y-2.5">{['92%', '70%', '84%', '55%', '78%', '66%', '88%', '60%'].map((w, i) => <div key={i} className="h-3 rounded bg-zinc-950/[0.06] dark:bg-white/[0.06]" style={{ width: w }} />)}</div>
                  : <Markdown text={content} />}
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
              <div className="grid size-14 place-items-center rounded-2xl bg-zinc-950/[0.04] dark:bg-white/[0.05]"><Icon name="book-open" size={24} className="text-zinc-400" /></div>
              <div className="text-[14px] font-semibold text-zinc-600 dark:text-zinc-300">Pick a skill to read it</div>
              <div className="max-w-xs text-[12.5px] leading-relaxed text-zinc-400 dark:text-zinc-500">{count} ready-made skills your agent loads on demand — per-service helpers, multi-step recipes, and ready-made personas.</div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function SkillsModal({ skills, count, self, onClose }) {
  return <Modal onClose={onClose} size="max-w-6xl">{(close) => <SkillsPanel skills={skills} count={count} self={self} close={close} />}</Modal>
}

export default function Gwx({ self, snap, actions, accent, icon, n }) {
  const accounts = snap?.gwx?.accounts?.length ? snap.gwx.accounts : ['work', 'personal']
  const authed = new Set(snap?.gwx?.authed || [])
  const real = !!snap?.gwx?.accounts?.length
  const installed = !!snap?.gwx?.installed
  const acolor = (i) => ACCOUNT_COLORS[i % 8]
  const { byId, run } = actions
  const whoami = byId['gwx-whoami'] || {}
  const inst = byId['install-gwx'] || {}
  const [data, setData] = useState(null)
  const [modal, setModal] = useState(false)
  useEffect(() => { fetch(self.api + '/gwx/skills').then((r) => r.json()).then(setData).catch(() => {}) }, [])

  return (
    <div>
      <Reveal>
        <ChapterIntro n={n} icon={icon} color={accent} kicker="gwx"
          idea="All your Google accounts, one command — and it can never send from the wrong one."
          why="If an agent helps with email across your accounts, the scary part is a slip: replying from your personal address on a work thread. gwx makes that impossible. Every command names its account — so reading across all of them is one line, but sending always points at exactly one." />
      </Reveal>

      {/* the suite it reaches */}
      <Reveal>
        <Step label="What it reaches" color={accent} title="Your whole Google Workspace"
          lead="gwx is a thin multi-account wrapper around gws — Google’s official Workspace CLI — so one line reaches every app, across every account.">
          <div className="mb-5 flex flex-wrap items-center gap-2.5">
            <span className="text-[12.5px] font-medium text-zinc-600 dark:text-zinc-300">The engine underneath — gws, open-source:</span>
            <a href="https://github.com/googleworkspace/cli" target="_blank" rel="noreferrer" className="inline-flex items-stretch overflow-hidden rounded-md border border-zinc-950/15 text-[12px] font-semibold shadow-sm transition hover:-translate-y-px hover:border-zinc-950/30 dark:border-white/15 dark:hover:border-white/30">
              <span className="inline-flex items-center gap-1.5 bg-zinc-950/[0.04] px-2.5 py-1.5 text-zinc-700 dark:bg-white/[0.06] dark:text-zinc-200"><Icon name="star" size={13} /> Star</span>
              <span className="inline-flex items-center border-l border-zinc-950/15 bg-zinc-950/[0.02] px-2.5 py-1.5 tabular-nums text-zinc-900 dark:border-white/15 dark:bg-white/[0.02] dark:text-zinc-100">29.1k</span>
            </a>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SUITE.map((a) => (
              <div key={a.name} className="flex items-start gap-3 rounded-xl border border-zinc-950/[0.06] bg-white p-3.5 dark:border-white/[0.06] dark:bg-white/[0.03]">
                <span className="grid size-9 shrink-0 place-items-center rounded-[10px] text-[13px] font-bold text-white" style={{ background: a.c }}>{a.i}</span>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">{a.name}</div>
                  <ul className="mt-1 space-y-0.5">
                    {a.ex.map((e) => <li key={e} className="flex gap-1.5 text-[11.5px] leading-relaxed text-zinc-500 dark:text-zinc-400"><span className="text-zinc-300 dark:text-zinc-600">·</span>{e}</li>)}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </Step>
      </Reveal>

      {/* three features — extra breathing room above */}
      <Reveal className="@container">
        <Step label="What makes it powerful" color={accent} title="Three things at once" className="!mt-20"
          lead="Every account it knows, every kind of request it can make, and a deep library of ready-made skills.">
          <div className="mt-2 grid gap-4 @3xl:grid-cols-3">
            <FeatureCard n={1} title="Every account" accent={accent}
              lead="gwx knows each Google identity by name — work, personal, a client’s. One command reaches across all of them at once.">
              <div className="space-y-1.5">
                {accounts.map((a, i) => {
                  const ok = real && authed.has(a)
                  return (
                    <div key={a} className={cn('flex items-center gap-2 rounded-lg bg-zinc-950/[0.03] px-2.5 py-1.5 text-[12.5px] dark:bg-white/[0.04]', !real && 'opacity-50')}>
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: acolor(i) }} />
                      <span className="cl-mono font-semibold text-zinc-800 dark:text-zinc-100">{a}</span>
                      <span className={cn('ml-auto text-[10.5px] font-medium', ok ? 'text-zinc-500 dark:text-zinc-400' : 'text-zinc-400/70 dark:text-zinc-600')}>{ok ? '✓ signed in' : 'not signed in'}</span>
                    </div>
                  )
                })}
              </div>
              <p className="mt-2.5 text-[11px] text-zinc-400 dark:text-zinc-500">{real ? `${authed.size} of ${accounts.length} signed in · gwx ${installed ? 'installed ✓' : 'not installed'}` : 'none yet — add one with gwx init'}</p>
            </FeatureCard>

            <FeatureCard n={2} title="Every kind of request" accent={accent}
              lead="Not just mail — Calendar, Drive, Sheets, Docs, Chat, Tasks, People. Reads fan out across accounts in parallel; a write always names exactly one.">
              <div className="space-y-1">
                {REQUESTS.map((r) => (
                  <div key={r} className="cl-mono truncate rounded-md bg-zinc-950 px-2.5 py-1.5 text-[11px] text-zinc-300"><span className="text-zinc-500">$ </span>{r}</div>
                ))}
              </div>
            </FeatureCard>

            <FeatureCard n={3} title={data ? `${data.count} ready-made skills` : 'Ready-made skills'} accent={accent}
              lead="A whole library your agent loads on demand — per-service helpers, multi-step recipes, and ready-made personas.">
              <div className="space-y-1.5">
                {FEATURED.map((f) => (
                  <div key={f} className="flex items-center gap-2 text-[12.5px] text-zinc-700 dark:text-zinc-200"><span style={{ color: accent }}>▸</span>{f}</div>
                ))}
              </div>
              <button onClick={() => setModal(true)} className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-sm transition hover:brightness-110" style={{ background: accent }}>
                <Icon name="layout-grid" size={13} /> Explore all {data?.count || ''} skills
              </button>
            </FeatureCard>
          </div>
        </Step>
      </Reveal>

      {/* why a CLI beats an MCP — explanation + getting-started commands (left), install box (right) */}
      <Reveal className="@container">
        <Step label="Why a CLI" color={accent} title="A skill + a CLI beats an MCP" className="!mt-16">
          <div className="grid items-start gap-x-12 gap-y-8 @4xl:grid-cols-[1.08fr_0.92fr]">
            <div>
              <div className="space-y-3.5 text-[14px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                <p>Most integrations are an <span className="font-semibold text-zinc-950 dark:text-zinc-50">MCP server</span> — a fixed menu of tools a developer wired up in advance. gwx takes the other path: it’s just a command-line tool, plus a <span className="font-semibold text-zinc-950 dark:text-zinc-50">skill</span> — a short note that teaches the agent how to drive it.</p>
                <p>That’s quietly more powerful. The agent gets the <em className="text-zinc-800 dark:text-zinc-100">whole</em> command surface — every Gmail, Calendar, and Drive verb — not a hand-picked few. It can chain and filter commands the way you would in a terminal. And the moment Google ships a new API, gwx’s own <code className="cl-mono text-[12.5px] text-zinc-700 dark:text-zinc-200">--help</code> shows it — nothing to rebuild.</p>
              </div>
              <p className="mb-3 mt-5 text-[13px] font-semibold text-zinc-700 dark:text-zinc-200">Getting started is three commands.</p>
              <div className="space-y-3.5">
                <div>
                  <p className="mb-1.5 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">First, connect an account. gwx opens a one-time Google sign-in and saves it under a short name you pick (here, <code className="cl-mono text-[12px]">work</code>):</p>
                  <CmdLine cmd="gwx init work" />
                </div>
                <div>
                  <p className="mb-1.5 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">Added it on another machine already, or its access expired? Just sign it back in:</p>
                  <CmdLine cmd="gwx login work" />
                </div>
                <div>
                  <p className="mb-1.5 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">Finally, confirm everything’s connected — this lists each account with a ✓ or ✗:</p>
                  <CmdLine cmd="gwx whoami" />
                </div>
              </div>
            </div>

            {/* on your machine */}
            <Card className="p-5">
              <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">On your machine</div>
              <div className="flex items-start gap-2.5">
                <span className={cn('mt-1.5 inline-block size-2.5 shrink-0 rounded-full', installed ? 'bg-emerald-500' : 'bg-amber-400')} />
                <div>
                  <div className="text-[14px] font-semibold text-zinc-950 dark:text-zinc-50"><code className="cl-mono">gwx</code> — {installed ? 'installed' : 'not installed'}</div>
                  <div className="mt-0.5 text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">{installed ? `${accounts.length} account${accounts.length === 1 ? '' : 's'} signed in.` : 'install it to connect your Google accounts — it pulls the official installer from GitHub.'}</div>
                  {installed && (
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center gap-2 text-[11px] text-zinc-400 dark:text-zinc-500"><span className="w-8 shrink-0 font-medium">gwx</span><VersionTag v={snap?.versions?.gwx} run={run} /></div>
                      {snap?.versions?.gws?.installed && <div className="flex items-center gap-2 text-[11px] text-zinc-400 dark:text-zinc-500"><span className="w-8 shrink-0 font-medium">gws</span><VersionTag v={snap?.versions?.gws} run={run} /></div>}
                    </div>
                  )}
                </div>
              </div>
              {installed ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button onClick={() => run('gwx-whoami')} className="inline-flex items-center gap-1.5 rounded-full border border-zinc-950/15 px-4 py-2 text-[13px] font-semibold text-zinc-700 transition hover:bg-zinc-950/[0.04] dark:border-white/15 dark:text-zinc-200 dark:hover:bg-white/[0.06]"><Icon name="check" size={14} /> Check sign-in</button>
                  <button onClick={() => run('install-gwx', { confirm: true })} className="inline-flex items-center gap-1.5 rounded-full border border-zinc-950/15 px-4 py-2 text-[13px] font-semibold text-zinc-700 transition hover:bg-zinc-950/[0.04] dark:border-white/15 dark:text-zinc-200 dark:hover:bg-white/[0.06]"><Icon name="rotate-cw" size={13} /> Update</button>
                </div>
              ) : (
                <div className="mt-5 flex justify-center">
                  <button onClick={() => run('install-gwx', { confirm: true })} className="cl-beacon inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-md transition hover:brightness-110" style={{ background: accent, '--bc': accent + '5c' }}><Icon name="sparkles" size={15} /> Install gwx</button>
                </div>
              )}
              <ActionConsole entry={inst} title="installing gwx" />
              <ActionConsole entry={whoami} title="checking sign-in" />
            </Card>
          </div>
        </Step>
      </Reveal>

      {modal && <SkillsModal skills={data?.skills || []} count={data?.count || 0} self={self} onClose={() => setModal(false)} />}
    </div>
  )
}
