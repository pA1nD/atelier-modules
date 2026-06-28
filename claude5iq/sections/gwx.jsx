/* Chapter 04 — gwx · the whole Google Workspace, one safe multi-account command.
 * The suite it reaches → three features (accounts · requests · skills) → why a CLI + set it up. */

import { Reveal, ChapterIntro, Step, ActionConsole, Card, Icon, Modal, cn } from '../lib.jsx'

const { useState, useEffect } = React
// account dot colours — 8 that cycle, no red (red reads as "offline / error")
const GWX_COLORS = ['#16a34a', '#2563eb', '#9333ea', '#0891b2', '#0d9488', '#db2777', '#ea580c', '#ca8a04']

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
const KIND_COLOR = { api: '#3b82f6', workflow: '#8b5cf6', persona: '#ec4899', recipe: '#10b981' }
const deriveName = (id) => { const s = id.replace(/^(gws-workflow-|gws-|recipe-|persona-)/, '').replace(/-/g, ' '); return s.charAt(0).toUpperCase() + s.slice(1) }

// a compact markdown renderer for a skill's SKILL.md (frontmatter stripped)
function Markdown({ text }) {
  const body = text.replace(/^---\n[\s\S]*?\n---\n?/, '')
  const inline = (s) => {
    const parts = []; let last = 0, i = 0, m
    const re = /(\*\*([^*]+)\*\*|`([^`]+)`)/g
    while ((m = re.exec(s))) {
      if (m.index > last) parts.push(s.slice(last, m.index))
      if (m[2]) parts.push(<strong key={i++} className="font-semibold text-zinc-900 dark:text-zinc-100">{m[2]}</strong>)
      else parts.push(<code key={i++} className="cl-mono rounded bg-zinc-950/[0.06] px-1 py-0.5 text-[0.9em] dark:bg-white/10">{m[3]}</code>)
      last = m.index + m[0].length
    }
    if (last < s.length) parts.push(s.slice(last))
    return parts
  }
  const out = []; let list = null, code = null, k = 0
  const flush = () => { if (list) { out.push(<ul key={k++} className="my-2 space-y-1">{list}</ul>); list = null } }
  for (const line of body.split('\n')) {
    if (/^```/.test(line)) {
      if (code === null) { flush(); code = [] }
      else { out.push(<pre key={k++} className="cl-mono my-2.5 overflow-auto rounded-lg bg-zinc-950 p-3 text-[11.5px] leading-relaxed text-zinc-300">{code.join('\n')}</pre>); code = null }
      continue
    }
    if (code !== null) { code.push(line); continue }
    if (/^#{1,2}\s+/.test(line)) { flush(); out.push(<h4 key={k++} className="mt-4 text-[15px] font-bold text-zinc-950 first:mt-0 dark:text-zinc-50">{inline(line.replace(/^#{1,2}\s+/, ''))}</h4>) }
    else if (/^#{3,}\s+/.test(line)) { flush(); out.push(<h5 key={k++} className="mt-3 text-[13px] font-semibold text-zinc-700 dark:text-zinc-300">{inline(line.replace(/^#{3,}\s+/, ''))}</h5>) }
    else if (/^[-*]\s+/.test(line)) { (list = list || []).push(<li key={k++} className="flex gap-2 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300"><span className="mt-px text-zinc-400">•</span><span>{inline(line.replace(/^[-*]\s+/, ''))}</span></li>) }
    else if (line.trim() === '') flush()
    else { flush(); out.push(<p key={k++} className="my-2 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">{inline(line)}</p>) }
  }
  flush()
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

// the full catalogue of gwx skills — searchable, click one to read its SKILL.md
function SkillsPanel({ skills, count, self, close }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(null)
  const [content, setContent] = useState(null)
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && (sel ? setSel(null) : close())
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [sel])
  const open = (id) => { setSel(id); setContent(null); fetch(self.api + '/gwx/skill/' + id).then((r) => r.json()).then((d) => setContent(d.content || '(could not load this skill)')).catch(() => setContent('(could not load this skill)')) }
  const ql = q.trim().toLowerCase()
  const filtered = ql ? skills.filter((s) => (s.id + ' ' + (s.desc || '')).toLowerCase().includes(ql)) : skills
  return (
    <>
      <div className="flex shrink-0 items-center gap-3 border-b border-zinc-950/10 px-4 py-3 dark:border-white/10">
        {sel ? (
          <>
            <button onClick={() => setSel(null)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium text-zinc-500 transition hover:bg-zinc-950/[0.05] hover:text-zinc-800 dark:hover:bg-white/10 dark:hover:text-zinc-100"><Icon name="chevron-left" size={14} /> all skills</button>
            <span className="cl-mono truncate text-[13px] font-semibold text-zinc-950 dark:text-zinc-50">{sel}</span>
          </>
        ) : (
          <>
            <span className="shrink-0 text-[13px] font-semibold text-zinc-950 dark:text-zinc-50">{count} gwx skills</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search…" className="cl-mono ml-1 min-w-0 flex-1 rounded-lg border border-zinc-950/10 bg-zinc-950/[0.02] px-2.5 py-1.5 text-[12px] text-zinc-700 outline-none focus:border-zinc-950/25 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-200" />
          </>
        )}
        <button onClick={close} className="ml-auto shrink-0 rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-950/[0.06] hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"><Icon name="x" size={16} /></button>
      </div>
      <div className="flex-1 overflow-auto">
        {sel ? (
          <div className="px-5 py-4">{content == null ? <div className="text-[12px] text-zinc-400">loading…</div> : <Markdown text={content} />}</div>
        ) : (
          <div className="p-2.5">
            {filtered.length ? filtered.map((s) => (
              <button key={s.id} onClick={() => open(s.id)} className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-zinc-950/[0.04] dark:hover:bg-white/[0.05]">
                <span className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide" style={{ background: (KIND_COLOR[s.kind] || '#888') + '22', color: KIND_COLOR[s.kind] || '#888' }}>{KIND_LABEL[s.kind] || s.kind}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">{deriveName(s.id)}</div>
                  {s.desc && <div className="mt-0.5 text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">{s.desc}</div>}
                </div>
                <Icon name="chevron-right" size={15} className="mt-1 shrink-0 text-zinc-300 dark:text-zinc-600" />
              </button>
            )) : <div className="p-6 text-center text-[12px] text-zinc-400">no skills match “{q}”</div>}
          </div>
        )}
      </div>
    </>
  )
}

function SkillsModal({ skills, count, self, onClose }) {
  return <Modal onClose={onClose} size="max-w-2xl" closeOnEsc={false}>{(close) => <SkillsPanel skills={skills} count={count} self={self} close={close} />}</Modal>
}

export default function Gwx({ self, snap, actions, accent, icon, n }) {
  const accounts = snap?.gwx?.accounts?.length ? snap.gwx.accounts : ['work', 'personal']
  const real = !!snap?.gwx?.accounts?.length
  const installed = !!snap?.gwx?.installed
  const acolor = (i) => GWX_COLORS[i % 8]
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
          lead="gwx is one CLI over the entire Google Workspace — every app, across every account.">
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
                {accounts.map((a, i) => (
                  <div key={a} className={cn('flex items-center gap-2 rounded-lg bg-zinc-950/[0.03] px-2.5 py-1.5 text-[12.5px] dark:bg-white/[0.04]', !real && 'opacity-50')}>
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: acolor(i) }} />
                    <span className="cl-mono font-semibold text-zinc-800 dark:text-zinc-100">{a}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2.5 text-[11px] text-zinc-400 dark:text-zinc-500">{real ? `${accounts.length} signed in · gwx ${installed ? 'installed ✓' : 'not installed'}` : 'none yet — add one with gwx init'}</p>
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
