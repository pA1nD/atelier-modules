/* horse-browser/credentials.jsx — the Bitwarden broker control panel.
 *
 * Styled on the module's dark night-console palette (no @atelier/kit — every
 * atom is hand-rolled here).
 * The signed daemon + socket + launchd live in ./broker.js and ./native/; the
 * routes in ./credentials.js. This file is the UI at the module's `credentials`
 * sub-route, plus the compact live status card shown on the board.
 */

import { Reveal, Icon, CopyBoom, cn } from './lib.jsx'

const { useState, useEffect, useRef, useMemo, useCallback } = React
const ACCENT = '#10b981'

// API base — set by the entry components (Credentials / CredentialsCard) from
// the `self` the shell hands the module, so every child can reach the routes.
let API = ''
const setApi = (self) => { API = self.api }
const copyText = (t) => (navigator.clipboard ? navigator.clipboard.writeText(t).then(() => true).catch(() => false) : Promise.resolve(false))
const postJSON = (p, body) => fetch(API + p, { method: 'POST', headers: body != null ? { 'Content-Type': 'application/json' } : {}, body: body != null ? JSON.stringify(body) : undefined }).then((r) => r.json())

/* ─────────────────────────────── dark atoms ──────────────────────────────── */
const BADGE = {
  lime: 'bg-emerald-400/15 text-emerald-300', amber: 'bg-amber-400/15 text-amber-300',
  red: 'bg-rose-400/15 text-rose-300', sky: 'bg-sky-400/15 text-sky-300',
  cyan: 'bg-cyan-400/15 text-cyan-300', violet: 'bg-violet-400/15 text-violet-300',
  zinc: 'bg-white/[0.07] text-zinc-300',
}
function Badge({ color = 'zinc', className = '', children }) {
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold', BADGE[color] || BADGE.zinc, className)}>{children}</span>
}
function Btn({ tone = 'accent', disabled, onClick, style, className = '', children }) {
  const tones = {
    accent: 'text-white hover:brightness-110',
    outline: 'border border-white/15 text-zinc-200 hover:border-white/30 hover:text-white',
    danger: 'text-white hover:brightness-110',
    plain: 'text-zinc-400 hover:text-zinc-100',
  }
  const bg = tone === 'accent' ? { background: ACCENT } : tone === 'danger' ? { background: '#dc2626' } : undefined
  return <button type="button" disabled={disabled} onClick={onClick} style={{ ...bg, ...style }} className={cn('rounded-full px-3 py-1.5 text-[12px] font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50', tones[tone], className)}>{children}</button>
}
const Code = ({ children }) => <code className="cl-mono rounded bg-white/10 px-1 py-0.5 text-[0.9em] text-zinc-200">{children}</code>
const Strong = ({ children, className = '' }) => <strong className={cn('font-semibold text-zinc-100', className)}>{children}</strong>
function StatusDot({ color }) {
  const map = { lime: 'bg-emerald-400', amber: 'bg-amber-400', red: 'bg-rose-400', sky: 'bg-sky-400', cyan: 'bg-cyan-400', zinc: 'bg-zinc-500' }
  return <span className={cn('inline-block size-2 shrink-0 rounded-full', map[color] || map.zinc)} />
}
function Spinner({ className = 'size-4' }) {
  return <svg viewBox="0 0 24 24" className={cn('animate-spin', className)} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.2-8.6" /></svg>
}
function Label({ children, right }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span aria-hidden className="inline-block h-3 w-px" style={{ background: ACCENT }} />
        <span className="cl-mono text-[10.5px] font-medium uppercase tracking-[0.2em] text-zinc-500">{children}</span>
      </div>
      {right}
    </div>
  )
}
function Field({ value, onChange, placeholder, className = '', type = 'text', ...rest }) {
  return <input type={type} value={value} onChange={onChange} placeholder={placeholder} spellCheck={false}
    className={cn('rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[13px] text-zinc-200 outline-none transition placeholder:text-zinc-500 focus:border-white/25', className)} {...rest} />
}
function CopyLine({ text }) {
  const [ok, setOk] = useState(false)
  return (
    <button type="button" onClick={async () => { if (await copyText(text)) { setOk(true); setTimeout(() => setOk(false), 1200) } }}
      className="mt-1.5 flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-left font-mono text-[12px] text-zinc-200 transition hover:border-white/25">
      <span className="truncate">{text}</span>
      <span className="shrink-0 text-[10px] uppercase tracking-wide text-zinc-500">{ok ? 'copied' : 'copy'}</span>
    </button>
  )
}

/* markdown renderer for the agent skill (dark) */
function mdInline(text, kb) {
  const out = []
  let rest = String(text), i = 0
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))/
  while (rest) {
    const m = rest.match(re)
    if (!m) { out.push(rest); break }
    if (m.index > 0) out.push(rest.slice(0, m.index))
    const tok = m[0], k = `${kb}-${i++}`
    if (tok[0] === '`') out.push(<Code key={k}>{tok.slice(1, -1)}</Code>)
    else if (tok.startsWith('**')) out.push(<Strong key={k}>{tok.slice(2, -2)}</Strong>)
    else if (tok[0] === '*') out.push(<em key={k} className="italic text-zinc-200">{tok.slice(1, -1)}</em>)
    else { const mm = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/); out.push(<a key={k} href={mm[2]} target="_blank" rel="noopener" className="underline decoration-white/25 underline-offset-2 hover:decoration-white/60">{mm[1]}</a>) }
    rest = rest.slice(m.index + tok.length)
  }
  return out
}
const mdIndent = (l) => (l.match(/^ */)[0] || '').length
const mdIsMarker = (l) => /^ *(?:[-*]|\d+\.)\s+/.test(l)
// render one list item's already-dedented lines: pure prose collapses to an inline
// run (no <p> margins next to the bullet); an item with an indented code block
// renders wrapped paragraph(s) + <pre> so continuations and code nest under it.
function mdItemBlock(dl, kb) {
  const hasCode = dl.some((l) => /^ {4,}/.test(l))
  if (!hasCode) return mdInline(dl.filter((l) => l.trim() !== '').join(' ').replace(/\s+/g, ' ').trim(), kb)
  const nodes = []; let k = 0
  while (k < dl.length) {
    if (dl[k].trim() === '') { k++; continue }
    if (/^ {4,}/.test(dl[k])) {
      const code = []
      while (k < dl.length && (/^ {4,}/.test(dl[k]) || (dl[k].trim() === '' && k + 1 < dl.length && /^ {4,}/.test(dl[k + 1])))) { code.push(dl[k].replace(/^ {4}/, '')); k++ }
      nodes.push(<pre key={`${kb}c${k}`} className="my-2 overflow-x-auto rounded-lg bg-black/60 p-3 font-mono text-[11.5px] leading-relaxed text-zinc-100"><code>{code.join('\n')}</code></pre>)
      continue
    }
    const buf = [dl[k]]; k++
    while (k < dl.length && dl[k].trim() !== '' && !/^ {4,}/.test(dl[k])) { buf.push(dl[k].trim()); k++ }
    nodes.push(<p key={`${kb}p${k}`} className={nodes.length ? 'mt-2' : ''}>{mdInline(buf.join(' '), `${kb}${k}`)}</p>)
  }
  return nodes
}
function Markdown({ src }) {
  let s = String(src || '')
  if (s.startsWith('---\n')) { const end = s.indexOf('\n---', 3); if (end !== -1) s = s.slice(end + 4) }
  const lines = s.split('\n'); const out = []; let i = 0
  while (i < lines.length) {
    const ln = lines[i]
    if (ln.startsWith('```')) { const buf = []; i++; while (i < lines.length && !lines[i].startsWith('```')) { buf.push(lines[i]); i++ } i++; out.push(<pre key={out.length} className="my-3 overflow-x-auto rounded-lg bg-black/60 p-3.5 font-mono text-[11.5px] leading-relaxed text-zinc-100"><code>{buf.join('\n')}</code></pre>); continue }
    if (/^###\s+/.test(ln)) { out.push(<h5 key={out.length} className="mb-1 mt-6 text-[13px] font-semibold text-zinc-200">{mdInline(ln.replace(/^###\s+/, ''), `h3${i}`)}</h5>); i++; continue }
    if (/^##\s+/.test(ln)) { out.push(<h4 key={out.length} className="mb-2 mt-8 text-[16px] font-semibold text-zinc-100">{mdInline(ln.replace(/^##\s+/, ''), `h2${i}`)}</h4>); i++; continue }
    if (/^#\s+/.test(ln)) { out.push(<h3 key={out.length} className="mb-3 text-[22px] font-bold text-zinc-50">{mdInline(ln.replace(/^#\s+/, ''), `h1${i}`)}</h3>); i++; continue }
    if (/^---\s*$/.test(ln)) { out.push(<div key={out.length} className="my-6 border-t border-white/10" />); i++; continue }
    if (mdIsMarker(ln)) {
      const baseIndent = mdIndent(ln)
      const ordered = /^ *\d+\./.test(ln)
      // collect the whole list block, keeping each item's wrapped/indented lines
      const block = []
      while (i < lines.length) {
        const l = lines[i]
        if (l.trim() === '') {
          let j = i + 1; while (j < lines.length && lines[j].trim() === '') j++
          if (j < lines.length && (mdIndent(lines[j]) > baseIndent || (mdIsMarker(lines[j]) && mdIndent(lines[j]) === baseIndent))) { block.push(''); i++; continue }
          break
        }
        const ind = mdIndent(l)
        if (ind < baseIndent) break
        if (ind === baseIndent && !mdIsMarker(l)) break
        block.push(l); i++
      }
      // split into items on a base-indent marker; everything else belongs to the current item
      const items = []
      for (const l of block) {
        if (mdIsMarker(l) && mdIndent(l) === baseIndent) items.push([l])
        else if (items.length) items[items.length - 1].push(l)
      }
      const Tag = ordered ? 'ol' : 'ul'
      out.push(
        <Tag key={out.length} className={cn('my-3 ml-5 space-y-2 text-[13.5px] leading-relaxed text-zinc-300 marker:text-zinc-500', ordered ? 'list-decimal' : 'list-disc')}>
          {items.map((raw, j) => {
            const ci = raw[0].match(/^ *(?:[-*]|\d+\.)\s+/)[0].length
            const dl = raw.map((r, k) => (k === 0 ? r.slice(ci) : r.slice(Math.min(ci, mdIndent(r)))))
            return <li key={j} className="pl-1">{mdItemBlock(dl, `li${out.length}-${j}`)}</li>
          })}
        </Tag>
      )
      continue
    }
    if (ln.trim() === '') { i++; continue }
    const buf = [ln]; i++
    while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,3}\s|```|\s*(?:[-*]|\d+\.)\s|---\s*$)/.test(lines[i])) { buf.push(lines[i]); i++ }
    out.push(<p key={out.length} className="my-2 text-[13.5px] leading-relaxed text-zinc-300">{mdInline(buf.join(' '), `p${i}`)}</p>)
  }
  return <>{out}</>
}

/* ─────────────────────────────── broker bits ─────────────────────────────── */
const TIER_META = { auto: { color: 'lime', label: 'auto' }, ask: { color: 'amber', label: 'ask' }, never: { color: 'zinc', label: 'never' } }
function TierPill({ tier }) { const m = TIER_META[tier] || TIER_META.never; return <Badge color={m.color}>{m.label}</Badge> }

const EVENT_LABEL = { type_secret: 'typed password', type_totp: 'typed 2FA code', get_totp: 'read 2FA code', policy_set: 'access change', lock_soft: 'locked vault', lock: 'locked vault (hard)', reset: 'disconnected' }
const TIER_INK = { auto: 'text-emerald-400', ask: 'text-amber-400', off: 'text-zinc-500', never: 'text-zinc-500' }
// session codename — byte-identical to statusline.sh / the tab grouper
const CODE_COLORS = { red: '#f87171', orange: '#fb923c', yellow: '#facc15', green: '#4ade80', cyan: '#22d3ee', blue: '#60a5fa', purple: '#c084fc', pink: '#f472b6' }
const CODES = [['🔥', 'red'], ['🍎', 'red'], ['🍓', 'red'], ['🍒', 'red'], ['🌹', 'red'], ['🐞', 'red'], ['🦊', 'orange'], ['🍊', 'orange'], ['🦁', 'orange'], ['🐯', 'orange'], ['🥕', 'orange'], ['🏀', 'orange'], ['🍋', 'yellow'], ['🌻', 'yellow'], ['⭐', 'yellow'], ['🐝', 'yellow'], ['🍌', 'yellow'], ['🐥', 'yellow'], ['🐸', 'green'], ['🍀', 'green'], ['🌵', 'green'], ['🐢', 'green'], ['🌲', 'green'], ['🐍', 'green'], ['🐬', 'cyan'], ['🌊', 'cyan'], ['💎', 'cyan'], ['🧊', 'cyan'], ['🐳', 'cyan'], ['💧', 'cyan'], ['🐧', 'blue'], ['🫐', 'blue'], ['🦋', 'blue'], ['🌀', 'blue'], ['🌐', 'blue'], ['🐟', 'blue'], ['🦄', 'purple'], ['🍇', 'purple'], ['🔮', 'purple'], ['🐙', 'purple'], ['🍆', 'purple'], ['👾', 'purple'], ['🌸', 'pink'], ['🐷', 'pink'], ['🦩', 'pink'], ['🍑', 'pink'], ['🌷', 'pink'], ['🌺', 'pink']]
function codeHash32(s) { let h = 0x811c9dc5; for (let i = 0; i < (s || '').length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) } h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16; return h >>> 0 }
function codename(id) { const [e, c] = CODES[codeHash32(id || '') % CODES.length]; return { callsign: (id || '').slice(-4).toUpperCase(), emoji: e, hex: CODE_COLORS[c] } }

// Installing the credential feature is an AGENT task (like everything else) —
// this block hands over the scoped setup prompt — the manual (and the install
// script it points at) is the whole story; there is no install API.
// the next step, front and center: the same green agent button-group as the
// hero — open the credentials guide, or copy the scoped prompt straight away.
function CredFeatureSetup({ status, navigate }) {
  const prompt = `I'm giving you a skill — read it and use it: ${(typeof window !== 'undefined' ? window.location.origin : '') + API + '/setup.md?part=credentials'}`
  return (
    <div className="mt-4">
      {/* the connection ladder above already shows the road — just the action + two lines here */}
      <div className="flex max-w-[19rem] items-stretch rounded-full shadow-sm" style={{ background: ACCENT }}>
        <button type="button" onClick={() => navigate && navigate('setup/credentials')} className="min-w-0 flex-1 px-3 py-1.5 text-[11.5px] font-semibold text-white transition hover:brightness-110">
          Set up credentials — via agent →
        </button>
        <span className="my-1 w-px shrink-0 bg-white/35" />
        <span className="flex shrink-0 items-center gap-1.5 px-2.5 transition hover:brightness-110">
          <span className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-white/90">prompt</span>
          <CopyBoom value={prompt} title="Copy the credentials setup prompt" size={16} ink="#ffffff" className="drop-shadow-sm" />
        </span>
      </div>
      <p className="mt-2.5 text-[12px] leading-relaxed text-zinc-500">An agent compiles the signed daemon (a readable script, installed outside the module tree) and wires the agent side. macOS will ask once for your password — choose <Strong>“Always Allow”</Strong>; your Bitwarden master password never leaves you.</p>
    </div>
  )
}

function BrokerStatus({ status }) {
  if (!status) return <div className="flex items-center gap-2 text-[13px] text-zinc-400"><Spinner className="size-4" /> reaching the broker…</div>
  const v = status.vault || {}
  const bwState = v.bwStatus || 'unknown'
  const dot = (c, t) => <span className="inline-flex items-center gap-1.5"><StatusDot color={c} />{t}</span>
  const daemonRow = ['daemon', status.installed ? (status.ok ? dot('lime', 'running') : dot('red', 'installed, not answering')) : dot('zinc', 'not built')]
  // no daemon yet → show the SAME ladder it will have once installed, with the
  // later rungs as muted upcoming steps — the card doubles as the install guide
  // and the UI doesn't reshuffle as things land
  const pend = (t) => <span className="inline-flex items-center gap-1.5 text-zinc-600"><StatusDot color="zinc" />{t}</span>
  const rows = !status.installed ? [
    daemonRow,
    ['bitwarden cli', pend('checked after install')],
    ['session token', pend('after connect — hb-broker setup')],
    ['vault session', pend('after connect')],
  ] : [
    daemonRow,
    ['bitwarden cli', bwState === 'no-cli' ? dot('red', 'not installed') : bwState === 'unauthenticated' ? dot('amber', 'not logged in') : bwState === 'unknown' ? dot('zinc', 'unknown') : dot('lime', bwState)],
    ...(v.email ? [['account', <span className="font-mono text-[12px] text-zinc-200">{v.email}</span>]] : []),
    ...(v.server ? [['server', <span className="font-mono text-[12px] text-zinc-200">{(v.server || '').replace(/^https?:\/\//, '')}</span>]] : []),
    ['session token', v.hasSession ? dot('lime', 'in the login Keychain') : dot('red', 'not connected')],
    ['vault session', v.warm ? dot('lime', 'warm') : v.hasSession ? dot('zinc', 'cold (unlocks on demand)') : dot('red', 'none — connect first')],
  ]
  return (
    <div className="grid gap-y-1">
      {rows.map(([k, val]) => (
        <div key={k} className="flex items-center justify-between border-b border-white/5 py-1.5">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500">{k}</span>
          <span className="text-[13px] text-zinc-200">{val}</span>
        </div>
      ))}
    </div>
  )
}

function ConnectBox({ status, setupCmd, cli }) {
  const v = status?.vault || {}
  const cliReady = !!v.bwStatus && v.bwStatus !== 'no-cli'
  // needed with no token, AND when bw got logged out under a stale token — setup heals both
  const needToken = !v.hasSession || v.bwStatus === 'unauthenticated'
  if (!status?.installed || status?.hbInstalled === false || !cliReady || !needToken) return null
  return (
    <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/[0.06] p-4">
      <div className="text-[13.5px] font-medium text-emerald-300">Connect your Bitwarden</div>
      <p className="mt-1 text-[13px] leading-relaxed text-zinc-400">
        Run this one command. It prompts for your server, email, and master password (typed hidden), then logs in and mints the token <Strong>inside the daemon</Strong> — so nothing (no token, no passwords) is ever printed to your terminal. Only the token is stored, in the code-signature-bound Keychain; your master password is never saved.
      </p>
      <div className="mt-3"><CopyLine text={setupCmd || `${cli || 'hb-broker'} setup`} /></div>
      <p className="mt-2 text-[12px] text-zinc-500"><Strong className="text-zinc-400">We don't recommend running <Code>bw login</Code> yourself</Strong> — bw prints the session token (full vault access) straight to your terminal.</p>
    </div>
  )
}

// inline two-step confirm (no modal) for a destructive action
function DisconnectLink({ name, endpoint, warn, onDone, lock }) {
  const [step, setStep] = useState(0)   // 0 idle · 1 confirm · 2 busy
  const [manual, setManual] = useState(null)
  const [failed, setFailed] = useState(null)
  const go = async () => {
    setStep(2); setFailed(null)
    /* Dropping back to step 0 on failure made a FAILED disconnect look exactly like a
       cancelled one — the vault stays connected either way and the user is told nothing.
       Surface it. */
    try {
      const r = await postJSON(endpoint)
      if (r && r.ok) { setManual(r.manual || 'Disconnected.'); onDone && onDone() }
      else { setFailed((r && (r.error || r.reason)) || 'the broker refused the disconnect'); setStep(0) }
    } catch (e) { setFailed(String((e && e.message) || e)); setStep(0) }
  }
  if (manual) return <div className="flex items-start gap-2 text-[12px] text-zinc-400"><span className="mt-1"><StatusDot color="amber" /></span><div><Strong>Disconnected.</Strong> {manual}</div></div>
  if (step === 0) return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => { setFailed(null); setStep(1) }} title={lock ? 'Prompts for macOS approval to confirm' : undefined} className="text-[12px] text-zinc-400 underline underline-offset-2 transition hover:text-rose-400">{lock ? '🔒 ' : ''}disconnect {name}</button>
      {failed ? <span className="text-[12px] text-amber-300">— didn't disconnect; still connected. <span className="text-amber-300/70">{failed}</span></span> : null}
    </span>
  )
  return (
    <span className="inline-flex items-center gap-2 text-[12px] text-zinc-400">
      <span className="max-w-xs">{warn}</span>
      <button type="button" disabled={step === 2} onClick={go} className="rounded-md px-2 py-0.5 font-semibold text-white disabled:opacity-50" style={{ background: '#dc2626' }}>{step === 2 ? '…' : 'Disconnect'}</button>
      <button type="button" onClick={() => setStep(0)} className="text-zinc-500 hover:text-zinc-300">cancel</button>
    </span>
  )
}

const GROUP_TIERS = [
  { v: 'off', label: 'off', hint: "not granted — agents can't touch it" },
  { v: 'ask', label: 'ask', hint: 'macOS approval every use' },
  { v: 'auto', label: 'auto', hint: 'always, no prompt — unattended' },
]
function GroupPicker({ policy, groups, onLoadGroups, loadingGroups, groupsErr, onSave, saving, saveMsg, disabled }) {
  const [tiers, setTiers] = useState({})
  const meta = useRef({})
  useEffect(() => {
    if (!policy) return
    const g = policy.groups || {}; const t = {}
    for (const [k, r] of Object.entries(g)) { t[k] = r.tier === 'never' ? 'off' : (r.tier || 'off'); meta.current[k] = { kind: r.kind, name: r.name } }
    setTiers(t)
  }, [policy])
  useEffect(() => {
    if (!groups) return
    for (const g of groups) meta.current[g.key] = { kind: g.kind, name: g.name, count: g.count }
    setTiers((t) => { const n = { ...t }; for (const g of groups) if (!(g.key in n)) n[g.key] = g.tier && g.tier !== 'never' ? g.tier : 'off'; return n })
  }, [groups])
  const keys = Object.keys(meta.current).sort((a, b) => (meta.current[a].name || a).localeCompare(meta.current[b].name || b))
  const setTier = (k, v) => setTiers((t) => ({ ...t, [k]: v }))
  const grantedCount = Object.values(tiers).filter((v) => v && v !== 'off').length
  // accounts reachable per tier — item counts come from the groups scan (0 until loaded)
  const tally = (tier) => keys.filter((k) => (tiers[k] || 'off') === tier).reduce((n, k) => n + ((meta.current[k] || {}).count || 0), 0)
  const savedTiers = useMemo(() => { const g = (policy && policy.groups) || {}; const t = {}; for (const [k, r] of Object.entries(g)) t[k] = r.tier === 'never' ? 'off' : (r.tier || 'off'); return t }, [policy])
  const pending = keys.filter((k) => (tiers[k] || 'off') !== (savedTiers[k] || 'off'))
  const dirty = pending.length > 0
  const save = () => {
    const out = {}
    for (const [k, v] of Object.entries(tiers)) { if (v === 'off' || !v) continue; const m = meta.current[k] || {}; out[k] = { kind: m.kind || (k.startsWith('fld:') ? 'folder' : 'collection'), name: m.name || k, tier: v } }
    /* Everything off is a legitimate "revoke all" — but the broker rejects an empty policy
       unless it's explicit, because an empty or malformed body decodes to the same thing and
       would otherwise wipe every grant silently. Turning them off here IS deliberate. */
    const payload = { version: 2, groups: out }
    if (Object.keys(out).length === 0) payload.allowEmpty = true
    onSave(payload)
  }
  return (
    <div className="space-y-4">
      {/* pending changes follow you while scrolling the (long) table — nothing
          applies until the 🔒 save */}
      {dirty && (
        <div className="sticky top-3 z-30 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/25 bg-zinc-900/95 px-4 py-2.5 shadow-xl backdrop-blur">
          <span className="text-[12.5px] text-zinc-300"><span className="font-semibold text-amber-300">{pending.length} pending change{pending.length === 1 ? '' : 's'}</span> — nothing applies until you save</span>
          <Btn tone="accent" onClick={save} disabled={saving}><span aria-hidden="true" className="mr-1">🔒</span>{saving ? 'saving…' : 'Save access'}</Btn>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[14px] font-semibold text-zinc-100">Access by collection</span>
        <div className="flex items-center justify-end gap-3">
          <p className="max-w-[16rem] text-right text-[11px] leading-snug text-zinc-500">Re-reads your live vault from Bitwarden to refresh counts.</p>
          <button type="button" onClick={onLoadGroups} disabled={loadingGroups || disabled} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 text-[12px] text-zinc-300 transition hover:border-white/30 disabled:opacity-50">
            {loadingGroups ? <Spinner className="size-3.5" /> : null} {groups ? 'Rescan' : 'Load collections'}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[40rem] text-[13px]">
          <thead>
            <tr className="border-b border-white/10 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
              <th className="px-3 py-2 font-medium">collection / folder</th>
              <th className="px-3 py-2 font-medium">items</th>
              <th className="px-3 py-2 font-medium">access</th>
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 && <tr><td colSpan={3} className="px-3 py-6 text-center text-[13px]">{
              groupsErr
                ? <span className="text-amber-300">Couldn't read your collections — <span className="text-amber-300/70">{groupsErr}</span></span>
                : <span className="text-zinc-500">{disabled ? 'Build the broker daemon first — collections load through it.' : groups ? 'No collections or folders in this Bitwarden account.' : 'Load your Bitwarden collections to grant access.'}</span>
            }</td></tr>}
            {keys.map((k) => {
              const m = meta.current[k] || {}; const t = tiers[k] || 'off'
              return (
                <tr key={k} className="border-b border-white/5 last:border-0">
                  <td className="px-3 py-2"><span className="text-zinc-100">{m.name || k}</span><Badge color={m.kind === 'folder' ? 'zinc' : 'sky'} className="ml-2">{m.kind || 'collection'}</Badge></td>
                  <td className="px-3 py-2 font-mono text-[12px] text-zinc-500">{m.count != null ? m.count : '—'}</td>
                  <td className="px-3 py-2">
                    <div className="inline-flex overflow-hidden rounded-lg border border-white/10">
                      {GROUP_TIERS.map(({ v, label, hint }) => (
                        <button key={v} type="button" title={hint} onClick={() => setTier(k, v)}
                          className={cn('px-2.5 py-1 text-[12px] transition', t === v
                            ? (v === 'auto' ? 'bg-emerald-500 text-white' : v === 'ask' ? 'bg-amber-500 text-white' : 'bg-zinc-200 text-zinc-900')
                            : 'text-zinc-400 hover:text-white')}>{label}</button>
                      ))}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[12px] text-zinc-500">
          {grantedCount} collection{grantedCount === 1 ? '' : 's'} granted
          {(tally('auto') > 0 || tally('ask') > 0) && <> · <span className="font-medium text-emerald-300">{tally('auto')}</span> account{tally('auto') === 1 ? '' : 's'} auto · <span className="font-medium text-amber-300">{tally('ask')}</span> ask</>}
        </span>
        {saveMsg && <span className={cn('text-[12.5px]', saveMsg.ok ? 'text-emerald-400' : 'text-rose-400')}>{saveMsg.text}</span>}
        {dirty && !saving && !saveMsg && <span className="text-[12px] font-medium text-amber-400">{pending.map((k) => `${(meta.current[k] || {}).name || k} → ${tiers[k]}`).join(', ')}</span>}
      </div>
      {/* the save group: button · a two-line-tall 🔒 · the two-line small print it refers to */}
      <div className="!mt-3 flex flex-wrap items-start gap-3.5">
        <Btn tone="accent" onClick={save} disabled={saving || !dirty} style={!dirty ? { background: 'rgba(255,255,255,.08)' } : undefined}>{saving ? 'saving…' : dirty ? `Save access · ${pending.length}` : 'Save access'}</Btn>
        <div className="flex min-w-0 items-center gap-2.5">
          <Icon name="lock" size={24} className="shrink-0" style={{ color: '#ab9062' }} />
          <p className="max-w-[36rem] text-[11px] leading-snug text-zinc-500">
            Saving asks for a real macOS approval (Touch ID / login password) when it <Strong className="text-zinc-400">raises</Strong> access — same prompt an agent gets on every <Strong className="text-zinc-400">ask</Strong> login. Lowering access, <Strong className="text-zinc-400">auto</Strong> fills, and viewing collections stay silent.
          </p>
        </div>
      </div>
    </div>
  )
}

function agoText(sec) {
  if (!sec) return 'never'
  const d = Math.max(0, Date.now() / 1000 - sec)
  if (d < 60) return 'just now'
  if (d < 3600) return Math.floor(d / 60) + 'm ago'
  if (d < 86400) return Math.floor(d / 3600) + 'h ago'
  return Math.floor(d / 86400) + 'd ago'
}

function ReachableSection({ navigate }) {
  const [st, setSt] = useState({ loading: true })
  const [slow, setSlow] = useState(false)
  const [q, setQ] = useState('')
  const [syncing, setSyncing] = useState(false)
  /* syncWarn: the daemon stamps syncedAt even when the server pull failed, so "synced 2m ago"
     alone would present a stale local snapshot as fresh. didSync/syncError say what really
     happened; the plain /broker/reachable GET omits both, so this stays null there. */
  const apply = (r) => {
    if (r && r.ok) setSt({
      items: r.items || [], syncedAt: r.syncedAt || 0, neverSynced: !!r.neverSynced,
      syncWarn: r.syncError || (r.didSync === false ? "the vault couldn't be opened, so nothing was pulled from Bitwarden" : null),
    })
    else setSt({ error: r?.error || 'unavailable', reason: r?.reason })
  }
  // Sync now = warm the vault + rebuild the cache (the ONLY action that unlocks). The list itself
  // reads the cache, so it's instant and never triggers an unlock.
  /* A sync can outlive the page (it may unlock the vault, so tens of seconds) — mounted keeps
     its late resolution from setting state on an unmounted component. */
  const mounted = useRef(true)
  useEffect(() => () => { mounted.current = false }, [])
  const sync = () => {
    setSyncing(true)
    postJSON('/broker/sync')
      .then((r) => { if (mounted.current) apply(r) })
      .catch((e) => { if (mounted.current) setSt({ error: String((e && e.message) || e) }) })
      .finally(() => { if (mounted.current) setSyncing(false) })
  }
  useEffect(() => {
    let alive = true
    const t = setTimeout(() => { if (alive) setSlow(true) }, 400)
    fetch(API + '/broker/reachable').then((x) => x.json()).then((r) => { if (alive) apply(r) })
      .catch((e) => { if (alive) setSt({ error: String((e && e.message) || e) }) }).finally(() => { if (alive) clearTimeout(t) })
    return () => { alive = false; clearTimeout(t) }
  }, [])
  /* Rendering nothing was fine when this only ever appeared inside the board (where the broker
     card already explains itself), but it is ALSO the whole body of the /accounts page — so
     deep-linking there with the daemon down gave a page containing two back-links and nothing
     else. Say what is wrong instead. */
  if (st.error && st.reason === 'no-broker') return (
    <div className="space-y-3"><Label>Reachable accounts</Label>
      <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-5 text-[13px] text-zinc-400">
        <div className="font-medium text-zinc-300">The credential broker isn't running.</div>
        <div className="mt-1.5">There is nothing to list until it is. {navigate ? <>Set it up from the <button type="button" onClick={() => navigate('')} className="underline underline-offset-2 hover:text-zinc-200">board</button>.</> : null}</div>
      </div>
    </div>
  )
  if (st.error) return (
    <div className="space-y-3"><Label>Reachable accounts</Label>
      <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.06] px-4 py-5 text-[13px] text-amber-300"><div className="font-medium">No accounts reachable — this is not an empty list.</div><div className="mt-1.5 text-amber-300/80">{st.error}</div></div>
    </div>
  )
  if (st.loading) { if (!slow) return null; return <div className="space-y-3"><Label>Reachable accounts</Label><div className="flex items-center gap-2 py-6 text-[13px] text-zinc-400"><Spinner className="size-4" /> reading the cache…</div></div> }
  const items = (st.items || []).slice().sort((a, b) => (a.item || '').localeCompare(b.item || ''))
  const autoN = items.filter((i) => i.tier === 'auto').length
  const askN = items.filter((i) => i.tier === 'ask').length
  const filtered = q ? items.filter((i) => ((i.item || '') + ' ' + (i.username || '') + ' ' + (i.hosts || []).join(' ')).toLowerCase().includes(q.toLowerCase())) : items
  return (
    <div className="space-y-3">
      <Label>Reachable accounts</Label>
      <p className="max-w-2xl text-[13.5px] leading-relaxed text-zinc-400">The logins inside your granted collections — what an agent can enumerate right now. This list is <Strong>non-secret</Strong>: any agent reads it via <Code>list_login_profiles</Code>. The password never appears here or anywhere — it is only ever <Code>type_secret</Code>-typed by the broker, gated by tier, origin, and a macOS approval.</p>
      {st.syncWarn ? (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.06] px-3 py-2.5 text-[12.5px] text-amber-300">
          <Strong>That sync didn't reach Bitwarden.</Strong> <span className="text-amber-300/80">Showing the last data that did — a login added on another device may be missing. {st.syncWarn}</span>
        </div>
      ) : null}
      {items.length === 0 ? (
        st.neverSynced ? (
          <div className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-[13px] text-zinc-500">Not synced yet — <button type="button" onClick={sync} disabled={syncing} className="underline underline-offset-2 hover:text-zinc-300 disabled:opacity-50">{syncing ? 'syncing…' : 'Sync now'}</button> to read your granted collections.</div>
        ) : (
          <div className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-[13px] text-zinc-500">Nothing granted yet — set a collection to <Code>ask</Code> or <Code>auto</Code> in <button type="button" onClick={() => navigate && navigate('credentials')} className="underline underline-offset-2 hover:text-zinc-300">Settings</button>.</div>
        )
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Field value={q} onChange={(e) => setQ(e.target.value)} placeholder="filter…" className="w-full max-w-xs" />
            <div className="flex items-center gap-2.5 text-[12.5px] text-zinc-500">
              <span>{autoN} auto{askN ? ' · ' + askN + ' ask' : ''} · {items.length} reachable</span>
              <span className="text-zinc-600">·</span>
              <span>synced {agoText(st.syncedAt)}</span>
              <button type="button" onClick={sync} disabled={syncing} className="rounded-md border border-white/10 px-2 py-0.5 font-medium text-zinc-300 transition hover:bg-white/5 disabled:opacity-50">{syncing ? 'syncing…' : 'Sync now'}</button>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-white/10">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead className="bg-white/[0.03]"><tr className="text-[11px] uppercase tracking-wide text-zinc-500"><th className="px-3 py-2 font-medium">Account</th><th className="px-3 py-2 font-medium">Username</th><th className="px-3 py-2 font-medium">Access</th><th className="px-3 py-2 font-medium">2FA</th></tr></thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((i) => { const host = (i.hosts && i.hosts[0]) || ''; return (
                  <tr key={i.id} className="hover:bg-white/[0.03]">
                    <td className="px-3 py-2"><div className="font-medium text-zinc-100">{i.item || '(unnamed)'}</div><div className="font-mono text-[11px] text-zinc-500">{host || '—'}</div></td>
                    <td className="px-3 py-2 text-zinc-400">{i.username || '—'}</td>
                    <td className="px-3 py-2"><Badge color={i.tier === 'auto' ? 'lime' : 'amber'}>{i.tier}</Badge></td>
                    <td className="px-3 py-2">{i.hasTotp ? <Badge color="cyan">totp</Badge> : <span className="text-zinc-500">—</span>}</td>
                  </tr>) })}
              </tbody>
            </table>
            {filtered.length === 0 && <div className="px-3 py-6 text-center text-[13px] text-zinc-500">no matches</div>}
          </div>
        </>
      )}
    </div>
  )
}

function AuditFeed({ events }) {
  if (!events) return <div className="flex items-center gap-2 text-[13px] text-zinc-400"><Spinner className="size-4" /> loading…</div>
  if (events.length === 0) return <p className="text-[13px] text-zinc-500">No access events yet. Every fill and value request lands here.</p>
  const resultColor = (e) => (e.result === 'ok' ? 'lime' : e.result === 'denied' ? 'red' : 'zinc')
  return (
    <div className="space-y-1.5">
      {events.map((e, i) => {
        const account = e.item || e.cred; const cn2 = codename(e.session)
        return (
          <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/5 py-1.5 text-[12.5px]">
            <StatusDot color={resultColor(e)} />
            <span className="font-mono text-[11.5px] text-zinc-500">{(e.ts || '').replace('T', ' ').replace('Z', '')}</span>
            <span className="text-zinc-200">{EVENT_LABEL[e.event] || e.event}</span>
            {account && <span className="font-medium text-zinc-100">{account}</span>}
            {e.username && <span className="text-zinc-500">{e.username}</span>}
            {e.hasTotp && <Badge color="cyan">totp</Badge>}
            {e.host && <span className="font-mono text-[11px] text-zinc-400">on {e.host}</span>}
            {e.tier && <TierPill tier={e.tier} />}
            {(e.changes || []).map((c, j) => <span key={j} className="inline-flex items-center gap-1.5"><span className="font-medium text-zinc-100">{c.name}</span><span className="text-zinc-500">{c.from} →</span><span className={cn('font-medium', TIER_INK[c.to] || 'text-zinc-400')}>{c.to}</span></span>)}
            {e.result === 'denied' && <span className="text-rose-400">{e.reason}</span>}
            {e.session === 'ui'
              ? <span className="ml-auto pl-2 font-mono text-[11px] text-zinc-600" title="done from this dashboard">system</span>
              : <span className="ml-auto inline-flex items-center gap-1 pl-2" title={e.session}><span aria-hidden="true" className="text-[11px]">{cn2.emoji}</span><span className="font-mono text-[11px] font-semibold" style={{ color: cn2.hex }}>{cn2.callsign}</span></span>}
          </div>
        )
      })}
    </div>
  )
}

/* ─────────────────────── agent helpers + hints (advanced) ─────────────────── */
// Compact health CARD (dashboard, next to Connection): are the helper calls, the per-site hint
// hook, and the always-on rule wired up? Fix buttons inline; the full reference lives on the
// docs page (navigate('docs')). Self-fetching — drops in anywhere.
function AgentIntegration({ navigate, brokerReady }) {
  const [helper, setHelper] = useState(null)
  const [cfg, setCfg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const loadHelper = useCallback(() => fetch(API + '/state').then((r) => r.json()).then((c) => setHelper(c.helper)).catch(() => {}), [])
  const loadCfg = useCallback(() => fetch(API + '/hints-config').then((r) => r.json()).then(setCfg).catch(() => {}), [])
  /* Re-read when the broker comes up. Both loaders are useCallback([]), so mounting once meant
     these three rows kept showing their pre-install snapshot — and the toggle stayed bound to a
     stale cfg — until a full page reload. brokerReady flips false→true over the WS exactly when
     the daemon finishes installing, which is the moment the rows are supposed to turn green. */
  useEffect(() => { loadHelper(); loadCfg() }, [loadHelper, loadCfg, brokerReady])
  const mf = helper?.moduleFile
  const managed = !!mf?.exists
  const hState = !helper ? null : (managed && mf.current ? 'ok' : managed ? 'outdated' : 'missing')
  const hook = cfg?.hook, ar = cfg?.authRule
  const dot = (s) => (s === 'ok' ? 'lime' : s == null || s === 'missing' ? 'zinc' : 'amber')
  const post = async (p, okNote, after, body) => { setBusy(true); setNote(''); try { const r = await postJSON(p, body); setNote(r.ok ? okNote : (r.error || 'failed')); if (r.ok) await after() } catch { setNote('failed') } finally { setBusy(false) } }
  // ONE toggle governs the whole package (plugin + hook + rule): on = installed
  // and kept current by the module; off = our three files removed.
  const enabled = cfg ? cfg.enabled !== false : true
  const toggle = () => post('/agent-integration', enabled ? 'agent integration removed' : 'agent integration installed', async () => { await loadCfg(); await loadHelper() }, { enabled: !enabled })
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="flex items-baseline gap-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Agent integration</span>
          <button onClick={() => navigate('docs')} className="text-[11px] text-zinc-500 transition hover:text-zinc-200">reference →</button>
        </span>
        <div className="flex items-center gap-2">
          {brokerReady && cfg && <span className={cn('text-[10.5px] font-medium', enabled ? 'text-zinc-400' : 'text-amber-300/90')}>{enabled ? 'shown to every new agent' : 'hidden from new agents'}</span>}
          {brokerReady && cfg && (
            <button type="button" role="switch" aria-checked={enabled} disabled={busy} onClick={toggle}
              title={enabled ? 'Remove the agent integration (plugin + hint hook + rule) — agents stop seeing the broker' : 'Install the agent integration (plugin + hint hook + rule)'}
              className={cn('relative h-[18px] w-8 shrink-0 rounded-full transition-colors disabled:opacity-50', enabled ? '' : 'bg-white/15')} style={enabled ? { background: ACCENT } : undefined}>
              <span className={cn('absolute left-0 top-[2px] size-[14px] rounded-full bg-white shadow transition-transform', enabled ? 'translate-x-[16px]' : 'translate-x-[2px]')} />
            </button>
          )}
        </div>
      </div>
      {brokerReady && cfg && !enabled && <div className="mb-1 text-[11.5px] leading-snug text-amber-300/90">off — agents don't see the broker; toggling on reinstalls all three pieces</div>}
      <div className="divide-y divide-white/5">
        <div className="flex items-start justify-between gap-3 py-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 text-[13px] text-zinc-300"><StatusDot color={dot(hState)} /><span className="min-w-0 truncate">{hState === 'ok' ? 'helper calls' : hState === 'outdated' ? 'helper calls — update' : hState === 'missing' ? (helper?.harnessReady ? 'helper calls — not installed' : 'helper calls — install horse-browser') : 'helper calls…'}</span></div>
            <div className="mt-0.5 pl-[18px] text-[11.5px] leading-snug text-zinc-500">the broker verbs (<span className="cl-mono text-zinc-400">type_secret</span>, <span className="cl-mono text-zinc-400">list_login_profiles</span>…) agents call to reach the vault</div>
          </div>
          {/* no per-row buttons — the package toggle governs; self-heal keeps pieces current while on */}
        </div>
        <div className="flex items-start justify-between gap-3 py-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 text-[13px] text-zinc-300"><StatusDot color={dot(hook?.state)} /><span className="min-w-0 truncate">{hook?.state === 'ok' ? 'per-site hint hook' : hook ? 'per-site hint hook — not installed' : 'per-site hint hook…'}</span></div>
            <div className="mt-0.5 pl-[18px] text-[11.5px] leading-snug text-zinc-500">shows agents a saved login exists when they open a site</div>
          </div>
        </div>
        <div className="flex items-start justify-between gap-3 py-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 text-[13px] text-zinc-300"><StatusDot color={dot(ar?.state)} /><span className="min-w-0 truncate">{!ar ? 'always-on agent rule…' : ar.state === 'foreign' ? 'always-on agent rule — your own file' : ar.state === 'missing' ? 'always-on agent rule — not installed' : ar.state === 'stale' ? 'always-on agent rule — outdated' : 'always-on agent rule'}</span></div>
            <div className="mt-0.5 pl-[18px] text-[11.5px] leading-snug text-zinc-500">{ar?.state === 'foreign' ? 'a rule file we didn’t write is here — Replace to manage it here' : 'loads into every Claude Code session at start — use the broker, never type a secret yourself'}</div>
          </div>
          {ar?.state === 'foreign' && <Btn tone="outline" disabled={busy} onClick={() => post('/authrule/install', 'rule installed', loadCfg)}>Replace</Btn>}
        </div>
      </div>
      {note && <div className="mt-2 text-[11.5px] text-zinc-500">{note}</div>}
      {/* ── the HANDOFF — its own quiet section under a rule, not a fourth card ── */}
      {brokerReady && (
        <div className="mt-3.5 border-t border-white/[0.07] pt-3">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="text-[14px]">🐴</span>
            <button onClick={() => navigate('skill')} className="min-w-0 truncate text-left text-[12.5px] font-semibold text-zinc-200 transition hover:text-white">Hand the login skill to an agent →</button>
            <span className="ml-auto shrink-0"><CopyBoom value={`I'm giving you a skill — read it and use it: ${(typeof window !== 'undefined' ? window.location.origin : '') + API + '/skill.md'}`} title="Copy the login-skill prompt" /></span>
          </div>
          <p className="mt-1 pl-[22px] text-[11.5px] leading-snug text-zinc-500">teaches an agent to sign into sites through the broker — <span className="cl-mono text-zinc-400">list_login_profiles</span>, <span className="cl-mono text-zinc-400">type_secret</span>, and the 🐴 hints</p>
        </div>
      )}
    </div>
  )
}


// "hand this to an agent" — the login skill, in a reading modal
function AgentSpark() {
  return <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0"><path fill="currentColor" d="M11 3C11.4 9 13.6 11.1 19.5 12.5C13.6 13.9 11.4 16 11 22C10.6 16 8.4 13.9 2.5 12.5C8.4 11.1 10.6 9 11 3Z" /></svg>
}
export function Skill({ self, navigate }) {
  setApi(self)
  const [md, setMd] = useState(null)
  const [raw, setRaw] = useState(false)
  useEffect(() => { fetch(API + '/skill.md').then((r) => r.text()).then(setMd).catch(() => setMd('(could not load the skill)')) }, [])
  const fullUrl = (typeof window !== 'undefined' ? window.location.origin : '') + API + '/skill.md'
  const prompt = `I'm giving you a skill — read it and use it: ${fullUrl}`
  const seg = (a) => cn('rounded-md px-2.5 py-1 text-[11px] font-semibold transition', a ? 'bg-white/15 text-zinc-50' : 'text-zinc-400 hover:text-zinc-200')
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <button onClick={() => navigate('')} className="inline-flex items-center gap-1.5 text-[13px] text-zinc-400 transition hover:text-zinc-100">← back to the board</button>
        <span className="flex items-center gap-0.5 rounded-lg bg-white/[0.08] p-0.5"><button onClick={() => setRaw(false)} className={seg(!raw)}>Pretty</button><button onClick={() => setRaw(true)} className={seg(raw)}>Raw</button></span>
      </div>

      <div className="flex items-center gap-2.5">
        <span style={{ color: ACCENT }}><AgentSpark /></span>
        <h1 className="text-[22px] font-semibold tracking-tight text-white">Hand this to an agent</h1>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3.5">
        <div className="text-[12.5px] text-zinc-400">Generated live with this machine's URL. Paste this into a fresh Claude Code session:</div>
        <div className="mt-2.5 flex items-center gap-2.5 rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10">
          <span className="shrink-0 text-zinc-600">$</span>
          <code className="cl-mono min-w-0 flex-1 truncate text-[12px] text-zinc-200">{prompt}</code>
          <CopyBoom value={prompt} title="Copy the agent prompt" />
        </div>
      </div>

      <div className="mt-8">
        {md == null ? <div className="flex items-center gap-2 text-[13px] text-zinc-400"><Spinner className="size-4" /> loading…</div>
          : raw ? <pre className="cl-mono whitespace-pre-wrap break-words text-[12px] leading-relaxed text-zinc-300">{md}</pre>
          : <Markdown src={md} />}
      </div>

      <div className="mt-12"><button onClick={() => navigate('')} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-zinc-300 transition hover:text-white">← back to the board</button></div>
    </div>
  )
}

/* ─────────── dashboard helpers: quick account search + recent access ──────── */
// Lazy account search — hits /broker/reachable (the non-secret cache, no unlock) on first
// focus. Search reads the cache, so it's instant and never warms the vault.
function QuickSearch({ navigate }) {
  const [q, setQ] = useState('')
  const [items, setItems] = useState(null)
  const [loading, setLoading] = useState(false)
  /* err: without this a failed load left items null, and the "no matches" branch below then
     told the user the account does not exist — a false negative on the exact question this
     widget answers. "Couldn't load" and "not in your granted collections" must not look alike. */
  const [err, setErr] = useState(null)
  const load = () => {
    if (items || loading) return
    setLoading(true); setErr(null)
    fetch(API + '/broker/reachable').then((r) => r.json())
      .then((r) => { if (r && r.ok) setItems(r.items || []); else setErr((r && (r.error || r.reason)) || 'the account list could not be read') })
      .catch((e) => setErr(String((e && e.message) || e)))
      .finally(() => setLoading(false))
  }
  const matches = q && items ? items.filter((i) => ((i.item || '') + ' ' + (i.username || '') + ' ' + (i.hosts || []).join(' ')).toLowerCase().includes(q.toLowerCase())) : []
  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 focus-within:border-white/25">
        <Icon name="search" size={13} className="shrink-0 text-zinc-500" />
        <input value={q} onFocus={load} onChange={(e) => setQ(e.target.value)} placeholder="search reachable accounts…" spellCheck={false} className="w-full bg-transparent text-[12.5px] text-zinc-200 outline-none placeholder:text-zinc-500" />
        {loading && <Spinner className="size-3.5 shrink-0 text-zinc-500" />}
      </div>
      {q && (
        /* in-flow, not an overlay — the card GROWS so results always have room */
        <div className="mt-1.5 overflow-hidden rounded-lg border border-white/10 bg-zinc-900 shadow-xl">
          {loading && !items ? (
            <div className="px-3 py-3 text-[12px] text-zinc-500">searching…</div>
          ) : err ? (
            <div className="px-3 py-3 text-[12px] text-amber-300">Couldn't load the account list — this is not a "no match". <span className="text-amber-300/70">{err}</span></div>
          ) : matches.length === 0 ? (
            <div className="px-3 py-3 text-[12px] text-zinc-500">no accounts match “{q}”.</div>
          ) : (
            <>
              {matches.slice(0, 6).map((i) => (
                <button key={i.id} onClick={() => navigate('accounts')} className="flex w-full items-center gap-2 border-b border-white/5 px-3 py-2 text-left last:border-0 hover:bg-white/[0.04]">
                  <span className="min-w-0 flex-1"><span className="text-[12.5px] font-medium text-zinc-100">{i.item || '(unnamed)'}</span> <span className="font-mono text-[11px] text-zinc-500">{(i.hosts && i.hosts[0]) || ''}</span></span>
                  <Badge color={i.tier === 'auto' ? 'lime' : 'amber'}>{i.tier}</Badge>
                </button>
              ))}
              <button onClick={() => navigate('accounts')} className="block w-full bg-white/[0.02] px-3 py-2 text-left text-[11.5px] text-zinc-400 transition hover:text-zinc-200">{matches.length} match{matches.length === 1 ? '' : 'es'} · open all accounts →</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// relative time, exact on hover; the audit ts is ISO ("…T…Z") or "YYYY-MM-DD HH:MM:SS"
function ago(ts) {
  const t = Date.parse((ts || '').replace(' ', 'T'))
  if (!isFinite(t)) return ''
  const s = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60); if (h < 48) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}
const exactTs = (ts) => (ts || '').replace('T', ' ').replace(/\.\d+/, '').replace('Z', ' UTC')

// one rich access-log row (dashboard preview) — event · account · username · 2FA ·
// website · tier · result all on ONE line; time · session codename on the right.
function AuditRow({ e }) {
  const account = e.item || e.cred
  const website = e.host || (e.hosts && e.hosts[0])
  const cn2 = codename(e.session)
  const color = e.result === 'ok' ? 'lime' : e.result === 'denied' ? 'red' : 'zinc'
  return (
    <div className="flex items-start gap-3 py-2 text-[12px]">
      <span className="mt-1"><StatusDot color={color} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-medium text-zinc-200">{EVENT_LABEL[e.event] || e.event}</span>
          {account && <span className="font-semibold text-zinc-50">{account}</span>}
          {e.username && <span className="font-mono text-[11px] text-zinc-400">{e.username}</span>}
          {e.hasTotp && <Badge color="cyan">2FA</Badge>}
          {website && <span className="font-mono text-[11px] text-zinc-400">on {website}</span>}
          {e.tier && <TierPill tier={e.tier} />}
          {e.result === 'denied' && <span className="text-rose-400">· {e.reason}</span>}
          {(e.changes || []).map((c, j) => <span key={j} className="inline-flex items-center gap-1"><span className="text-zinc-300">{c.name}</span><span className="text-zinc-500">{c.from} →</span><span className={cn('font-medium', TIER_INK[c.to] || 'text-zinc-400')}>{c.to}</span></span>)}
        </div>
      </div>
      <div className="mt-0.5 flex shrink-0 items-center gap-2">
        <span title={exactTs(e.ts)} className="whitespace-nowrap text-[11px] text-zinc-500">{ago(e.ts)}</span>
        {e.session === 'ui'
          ? <span className="font-mono text-[10.5px] text-zinc-600" title="done from this dashboard">system</span>
          : <span className="inline-flex items-center gap-1" title={e.session}><span aria-hidden="true" className="text-[11px]">{cn2.emoji}</span><span className="font-mono text-[10.5px] font-semibold" style={{ color: cn2.hex }}>{cn2.callsign}</span></span>}
      </div>
    </div>
  )
}
function RecentAccess({ self, navigate }) {
  const [events, setEvents] = useState(null)
  useEffect(() => {
    let alive = true
    fetch(API + '/broker/audit?n=8').then((r) => r.json()).then((r) => { if (alive && r && r.ok) setEvents((r.events || []).slice().reverse().slice(0, 8)) }).catch(() => {})
    const unsub = self.subscribe((f) => { if (f.type === 'broker-audit' && f.event && alive) setEvents((e) => [f.event, ...(e || [])].slice(0, 8)) })
    return () => { alive = false; unsub && unsub() }
  }, [])
  return (
    <div className="mt-5 border-t border-white/10 pt-4">
      <div className="flex items-center justify-between gap-3">
        <Label>Recent access</Label>
        <button onClick={() => navigate('activity')} className="text-[12px] text-zinc-400 transition hover:text-zinc-100">view the full log →</button>
      </div>
      {events === null ? <div className="mt-2 flex items-center gap-2 text-[12px] text-zinc-500"><Spinner className="size-3.5" /> loading…</div>
        : events.length === 0 ? <div className="mt-2 text-[12px] text-zinc-500">No access events yet. Every fill and value request lands here.</div>
        : <div className="mt-1.5 divide-y divide-white/5">{events.map((e, i) => <AuditRow key={i} e={e} />)}</div>}
    </div>
  )
}

/* ──────────────────────────── the board dashboard ──────────────────────────
 * The whole auth system, live, on the control board: connection details, the
 * access stats + a quick account search, and a recent-access preview. Reads
 * /broker/status + /broker/groups (cached, NO vault unlock). Deep pages: broker
 * Settings, Reachable accounts, and the full Access log. */
export function AuthPanel({ self, navigate }) {
  setApi(self)
  const [bw, setBw] = useState(null)
  const [grp, setGrp] = useState(null)
  useEffect(() => {
    let busy = false
    let alive = true
    /* gen counts applied updates. The daemon PUSHES broker-status the moment anything changes,
       so a frame that lands while a poll is in flight is always fresher than that poll's
       response — without this the slow response wins by arriving last and rolls the connection
       ladder backwards (e.g. back to "cold" just after the vault warmed). */
    let gen = 0
    const apply = (v) => { gen += 1; setBw(v) }
    const load = async () => {
      if (busy) return
      busy = true
      const startedAt = gen
      try {
        const r = await fetch(API + '/broker/status', { signal: AbortSignal.timeout(10000) })
        if (!alive || !r.ok) return
        const j = await r.json()
        if (!alive || gen !== startedAt) return   // something newer already landed — keep it
        apply(j)
      } catch { if (alive) setBw((b) => b || { installed: false }) } finally { busy = false }
    }
    load()
    /* Opening the board warms/slides the vault so hints are ready for agents: a silent slide when
       already warm, a Touch-ID unlock when it has gone cold. Once per mount, not on the poll.
       'if-stale' also pulls from Bitwarden — but the daemon gates that to at most once an hour
       across every trigger and every tab, so opening the board ten times pulls once. */
    postJSON('/broker/refresh', { pull: 'if-stale' }).then(() => load()).catch(() => {})
    const unsub = self.subscribe((f) => { if (f.type === 'broker-status' && f.status && alive) apply(f.status) })
    const t = setInterval(() => { if (!document.hidden) load() }, 45000)
    return () => { alive = false; unsub && unsub(); clearInterval(t) }
  }, [])
  useEffect(() => {
    let alive = true
    const load = () => fetch(API + '/broker/groups').then((r) => r.json()).then((r) => {
      if (!alive || !r) return
      /* needsScan = the vault has never been scanned, so these numbers are unknowable rather
         than slow. Bailing left the headline tallies showing "…" forever with no way out —
         and the Rescan that fixes it lives on another page. Say so, and offer the trip. */
      if (!r.ok || r.needsScan) { setGrp({ needsScan: !!r.needsScan }); return }
      const granted = (r.groups || []).filter((g) => g.tier && g.tier !== 'off' && g.tier !== 'never')
      setGrp({ accounts: granted.reduce((n, g) => n + (g.count || 0), 0), collections: granted.length,
        auto: granted.filter((g) => g.tier === 'auto').reduce((n, g) => n + (g.count || 0), 0),
        ask: granted.filter((g) => g.tier === 'ask').reduce((n, g) => n + (g.count || 0), 0) })
    }).catch(() => {})
    load()
    const unsub = self.subscribe((f) => { if (f.type === 'broker-status') load() })
    return () => { alive = false; unsub && unsub() }
  }, [])

  const v = bw?.vault || {}
  const ready = !!(bw && bw.installed && v.hasSession && v.bwStatus !== 'no-cli' && v.bwStatus !== 'unauthenticated')
  const grantedCols = bw?.granted
  const nothingGranted = ready && grantedCols === 0
  const setup = !bw ? false : !bw.installed || v.bwStatus === 'no-cli' || v.bwStatus === 'unauthenticated' || !v.hasSession || nothingGranted || !ready
  const reloadBw = () => { fetch(API + '/broker/status').then((r) => r.json()).then(setBw).catch(() => {}) }
  const lockVault = async () => { try { await postJSON('/broker/lock-soft') } catch {} ; reloadBw() }

  return (
    /* no overflow-hidden — the copy booms (header chip, agent handovers) must escape the panel */
    <div className="rounded-2xl border border-emerald-400/20 bg-white/[0.03] p-5 sm:p-6">
      <div className="flex flex-wrap items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-400/10"><Icon name="key-round" size={24} style={{ color: ACCENT }} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[16px] font-semibold text-zinc-50">Bitwarden broker</span>
            <Badge color="violet">enforced</Badge>
            {bw?.policyOk === false && <Badge color="red">policy tampered</Badge>}
          </div>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-zinc-400">Agents sign into any site without ever seeing the password — a signed local daemon types it over CDP, gated by the Bitwarden collection, the tab’s origin, and a macOS approval.</p>
          {/* NO status line — the connection ladder and access panel below carry the state */}
        </div>
      </div>

      {bw && (
        <>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {/* connection — the whole daemon setup happens right here on the board */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Connection</span>
                {bw?.installed && (
                  <span className="flex items-center gap-2.5 text-[11px]">
                    <button onClick={lockVault} title="Drops the unlocked session but keeps the token — re-warms silently on next use, no reconnect." className="text-zinc-500 underline decoration-zinc-700 underline-offset-2 transition hover:text-zinc-200">lock vault</button>
                    {ready && <DisconnectLink name="Bitwarden" endpoint="/broker/disconnect" warn="Forgets the session token, drops the vault session, clears grants + log. The daemon stays installed." lock onDone={reloadBw} />}
                  </span>
                )}
              </div>
              <BrokerStatus status={bw} />
              {!bw.installed && <CredFeatureSetup status={bw} navigate={navigate} />}
              {bw.installed && bw.vault?.bwStatus === 'no-cli' && (
                <div className="mt-4 border-t border-white/5 pt-3"><div className="mb-1.5 text-[12px] text-zinc-400">Install the Bitwarden CLI:</div><CopyLine text="brew install bitwarden-cli" /></div>
              )}
            </div>
            {/* agent integration — setup health, next to the connection */}
            <AgentIntegration navigate={navigate} brokerReady={!!bw.installed} />
          </div>
          {/* connect the vault — appears once the daemon is up and no token is minted yet */}
          <div className="mt-4 empty:hidden"><ConnectBox status={bw} setupCmd={bw.setupCmd} cli={bw.cli} /></div>
          {/* access — full width below */}
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Access</span>
              <span className="flex items-center gap-4">
                {ready && !nothingGranted && <button onClick={() => navigate('accounts')} className="text-[12px] text-zinc-400 transition hover:text-zinc-100">all accounts →</button>}
                {/* THE regular action on this panel — granting/editing access */}
                {bw?.installed && <button onClick={() => navigate('credentials')} className="rounded-full px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:brightness-110" style={{ background: ACCENT }}>Grant access →</button>}
              </span>
            </div>
            {ready && !nothingGranted ? (
              <>
                {/* one compact box instead of four wide tiles */}
                {grp && grp.needsScan ? (
                  <div className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-2.5 text-[12px] text-zinc-400">
                    <span>Collections haven't been scanned yet, so the counts are unknown —</span>
                    <button type="button" onClick={() => navigate('credentials')} className="font-medium text-zinc-200 underline underline-offset-2 hover:text-white">scan them in Settings</button>
                  </div>
                ) : (
                <div className="inline-flex flex-wrap items-baseline gap-x-2.5 gap-y-1 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-2.5">
                  <span className="text-[20px] font-semibold tabular-nums text-emerald-300">{grp ? grp.accounts : '…'}</span>
                  <span className="text-[12px] text-zinc-400">accounts reachable</span>
                  <span className="text-zinc-600">·</span>
                  <span className="text-[12px] text-zinc-400"><span className="font-semibold tabular-nums text-zinc-200">{grp ? grp.collections : (grantedCols ?? '…')}</span> collection{(grp ? grp.collections : grantedCols) === 1 ? '' : 's'} granted</span>
                  <span className="text-zinc-600">·</span>
                  <span className="text-[12px] text-zinc-400"><span className="font-semibold tabular-nums text-zinc-200">{grp ? grp.auto : '…'}</span> auto</span>
                  <span className="text-zinc-600">·</span>
                  <span className="text-[12px] text-zinc-400"><span className="font-semibold tabular-nums text-amber-300">{grp ? grp.ask : '…'}</span> ask</span>
                </div>
                )}
                <div className="mt-3"><QuickSearch navigate={navigate} /></div>
              </>
            ) : (
              <div className="py-3 text-[12.5px] text-zinc-400">{nothingGranted ? <>Nothing granted yet — grant a collection in <button onClick={() => navigate('credentials')} className="underline underline-offset-2 hover:text-zinc-200">Settings</button> to let agents in.</> : !bw.installed ? 'build the daemon and connect the vault, then grant a collection.' : 'connect the vault to grant access.'}</div>
            )}
          </div>
        </>
      )}

      {ready && <RecentAccess self={self} navigate={navigate} />}
    </div>
  )
}

/* ─────────────────────────── page: broker settings ─────────────────────────
 * Connection management + grant-by-collection + the agent helpers/hints. The
 * reachable-accounts list and the access log are their own pages. */
export function Settings({ self, navigate }) {
  setApi(self)
  const [status, setStatus] = useState(null)
  const [policy, setPolicy] = useState(null)
  const [groups, setGroups] = useState(null)
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState(null)

  const loadStatus = useCallback(async () => { try { setStatus(await fetch(API + '/broker/status').then((r) => r.json())) } catch {} }, [])
  const loadPolicy = useCallback(async () => { try { const r = await fetch(API + '/broker/policy').then((x) => x.json()); if (r.ok) setPolicy(r.policy) } catch {} }, [])
  const loadCachedGroups = useCallback(async () => { try { const r = await fetch(API + '/broker/groups').then((x) => x.json()); if (r.ok && !r.needsScan) setGroups(r.groups || []) } catch {} }, [])
  useEffect(() => { loadStatus(); loadPolicy(); loadCachedGroups() }, [loadStatus, loadPolicy, loadCachedGroups])
  useEffect(() => {
    const unsub = self.subscribe((f) => { if (f.type === 'broker-status' && f.status) setStatus(f.status) })
    const t = setInterval(() => { if (!document.hidden) loadStatus() }, 45000)
    return () => { unsub(); clearInterval(t) }
  }, [loadStatus])

  /* No catch/else meant a locked vault, a cancelled Touch ID, or a broker that's down all
     ended with the spinner stopping and the table still saying "Load your collections" —
     no reason given. A thrown fetch also escaped as an unhandled rejection, since the
     onClick never awaits this. */
  const [groupsErr, setGroupsErr] = useState(null)
  const loadGroups = async () => {
    setLoadingGroups(true); setGroupsErr(null)
    try {
      const r = await postJSON('/broker/refresh', { pull: true })   // explicit Rescan: get the server's latest
      if (r && r.ok) setGroups(r.groups || [])
      else setGroupsErr((r && (r.error || r.reason)) || 'the vault could not be read')
    } catch (e) { setGroupsErr(String((e && e.message) || e)) }
    finally { setLoadingGroups(false) }
  }
  /* The save may sit on a Touch ID prompt, and the "saved" flash clears on a 4s timer — both can
     land after the page is gone, so both are guarded and the timer is cancelled on unmount. */
  const mounted = useRef(true)
  const msgTimer = useRef(null)
  useEffect(() => () => { mounted.current = false; if (msgTimer.current) clearTimeout(msgTimer.current) }, [])
  const save = async (body) => {
    setSaving(true); setSaveMsg(null)
    try {
      const r = await postJSON('/broker/policy', body)
      if (!mounted.current) return
      if (r && r.ok) { setPolicy(r.policy); setSaveMsg({ ok: true, text: 'saved' }) }
      else setSaveMsg({ ok: false, text: (r && (r.error || r.reason)) || 'failed' })
    } catch (e) {
      if (mounted.current) setSaveMsg({ ok: false, text: String((e && e.message) || e) })
    } finally {
      if (mounted.current) {
        setSaving(false)
        if (msgTimer.current) clearTimeout(msgTimer.current)
        msgTimer.current = setTimeout(() => { if (mounted.current) setSaveMsg(null) }, 4000)
      }
    }
  }

  const v = status?.vault
  const badge = !status ? null
    : !status.installed ? <Badge color="zinc">not built</Badge>
    : v?.bwStatus === 'no-cli' ? <Badge color="red">no cli</Badge>
    : v?.bwStatus === 'unauthenticated' ? <Badge color="amber">not logged in</Badge>
    : !v?.hasSession ? <Badge color="amber">setup</Badge>
    : <Badge color="lime">connected</Badge>
  const subtitle = !status ? 'checking…' : !status.installed ? 'daemon not built' : v?.bwStatus === 'no-cli' ? 'bitwarden cli not installed' : v?.bwStatus === 'unauthenticated' ? 'bw not logged in' : !v?.hasSession ? 'vault token not connected' : v?.warm ? 'agent broker · vault unlocked' : 'agent broker · vault locked'

  return (
    <>
      {/* this page has ONE job — access by collection (accounts + log live off the board) */}
      <div className="mb-6">
        <button onClick={() => navigate('')} className="inline-flex items-center gap-1.5 text-[13px] text-zinc-400 transition hover:text-zinc-100">← back to the board</button>
      </div>

      {/* connection management lives on the DASHBOARD's connection box — this
          page is heading toward one job: access by collection */}
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <img src={`${API}/images/bitwarden.png`} alt="" aria-hidden="true" onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} className="size-10 shrink-0 object-contain" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h1 className="text-[22px] font-semibold tracking-tight text-white">Broker settings</h1>{badge}<Badge color="violet">enforced</Badge></div>
            <div className="font-mono text-[12px] text-zinc-500">{subtitle}</div>
          </div>
        </div>
        <p className="mt-3 max-w-2xl text-[13.5px] leading-relaxed text-zinc-400">Grant agents a Bitwarden <Strong>collection</Strong> (or folder), not individual logins — every item inside inherits the tier, and moving a password in or out of the collection is how you change its access. <Strong>auto</Strong> = silent; <Strong>ask</Strong> = macOS approval each use. <Strong>Only granted collections are reachable</Strong> — every other item in your vault is a hard deny, not even enumerable, so your personal logins are never silently available.</p>
      </div>

      {status && status.policyOk === false && (
        <div className="mt-8 rounded-xl border border-rose-500/50 bg-rose-500/[0.07] p-4">
          <div className="flex items-start gap-2.5"><span className="mt-0.5"><StatusDot color="red" /></span><div className="text-[13px] text-rose-300"><Strong className="text-rose-200">Policy integrity check failed.</Strong> <Code>policy.json</Code> no longer matches its signature — it was edited outside the app, or the daemon binary changed. <Strong className="text-rose-200">All grants are suspended</Strong> until you re-save below. If you didn't change anything, treat this as a tamper alert.</div></div>
        </div>
      )}

      <div className="mt-8"><GroupPicker policy={policy} groups={groups} onLoadGroups={loadGroups} loadingGroups={loadingGroups} groupsErr={groupsErr} onSave={save} saving={saving} saveMsg={saveMsg} disabled={!!status && !status.installed} /></div>

      <div className="mt-14"><button onClick={() => navigate('')} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-zinc-300 transition hover:text-white">← back to the board</button></div>
    </>
  )
}

/* ─────────────────────────── page: reachable accounts ──────────────────────── */
export function Accounts({ self, navigate }) {
  setApi(self)
  return (
    <>
      {/* only the back link — these pages don't route sideways */}
      <div className="mb-6">
        <button onClick={() => navigate('')} className="inline-flex items-center gap-1.5 text-[13px] text-zinc-400 transition hover:text-zinc-100">← back to the board</button>
      </div>
      <Reveal><ReachableSection navigate={navigate} /></Reveal>
      <div className="mt-14"><button onClick={() => navigate('')} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-zinc-300 transition hover:text-white">← back to the board</button></div>
    </>
  )
}

/* ─────────────────────────── page: access log ──────────────────────────────── */
export function Activity({ self, navigate }) {
  setApi(self)
  const [audit, setAudit] = useState(null)
  useEffect(() => {
    let alive = true
    /* The initial GET REPLACES the list, so a live event that arrived while it was in flight was
       dropped — the one case where the log silently loses a credential access. Keep those and
       merge, de-duped: the pushed frame and the file line are the same record, so key on the
       fields that identify it (Swift dicts are unordered, so JSON text can't be the key). */
    let pending = []
    let loaded = false
    const keyOf = (e) => [e.ts, e.event, e.cred, e.session, e.result, e.host].join('|')
    fetch(API + '/broker/audit?n=200').then((r) => r.json()).then((r) => {
      if (!alive || !r || !r.ok) return
      const base = (r.events || []).slice().reverse()
      const seen = new Set(base.map(keyOf))
      setAudit([...pending.filter((e) => !seen.has(keyOf(e))), ...base].slice(0, 300))
      loaded = true; pending = []
    }).catch(() => {})
    const unsub = self.subscribe((f) => {
      if (f.type !== 'broker-audit' || !f.event || !alive) return
      if (!loaded) pending = [f.event, ...pending]
      setAudit((a) => [f.event, ...(a || [])].slice(0, 300))
    })
    return () => { alive = false; unsub && unsub() }
  }, [])
  return (
    <>
      {/* only the back link — these pages don't route sideways */}
      <div className="mb-6">
        <button onClick={() => navigate('')} className="inline-flex items-center gap-1.5 text-[13px] text-zinc-400 transition hover:text-zinc-100">← back to the board</button>
      </div>
      <Reveal>
        <Label>Access log</Label>
        <p className="mt-1 mb-3 max-w-2xl text-[12.5px] text-zinc-500">Every credential request — allowed or denied — with the account, the site it was used on, the tier, and the requesting session. Live.</p>
        <AuditFeed events={audit} />
      </Reveal>
      <div className="mt-14"><button onClick={() => navigate('')} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-zinc-300 transition hover:text-white">← back to the board</button></div>
    </>
  )
}
