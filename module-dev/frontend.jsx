// Module Development — the three-folder layout for serious agent development, as a page:
// the story (instance / modules / chromes, one job each), a live checklist that
// reads YOUR instance (folders, installPath wiring, the three CLAUDE.md
// playbooks — honest states: ours / yours / none), and a migration scan with a
// copyable agent brief. Works right after a fresh install AND as the guided way
// to migrate an instance that's been running for a while.

import { Button, Input, Heading, Text } from '@atelier/kit'
import { ICONS } from './icons.js'

export const meta = { name: 'Module Development', icon: 'folder-tree', chrome: 'catalyst-chrome' }

const { useState, useEffect, useCallback, useRef } = React
const cn = (...p) => p.filter(Boolean).join(' ')
const self = window.__atelier.self(import.meta.url)

function Icon({ name, size = 16, strokeWidth = 1.75, className = '', style }) {
  const nodes = ICONS[name] || ICONS.square
  return (
    <span aria-hidden="true" className={cn('inline-flex shrink-0 items-center justify-center', className)} style={{ width: size, height: size, ...style }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        {nodes.map(([tag, attrs], i) => React.createElement(tag, { key: i, ...attrs }))}
      </svg>
    </span>
  )
}

// Presence + freshness in ONE bounded loop: while the tab is VISIBLE, re-GET
// the snapshot every 45s. That stamps the backend watcher awake (it idles
// within 90s of the last GET) and heals any frame the WS lost across a
// reconnect — so a visible tab is never older than ~45s even with total
// socket loss. Flood-safe by construction: fixed cadence (failures never
// speed it up), single-flight, 10s abort, hidden tabs send nothing, and the
// visibility handler is throttled. WS reconnection itself is the shell's job.
function useSnapshot() {
  const [snap, setSnap] = useState(null)
  useEffect(() => {
    let alive = true, busy = false, last = 0
    const load = async () => {
      if (busy) return
      busy = true; last = Date.now()
      try {
        const r = await fetch(self.api + '/snapshot', { signal: AbortSignal.timeout(10000) })
        if (alive && r.ok) setSnap(await r.json())
      } catch {} finally { busy = false }
    }
    load()
    const unsub = self.subscribe((f) => { if (f.type === 'snapshot' && f.snapshot) setSnap(f.snapshot) })
    const t = setInterval(() => { if (!document.hidden) load() }, 45000)
    const onVis = () => { if (!document.hidden && Date.now() - last > 5000) load() }
    document.addEventListener('visibilitychange', onVis)
    return () => { alive = false; unsub(); clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
  }, [])
  return snap
}

/* CLAUDE.md state → an honest chip */
function MdChip({ state }) {
  if (state === 'ours') return <span title="Our playbook, and it matches what the module would write today — paths and template are current." className="inline-flex cursor-help items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400"><Icon name="check" size={10} /> playbook installed</span>
  if (state === 'ours-stale') return <span title="Our playbook is installed, but the instance's paths/port or the shipped template changed since. Update replaces only our block (backed up) — anything of yours above it stays." className="inline-flex cursor-help items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400"><Icon name="triangle-alert" size={10} /> playbook outdated</span>
  if (state === 'present') return <span title="A CLAUDE.md exists that this module didn’t write — it differs from the shipped playbook (compare via “view”). Append backs your file up, then adds the playbook below your rules." className="inline-flex cursor-help items-center gap-1 rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400"><Icon name="check" size={10} /> yours · differs from the playbook</span>
  return <span className="inline-flex items-center gap-1 rounded-md bg-zinc-500/15 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:text-zinc-400">no CLAUDE.md</span>
}

function StepDot({ done }) {
  return done
    ? <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"><Icon name="check" size={14} /></span>
    : <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-zinc-500/10 text-zinc-400"><Icon name="arrow-right" size={13} /></span>
}

/* a tiny markdown renderer (copied from the claude-md module — no cross-module
 * imports) for the playbook previews: headings, lists, **bold**, `code`, fences.
 * Marker comments (<!-- ... -->) are skipped. */
function Markdown({ text }) {
  const inline = (s) => {
    const parts = []; let last = 0, i = 0, m
    const re = /(\*\*([^*]+)\*\*|`([^`]+)`)/g
    while ((m = re.exec(s))) {
      if (m.index > last) parts.push(s.slice(last, m.index))
      if (m[2]) parts.push(<strong key={i++} className="font-semibold text-zinc-950 dark:text-zinc-50">{m[2]}</strong>)
      else parts.push(<code key={i++} className="rounded bg-zinc-950/[0.06] px-1 py-0.5 font-mono text-[0.9em] dark:bg-white/10">{m[3]}</code>)
      last = m.index + m[0].length
    }
    if (last < s.length) parts.push(s.slice(last))
    return parts
  }
  const out = []; let list = null, code = null, k = 0
  const flush = () => { if (list) { out.push(<ul key={k++} className="my-2 space-y-1">{list}</ul>); list = null } }
  for (const line of (text || '').split('\n')) {
    if (/^<!--/.test(line.trim())) continue
    if (/^```/.test(line)) {
      if (code === null) { flush(); code = [] }
      else { out.push(<pre key={k++} className="my-3 overflow-auto rounded-lg bg-zinc-950 p-3 font-mono text-[12px] leading-relaxed text-zinc-300">{code.join('\n')}</pre>); code = null }
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

/* side-by-side diff — left: your file · right: the playbook. Reworded lines
 * align as one row with word-level highlights; whitespace-only differences
 * were already treated as unchanged by the backend; long unchanged runs
 * collapse to a count. */
function Seg({ segs, text, tone }) {
  if (!segs) return <>{text}</>
  return <>{segs.map(([t, changed], i) => changed
    ? <span key={i} className={tone === 'del' ? 'rounded-sm bg-red-500/25 text-red-200' : 'rounded-sm bg-emerald-500/25 text-emerald-200'}>{t}</span>
    : <span key={i}>{t}</span>)}</>
}

function DiffView({ rows }) {
  const out = []
  let i = 0
  while (i < rows.length) {
    if (rows[i].k !== 'same') { out.push(rows[i]); i++; continue }
    let j = i
    while (j < rows.length && rows[j].k === 'same') j++
    const run = j - i
    if (run > 7) {
      for (let x = i; x < i + 3; x++) out.push(rows[x])
      out.push({ k: 'gap', n: run - 6 })
      for (let x = j - 3; x < j; x++) out.push(rows[x])
    } else for (let x = i; x < j; x++) out.push(rows[x])
    i = j
  }
  const cell = 'whitespace-pre-wrap break-words px-2 py-px'
  return (
    <div className="rounded-xl bg-zinc-950 p-3 font-mono text-[11.5px] leading-relaxed">
      <div className="mb-2 grid grid-cols-2 gap-x-3 px-2 text-[10.5px] font-semibold uppercase tracking-wide text-zinc-500">
        <span>your file</span><span>the playbook</span>
      </div>
      {out.map((r, idx) => r.k === 'gap' ? (
        <div key={idx} className="py-1 text-center text-[10.5px] text-zinc-600">· {r.n} unchanged lines ·</div>
      ) : (
        <div key={idx} className="grid grid-cols-2 gap-x-3">
          <div className={cn(cell,
            r.k === 'same' ? 'text-zinc-500' :
            r.k === 'mod' ? 'bg-red-500/[0.07] text-zinc-300' :
            r.k === 'del' ? 'bg-red-500/[0.14] text-red-200' : 'text-zinc-800')}>
            {r.l != null ? <Seg segs={r.lseg} text={r.l} tone="del" /> : ''}
          </div>
          <div className={cn(cell,
            r.k === 'same' ? 'text-zinc-500' :
            r.k === 'mod' ? 'bg-emerald-500/[0.07] text-zinc-300' :
            r.k === 'add' ? 'bg-emerald-500/[0.14] text-emerald-200' : 'text-zinc-800')}>
            {r.r != null ? <Seg segs={r.rseg} text={r.r} tone="add" /> : ''}
          </div>
        </div>
      ))}
    </div>
  )
}

function Modal({ onClose, wide, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    // lock the page behind the modal — only the modal body scrolls. The chrome
    // scrolls the ROOT element, not body, so both need the lock.
    const prevHtml = document.documentElement.style.overflow
    const prevBody = document.body.style.overflow
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.documentElement.style.overflow = prevHtml
      document.body.style.overflow = prevBody
    }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-zinc-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className={cn('relative flex h-[88vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-zinc-900', wide ? 'max-w-7xl' : 'max-w-4xl')}>
        <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 z-10 cursor-pointer rounded-lg bg-white/80 p-1.5 text-zinc-400 shadow-sm ring-1 ring-zinc-950/10 backdrop-blur transition hover:text-zinc-700 dark:bg-zinc-900/80 dark:ring-white/10 dark:hover:text-zinc-200"><Icon name="x" size={16} /></button>
        <div className="flex-1 overflow-auto px-6 py-6">{children}</div>
      </div>
    </div>
  )
}

function CopyBtn({ getText, label = 'Copy', copiedLabel = 'Copied' }) {
  const [ok, setOk] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(typeof getText === 'function' ? await getText() : getText); setOk(true); setTimeout(() => setOk(false), 1600) } catch {}
  }
  return (
    <button onClick={copy} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-950/15 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-950/5 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/10">
      <Icon name={ok ? 'check' : 'copy'} size={14} className={ok ? 'text-emerald-500' : ''} /> {ok ? copiedLabel : label}
    </button>
  )
}

/* One folder of the layout — identity, live path + status, its CLAUDE.md */
function FolderCard({ icon, accent, title, role, p, mdState, children }) {
  return (
    <div className="rounded-2xl border border-zinc-950/10 bg-white p-4 shadow-sm shadow-zinc-950/[0.03] dark:border-white/10 dark:bg-white/[0.02] dark:shadow-none">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 ring-inset ring-black/[0.04]" style={{ background: accent + '22', color: accent }}><Icon name={icon} size={19} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-zinc-950 dark:text-white">{title}</span>
            {p && (p.exists === undefined || p.exists
              ? (mdState ? <MdChip state={mdState} /> : null)
              : <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">folder missing</span>)}
          </div>
          <p className="mt-0.5 text-xs leading-[1.5] text-zinc-500 dark:text-zinc-400">{role}</p>
          {p && <div className="mt-1.5 truncate font-mono text-[11px] text-zinc-400 dark:text-zinc-500" title={p.path}>{p.path}</div>}
        </div>
      </div>
      {children}
    </div>
  )
}

export default function Module() {
  const snap = useSnapshot()
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(null)     // action id in flight
  const [modPath, setModPath] = useState(null)   // null = follow the snapshot
  const [chrPath, setChrPath] = useState(null)
  const [preview, setPreview] = useState(null)   // { name, content }
  const [customOpen, setCustomOpen] = useState(false)   // the 'define custom folders' disclosure
  const seeded = useRef(false)

  // Seed the editable paths once from the live snapshot; afterwards they're the user's.
  useEffect(() => {
    if (snap && !seeded.current) { seeded.current = true; setModPath(snap.paths.modules.path); setChrPath(snap.paths.chromes.path) }
  }, [snap])

  const act = useCallback(async (id, route, body) => {
    setBusy(id); setErr(null)
    try {
      const r = await (await fetch(self.api + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })).json()
      if (r.error) setErr(r.error)
      else if (id === 'installpath') { seeded.current = false; setModPath(null); setChrPath(null) }   // re-sync inputs to the new wiring
      return r
    } catch (e) { setErr(String(e)); return null } finally { setBusy(null) }
  }, [])

  const showTemplate = async (name) => {
    try { setPreview({ ...(await (await fetch(self.api + '/template/' + name)).json()), mode: 'md' }) } catch {}
  }
  const showDiff = async (name) => {
    try { setPreview({ ...(await (await fetch(self.api + '/claudemd-diff/' + name)).json()), name, mode: 'diff' }) } catch {}
  }

  if (!snap) return <div className="flex items-center justify-center gap-2 py-24 text-sm text-zinc-500"><Icon name="loader-circle" size={16} className="animate-spin" /> Reading your instance…</div>

  const { paths, migration, done } = snap
  const pathsBody = { modules: modPath ?? paths.modules.path, chromes: chrPath ?? paths.chromes.path }
  // manual override: the inputs may point somewhere other than what's wired —
  // then the folder/installPath steps re-activate to apply the new paths
  const dirty = pathsBody.modules !== paths.modules.path || pathsBody.chromes !== paths.chromes.path
  const resetPaths = () => { setModPath(paths.modules.path); setChrPath(paths.chromes.path) }
  const migrating = migration.toModules.length + migration.toChromes.length > 0
  const allDone = done.folders && done.installPath && done.mdInstance && done.mdChromes && done.migration

  const steps = [
    {
      id: 'folders', done: done.folders, title: 'Create the modules & chromes folders',
      desc: 'Two folders OUTSIDE the instance — the workshop and the theme shelf. Existing folders are left as they are.',
      action: (!done.folders || dirty) && <Button onClick={() => act('folders', '/action/folders', pathsBody)} disabled={busy === 'folders'}>Create folders</Button>,
    },
    {
      id: 'installpath', done: done.installPath, title: 'Wire installPath in atelier.config.json',
      desc: 'Points the installer at the layout: `atelier add` drops new modules into the modules folder and chromes into the chromes folder, automatically.',
      action: (!done.installPath || dirty) && <Button onClick={() => act('installpath', '/action/installpath', pathsBody)} disabled={busy === 'installpath'}>{done.installPath ? 'Update installPath' : 'Wire installPath'}</Button>,
    },
    {
      id: 'md-instance', done: done.mdInstance, tpl: 'instance', title: 'CLAUDE.md — instance folder', state: paths.instance.claudemd,
      desc: 'The layout map + the full module playbook: the shell contract, WS streaming (no polling), render-verify, portable modules.',
      action: paths.instance.claudemd === 'none' ? <Button onClick={() => act('md-instance', '/action/claudemd', { target: 'instance' })} disabled={busy === 'md-instance'}>Install</Button>
        : paths.instance.claudemd === 'ours-stale' ? <Button onClick={() => act('md-instance', '/action/claudemd', { target: 'instance' })} disabled={busy === 'md-instance'}>Update</Button>
        : paths.instance.claudemd === 'present' ? <button onClick={() => act('md-instance', '/action/claudemd', { target: 'instance' })} disabled={busy === 'md-instance'} title="Backs your file up, then adds the playbook below your rules — optional; your own CLAUDE.md is a perfectly fine state." className="cursor-pointer rounded-lg px-2 py-1 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-950/[0.05] hover:text-zinc-700 disabled:opacity-50 dark:hover:bg-white/10 dark:hover:text-zinc-200">append ours</button> : null,
    },
    {
      id: 'md-chromes', done: done.mdChromes, tpl: 'chromes', title: 'CLAUDE.md — chromes folder', state: paths.chromes.claudemd,
      desc: 'Handle with care: everything here is cross-cutting, a chrome change ripples into every module at once.',
      action: paths.chromes.claudemd === 'none' ? <Button onClick={() => act('md-chromes', '/action/claudemd', { target: 'chromes' })} disabled={busy === 'md-chromes' || !paths.chromes.exists}>Install</Button>
        : paths.chromes.claudemd === 'ours-stale' ? <Button onClick={() => act('md-chromes', '/action/claudemd', { target: 'chromes' })} disabled={busy === 'md-chromes'}>Update</Button>
        : paths.chromes.claudemd === 'present' ? <button onClick={() => act('md-chromes', '/action/claudemd', { target: 'chromes' })} disabled={busy === 'md-chromes'} title="Backs your file up, then adds the playbook below your rules — optional; your own CLAUDE.md is a perfectly fine state." className="cursor-pointer rounded-lg px-2 py-1 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-950/[0.05] hover:text-zinc-700 disabled:opacity-50 dark:hover:bg-white/10 dark:hover:text-zinc-200">append ours</button> : null,
    },
  ]

  return (
    <div className="mx-auto max-w-4xl text-zinc-950 dark:text-white">
      <header>
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-600/90 dark:text-blue-400/90">Module Development</div>
        <h1 className="mt-1.5 text-[30px] font-semibold leading-none tracking-tight">Three folders, three jobs</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
          The layout this collection is built with. An agent building a feature holds <span className="font-medium text-zinc-900 dark:text-white">one module</span> in its
          head — and physically can’t wreck the shell or restyle the whole system, because those live in folders its task never touches. The instance and chromes folders carry
          <span className="font-medium text-zinc-900 dark:text-white"> CLAUDE.md playbooks</span> so any agent that lands there already knows the rules — the modules folder stays clean, it’s just a container. Works immediately after a fresh
          install — and as the guided way to migrate an instance that’s been running for a while.
        </p>
      </header>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <FolderCard icon="settings-2" accent="#3b82f6" title="Instance" role="Runs it: config, .env, shell. The wiring — config edits only." p={paths.instance} mdState={paths.instance.claudemd} />
        <FolderCard icon="blocks" accent="#10b981" title="Modules" role="One subfolder per module — agents build in those. The folder itself is just a container; it carries no rules file." p={paths.modules} mdState={undefined} />
        <FolderCard icon="palette" accent="#a855f7" title="Chromes" role="The themes. Cross-cutting — hands off from module tasks." p={paths.chromes} mdState={paths.chromes.claudemd} />
      </div>

      {!(customOpen || dirty) && (
        <button onClick={() => setCustomOpen(true)} className="mt-3 inline-flex cursor-pointer items-center gap-1.5 px-1 text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300">
          <Icon name="folder-cog" size={13} /> Define custom folders…
        </button>
      )}
      {(customOpen || dirty) && (
      <div className="mt-4 rounded-2xl border border-dashed border-zinc-950/15 bg-zinc-950/[0.015] p-4 dark:border-white/15 dark:bg-white/[0.015]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-600 dark:text-zinc-300"><Icon name="folder-cog" size={15} /> Define custom folders</div>
          {dirty
            ? <span className="inline-flex items-center gap-2">
                <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">override pending — re-run the steps below</span>
                <button onClick={resetPaths} className="cursor-pointer text-[11px] font-medium text-zinc-400 underline-offset-2 hover:text-zinc-600 hover:underline dark:hover:text-zinc-200">reset</button>
              </span>
            : <span className="inline-flex items-center gap-2">
                {done.installPath && <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">wired via installPath</span>}
                <button onClick={() => setCustomOpen(false)} className="cursor-pointer text-[11px] font-medium text-zinc-400 underline-offset-2 hover:text-zinc-600 hover:underline dark:hover:text-zinc-200">close</button>
              </span>}
        </div>
        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">Anywhere outside the instance folder — each is a manual override: edit a path, then re-run “Create folders” and “{done.installPath ? 'Update' : 'Wire'} installPath” to apply it.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-zinc-400">Modules folder{pathsBody.modules !== paths.modules.path && <span className="ml-1.5 normal-case text-amber-500">· changed</span>}</span>
            <Input value={modPath ?? ''} onChange={(e) => setModPath(e.target.value)} placeholder="~/pro/002-my-atelier-modules" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-zinc-400">Chromes folder{pathsBody.chromes !== paths.chromes.path && <span className="ml-1.5 normal-case text-amber-500">· changed</span>}</span>
            <Input value={chrPath ?? ''} onChange={(e) => setChrPath(e.target.value)} placeholder="~/pro/001-my-atelier-chromes" />
          </label>
        </div>
      </div>
      )}

      {err && <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/[0.06] px-3 py-2 text-sm text-red-600 dark:text-red-400">{err}</p>}

      <section className="mt-8">
        <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-400 dark:text-zinc-500">Set it up — live against your instance</span>
          {allDone && <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"><Icon name="sparkles" size={13} /> layout complete</span>}
        </div>
        <div className="divide-y divide-zinc-950/[0.06] overflow-hidden rounded-2xl border border-zinc-950/10 bg-white dark:divide-white/[0.06] dark:border-white/10 dark:bg-white/[0.02]">
          {steps.map((s) => (
            <div key={s.id} className="px-4 py-3.5">
              <div className="flex items-start gap-3">
                <StepDot done={s.done} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-semibold text-zinc-950 dark:text-white">{s.title}</span>
                    {(s.state === 'present' || s.state === 'ours-stale') && <MdChip state={s.state} />}
                  </div>
                  <p className="mt-0.5 text-xs leading-[1.5] text-zinc-500 dark:text-zinc-400">{s.desc}</p>
                  {s.state === 'present' && !s.done && null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {s.tpl && <button onClick={() => showTemplate(s.tpl)} className="cursor-pointer rounded-lg px-2 py-1 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-950/[0.05] hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200">view</button>}
                  {s.tpl && (s.state === 'present' || s.state === 'ours-stale') && <button onClick={() => showDiff(s.tpl)} className="cursor-pointer rounded-lg px-2 py-1 text-xs font-medium text-amber-600/80 transition-colors hover:bg-amber-500/10 hover:text-amber-600 dark:text-amber-400/80 dark:hover:text-amber-300">diff</button>}
                  {s.action}
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 px-1 text-[11px] leading-[1.6] text-zinc-400 dark:text-zinc-500">
          Never clobbered: an existing CLAUDE.md of yours is backed up and appended to; when paths or the template change later, the step flips to “playbook outdated” and Update replaces only our block — your own content above it stays.
        </p>
      </section>

      <section className="mt-8">
        <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-400 dark:text-zinc-500">Migration — what still lives in the wrong folder</div>
        {migrating ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.05] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-200">
                <Icon name="move-right" size={16} /> {migration.toModules.length + migration.toChromes.length} to move · {migration.ok} already in place
              </div>
              <CopyBtn label="Copy the agent brief" copiedLabel="Brief copied" getText={async () => (await (await fetch(self.api + '/brief')).json()).brief} />
            </div>
            <div className="mt-3 space-y-1.5">
              {[...migration.toModules.map((m) => ({ ...m, dest: paths.modules.path })), ...migration.toChromes.map((m) => ({ ...m, dest: paths.chromes.path }))].map((m) => (
                <div key={m.ws + '/' + m.id} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg bg-white/60 px-3 py-2 text-xs dark:bg-white/[0.04]">
                  <Icon name={m.isChrome ? 'palette' : 'blocks'} size={13} className="text-zinc-400" />
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">{m.id}</span>
                  <span className="rounded bg-zinc-500/15 px-1 py-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">{m.ws}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-zinc-400 dark:text-zinc-500" title={m.dir}>{m.dir}</span>
                  <span className="inline-flex items-center gap-1 font-mono text-[10.5px] text-amber-700 dark:text-amber-300"><Icon name="arrow-right" size={11} /> {m.dest}/</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-[1.6] text-amber-700/80 dark:text-amber-300/70">
              Moving folders on a running instance is deliberate work — copy the brief and hand it to an agent: it moves one module at a time, updates the config entry, and verifies each before the next.
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 rounded-2xl border border-zinc-950/10 bg-white px-4 py-3 text-sm text-zinc-600 dark:border-white/10 dark:bg-white/[0.02] dark:text-zinc-300">
            <Icon name="check" size={15} className="text-emerald-500" /> Nothing to move — every mounted module and chrome lives where the layout says.
            {migration.external.length > 0 && <span className="text-xs text-zinc-400 dark:text-zinc-500">({migration.external.length} linked from elsewhere — fine, that’s what path-mounts are for)</span>}
          </div>
        )}
      </section>

      {preview && (
        <Modal onClose={() => setPreview(null)} wide={preview.mode === 'diff'}>
          {preview.mode === 'diff' ? <DiffView rows={preview.rows || []} /> : <div className="mx-auto max-w-2xl"><Markdown text={preview.content} /></div>}
        </Modal>
      )}

      <section className="mt-8 mb-2 rounded-2xl border border-zinc-950/10 bg-zinc-950/[0.02] p-4 text-xs leading-[1.7] text-zinc-500 dark:border-white/10 dark:bg-white/[0.02] dark:text-zinc-400">
        <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-400 dark:text-zinc-500"><Icon name="terminal" size={13} /> Day one, after this</div>
        Start an agent in the <span className="font-mono">{paths.modules.path}</span> folder and say what you want built — the CLAUDE.md there already carries the module contract.
        New modules from collections land in the right folder by themselves (<span className="font-mono">npx atelier add …</span> reads <span className="font-mono">installPath</span>).
        The instance folder stays quiet: config, env, shell — nothing an agent needs to touch to ship a feature.
      </section>
    </div>
  )
}
