import { Heading, Subheading, Text, Strong, Code, Badge, Button, Divider, Link, Input, Textarea, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Alert, AlertActions, AlertDescription, AlertTitle } from '@atelier/kit'

// HB Auth — the credentials & login-methods manager for Horse Browser. Sibling of
// the `browser` (how the machine works) and `hb-stealth` (passing unnoticed)
// modules; this one is "getting in". meta.chrome pins catalyst-chrome (@atelier/kit).
export const meta = {
  name: 'HB Auth',
  icon: 'key-round',
  chrome: 'catalyst-chrome',
}

const { useState, useEffect, useCallback, useMemo, useRef } = React

const self = window.__atelier.self(import.meta.url)
const API = self.api
const ACCENT = '#7c5cff'

/* ---------------------------------------------------------------- primitives */
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true } catch { return false }
}
async function postJSON(path, body) {
  return fetch(API + path, {
    method: 'POST',
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  }).then((r) => r.json())
}
function ago(ms) {
  if (!ms) return ''
  const s = Math.round((Date.now() - ms) / 1000)
  if (s < 60) return 'just now'
  const m = Math.round(s / 60); if (m < 60) return m + 'm ago'
  const h = Math.round(m / 60); if (h < 24) return h + 'h ago'
  return Math.round(h / 24) + 'd ago'
}
// Inject a <style> once per id — replaces the copy-pasted guard the browser module had 4×.
function useStyleOnce(id, css) {
  useEffect(() => {
    if (document.getElementById(id)) return
    const el = document.createElement('style'); el.id = id; el.textContent = css
    document.head.appendChild(el)
  }, [id, css])
}
function usePoll(fn, ms) {
  const ref = useRef(fn); ref.current = fn
  useEffect(() => { const t = setInterval(() => ref.current(), ms); return () => clearInterval(t) }, [ms])
}

/* ---------------------------------------------------------- sparkle + boom UI */
function AgentSpark() {
  useStyleOnce('ha-spark-kf', '@keyframes haSpark{0%,100%{opacity:.5;transform:scale(.8) rotate(0deg)}50%{opacity:1;transform:scale(1) rotate(45deg)}}@media(prefers-reduced-motion:reduce){.ha-spark{animation:none!important;opacity:1!important}}')
  const star = (delay) => ({ transformBox: 'fill-box', transformOrigin: 'center', animation: `haSpark 2.8s ease-in-out ${delay} infinite` })
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <path className="ha-spark" style={star('0s')} fill="currentColor" d="M11 3C11.4 9 13.6 11.1 19.5 12.5C13.6 13.9 11.4 16 11 22C10.6 16 8.4 13.9 2.5 12.5C8.4 11.1 10.6 9 11 3Z" />
      <path className="ha-spark" style={star('.9s')} fill="currentColor" d="M18.6 2.2C18.75 4.1 19.5 4.85 21.4 5C19.5 5.15 18.75 5.9 18.6 7.8C18.45 5.9 17.7 5.15 15.8 5C17.7 4.85 18.45 4.1 18.6 2.2Z" />
    </svg>
  )
}

const CB_CSS = `
.ha-cb__copy,.ha-cb__check{position:absolute;inset:0;width:100%;height:100%}
.ha-cb__copy{transition:opacity .18s ease,transform .18s ease}
.ha-cb__check{fill:none;stroke:${ACCENT};stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:26;stroke-dashoffset:26;opacity:0;transform:scale(.5)}
.ha-cb.is-boom .ha-cb__copy{opacity:0;transform:scale(.4)}
.ha-cb.is-boom .ha-cb__check{opacity:1;transform:scale(1);stroke-dashoffset:0;transition:stroke-dashoffset .45s cubic-bezier(.16,1,.3,1) .06s,opacity .12s ease,transform .3s cubic-bezier(.16,1,.3,1)}
`
function CopyBoom({ value, title = 'Copy' }) {
  const [boom, setBoom] = useState(false)
  useStyleOnce('ha-boom-kf', CB_CSS)
  const onCopy = async (e) => {
    e.preventDefault(); e.stopPropagation()
    if (!(await copyText(typeof value === 'function' ? value() : value))) return
    setBoom(false); requestAnimationFrame(() => requestAnimationFrame(() => setBoom(true)))
    setTimeout(() => setBoom(false), 1500)
  }
  return (
    <button type="button" onClick={onCopy} aria-label={title} title={boom ? 'Copied!' : title}
      className={'ha-cb relative inline-flex size-[15px] shrink-0 items-center justify-center align-[-3px] text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300' + (boom ? ' is-boom' : '')}>
      <svg className="ha-cb__copy" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" />
      </svg>
      <svg className="ha-cb__check" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
    </button>
  )
}

function CopyBox({ code, className = '' }) {
  const [copied, setCopied] = useState(false)
  const copy = useCallback(() => { copyText(code).then((ok) => { if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1200) } }) }, [code])
  return (
    <div className={'group relative my-3 ' + className}>
      <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-3 pr-12 font-mono text-[11.5px] leading-relaxed text-zinc-200 whitespace-pre dark:bg-black">{code}</pre>
      <button onClick={copy} className="absolute right-2 top-2 rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-medium text-zinc-300 opacity-0 transition group-hover:opacity-100 hover:bg-white/20">
        {copied ? 'copied' : 'copy'}
      </button>
    </div>
  )
}

function CopyName({ value, title = 'Copy the item name' }) {
  const [copied, setCopied] = useState(false)
  const copy = (e) => { e.stopPropagation(); copyText(value).then((ok) => { if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1000) } }) }
  return (
    <button type="button" onClick={copy} title={title} className="rounded-md px-2 py-0.5 text-[11px] font-medium text-zinc-400 transition hover:bg-zinc-950/5 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200">
      {copied ? 'copied' : 'copy'}
    </button>
  )
}

function StatusDot({ color }) {
  const map = { lime: 'bg-lime-500', amber: 'bg-amber-500', red: 'bg-red-500', sky: 'bg-sky-500', zinc: 'bg-zinc-400' }
  return <span className={`inline-block size-2 rounded-full ${map[color] || map.zinc}`} />
}

// An editorial section marker: a hairline accent tick + a tracked mono eyebrow.
function Label({ children }) {
  return (
    <div className="flex items-center gap-2.5">
      <span aria-hidden className="inline-block h-3 w-px" style={{ background: ACCENT }} />
      <span className="font-mono text-[10.5px] font-medium uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500">{children}</span>
    </div>
  )
}

function Toggle({ on, disabled, onClick }) {
  return (
    <button
      type="button" role="switch" aria-checked={!!on} disabled={disabled} onClick={onClick}
      className={'relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full transition-colors ' +
        (disabled ? 'cursor-not-allowed opacity-50 ' : 'cursor-pointer ') + (on ? '' : 'bg-zinc-300 dark:bg-zinc-600')}
      style={on ? { background: ACCENT } : undefined}
    >
      <span className={'inline-block h-[16px] w-[16px] transform rounded-full bg-white shadow transition-transform ' + (on ? 'translate-x-[19px]' : 'translate-x-[3px]')} />
    </button>
  )
}

/* ---------------------------------------------------------------- status atoms */
const STATUS_META = {
  untested: { color: 'zinc', label: 'untested' },
  verified: { color: 'lime', label: 'verified' },
  '2fa-blocked': { color: 'amber', label: '2FA blocked' },
  broken: { color: 'red', label: 'broken' },
}
function StatusBadge({ status }) {
  const st = status || {}
  const m = STATUS_META[st.state] || STATUS_META.untested
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge color={m.color}>{m.label}</Badge>
      {st.lastVerified && st.state === 'verified' && <span className="font-mono text-[10.5px] text-zinc-400">{ago(st.lastVerified)}</span>}
    </span>
  )
}
function MethodBadges({ methods }) {
  const m = methods || {}
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge color="zinc">pw</Badge>
      {m.totp && <Badge color="lime">totp</Badge>}
    </span>
  )
}

/* --------------------------------------------------------------- masthead */
function PageMenu({ active, navigate }) {
  const items = [['', 'Overview'], ['accounts', 'Accounts'], ['methods', 'Methods']]
  return (
    <nav className="flex overflow-hidden rounded-lg border border-zinc-950/10 bg-white/60 backdrop-blur dark:border-white/10 dark:bg-zinc-900/50">
      {items.map(([k, label], i) => {
        const on = active === k
        return (
          <button key={k || 'accounts'} type="button" onClick={() => navigate(k)}
            className={'flex items-baseline gap-1.5 px-3 py-1.5 text-[12.5px] font-medium transition ' + (on ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white')}>
            <span className={'font-mono text-[9.5px] tabular-nums ' + (on ? 'opacity-60' : 'opacity-45')}>{String(i + 1).padStart(2, '0')}</span>
            {label}
          </button>
        )
      })}
    </nav>
  )
}

const KEY_CSS = `
@keyframes haKey{0%,100%{opacity:var(--ha-o);transform:translateY(0)}12%{opacity:var(--ha-oo);transform:translateY(-3px)}26%{opacity:var(--ha-o);transform:translateY(0)}}
.ha-key{animation:haKey 3.6s ease-in-out var(--ha-d) infinite}
@media(prefers-reduced-motion:reduce){.ha-key{animation:none!important}}
`
function KeyTrail() {
  useStyleOnce('ha-key-kf', KEY_CSS)
  const ghosts = [0.1, 0.18, 0.28, 0.42]
  return (
    <div aria-hidden="true" className="hidden select-none items-center gap-3 pr-1 text-zinc-950 sm:flex dark:text-white">
      {ghosts.map((o, i) => (
        <span key={i} className="ha-key text-[22px] leading-none" style={{ '--ha-o': o, '--ha-oo': o + 0.25, '--ha-d': i * 0.14 + 's', opacity: o }}>⚿</span>
      ))}
      <span className="ha-key text-[24px] leading-none" style={{ color: ACCENT, '--ha-o': 0.9, '--ha-oo': 1, '--ha-d': ghosts.length * 0.14 + 's', opacity: 0.9 }}>⚿</span>
    </div>
  )
}

const AGENT_PROMPT = `I'm giving you a skill — read it and use it: ${(typeof window !== 'undefined' ? window.location.origin : '') + API}/skill.md`

function Masthead({ active, navigate, home }) {
  return (
    <header className="relative isolate">
      <div aria-hidden="true" className="pointer-events-none absolute -inset-x-6 -top-6 -z-10 h-52 overflow-hidden lg:-inset-x-10 lg:-top-10">
        <div className="absolute inset-0 opacity-70 dark:opacity-100"
          style={{ background: `radial-gradient(60% 130% at 14% -12%, ${ACCENT}2e, transparent 62%), radial-gradient(42% 110% at 68% -18%, ${ACCENT}14, transparent 55%)` }} />
        <div className="absolute inset-0 text-zinc-950/45 dark:text-white/35"
          style={{
            backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)', backgroundSize: '20px 20px', opacity: 0.12,
            WebkitMaskImage: 'radial-gradient(120% 130% at 16% 0%, #000, transparent 65%)',
            maskImage: 'radial-gradient(120% 130% at 16% 0%, #000, transparent 65%)',
          }} />
      </div>
      <div className="flex items-start justify-between gap-6">
        <div>
          <Label>Agent credentials</Label>
          <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="cursor-pointer text-[28px]/9 font-semibold tracking-[-0.015em] text-zinc-950 sm:text-[32px]/10 dark:text-white" onClick={() => navigate('')}>HB Auth</h1>
            <span className="inline-flex items-center gap-2 rounded-full border border-zinc-950/10 bg-white/60 px-2.5 py-1 text-[12.5px] text-zinc-600 backdrop-blur dark:border-white/10 dark:bg-zinc-900/50 dark:text-zinc-300">
              <button type="button" onClick={() => navigate('skill')} className="inline-flex items-center gap-1.5 font-medium transition hover:text-zinc-950 dark:hover:text-white">
                <span className="inline-flex shrink-0" style={{ color: ACCENT }}><AgentSpark /></span>
                <span className="underline decoration-zinc-300 underline-offset-2 dark:decoration-zinc-600">hand to an agent</span>
              </button>
              <span className="text-zinc-300 dark:text-zinc-600">·</span>
              <CopyBoom value={AGENT_PROMPT} title="Copy the agent prompt" />
            </span>
          </div>
          {home && (
            <Text className="mt-3 max-w-2xl text-zinc-500 dark:text-zinc-400">
              How agents log into sites — the enforced Bitwarden broker types the credential over CDP so the secret never enters the model, plus the login methods and a legacy LastPass path.
            </Text>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-4 self-start">
          <KeyTrail />
          <PageMenu active={active} navigate={navigate} />
        </div>
      </div>
    </header>
  )
}


/* ------------------------------------------------------------- tool status */
function toolBadge(s) {
  if (!s) return { color: 'zinc', label: 'checking…' }
  if (!s.installed) return { color: 'zinc', label: 'not installed' }
  if (s.upToDate === true) return { color: 'lime', label: 'up to date' }
  if (s.upToDate === false) return { color: 'amber', label: 'update available' }
  if (s.error) return { color: 'red', label: 'check failed' }
  return { color: 'lime', label: 'installed' }
}
function ToolCard({ tool }) {
  const s = tool.status
  const b = toolBadge(s)
  const needsInstall = s && !s.installed
  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <StatusDot color={b.color} />
            <span className="font-semibold text-zinc-900 dark:text-white">{tool.name}</span>
            <span className="font-mono text-[12px] text-zinc-400">{tool.bin}</span>
          </div>
          <Text className="mt-1.5 max-w-xl text-[13.5px] text-zinc-500 dark:text-zinc-400">{tool.desc}</Text>
        </div>
        <Badge color={b.color}>{b.label}</Badge>
      </div>
      <div className="mt-4 grid max-w-xl grid-cols-2 gap-6">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400">Installed</div>
          <div className="mt-1.5 font-mono text-sm">
            {!s ? <span className="animate-pulse text-zinc-400">checking…</span>
              : s.installed ? <span className="text-zinc-800 dark:text-zinc-200">{s.current || 'yes'}</span>
                : <span className="text-zinc-400">not installed</span>}
          </div>
          {s && s.path && <div className="mt-1 truncate font-mono text-[11px] text-zinc-400" title={s.path}>{s.path}</div>}
        </div>
        <div className="border-l border-zinc-950/10 pl-6 dark:border-white/10">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400">Latest</div>
          <div className="mt-1.5 font-mono text-sm">
            {!s ? <span className="animate-pulse text-zinc-400">checking…</span>
              : s.latest ? <span className={s.installed && s.upToDate === false ? 'text-amber-700 dark:text-amber-400' : 'text-zinc-800 dark:text-zinc-200'}>{s.latest}</span>
                : <span className="text-zinc-400">—</span>}
          </div>
          <Link href={tool.repo} target="_blank" className="mt-1 block truncate font-mono text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200" title={tool.repo}>
            {tool.repo.replace(/^https?:\/\//, '')}
          </Link>
        </div>
      </div>
      {s && s.error && <p className="mt-2 font-mono text-xs text-red-600 dark:text-red-400">{s.error}</p>}
      <div className="mt-4 space-y-3">
        <div className="flex items-center gap-2 text-[13px] text-zinc-500 dark:text-zinc-400">
          <span className="font-medium text-zinc-600 dark:text-zinc-300">From</span>
          <span>{tool.from}</span>
          <span className="text-zinc-300 dark:text-zinc-600">·</span>
          <Link href={tool.docs} target="_blank" className="underline decoration-zinc-300 underline-offset-2 hover:text-zinc-700 dark:decoration-zinc-600 dark:hover:text-zinc-200">docs</Link>
        </div>
        <div>
          <div className="mb-1 text-[12px] font-medium text-zinc-500 dark:text-zinc-400">{needsInstall ? 'Install' : 'Reinstall / install'}</div>
          <CopyBox code={tool.install} />
        </div>
        {s && s.upToDate === false && (
          <div>
            <div className="mb-1 text-[12px] font-medium text-amber-700 dark:text-amber-400">Update</div>
            <CopyBox code={tool.update} />
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ first-time auth */
const AUTH_STEPS = [
  ['Log the dedicated account in, passing the never-expire timeout inline — it\'s read once, when this command spawns the shared agent, so the agent is born unlocked-forever. The prefix dies with the command; nothing global to persist. --trust remembers this machine so 2FA won\'t re-prompt.', 'LPASS_AGENT_TIMEOUT=0 lpass login --trust agent-bot@example.com'],
  ['Verify you\'re logged in and can see the shared logins — that folder is the agent\'s allow-list.', 'lpass status && lpass ls'],
]
function AuthSection() {
  return (
    <div>
      <Text className="max-w-2xl text-[13.5px] text-zinc-500 dark:text-zinc-400">
        One-time setup on the machine that drives horse-browser. You enter the dedicated account's master
        password to unlock the vault; <Code>lpass</Code> then keeps it unlocked and the helpers just work — until the next reboot.
      </Text>
      <ol className="mt-4 space-y-5">
        {AUTH_STEPS.map(([label, code], i) => (
          <li key={i} className="grid grid-cols-[1.75rem_1fr] gap-x-3">
            <span className="pt-px font-mono text-[11.5px] tabular-nums text-zinc-300 dark:text-zinc-600">{String(i + 1).padStart(2, '0')}</span>
            <div className="min-w-0">
              <div className="text-[13.5px] leading-relaxed text-zinc-700 dark:text-zinc-300">{label}</div>
              <CopyBox code={code} />
            </div>
          </li>
        ))}
      </ol>
      <Text className="mt-2 text-[12.5px] text-zinc-400">
        <Code>LPASS_AGENT_TIMEOUT</Code> is read once, when <Code>lpass login</Code> starts the shared agent; <Code>0</Code> keeps it unlocked until <Code>lpass logout</Code> or a reboot. Replace <Code>agent-bot@example.com</Code> with your dedicated account. <Strong className="text-zinc-500 dark:text-zinc-400">Why never-expire is OK:</Strong> an always-unlocked vault's exposure is bounded by what's in it — only throwaway, unique logins, never your real vault.
      </Text>
    </div>
  )
}

/* --------------------------------------------------------------- setup gate */
function SetupGate({ snap, reload }) {
  const session = snap?.session
  const tool = (snap?.tools || [])[0]
  const helper = snap?.helper
  const installed = !!session?.installed
  const loggedIn = !!session?.loggedIn
  const helperOk = !!(helper?.moduleFile?.exists && helper?.stubWired && helper?.moduleFile?.current)
  const [busy, setBusy] = useState(false)
  const install = async () => { setBusy(true); try { await postJSON('/helpers/install'); await reload() } finally { setBusy(false) } }
  const Step = ({ n, done, title, children }) => (
    <li className="grid grid-cols-[1.75rem_1fr] gap-x-3">
      <span className="pt-0.5"><StatusDot color={done ? 'lime' : 'zinc'} /></span>
      <div className="min-w-0">
        <div className="text-[14px] font-medium text-zinc-800 dark:text-zinc-100">{n}. {title}</div>
        <div className="mt-1">{children}</div>
      </div>
    </li>
  )
  return (
    <section className="space-y-6">
      <div>
        <Label>Set up · one time</Label>
        <Text className="mt-1.5 max-w-2xl text-[13.5px] text-zinc-500 dark:text-zinc-400">
          Three steps wire the chain: install the LastPass CLI, log the dedicated agent account in, and install the login helpers. This panel goes away once you're logged in and the helpers are current.
        </Text>
      </div>
      <ol className="space-y-6">
        <Step n={1} done={installed} title="Install the LastPass CLI">
          {tool ? <ToolCard tool={tool} /> : <Text className="text-[13px] text-zinc-400">checking…</Text>}
        </Step>
        <Step n={2} done={loggedIn} title="Log the dedicated account in">
          <AuthSection />
        </Step>
        <Step n={3} done={helperOk} title="Install the login helpers">
          <div className={'flex items-center justify-between gap-3 rounded-lg px-3.5 py-2.5 ' + (helperOk ? 'bg-lime-500/10 dark:bg-lime-400/10' : 'bg-zinc-950/[0.03] dark:bg-white/[0.04]')}>
            <div className="flex min-w-0 items-center gap-2.5 text-[13px] text-zinc-600 dark:text-zinc-300">
              <StatusDot color={helperOk ? 'lime' : 'zinc'} />
              <span className="min-w-0 truncate">
                {helperOk ? <>installed &amp; current — <Code>{helper?.moduleFile?.path}</Code></>
                  : !helper?.fileExists ? 'browser-harness workspace not found — install it first'
                  : 'not installed — agents can’t call hb_login / lastpass_fill yet'}
              </span>
            </div>
            {!helperOk && helper?.fileExists && <Button outline disabled={busy} onClick={install}>Install helpers</Button>}
          </div>
        </Step>
      </ol>
    </section>
  )
}

/* --------------------------------------------------------------- stat strip */
function Stat({ label, value, sub, tone = 'zinc' }) {
  const toneCls = { lime: 'text-lime-600 dark:text-lime-400', amber: 'text-amber-600 dark:text-amber-400', red: 'text-red-600 dark:text-red-400', zinc: 'text-zinc-900 dark:text-white' }[tone]
  return (
    <div className="rounded-lg border border-zinc-950/10 bg-white/70 px-3.5 py-3 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400">{label}</div>
      <div className={'mt-1 font-mono text-2xl tabular-nums ' + toneCls}>{value}</div>
      {sub && <div className="mt-0.5 text-[11.5px] text-zinc-400">{sub}</div>}
    </div>
  )
}
/* ------------------------------------------------------ unregistered vault items */
/* --------------------------------------------------------------- sources */
// A source = one connected place credentials/codes come from (a LastPass account,
// an SMSPool number). A service can hold several, so "source" not "provider".
// A source card doubles as its own setup entry: when the source isn't configured
// it renders dim with a "Set up" affordance (click → the detail, which leads with
// the setup guide); once ready it shows the live identity + summary.
function SourceCard({ id, name, kind, identity, ready, summary, navigate }) {
  return (
    <button type="button" onClick={() => navigate('source/' + id)}
      className={'group flex w-full cursor-pointer items-center gap-4 rounded-xl border p-4 text-left transition ' + (ready
        ? 'border-zinc-950/10 bg-white/60 hover:border-zinc-950/25 dark:border-white/10 dark:bg-zinc-900/40 dark:hover:border-white/25'
        : 'border-dashed border-zinc-950/15 bg-transparent hover:border-zinc-950/35 dark:border-white/15 dark:hover:border-white/30')}>
      <img src={`${API}/logo/${id}`} alt="" aria-hidden="true" onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
        className={'size-11 shrink-0 object-contain transition ' + (ready ? '' : 'opacity-40 grayscale group-hover:opacity-70')} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <StatusDot color={ready ? 'lime' : 'zinc'} />
          <span className={'text-[14px] font-semibold ' + (ready ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 dark:text-zinc-400')}>{name}</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400">{kind}</span>
        </div>
        {ready
          ? <div className="mt-1 truncate font-mono text-[12.5px] text-zinc-600 dark:text-zinc-300">{identity || '—'}</div>
          : null}
        <div className={'mt-0.5 text-[12px] ' + (ready ? 'text-zinc-400' : 'text-zinc-500 dark:text-zinc-400')}>{summary}</div>
      </div>
      {ready
        ? <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-zinc-400 transition group-hover:translate-x-0.5 group-hover:text-zinc-600 dark:group-hover:text-zinc-200" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
        : <span className="shrink-0 rounded-lg border border-zinc-950/15 px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide text-zinc-500 transition group-hover:border-zinc-950/30 group-hover:text-zinc-700 dark:border-white/15 dark:text-zinc-400 dark:group-hover:text-zinc-200">Set&nbsp;up</span>}
    </button>
  )
}

function SourcesRow({ snap, navigate }) {
  const session = snap?.session
  const [sms, setSms] = useState(null)
  const [bw, setBw] = useState(null)
  useEffect(() => {
    const load = () => fetch(API + '/sms/status').then((r) => r.json()).then(setSms).catch(() => setSms({ keySet: false }))
    load()
    return self.subscribe((f) => { if (f.type === 'sms' || f.type === 'sms-sync') load() })
  }, [])
  useEffect(() => {
    let busy = false, last = 0
    const load = async () => {
      if (busy) return
      busy = true; last = Date.now()
      try { const r = await fetch(API + '/broker/status', { signal: AbortSignal.timeout(10000) }); if (r.ok) setBw(await r.json()) }
      catch { setBw((b) => b || { installed: false }) } finally { busy = false }
    }
    load()
    // live: the backend's status watcher pushes broker-status on change; the 45s
    // visible re-GET keeps it awake (it idles otherwise) + heals lost frames
    const unsub = self.subscribe((f) => { if (f.type === 'broker-status' && f.status) setBw(f.status) })
    const t = setInterval(() => { if (!document.hidden) load() }, 45000)
    const onVis = () => { if (!document.hidden && Date.now() - last > 5000) load() }
    document.addEventListener('visibilitychange', onVis)
    return () => { unsub(); clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
  }, [])
  const bwReady = !!(bw && bw.installed && bw.vault && bw.vault.hasSession && bw.vault.bwStatus !== 'no-cli' && bw.vault.bwStatus !== 'unauthenticated')
  const bwSummary = !bw ? 'checking…'
    : !bw.installed ? (bw.building ? 'compiling daemon…' : 'not built')
    : (bw.vault?.bwStatus === 'no-cli') ? 'bitwarden cli not installed'
    : (bw.vault?.bwStatus === 'unauthenticated') ? 'bw not logged in'
    : !bw.vault?.hasSession ? 'connect the vault (Keychain token)'
    : bw.vault?.warm ? 'connected · vault unlocked' : 'connected · vault locked'
  // Set-up sources float to the top; unconfigured "Set up" cards sink to the
  // bottom. Stable sort keeps the declared order within each group.
  const sources = [
    { id: 'bitwarden', name: 'Bitwarden', kind: 'password vault · enforced', identity: bwReady ? 'agent broker' : null, ready: bwReady, summary: bwSummary },
    { id: 'lastpass', name: 'LastPass', kind: 'password vault', identity: session?.account, ready: !!session?.loggedIn,
      summary: session?.loggedIn ? `${session.items} logins` : session?.installed ? 'locked — log in' : 'lpass not installed' },
    { id: 'smspool', name: 'SMSPool', kind: '2FA SMS number', identity: sms?.number, ready: !!sms?.ready,
      summary: !sms ? 'checking…' : !sms.keySet ? 'no API key' : sms.ready ? `${sms.msgCount} messages · ${daysLeft(sms.expiry)}d left` : 'inactive' },
  ].sort((a, b) => (b.ready ? 1 : 0) - (a.ready ? 1 : 0))
  return (
    <section>
      <Label>Sources · where credentials &amp; codes come from</Label>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        {sources.map((s) => <SourceCard key={s.id} {...s} navigate={navigate} />)}
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------- activity feed */
function ActivityEvent({ e }) {
  return (
    <li className="flex items-start gap-3 py-3">
      <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-zinc-950/[0.04] text-zinc-500 dark:bg-white/[0.06] dark:text-zinc-300" title="SMS">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] font-medium text-zinc-700 dark:text-zinc-200">SMS · {e.sender || 'unknown'}</span>
          <span className="rounded bg-zinc-950/5 px-1.5 py-px font-mono text-[10px] text-zinc-400 dark:bg-white/10">{e.source}</span>
          <span className="font-mono text-[10.5px] text-zinc-400">{fmtSmsTime(e.at)}</span>
          {e.code && <span className="ml-auto inline-flex items-center gap-1 rounded-md bg-lime-500/15 px-2 py-0.5 font-mono text-[12px] font-semibold tabular-nums text-lime-700 dark:text-lime-400">{e.code}<CopyName value={e.code} title="Copy the code" /></span>}
        </div>
        <div className="mt-0.5 whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">{e.message}</div>
      </div>
    </li>
  )
}

function ActivityFeed() {
  const [events, setEvents] = useState(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => { setBusy(true); try { const r = await fetch(API + '/activity').then((x) => x.json()); setEvents(r.events || []) } catch { setEvents([]) } finally { setBusy(false) } }, [])
  useEffect(() => { load() }, [load])
  usePoll(() => load(), 60000)   // fallback; new SMS arrive in realtime over the WS
  useEffect(() => self.subscribe((f) => {
    if (f.type === 'sms' && f.event) setEvents((prev) => (prev && prev.some((e) => e.id === f.event.id)) ? prev : [f.event, ...(prev || [])])
  }), [])
  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <Label>Activity</Label>
        <button type="button" onClick={load} disabled={busy} title="Refresh activity" className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-zinc-500 transition hover:bg-zinc-950/5 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-200">
          {busy ? <Spinner className="size-3.5" /> : <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" /></svg>}
          refresh
        </button>
      </div>
      <Text className="mt-1.5 text-[13px] text-zinc-500 dark:text-zinc-400">Incoming codes and — soon — password accesses: a live view of what the credential machinery is doing.</Text>
      {!events ? (
        <div className="mt-3 flex items-center gap-2 py-6 text-[13px] text-zinc-400"><Spinner className="size-4" /> loading activity…</div>
      ) : events.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-zinc-950/15 px-4 py-8 text-center text-[13px] text-zinc-400 dark:border-white/15">No activity yet.</div>
      ) : (
        <ul className="mt-1 divide-y divide-zinc-950/5 dark:divide-white/10">
          {events.map((e) => <ActivityEvent key={e.id} e={e} />)}
        </ul>
      )}
      <div className="mt-3 flex items-center gap-2 text-[11.5px] text-zinc-400">
        <StatusDot color="zinc" /> Password accesses will appear here once the login helpers log them (next step).
      </div>
    </section>
  )
}

/* --------------------------------------------------------------- overview */
function Overview({ snap, navigate }) {
  // The first page is always the sources + activity — independent of any one source's
  // login state. Per-source setup (e.g. the LastPass guide) lives in that source's page.
  return (
    <div className="grid gap-8 lg:grid-cols-2 lg:items-start lg:gap-10">
      <SourcesRow snap={snap} navigate={navigate} />
      <ActivityFeed />
    </div>
  )
}

// The whole LastPass vault, with origin, and a "set up automation" action per login.
function VaultTable({ logins, accounts, origin, navigate, reload }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState('')
  const known = new Set()
  const slugOf = {}
  for (const a of accounts || []) {
    known.add('nm:' + a.lpassItem); if (a.lpassId) known.add('id:' + a.lpassId)
    slugOf['nm:' + a.lpassItem] = a.slug; if (a.lpassId) slugOf['id:' + a.lpassId] = a.slug
  }
  const rows = (logins || []).map((l) => {
    let host = ''
    try { host = (new URL(l.url).hostname || '').replace(/^www\./, '') } catch {}
    return { ...l, host, registered: known.has('id:' + l.id) || known.has('nm:' + l.name), slug: slugOf['id:' + l.id] || slugOf['nm:' + l.name] || null }
  }).filter((l) => l.host && l.host !== 'group' && l.host !== 'sn')
  const filtered = q ? rows.filter((l) => (l.name + ' ' + l.username + ' ' + l.url).toLowerCase().includes(q.toLowerCase())) : rows
  const register = async (l) => {
    setBusy(l.id)
    try { const r = await postJSON('/accounts', { lpassId: l.id, lpassItem: l.name }); if (r.ok && r.account) { await reload(); navigate('account/' + r.account.slug) } }
    finally { setBusy('') }
  }
  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Label>Vault · all logins</Label>
        <span className="text-[12.5px] text-zinc-400">{filtered.length} of {rows.length}</span>
      </div>
      <Text className="mt-1.5 max-w-2xl text-[13.5px] text-zinc-500 dark:text-zinc-400">
        Every login stored in this source — each <Strong className="text-zinc-700 dark:text-zinc-200">Name</Strong> is the key <Code>lastpass_fill</Code> uses. Set one up as an <button type="button" onClick={() => navigate('accounts')} className="cursor-pointer underline underline-offset-2">automation</button> to sign in unattended.
      </Text>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="filter…" className="mt-3 w-full max-w-xs rounded-lg border border-zinc-950/10 bg-transparent px-3 py-1.5 text-[13px] text-zinc-800 outline-none transition placeholder:text-zinc-400 focus:border-zinc-950/25 dark:border-white/10 dark:text-zinc-200 dark:focus:border-white/25" />
      <div className="mt-3 overflow-hidden rounded-xl border border-zinc-950/10 dark:border-white/10">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead className="bg-zinc-50/95 dark:bg-zinc-800/95">
            <tr className="text-[11px] uppercase tracking-wide text-zinc-400">
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Username</th>
              <th className="w-0 px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-950/5 dark:divide-white/10">
            {filtered.map((l) => (
              <tr key={l.id || l.name} className="group hover:bg-zinc-950/[0.02] dark:hover:bg-white/[0.03]">
                <td className="px-3 py-1.5 font-mono text-[12.5px] text-zinc-800 dark:text-zinc-200">{l.name || '(unnamed)'}</td>
                <td className="px-3 py-1.5 text-zinc-500 dark:text-zinc-400">{l.username || '—'}</td>
                <td className="px-3 py-1.5 text-right">
                  {l.registered
                    ? <button type="button" onClick={() => l.slug && navigate('account/' + l.slug)} className="cursor-pointer text-[11.5px] text-lime-600 underline underline-offset-2 dark:text-lime-400">automated</button>
                    : <button type="button" disabled={busy === l.id} onClick={() => register(l)} className="cursor-pointer text-[11.5px] text-zinc-400 underline underline-offset-2 opacity-0 transition hover:text-zinc-700 focus:opacity-100 group-hover:opacity-100 disabled:opacity-100 dark:hover:text-zinc-200">{busy === l.id ? 'setting up…' : 'automate'}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="px-3 py-5 text-center text-[13px] text-zinc-400">no matches</div>}
      </div>
    </section>
  )
}

function LastPassSource({ snap, navigate, reload, onSync, syncing }) {
  const session = snap?.session
  const tool = (snap?.tools || [])[0]
  const s = tool?.status
  const b = s ? toolBadge(s) : null
  if (!session) return <div className="flex items-center gap-2 text-[13px] text-zinc-400"><Spinner className="size-4" /> loading…</div>
  return (
    <div className="space-y-8">
      <div className="grid gap-5 lg:grid-cols-[1fr_25rem] lg:items-start">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => navigate('')} title="Back to overview" className="inline-flex cursor-pointer items-center gap-1 text-[13px] text-zinc-500 transition hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            </button>
            <img src={`${API}/logo/lastpass`} alt="" aria-hidden="true" className="size-10 shrink-0 object-contain" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Heading>LastPass</Heading>
                {b && <Badge color={b.color}>{b.label}</Badge>}
                <button type="button" onClick={onSync} disabled={syncing} title="Sync from LastPass (lpass sync)" className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-zinc-950/10 px-2 py-1 text-[11.5px] text-zinc-500 transition hover:bg-zinc-950/5 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-200">
                  <svg viewBox="0 0 24 24" className={'size-3 ' + (syncing ? 'animate-spin' : '')} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" /></svg>
                  sync
                </button>
              </div>
              <div className="font-mono text-[12px] text-zinc-400">{session.loggedIn ? session.account : session.installed ? 'locked — not logged in' : 'lpass not installed'}</div>
            </div>
          </div>
          <Text className="mt-3 max-w-md text-[13.5px] text-zinc-500 dark:text-zinc-400">
            {tool?.desc || 'Reads credentials from your LastPass vault in the terminal — the clean way for an agent to fetch a login.'}
          </Text>
        </div>
        {tool && session.loggedIn && (
          <div className="rounded-xl border border-zinc-950/10 p-4 dark:border-white/10">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">Installed</div>
                <div className="mt-1 font-mono text-[13px] text-zinc-800 dark:text-zinc-200">{s?.installed ? (s.current || 'yes') : 'not installed'}</div>
                {s?.path && <div className="mt-0.5 truncate font-mono text-[10.5px] text-zinc-400" title={s.path}>{s.path}</div>}
              </div>
              <div className="border-l border-zinc-950/10 pl-4 dark:border-white/10">
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">Latest</div>
                <div className={'mt-1 font-mono text-[13px] ' + (s?.installed && s.upToDate === false ? 'text-amber-700 dark:text-amber-400' : 'text-zinc-800 dark:text-zinc-200')}>{s?.latest || '—'}</div>
                <Link href={tool.repo} target="_blank" className="mt-0.5 block truncate font-mono text-[10.5px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">{tool.repo.replace(/^https?:\/\//, '')}</Link>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-1.5 text-[12px] text-zinc-500 dark:text-zinc-400">
              <span>From {tool.from}</span><span className="text-zinc-300 dark:text-zinc-600">·</span><Link href={tool.docs} target="_blank" className="underline decoration-zinc-300 underline-offset-2 hover:text-zinc-700 dark:decoration-zinc-600 dark:hover:text-zinc-200">docs</Link>
            </div>
            <CopyBox code={tool.install} className="!mb-0 !mt-2" />
            {session.loggedIn && (
              <div className="mt-3 border-t border-zinc-950/5 pt-3 dark:border-white/5">
                <DisconnectLink name="LastPass" endpoint="/sources/lastpass/disconnect"
                  warn="hb-auth stores no LastPass secret; the login helpers are shared, so there's nothing app-side to wipe. Disconnecting is a manual CLI step." />
              </div>
            )}
          </div>
        )}
      </div>
      {session.loggedIn
        ? <VaultTable logins={session.logins} accounts={snap.accounts} origin={session.account} navigate={navigate} reload={reload} />
        : <SetupGate snap={snap} reload={reload} />}
    </div>
  )
}

function SmsSource({ navigate }) {
  const [status, setStatus] = useState(null)
  const [err, setErr] = useState(false)
  const [saving, setSaving] = useState(false)
  const load = useCallback(async () => { try { const r = await fetch(API + '/sms/status').then((x) => x.json()); setStatus(r); setErr(false) } catch { setErr(true) } }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => self.subscribe((f) => { if (f.type === 'sms' || f.type === 'sms-sync') load() }), [load])
  const toggleEnabled = async () => {
    if (!status) return
    setSaving(true)
    try { const r = await postJSON('/sms/config', { enabled: !status.enabled }); setStatus((st) => ({ ...st, enabled: r.enabled })) } finally { setSaving(false) }
  }
  const st = status
  const badge = !st ? null
    : !st.keySet ? <Badge color="zinc">no API key</Badge>
    : st.error ? <Badge color="red">error</Badge>
    : st.ready ? <Badge color="lime">ready</Badge>
    : <Badge color="amber">disabled</Badge>
  return (
    <div className="space-y-8">
      <div className="grid gap-5 lg:grid-cols-[1fr_25rem] lg:items-start">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => navigate('')} title="Back to overview" className="inline-flex cursor-pointer items-center gap-1 text-[13px] text-zinc-500 transition hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            </button>
            <img src={`${API}/logo/smspool`} alt="" aria-hidden="true" className="size-10 shrink-0 object-contain" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Heading>SMSPool</Heading>
                {badge}
                {st && st.keySet && (
                  <span className="inline-flex items-center gap-1.5">
                    {saving ? <Spinner className="size-[20px] text-zinc-400" /> : <Toggle on={st.enabled} onClick={toggleEnabled} />}
                    <span className="text-[11.5px] text-zinc-400">{st.enabled ? '2FA on' : '2FA off'}</span>
                  </span>
                )}
              </div>
              <div className="font-mono text-[12px] text-zinc-400">2FA SMS number</div>
            </div>
          </div>
          <Text className="mt-3 max-w-md text-[13.5px] text-zinc-500 dark:text-zinc-400">
            A rented phone number that receives 2FA texts. <Code>hb_login</Code> notes the inbox baseline before submitting, then polls this number for the new code and types it in — read server-side, never in the model.
          </Text>
          {st && st.keySet && st.ready && <div className="mt-3 max-w-md"><WatchForCode status={st} onRefresh={load} /></div>}
        </div>
        {st && st.keySet && (
          <div className="rounded-xl border border-zinc-950/10 p-4 dark:border-white/10">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">SMSPool account</div>
            <div className="mt-2 grid grid-cols-2 gap-4">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">Balance</div>
                <div className="mt-1 font-mono text-[15px] text-zinc-800 dark:text-zinc-200">{st.balance != null ? `$${st.balance}` : '—'}</div>
              </div>
              <div className="border-l border-zinc-950/10 pl-4 dark:border-white/10">
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">API key</div>
                <div className="mt-1 flex items-center gap-1.5 text-[13px] text-zinc-800 dark:text-zinc-200"><StatusDot color="lime" />in .env</div>
              </div>
            </div>
            <a href="https://www.smspool.net/dashboard/orders" target="_blank" rel="noopener" className="mt-3 inline-block cursor-pointer text-[12px] text-zinc-400 underline underline-offset-2 hover:text-zinc-600 dark:hover:text-zinc-200">manage on smspool.net</a>
            <div className="mt-3 border-t border-zinc-950/5 pt-3 dark:border-white/5">
              <DisconnectLink name="SMSPool" endpoint="/sources/smspool/disconnect"
                warn="Clears the SMSPool config from hb-auth (2FA off, number & rental forgotten)." onDone={load} />
            </div>
          </div>
        )}
      </div>

      {err && <div className="rounded-lg border border-red-500/40 bg-red-500/[0.06] px-3.5 py-2.5 text-[13px] text-red-700 dark:text-red-400">Couldn't load SMS status.</div>}
      {!st ? (
        <div className="flex items-center gap-2 py-6 text-[13px] text-zinc-400"><Spinner /> checking SMSPool…</div>
      ) : !st.keySet ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/[0.06] p-4">
          <div className="text-[13.5px] font-medium text-amber-800 dark:text-amber-300">Add your SMSPool API key</div>
          <Text className="mt-1 text-[13px] text-zinc-600 dark:text-zinc-400">Put your key in the instance <Code>.env</Code> — it stays out of this module's data and out of any agent's context — then restart the shell:</Text>
          <CopyBox code={'SMSPOOL_API_KEY=your-key-here'} />
        </div>
      ) : st.error ? (
        <div className="rounded-xl border border-red-500/40 bg-red-500/[0.06] p-4 text-[13px] text-red-700 dark:text-red-400">{st.error}</div>
      ) : (
        <>
          <section>
            <Label>Numbers</Label>
            <div className="mt-3 overflow-hidden rounded-xl border border-zinc-950/10 dark:border-white/10">
              <table className="w-full border-collapse text-left text-[13px]">
                <thead className="bg-zinc-50/95 dark:bg-zinc-800/95">
                  <tr className="text-[11px] uppercase tracking-wide text-zinc-400">
                    <th className="px-3 py-2 font-medium">Number</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Expires</th>
                    <th className="px-3 py-2 font-medium">Messages</th>
                    <th className="px-3 py-2 font-medium">Scanned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-950/5 dark:divide-white/10">
                  <tr className="hover:bg-zinc-950/[0.02] dark:hover:bg-white/[0.03]">
                    <td className="px-3 py-2 font-mono text-[12.5px] text-zinc-800 dark:text-zinc-200"><span className="inline-flex items-center gap-1.5">{st.number || '—'}{st.number && <CopyName value={st.number} title="Copy the number" />}</span></td>
                    <td className="px-3 py-2"><Badge color={st.available ? 'lime' : 'amber'}>{st.available ? 'active' : 'inactive'}</Badge></td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-300">{daysLeft(st.expiry) != null ? `${daysLeft(st.expiry)}d` : '—'}{st.autoExtend && <span className="text-zinc-400"> · auto-extend</span>}</td>
                    <td className="px-3 py-2 tabular-nums text-zinc-600 dark:text-zinc-300">{st.msgCount}</td>
                    <td className="px-3 py-2"><span className="inline-flex items-center gap-1.5 text-[12.5px] text-zinc-600 dark:text-zinc-300"><StatusDot color="lime" />watching</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
          <SmsInbox />
        </>
      )}
    </div>
  )
}

function SourceDetail({ id, snap, navigate, reload, onSync, syncing }) {
  if (id === 'lastpass') return <LastPassSource snap={snap} navigate={navigate} reload={reload} onSync={onSync} syncing={syncing} />
  if (id === 'smspool') return <SmsSource navigate={navigate} />
  if (id === 'bitwarden') return <BitwardenSource navigate={navigate} />
  return (
    <div className="space-y-4">
      <button type="button" onClick={() => navigate('')} className="cursor-pointer text-[13px] text-zinc-500 underline">← overview</button>
      <Text className="text-zinc-500 dark:text-zinc-400">Unknown source “{id}”.</Text>
    </div>
  )
}

/* ------------------------------------------- bitwarden reachable (broker) */
// What an agent can actually enumerate right now: the logins inside GRANTED
// collections. Non-secret metadata only (name / username / host / tier / totp
// flag) — any local program can read this via the broker's `list` op. The
// password and TOTP never appear here; those go through the gated ops.
function ReachableSection({ navigate }) {
  const [st, setSt] = useState({ loading: true })
  const [slow, setSlow] = useState(false)   // show a loading row only once the fetch is actually slow
  const [q, setQ] = useState('')
  useEffect(() => {
    let alive = true
    // A cold vault unlocks on this call and can take several seconds; a warm vault (or an
    // absent broker) answers instantly. Only reveal the loading row after a beat, so the
    // fast paths never flash a header.
    const t = setTimeout(() => { if (alive) setSlow(true) }, 400)
    fetch(API + '/broker/reachable').then((x) => x.json()).then((r) => {
      if (!alive) return
      if (r && r.ok) setSt({ items: r.items || [] })
      else setSt({ error: r?.error || 'unavailable', reason: r?.reason })
    }).catch((e) => { if (alive) setSt({ error: String((e && e.message) || e) }) })
      .finally(() => { if (alive) clearTimeout(t) })
    return () => { alive = false; clearTimeout(t) }
  }, [])

  // Broker absent / not set up → nothing Bitwarden to show on this page; stay quiet.
  if (st.error) return null
  if (st.loading) {
    if (!slow) return null   // fast path (warm vault, or no broker) — no flash
    return (
      <div className="space-y-3">
        <Label>Reachable via Bitwarden broker</Label>
        <div className="flex items-center gap-2 py-6 text-[13px] text-zinc-400">
          <Spinner className="size-4" /> reading your vault — a cold vault takes a few seconds to unlock…
        </div>
      </div>
    )
  }

  const items = (st.items || []).slice().sort((a, b) => (a.item || '').localeCompare(b.item || ''))
  const autoN = items.filter((i) => i.tier === 'auto').length
  const askN = items.filter((i) => i.tier === 'ask').length
  const filtered = q
    ? items.filter((i) => ((i.item || '') + ' ' + (i.username || '') + ' ' + (i.hosts || []).join(' ')).toLowerCase().includes(q.toLowerCase()))
    : items

  return (
    <div className="space-y-3">
      <Label>Reachable via Bitwarden broker</Label>
      <Text className="max-w-2xl text-[13.5px] text-zinc-500 dark:text-zinc-400">
        The logins inside your granted collections — what an agent can enumerate right now. This list is <Strong className="text-zinc-700 dark:text-zinc-200">non-secret</Strong>: any agent or program reads it via <Code>hb_creds</Code>. The password and TOTP never appear here — those go through <Code>hb_type_secret</Code> / <Code>hb_get_secret</Code>, gated by tier, origin, and a macOS approval.
      </Text>
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-950/10 px-3 py-6 text-center text-[13px] text-zinc-400 dark:border-white/10">
          Nothing granted yet — set a collection to <Code>ask</Code> or <Code>auto</Code> on the{' '}
          <button type="button" onClick={() => navigate('source/bitwarden')} className="cursor-pointer underline underline-offset-2">Bitwarden source</button>.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="filter…" className="w-full max-w-xs rounded-lg border border-zinc-950/10 bg-transparent px-3 py-1.5 text-[13px] text-zinc-800 outline-none transition placeholder:text-zinc-400 focus:border-zinc-950/25 dark:border-white/10 dark:text-zinc-200 dark:focus:border-white/25" />
            <span className="text-[12.5px] text-zinc-400">{autoN} auto{askN ? ' · ' + askN + ' ask' : ''} · {items.length} reachable</span>
          </div>
          <div className="overflow-hidden rounded-xl border border-zinc-950/10 dark:border-white/10">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead className="bg-zinc-50/95 dark:bg-zinc-800/95">
                <tr className="text-[11px] uppercase tracking-wide text-zinc-400">
                  <th className="px-3 py-2 font-medium">Account</th>
                  <th className="px-3 py-2 font-medium">Username</th>
                  <th className="px-3 py-2 font-medium">Access</th>
                  <th className="px-3 py-2 font-medium">2FA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-950/5 dark:divide-white/10">
                {filtered.map((i) => {
                  const host = (i.hosts && i.hosts[0]) || ''
                  return (
                    <tr key={i.id} className="hover:bg-zinc-950/[0.02] dark:hover:bg-white/[0.03]">
                      <td className="px-3 py-2">
                        <div className="font-medium text-zinc-900 dark:text-white">{i.item || '(unnamed)'}</div>
                        <div className="font-mono text-[11px] text-zinc-400">{host || '—'}</div>
                      </td>
                      <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400">{i.username || '—'}</td>
                      <td className="px-3 py-2"><Badge color={i.tier === 'auto' ? 'lime' : 'amber'}>{i.tier}</Badge></td>
                      <td className="px-3 py-2">{i.hasTotp ? <Badge color="cyan">totp</Badge> : <span className="text-zinc-400">—</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {filtered.length === 0 && <div className="px-3 py-6 text-center text-[13px] text-zinc-400">no matches</div>}
          </div>
        </>
      )}
    </div>
  )
}

/* --------------------------------------------------------------- accounts page */
// The demoted per-site automations — set up by agents for unattended sign-in.
function AccountsPage({ snap, navigate, reload }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState('')
  const accounts = snap?.accounts || []
  const logins = snap?.session?.logins || []
  const origin = snap?.session?.account
  const totpSet = new Set(snap?.totpItems || [])
  const byId = {}, byName = {}
  for (const a of accounts) { if (a.lpassId) byId[a.lpassId] = a; byName[a.lpassItem] = a }
  let rows = logins.map((l) => {
    let host = ''; try { host = (new URL(l.url).hostname || '').replace(/^www\./, '') } catch {}
    return { key: l.id || l.name, id: l.id, name: l.name, username: l.username, host, acct: byId[l.id] || byName[l.name] || null }
  }).filter((r) => r.host && r.host !== 'group' && r.host !== 'sn')
  const seen = new Set(rows.map((r) => r.acct && r.acct.slug).filter(Boolean))
  for (const a of accounts) if (!seen.has(a.slug)) rows.push({ key: 'a-' + a.slug, id: a.lpassId, name: a.lpassItem, username: a.username, host: a.host, acct: a })
  rows.sort((x, y) => ((x.acct ? 0 : 1) - (y.acct ? 0 : 1)) || (x.name || '').localeCompare(y.name || ''))
  const filtered = q ? rows.filter((r) => (r.name + ' ' + r.username + ' ' + r.host).toLowerCase().includes(q.toLowerCase())) : rows
  const autoCount = rows.filter((r) => r.acct).length
  const automate = async (r) => {
    setBusy(r.key)
    try { const res = await postJSON('/accounts', { lpassId: r.id, lpassItem: r.name }); if (res.ok && res.account) { await reload(); navigate('account/' + res.account.slug) } }
    finally { setBusy('') }
  }
  return (
    <div className="space-y-8">
      <div>
        <Label>Accounts</Label>
        <Text className="mt-1.5 max-w-2xl text-[13.5px] text-zinc-500 dark:text-zinc-400">
          What agents can sign into — from two sources. The <Strong className="text-zinc-700 dark:text-zinc-200">Bitwarden broker</Strong> exposes the logins in your granted collections (below); the <Strong className="text-zinc-700 dark:text-zinc-200">LastPass</Strong> convention lists vault logins you can automate with <Code>hb_login</Code>. For interactive work, hand an agent the <button type="button" onClick={() => navigate('skill')} className="cursor-pointer underline underline-offset-2">skill</button> instead.
        </Text>
      </div>
      <ReachableSection navigate={navigate} />
      <div className="space-y-4">
      <Label>Via LastPass</Label>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="filter…" className="w-full max-w-xs rounded-lg border border-zinc-950/10 bg-transparent px-3 py-1.5 text-[13px] text-zinc-800 outline-none transition placeholder:text-zinc-400 focus:border-zinc-950/25 dark:border-white/10 dark:text-zinc-200 dark:focus:border-white/25" />
        <span className="text-[12.5px] text-zinc-400">{autoCount} automated · {rows.length} total</span>
      </div>
      <div className="overflow-hidden rounded-xl border border-zinc-950/10 dark:border-white/10">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead className="bg-zinc-50/95 dark:bg-zinc-800/95">
            <tr className="text-[11px] uppercase tracking-wide text-zinc-400">
              <th className="px-3 py-2 font-medium">Account</th>
              <th className="px-3 py-2 font-medium">Username</th>
              <th className="px-3 py-2 font-medium">Origin</th>
              <th className="px-3 py-2 font-medium">Methods</th>
              <th className="px-3 py-2 font-medium">Automation</th>
              <th className="w-0 px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-950/5 dark:divide-white/10">
            {filtered.map((r) => {
              const a = r.acct
              const hasRecipe = !!(a && a.recipe && a.recipe.user && a.recipe.pass)
              return (
                <tr key={r.key} onClick={a ? () => navigate('account/' + a.slug) : undefined}
                  className={'group ' + (a ? 'cursor-pointer ' : '') + 'hover:bg-zinc-950/[0.02] dark:hover:bg-white/[0.03]'}>
                  <td className="px-3 py-2">
                    <div className="font-medium text-zinc-900 dark:text-white">{(a && a.label) || r.name || '(unnamed)'}</div>
                    <div className="font-mono text-[11px] text-zinc-400">{r.host || '—'}</div>
                  </td>
                  <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400">{r.username || '—'}</td>
                  <td className="px-3 py-2"><span className="font-mono text-[11.5px] text-zinc-400">{origin || '—'}</span></td>
                  <td className="px-3 py-2">
                    {(() => {
                      const hasTotp = (a && a.methods && a.methods.totp) || totpSet.has(r.name)
                      return (a || hasTotp) ? (
                        <span className="inline-flex items-center gap-1.5">
                          {a && <Badge color="zinc">pw</Badge>}
                          {hasTotp && <Badge color="lime">totp</Badge>}
                        </span>
                      ) : <span className="text-zinc-400">—</span>
                    })()}
                  </td>
                  <td className="px-3 py-2">
                    {!a ? <span className="text-[12px] text-zinc-400">not automated</span>
                      : hasRecipe ? <StatusBadge status={a.status} />
                      : <Badge color="amber">needs recipe</Badge>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {a ? <svg viewBox="0 0 24 24" className="inline size-4 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-500 dark:text-zinc-600 dark:group-hover:text-zinc-300" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                      : <button type="button" disabled={busy === r.key} onClick={(e) => { e.stopPropagation(); automate(r) }} className="cursor-pointer text-[12px] text-zinc-400 underline underline-offset-2 opacity-0 transition hover:text-zinc-700 focus:opacity-100 group-hover:opacity-100 disabled:opacity-100 dark:hover:text-zinc-200">{busy === r.key ? 'setting up…' : 'automate'}</button>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="px-3 py-6 text-center text-[13px] text-zinc-400">no matches</div>}
      </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- account detail */
function BackBar({ account, navigate }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('accounts')} className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] text-zinc-500 transition hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          accounts
        </button>
        <Heading>{account.label}</Heading>
      </div>
      <StatusBadge status={account.status} />
    </div>
  )
}

function FieldRow({ label, children, hint }) {
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-[8rem_1fr] sm:gap-4">
      <label className="pt-2 text-[12.5px] font-medium text-zinc-500 dark:text-zinc-400">{label}</label>
      <div>{children}{hint && <div className="mt-1 text-[11.5px] text-zinc-400">{hint}</div>}</div>
    </div>
  )
}

function IdentityCard({ account, save, busy }) {
  const [label, setLabel] = useState(account.label || '')
  const [host, setHost] = useState(account.host || '')
  const [loginUrl, setLoginUrl] = useState(account.loginUrl || '')
  const [agentNotes, setNotes] = useState(account.agentNotes || '')
  useEffect(() => { setLabel(account.label || ''); setHost(account.host || ''); setLoginUrl(account.loginUrl || ''); setNotes(account.agentNotes || '') }, [account.slug])
  const dirty = label !== (account.label || '') || host !== (account.host || '') || loginUrl !== (account.loginUrl || '') || agentNotes !== (account.agentNotes || '')
  return (
    <section>
      <Label>Identity</Label>
      <div className="mt-4 space-y-4">
        <FieldRow label="Label"><Input value={label} onChange={(e) => setLabel(e.target.value)} /></FieldRow>
        <FieldRow label="Host" hint="canonical host, no www — the hb_login(host) and hint join key"><Input value={host} onChange={(e) => setHost(e.target.value)} className="font-mono" /></FieldRow>
        <FieldRow label="Login URL" hint="where hb_login opens the browser"><Input value={loginUrl} onChange={(e) => setLoginUrl(e.target.value)} className="font-mono" /></FieldRow>
        <FieldRow label="Vault item" hint="the only key handed to lpass">
          <div className="flex items-center gap-2 pt-2"><span className="font-mono text-[13px] text-zinc-700 dark:text-zinc-300">{account.lpassItem}</span><CopyName value={account.lpassItem} />{!account.vaultPresent && <span className="text-[11px] text-amber-600 dark:text-amber-400">missing from vault</span>}</div>
        </FieldRow>
        <FieldRow label="Agent notes" hint="free text returned to the agent by /recipe"><Textarea rows={2} value={agentNotes} onChange={(e) => setNotes(e.target.value)} /></FieldRow>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Button disabled={busy || !dirty} style={dirty ? { background: ACCENT } : undefined} onClick={() => save({ label, host, loginUrl, agentNotes })}>Save identity</Button>
      </div>
    </section>
  )
}

function AccountMethods({ account, navigate, reload }) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const probe = async () => {
    setBusy(true); setNote('')
    try { const r = await postJSON(`/accounts/${account.slug}/probe-totp`); if (r.ok) { setNote(r.hasTotp ? 'TOTP found on the vault item' : 'no TOTP on this item'); await reload() } else setNote(r.error || 'failed') }
    finally { setBusy(false) }
  }
  const [sms, setSms] = useState(null)
  const [smsBusy, setSmsBusy] = useState(false)
  useEffect(() => { fetch(API + '/sms/status').then((r) => r.json()).then(setSms).catch(() => setSms({ keySet: false })) }, [])
  const smsOn = !!account.methods?.sms
  const toggleSms = async () => {
    setSmsBusy(true)
    try { await postJSON(`/accounts/${account.slug}/sms`, { enabled: !smsOn }); await reload() } finally { setSmsBusy(false) }
  }
  const Row = ({ dot, name, right, children }) => (
    <li className="flex items-start justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[13.5px] font-medium text-zinc-800 dark:text-zinc-200"><StatusDot color={dot} />{name}</div>
        {children && <div className="mt-0.5 pl-4 text-[12.5px] text-zinc-500 dark:text-zinc-400">{children}</div>}
      </div>
      {right}
    </li>
  )
  const totp = account.methods?.totp
  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <Label>Methods</Label>
        {note && <span className="text-[12px] text-zinc-400">{note}</span>}
      </div>
      <ul className="mt-2 divide-y divide-zinc-950/5 dark:divide-white/10">
        <Row dot="lime" name="Password · LastPass" right={<Badge color="lime">configured</Badge>}>
          Fetched with <Code>lp_field</Code> / <Code>lastpass_fill</Code> and typed over CDP.
        </Row>
        <Row dot={totp ? 'lime' : 'zinc'} name="TOTP · LastPass" right={totp ? <Badge color="lime">configured</Badge> : <Button outline disabled={busy} onClick={probe}>Probe vault</Button>}>
          {totp ? <>6-digit code via <Code>lpass show --otp</Code>, generated in-process. Probed {ago(totp.probedAt)}.</> : 'Store a TOTP secret on the vault item, then probe — hb_login will answer the OTP prompt automatically.'}
        </Row>
        <Row dot="zinc" name="Email code" right={<button onClick={() => navigate('methods')} className="text-[12px] text-zinc-400 underline">roadmap</button>}>
          Read a one-time code from a mailbox. Not built yet.
        </Row>
        <Row dot={smsOn ? 'lime' : 'zinc'} name="SMS · SMSPool"
          right={
            sms === null ? <Spinner className="size-4 text-zinc-400" />
            : (!sms.keySet || !sms.ready) ? <button type="button" onClick={() => navigate('methods')} className="cursor-pointer text-[12px] text-zinc-400 underline underline-offset-2 transition hover:text-zinc-600 dark:hover:text-zinc-200">set up</button>
            : (
              <div className="flex items-center gap-2">
                {smsOn && <Badge color="lime">on</Badge>}
                {smsBusy ? <Spinner className="size-[22px] text-zinc-400" /> : <Toggle on={smsOn} onClick={toggleSms} />}
              </div>
            )
          }>
          {sms && sms.keySet && sms.ready
            ? <>Delivered to your SMSPool number <span className="font-mono">{sms.number}</span>; <Code>hb_login</Code> reads the code and types it in.</>
            : 'Configure the SMSPool rental on the Methods page to enable SMS 2FA.'}
        </Row>
      </ul>
    </section>
  )
}

const RECIPE_FIELDS = [
  ['user', 'Username selector', 'CSS for the username / email input'],
  ['pass', 'Password selector', 'CSS for the password input'],
  ['submit', 'Submit selector', 'CSS for the sign-in button'],
  ['next', 'Next selector', 'two-step only: advances from username → password page'],
  ['otp', 'OTP selector', 'CSS for the 6-digit code input, if the site prompts'],
  ['otpSubmit', 'OTP submit', 'CSS to submit the OTP (defaults to the submit selector)'],
  ['success', 'Success selector', 'CSS present only when signed in (blank → “password field is gone”)'],
]
const EMPTY_RECIPE = { user: '', pass: '', submit: '', next: '', otp: '', otpSubmit: '', success: '', flow: 'single', notes: '' }
function RecipeEditor({ account, save, busy }) {
  const [rec, setRec] = useState({ ...EMPTY_RECIPE, ...(account.recipe || {}) })
  useEffect(() => { setRec({ ...EMPTY_RECIPE, ...(account.recipe || {}) }) }, [account.slug])
  const set = (k, v) => setRec((p) => ({ ...p, [k]: v }))
  const base = { ...EMPTY_RECIPE, ...(account.recipe || {}) }
  const dirty = JSON.stringify(rec) !== JSON.stringify(base)
  const learnPrompt = `Open ${account.loginUrl || 'the login page'} in a horse-browser session and read the DOM. Tell me the CSS selectors for: the username field, the password field, the submit button, and — if present — the OTP input and a selector that only exists once signed in. Don't log in; just report the selectors.`
  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <Label>Login recipe · learned once</Label>
        <Select value={rec.flow} onChange={(e) => set('flow', e.target.value)} className="max-w-[10rem]">
          <option value="single">single page</option>
          <option value="two-step">two-step</option>
        </Select>
      </div>
      <Text className="mt-1.5 max-w-2xl text-[13.5px] text-zinc-500 dark:text-zinc-400">
        The non-secret selectors <Code>hb_login</Code> uses to sign in unattended. Learn them once from the DOM — copy the prompt below, hand it to an agent, paste the answers here.
      </Text>
      <div className="mt-3"><CopyBox code={learnPrompt} /></div>
      <div className="mt-3 space-y-3">
        {RECIPE_FIELDS.filter(([k]) => k !== 'next' || rec.flow === 'two-step').map(([k, label, hint]) => (
          <FieldRow key={k} label={label} hint={hint}><Input value={rec[k]} onChange={(e) => set(k, e.target.value)} className="font-mono" placeholder={hint} /></FieldRow>
        ))}
        <FieldRow label="Notes" hint="returned to the agent alongside the recipe"><Textarea rows={2} value={rec.notes} onChange={(e) => set('notes', e.target.value)} /></FieldRow>
      </div>
      <div className="mt-4"><Button disabled={busy || !dirty} style={dirty ? { background: ACCENT } : undefined} onClick={() => save({ recipe: rec })}>Save recipe</Button></div>
    </section>
  )
}

function TestPanel({ account }) {
  const cmd = `hb_login(${JSON.stringify(account.slug)})`
  const prompt = `Open a horse-browser session and run ${cmd} — it logs into ${account.label} end to end from LastPass. Report the returned {state, detail}; don't print any secret.`
  const history = account.status?.history || []
  return (
    <section>
      <Label>Test · hand to an agent</Label>
      <Text className="mt-1.5 max-w-2xl text-[13.5px] text-zinc-500 dark:text-zinc-400">
        One call signs in and reports back — the row below updates itself. Needs a saved recipe (username + password selectors at minimum).
      </Text>
      <div className="mt-3 flex items-center gap-2">
        <div className="min-w-0 flex-1"><CopyBox code={cmd} className="my-0" /></div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-950/10 bg-white/60 px-2.5 py-1 text-[12px] text-zinc-500 dark:border-white/10 dark:bg-zinc-900/50">agent prompt <CopyBoom value={prompt} title="Copy the agent prompt" /></span>
      </div>
      <div className="mt-4">
        <div className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400">Report history</div>
        {history.length === 0 ? (
          <Text className="mt-1 text-[12.5px] text-zinc-400">No attempts yet.</Text>
        ) : (
          <ul className="mt-2 divide-y divide-zinc-950/5 dark:divide-white/10">
            {history.map((h, i) => {
              const m = STATUS_META[h.state] || { color: 'zinc', label: h.state }
              return (
                <li key={i} className="flex items-start gap-3 py-2">
                  <span className="mt-1"><StatusDot color={m.color} /></span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[12.5px]"><span className="font-medium text-zinc-700 dark:text-zinc-200">{m.label}</span><span className="font-mono text-[10.5px] text-zinc-400">{ago(h.at)}</span></div>
                    {h.detail && <div className="text-[12px] text-zinc-500 dark:text-zinc-400">{h.detail}</div>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}

function DangerRow({ account, navigate, reload }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const remove = async () => {
    setBusy(true)
    try { const r = await fetch(`${API}/accounts/${account.slug}`, { method: 'DELETE' }).then((x) => x.json()); if (r.ok) { await reload(); navigate('') } }
    finally { setBusy(false); setOpen(false) }
  }
  return (
    <section className="flex items-center justify-between gap-3 rounded-lg border border-red-500/25 px-3.5 py-2.5">
      <div className="text-[12.5px] text-zinc-500 dark:text-zinc-400">Remove this account from hb-auth. The vault login itself is untouched.</div>
      <Button outline onClick={() => setOpen(true)}>Unregister</Button>
      <Alert open={open} onClose={setOpen}>
        <AlertTitle>Unregister {account.label}?</AlertTitle>
        <AlertDescription>Drops the account, its recipe, and its status history from hb-auth. The LastPass vault item stays as it is.</AlertDescription>
        <AlertActions>
          <Button plain onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={busy} onClick={remove} style={{ background: '#dc2626' }}>Unregister</Button>
        </AlertActions>
      </Alert>
    </section>
  )
}

// Plain-text disconnect for a set-up source — lives inside the source's right-hand
// card (not a big red row). Same confirm + manual-notice flow as DisconnectRow.
function DisconnectLink({ name, endpoint, warn, onDone, lock }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [manual, setManual] = useState(null)
  const go = async () => {
    setBusy(true)
    try { const r = await postJSON(endpoint); if (r.ok) { setManual(r.manual || 'Disconnected.'); onDone && onDone() } }
    finally { setBusy(false); setOpen(false) }
  }
  if (manual) return (
    <div className="flex items-start gap-2 text-[12px] text-zinc-500 dark:text-zinc-400">
      <span className="mt-1"><StatusDot color="amber" /></span>
      <div><Strong className="text-zinc-700 dark:text-zinc-200">Disconnected.</Strong> {manual}</div>
    </div>
  )
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title={lock ? 'Prompts for macOS approval to confirm' : undefined} className="cursor-pointer text-[12px] text-zinc-500 underline underline-offset-2 transition hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400">{lock ? <span aria-hidden="true">🔒 </span> : null}disconnect {name}</button>
      <Alert open={open} onClose={setOpen}>
        <AlertTitle>Disconnect {name}?</AlertTitle>
        <AlertDescription>{warn} You’ll still have to log out or revoke it yourself — we’ll show you exactly how right after.</AlertDescription>
        <AlertActions>
          <Button plain onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={busy} onClick={go} style={{ background: '#dc2626' }}>Disconnect</Button>
        </AlertActions>
      </Alert>
    </>
  )
}

function AccountDetail({ slug, snap, navigate, reload }) {
  const account = (snap?.accounts || []).find((a) => a.slug === slug)
  const [busy, setBusy] = useState(false)
  const save = async (patch) => {
    setBusy(true)
    try { await postJSON('/accounts/' + slug, patch); await reload() } finally { setBusy(false) }
  }
  if (!snap) return <Text className="text-zinc-400">loading…</Text>
  if (!account) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate('')} className="inline-flex items-center gap-1.5 text-[13px] text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">← accounts</button>
        <Text className="text-zinc-500 dark:text-zinc-400">No account “{slug}”. It may have been unregistered.</Text>
      </div>
    )
  }
  return (
    <div className="space-y-10">
      <BackBar account={account} navigate={navigate} />
      <IdentityCard account={account} save={save} busy={busy} />
      <AccountMethods account={account} navigate={navigate} reload={reload} />
      <RecipeEditor account={account} save={save} busy={busy} />
      <TestPanel account={account} />
      <DangerRow account={account} navigate={navigate} reload={reload} />
    </div>
  )
}

/* --------------------------------------------------------------- SMS (SMSPool) */
function Spinner({ className = 'size-4' }) {
  return <svg viewBox="0 0 24 24" className={'animate-spin ' + className} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.2-8.6" /></svg>
}
function daysLeft(unix) {
  if (!unix) return null
  return Math.ceil((unix * 1000 - Date.now()) / 86400000)
}
function fmtSmsTime(ts) {
  const m = (ts || '').match(/\d{4}\/(\d{2}\/\d{2})\s+(\d{2}:\d{2})/)
  return m ? `${m[1]} ${m[2]}` : ts
}

function SmsMessage({ m }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span className="mt-1"><StatusDot color={m.code ? 'lime' : 'zinc'} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[12px] font-medium text-zinc-700 dark:text-zinc-200">{m.sender || 'unknown'}</span>
          <span className="font-mono text-[10.5px] text-zinc-400">{fmtSmsTime(m.at)}</span>
          {m.code && (
            <span className="ml-auto inline-flex items-center gap-1 rounded-md bg-lime-500/15 px-2 py-0.5 font-mono text-[12px] font-semibold tabular-nums text-lime-700 dark:text-lime-400">
              {m.code}<CopyName value={m.code} title="Copy the code" />
            </span>
          )}
        </div>
        <div className="mt-0.5 whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">{m.message}</div>
      </div>
    </li>
  )
}

// Live "watch for the next code" — the loading → success → timeout demo. Polls the
// same /sms-code endpoint hb_login uses, from the current inbox baseline.
function WatchForCode({ status, onRefresh }) {
  const [phase, setPhase] = useState('idle')   // idle | watching | got | timeout | error
  const [elapsed, setElapsed] = useState(0)
  const [hit, setHit] = useState(null)
  const timer = useRef(null)
  const stop = () => { if (timer.current) { clearInterval(timer.current); timer.current = null } }
  useEffect(() => stop, [])
  const start = () => {
    const base = status?.latestId || 0
    setPhase('watching'); setElapsed(0); setHit(null)
    const t0 = Date.now()
    stop()
    timer.current = setInterval(async () => {
      const secs = Math.round((Date.now() - t0) / 1000)
      setElapsed(secs)
      if (secs > 120) { stop(); setPhase('timeout'); return }
      try {
        const r = await fetch(API + '/sms-code?afterId=' + base).then((x) => x.json())
        if (r.ok) { stop(); setHit(r); setPhase('got'); onRefresh && onRefresh() }
      } catch { stop(); setPhase('error') }
    }, 4000)
  }
  const cancel = () => { stop(); setPhase('idle') }

  if (phase === 'got' && hit) {
    return (
      <div className="rounded-lg border border-lime-500/40 bg-lime-500/[0.07] p-3">
        <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-lime-700 dark:text-lime-400">
          <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
          Code received{hit.sender ? ` from ${hit.sender}` : ''}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
          <span className="font-mono text-2xl font-semibold tabular-nums tracking-[0.1em] text-zinc-900 dark:text-white">{hit.code}</span>
          <Button outline onClick={() => copyText(hit.code)}>Copy</Button>
          <button type="button" onClick={start} className="ml-auto cursor-pointer text-[12px] text-zinc-400 underline underline-offset-2 transition hover:text-zinc-600 dark:hover:text-zinc-200">watch again</button>
        </div>
      </div>
    )
  }
  if (phase === 'watching') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-zinc-950/10 bg-zinc-950/[0.02] px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex items-center gap-2 text-[12.5px] text-zinc-600 dark:text-zinc-300">
          <span className="relative flex size-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: ACCENT }} /><span className="relative inline-flex size-2.5 rounded-full" style={{ background: ACCENT }} /></span>
          Waiting for a new SMS…
          <span className="font-mono text-[11px] tabular-nums text-zinc-400">{elapsed}s</span>
        </div>
        <Button plain onClick={cancel}>Stop</Button>
      </div>
    )
  }
  if (phase === 'timeout' || phase === 'error') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/[0.06] px-3 py-2.5 text-[12.5px] text-amber-800 dark:text-amber-300">
        <span>{phase === 'error' ? 'Couldn’t reach SMSPool while watching.' : 'No new code arrived in two minutes.'}</span>
        <Button outline onClick={start}>Try again</Button>
      </div>
    )
  }
  return (
    <button type="button" onClick={start} className="group flex w-full cursor-pointer items-center gap-2.5 rounded-lg border border-dashed border-zinc-950/15 px-3 py-2.5 text-left transition hover:border-zinc-950/30 dark:border-white/15 dark:hover:border-white/30">
      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-white transition group-hover:scale-105" style={{ background: ACCENT }}>
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
      </span>
      <div className="min-w-0">
        <div className="text-[12.5px] font-medium text-zinc-800 dark:text-zinc-200">Watch for an incoming code</div>
        <div className="text-[11.5px] text-zinc-400">watch a 2FA text arrive live — the poll <Code>hb_login</Code> runs</div>
      </div>
    </button>
  )
}

function SmsInbox() {
  const [msgs, setMsgs] = useState(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => { setBusy(true); try { const r = await fetch(API + '/sms/inbox').then((x) => x.json()); setMsgs(r.messages || []) } catch { setMsgs([]) } finally { setBusy(false) } }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => self.subscribe((f) => {
    if (f.type === 'sms' && f.event) setMsgs((prev) => (prev && prev.some((m) => m.id === f.event.msgId)) ? prev : [{ id: f.event.msgId, sender: f.event.sender, message: f.event.message, code: f.event.code, at: f.event.at }, ...(prev || [])])
  }), [])
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12.5px] font-medium text-zinc-500 dark:text-zinc-400">Inbox{msgs ? ` · ${msgs.length}` : ''}</span>
        <button type="button" onClick={load} disabled={busy} title="Refresh the inbox" className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-zinc-500 transition hover:bg-zinc-950/5 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-200">
          {busy ? <Spinner className="size-3.5" /> : <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" /></svg>}
          refresh
        </button>
      </div>
      {!msgs ? (
        <div className="mt-2 flex items-center gap-2 py-6 text-[13px] text-zinc-400"><Spinner className="size-4" /> loading inbox…</div>
      ) : msgs.length === 0 ? (
        <div className="mt-2 rounded-xl border border-dashed border-zinc-950/15 px-4 py-8 text-center text-[13px] text-zinc-400 dark:border-white/15">No SMS received on this number yet.</div>
      ) : (
        <ul className="mt-1 divide-y divide-zinc-950/5 dark:divide-white/10">
          {msgs.map((m) => <SmsMessage key={m.id} m={m} />)}
        </ul>
      )}
    </div>
  )
}

/* --------------------------------------------------------------- code + markdown */
// A terminal-styled code viewer: window chrome, collapsed to a limited height with
// a fade, expands on click. Used for the read-only "what the module installs" dump.
function CodeTerminal({ code, filename, collapsedHeight = '15rem' }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const copy = () => copyText(code).then((ok) => { if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1200) } })
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-950/10 bg-zinc-950 shadow-sm dark:border-white/10 dark:bg-black">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3.5 py-2">
        <div className="flex items-center gap-2">
          <span className="flex gap-1.5" aria-hidden="true"><span className="size-2.5 rounded-full bg-red-500/70" /><span className="size-2.5 rounded-full bg-amber-500/70" /><span className="size-2.5 rounded-full bg-lime-500/70" /></span>
          {filename && <span className="ml-1 font-mono text-[11px] text-zinc-400">{filename}</span>}
        </div>
        <button type="button" onClick={copy} className="cursor-pointer rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-medium text-zinc-300 transition hover:bg-white/20">{copied ? 'copied' : 'copy'}</button>
      </div>
      <div className="relative">
        <div className="overflow-hidden transition-[max-height] duration-300 ease-in-out" style={{ maxHeight: open ? '3000px' : collapsedHeight }}>
          <pre className="overflow-x-auto p-3.5 font-mono text-[11.5px] leading-relaxed text-zinc-200 whitespace-pre">{code}</pre>
        </div>
        {!open && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-zinc-950 to-transparent dark:from-black" />}
      </div>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full cursor-pointer items-center justify-center gap-1.5 border-t border-white/10 bg-white/[0.02] py-1.5 text-[11px] font-medium text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200">
        {open ? 'collapse' : 'expand'}
        <svg viewBox="0 0 24 24" className={'size-3.5 transition-transform ' + (open ? 'rotate-180' : '')} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
    </div>
  )
}

// A small, dependency-free markdown renderer for the agent skill (headings, lists,
// fenced code, inline code/bold/em/links) — the sites-module pattern.
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
    else if (tok[0] === '*') out.push(<em key={k} className="italic">{tok.slice(1, -1)}</em>)
    else {
      const mm = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
      out.push(<a key={k} href={mm[2]} target="_blank" rel="noopener" className="underline decoration-zinc-300 underline-offset-2 hover:decoration-current dark:decoration-zinc-600">{mm[1]}</a>)
    }
    rest = rest.slice(m.index + tok.length)
  }
  return out
}
function Markdown({ src }) {
  let s = String(src || '')
  if (s.startsWith('---\n')) { const end = s.indexOf('\n---', 3); if (end !== -1) s = s.slice(end + 4) }  // strip frontmatter
  const lines = s.split('\n')
  const out = []
  let i = 0
  while (i < lines.length) {
    const ln = lines[i]
    if (ln.startsWith('```')) {
      const buf = []; i++
      while (i < lines.length && !lines[i].startsWith('```')) { buf.push(lines[i]); i++ }
      i++
      out.push(<pre key={out.length} className="my-3 overflow-x-auto rounded-lg bg-zinc-950 p-3.5 font-mono text-[11.5px] leading-relaxed text-zinc-100 dark:bg-black/60"><code>{buf.join('\n')}</code></pre>)
      continue
    }
    if (/^###\s+/.test(ln)) { out.push(<Subheading key={out.length} className="mt-6 mb-1">{mdInline(ln.replace(/^###\s+/, ''), `h3${i}`)}</Subheading>); i++; continue }
    if (/^##\s+/.test(ln)) { out.push(<Heading key={out.length} className="mt-8 mb-2">{mdInline(ln.replace(/^##\s+/, ''), `h2${i}`)}</Heading>); i++; continue }
    if (/^#\s+/.test(ln)) { out.push(<Heading key={out.length} className="mb-3 !text-2xl">{mdInline(ln.replace(/^#\s+/, ''), `h1${i}`)}</Heading>); i++; continue }
    if (/^---\s*$/.test(ln)) { out.push(<Divider key={out.length} className="my-6" />); i++; continue }
    if (/^\s*(?:[-*]|\d+\.)\s+/.test(ln)) {
      const items = []; const ordered = /^\s*\d/.test(ln)
      while (i < lines.length && /^\s*(?:[-*]|\d+\.)\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*(?:[-*]|\d+\.)\s+/, '')); i++ }
      out.push(<ul key={out.length} className="my-2 ml-5 space-y-1.5 text-[13.5px] leading-relaxed text-zinc-700 dark:text-zinc-300" style={{ listStyleType: ordered ? 'decimal' : 'disc' }}>{items.map((it, j) => <li key={j}>{mdInline(it, `li${i}-${j}`)}</li>)}</ul>)
      continue
    }
    if (ln.trim() === '') { i++; continue }
    const buf = [ln]; i++
    while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,3}\s|```|\s*(?:[-*]|\d+\.)\s|---\s*$)/.test(lines[i])) { buf.push(lines[i]); i++ }
    out.push(<Text key={out.length} className="my-2 text-[13.5px] leading-relaxed text-zinc-700 dark:text-zinc-300">{mdInline(buf.join(' '), `p${i}`)}</Text>)
  }
  return <>{out}</>
}

function HelperSection({ helper: initial, reload }) {
  const [helper, setHelper] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [selfHeal, setSelfHeal] = useState(null)
  const [healBusy, setHealBusy] = useState(false)
  const [healNote, setHealNote] = useState('')
  useEffect(() => { setHelper(initial) }, [initial])
  useEffect(() => { fetch(API + '/selfheal').then((r) => r.json()).then((c) => setSelfHeal(!!c.enabled)).catch(() => {}) }, [])
  if (!helper) return null
  const mf = helper.moduleFile
  const managed = !!(mf?.exists && helper.stubWired)
  const state = managed && mf.current ? 'ok' : managed ? 'outdated' : 'missing'
  const install = async () => {
    setBusy(true); setNote('')
    try {
      const r = await postJSON('/helpers/install')
      if (r.ok) { setHelper(r.helper); setNote('installed — running lanes pick it up on their next daemon spawn'); reload && reload() }
      else setNote(r.error || 'install failed')
    } catch { setNote('install failed') } finally { setBusy(false) }
  }
  const toggleHeal = async () => {
    const next = !selfHeal
    setHealBusy(true); setHealNote('')
    try {
      const r = await postJSON('/selfheal', { enabled: next })
      if (r.ok) { setSelfHeal(!!r.enabled); if (r.helper) setHelper(r.helper); setHealNote(r.repaired?.ran ? 're-wired just now' : next ? 'on' : 'off') }
      else setHealNote(r.error || 'failed')
    } catch { setHealNote('failed') } finally { setHealBusy(false) }
  }
  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <Label>The agent helpers · shipped by this module</Label>
        <Badge color={state === 'ok' ? 'lime' : 'zinc'}>{state === 'ok' ? 'installed' : state === 'outdated' ? 'update available' : 'not installed'}</Badge>
      </div>
      <Text className="mt-1.5 max-w-2xl text-[13.5px] text-zinc-500 dark:text-zinc-400">
        The module owns <Code>{mf?.path || 'atelier_login_helpers.py'}</Code> and overwrites it on every install/update; a one-time stub in <Code>agent_helpers.py</Code> (which browser-harness auto-loads on every call) loads it — your own code in that file is never touched.
      </Text>
      <div className={'mt-4 flex items-center justify-between gap-3 rounded-lg px-3.5 py-2.5 ' + (state === 'ok' ? 'bg-lime-500/10 dark:bg-lime-400/10' : 'bg-zinc-950/[0.03] dark:bg-white/[0.04]')}>
        <div className="flex min-w-0 items-center gap-2.5 text-[13px] text-zinc-600 dark:text-zinc-300">
          <StatusDot color={state === 'ok' ? 'lime' : state === 'outdated' ? 'amber' : 'zinc'} />
          <span className="min-w-0 truncate">
            {state === 'ok' ? <>installed &amp; current — <Code>{mf.path}</Code></>
              : state === 'outdated' ? 'installed, but the module ships a newer version'
              : !helper.fileExists ? 'browser-harness workspace not found — install browser-harness first'
              : 'not installed — agents can’t call hb_login / lastpass_fill yet'}
          </span>
          <span className="shrink-0 text-[12px] text-zinc-400">{note}</span>
        </div>
        {state !== 'ok' && helper.fileExists && (
          <Button outline disabled={busy} onClick={install}>{state === 'outdated' ? 'Update helpers' : 'Install helpers'}</Button>
        )}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-4 rounded-lg border border-zinc-950/[0.06] px-3.5 py-2.5 dark:border-white/10">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] font-medium text-zinc-700 dark:text-zinc-200">
            Auto-repair{healNote && <span className="text-[11.5px] font-normal text-zinc-400">· {healNote}</span>}
          </div>
          <div className="mt-0.5 max-w-xl text-[12.5px] text-zinc-500 dark:text-zinc-400">
            Re-wires the load stub in <Code>agent_helpers.py</Code> if a stray cleanup orphans the helpers, re-templates the file's API base after a port/mount change, and re-asserts the hint hook below when it drifts. Off = only the manual buttons repair them.
          </div>
        </div>
        <Toggle on={!!selfHeal} disabled={healBusy || selfHeal === null} onClick={toggleHeal} />
      </div>
      <ul className="mt-4 divide-y divide-zinc-950/5 dark:divide-white/10">
        {(helper.helpers || []).map((h) => (
          <li key={h.name} className="flex items-start gap-3 py-2.5">
            <span className="mt-1"><StatusDot color={h.installed ? 'lime' : 'zinc'} /></span>
            <div className="min-w-0">
              <code className="font-mono text-[12.5px] text-zinc-800 dark:text-zinc-200">{h.signature}</code>
              <div className="text-[13px] text-zinc-500 dark:text-zinc-400">{h.summary}</div>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-4">
        <div className="mb-1.5 text-[12px] font-medium text-zinc-500 dark:text-zinc-400">What the module installs (read-only — Install/Update writes exactly this)</div>
        <CodeTerminal code={helper.code} filename="atelier_login_helpers.py" />
      </div>
    </div>
  )
}

function HintTemplateEditor({ which, label, cfg, post, busy }) {
  const block = cfg?.[which]
  const [tpl, setTpl] = useState('')
  useEffect(() => { if (block) setTpl(block.template) }, [block?.template])
  if (!block) return null
  const dirty = tpl !== block.template
  const preview = '🐴 horse-browser: ' + (tpl || '').replace(/\{name\}/g, 'github.com').replace(/\{host\}/g, 'github.com').replace(/\{slug\}/g, 'github')
  return (
    <div>
      <div className="text-[12.5px] font-medium text-zinc-600 dark:text-zinc-300">{label}</div>
      <textarea value={tpl} onChange={(e) => setTpl(e.target.value)} rows={2} spellCheck={false}
        className="mt-1.5 w-full resize-y rounded-lg border border-zinc-950/10 bg-white/60 p-3 font-mono text-[12.5px] leading-relaxed text-zinc-800 outline-none focus:border-zinc-400 dark:border-white/10 dark:bg-zinc-900/40 dark:text-zinc-200 dark:focus:border-white/30" />
      <div className="mt-1.5 rounded-lg bg-zinc-950/[0.03] px-3 py-2 font-mono text-[12px] leading-relaxed text-zinc-500 dark:bg-white/[0.04] dark:text-zinc-400">{preview}</div>
      <div className="mt-2 flex items-center gap-2">
        <Button disabled={busy || !dirty || !tpl.trim()} style={dirty ? { background: ACCENT } : undefined} onClick={() => post('/hints-config', { [which]: tpl }, 'saved')}>Save</Button>
        {!block.isDefault && <Button outline disabled={busy} onClick={() => post('/hints-config', { [which]: '' }, 'reset')}>Reset to default</Button>}
      </div>
    </div>
  )
}

function HintsSection() {
  const [cfg, setCfg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const load = useCallback(() => fetch(API + '/hints-config').then((r) => r.json()).then(setCfg).catch(() => {}), [])
  useEffect(() => { load() }, [load])
  const post = async (path, body, okNote) => {
    setBusy(true); setNote('')
    try { const r = await postJSON(path, body); setNote(r.ok ? okNote : (r.error || 'failed')); if (r.ok) await load() }
    catch { setNote('failed — is the server reachable?') } finally { setBusy(false) }
  }
  const hook = cfg?.hook
  const hookDot = hook?.state === 'ok' ? 'lime' : hook?.state === 'missing' ? 'zinc' : 'amber'
  const hookLabel = !hook ? 'checking…'
    : hook.state === 'ok' ? <>hook installed — <Code>{hook.path}</Code></>
    : hook.state === 'missing' ? 'hook not installed — agents get no credential hints yet'
    : hook.state === 'foreign' ? <>an unrecognised file sits at <Code>{hook.path}</Code> — installing replaces it</>
    : 'hook outdated — reinstall to refresh it'
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <Label>Credential hints · agents learn a site has a login</Label>
        <span className="text-[12px] text-zinc-400">{note}</span>
      </div>
      <Text className="mt-1.5 max-w-2xl text-[13.5px] text-zinc-500 dark:text-zinc-400">
        On the first navigation to each host, horse-browser runs every hook in <Code>~/.config/horse-browser/hints.d/</Code> and surfaces its output as a <Code>🐴</Code> line. Ours curls this module's <Code>/hints</Code>: a <em>registered</em> site points the agent at <Code>hb_login</Code>, a vault-only site at <Code>lastpass_fill</Code>.
      </Text>
      <div className={'mt-4 flex items-center justify-between gap-3 rounded-lg px-3.5 py-2.5 ' + (hook?.state === 'ok' ? 'bg-lime-500/10 dark:bg-lime-400/10' : 'bg-zinc-950/[0.03] dark:bg-white/[0.04]')}>
        <div className="flex min-w-0 items-center gap-2.5 text-[13px] text-zinc-600 dark:text-zinc-300">
          <StatusDot color={hookDot} />
          <span className="min-w-0 truncate">{hookLabel}</span>
          {hook && !hook.helpersReady && <span className="shrink-0 text-amber-600 dark:text-amber-400">· horse-browser helpers lack hints.d — re-run its install.sh</span>}
        </div>
        {hook && hook.state !== 'ok' && (
          <Button outline disabled={busy} onClick={() => post('/hints-hook/install', null, 'hook installed')}>{hook.state === 'missing' ? 'Install hook' : 'Reinstall hook'}</Button>
        )}
      </div>
      <div className="mt-4 space-y-5">
        <HintTemplateEditor which="registered" label="Registered site → hb_login" cfg={cfg} post={post} busy={busy} />
        <HintTemplateEditor which="unregistered" label="Vault-only site → lastpass_fill" cfg={cfg} post={post} busy={busy} />
      </div>
      <Text className="mt-3 text-[12px] text-zinc-400">
        Placeholders: {Object.entries(cfg?.placeholders || {}).map(([k, v], i) => <span key={k}>{i > 0 && ' · '}<Code>{k}</Code> <span className="text-zinc-400">{v}</span></span>)}
      </Text>
    </div>
  )
}

function MethodsPage({ snap, reload, navigate }) {
  const methods = snap?.methods || []
  return (
    <div className="space-y-11">
      <section>
        <Label>Login methods</Label>
        <Text className="mt-1.5 max-w-2xl text-[13.5px] text-zinc-500 dark:text-zinc-400">
          How a credential is produced. LastPass password, LastPass TOTP, and SMS (SMSPool) are live; email + the other password managers are roadmap — each slots in as a new method plus one branch in <Code>hb_login</Code>. Configure them on their <button type="button" onClick={() => navigate('')} className="cursor-pointer underline underline-offset-2">Source</button> pages; this page is the plumbing underneath.
        </Text>
        <div className="mt-4 overflow-hidden rounded-xl border border-zinc-950/10 dark:border-white/10">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead className="bg-zinc-50/95 dark:bg-zinc-800/95">
              <tr className="text-[11px] uppercase tracking-wide text-zinc-400">
                <th className="px-3 py-2 font-medium">Method</th>
                <th className="px-3 py-2 font-medium">Kind</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">What it does</th>
                <th className="px-3 py-2 font-medium">Helpers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-950/5 dark:divide-white/10">
              {methods.map((m) => (
                <tr key={m.id} className={'align-top ' + (m.impl ? '' : 'opacity-55')}>
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium text-zinc-900 dark:text-white">{m.name}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-400">{m.kind}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {m.state === 'configured' ? <Badge color="lime">configured</Badge>
                      : m.state === 'available' ? <Badge color="zinc">available</Badge>
                      : <span className="rounded-md border border-zinc-950/15 px-2 py-0.5 text-[11px] text-zinc-400 dark:border-white/15">roadmap</span>}
                  </td>
                  <td className="max-w-md whitespace-normal px-3 py-2.5 text-zinc-500 dark:text-zinc-400">
                    {m.desc}
                    {m.requires && <div className="mt-0.5 text-[11.5px] text-zinc-400">Requires: {m.requires}</div>}
                  </td>
                  <td className="whitespace-normal px-3 py-2.5">
                    {m.helpers?.length ? <div className="flex flex-wrap gap-1">{m.helpers.map((h) => <Code key={h}>{h}</Code>)}</div> : <span className="text-zinc-400">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <HelperSection helper={snap?.helper} reload={reload} />
      <HintsSection />
    </div>
  )
}

/* --------------------------------------------------------------- skill view */
function SkillView({ navigate }) {
  const [md, setMd] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => { fetch(API + '/skill.md').then((r) => r.text()).then(setMd).catch((e) => setErr(String((e && e.message) || e))) }, [])
  const fullUrl = (typeof window !== 'undefined' ? window.location.origin : '') + API + '/skill.md'
  const prompt = `I'm giving you a skill — read it and use it: ${fullUrl}`
  return (
    <div>
      <button type="button" onClick={() => navigate('')} className="mb-5 inline-flex cursor-pointer items-center gap-1.5 text-[13px] text-zinc-500 transition hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        overview
      </button>
      <div className="rounded-xl border border-zinc-950/[0.06] bg-zinc-50 p-4 dark:border-white/10 dark:bg-zinc-900/50">
        <div className="flex items-center gap-2">
          <span className="inline-flex shrink-0" style={{ color: ACCENT }}><AgentSpark /></span>
          <span className="text-[13.5px] font-semibold text-zinc-900 dark:text-white">Hand this to an agent</span>
        </div>
        <Text className="mt-1.5 text-[13px] text-zinc-600 dark:text-zinc-400">
          The skill below is generated live with this machine's URL and leads with the Bitwarden broker. Paste this into a fresh session, or copy the whole skill.
        </Text>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1"><CopyBox code={prompt} className="!my-0" /></div>
          <Button outline onClick={() => copyText(md || '')}>Copy skill</Button>
        </div>
      </div>
      <div className="mt-7 max-w-3xl">
        {err && <Text className="text-[13px] text-red-600 dark:text-red-400">Couldn't load the skill: {err}</Text>}
        {md == null && !err && <div className="flex items-center gap-2 text-[13px] text-zinc-400"><Spinner className="size-4" /> loading…</div>}
        {md != null && <Markdown src={md} />}
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- data + module */
function useAuthState() {
  const [snap, setSnap] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const load = useCallback(() => fetch(API + '/state').then((r) => r.json()).then(setSnap).catch(() => {}), [])
  useEffect(() => { load() }, [load])
  usePoll(() => load(), 30000)
  // while the TOTP scan is running, re-poll quickly so the badges fill in soon
  useEffect(() => { if (snap?.totpScanning) { const t = setTimeout(() => load(), 3000); return () => clearTimeout(t) } }, [snap?.totpScanning, load])
  useEffect(() => {
    return self.subscribe((frame) => {
      if (frame.type === 'accounts-changed' || frame.type === 'login-report' || frame.type === 'sync-done') load()
    })
  }, [load])
  const sync = useCallback(async () => { setSyncing(true); try { await postJSON('/sync'); await load() } finally { setSyncing(false) } }, [load])
  return { snap, reload: load, sync, syncing }
}

const STYLE_ROOT = `.ha-root h1,.ha-root h2,.ha-root h3{letter-spacing:-0.01em}`

/* --------------------------------------------------------------- broker page */
const TIER_META = {
  auto:  { color: 'lime',  label: 'auto',  blurb: 'no prompt — used silently in unattended flows' },
  ask:   { color: 'amber', label: 'ask',   blurb: 'macOS approval every use' },
  never: { color: 'zinc',  label: 'never', blurb: 'blocked' },
}
function TierPill({ tier }) {
  const m = TIER_META[tier] || TIER_META.never
  return <Badge color={m.color}>{m.label}</Badge>
}

function BrokerStatus({ status }) {
  if (!status) return <div className="flex items-center gap-2 text-[13px] text-zinc-400"><Spinner className="size-4" /> reaching the broker…</div>
  const v = status.vault || {}
  const bwState = v.bwStatus || 'unknown'
  const shortServer = (v.server || '').replace(/^https?:\/\//, '')
  const rows = [
    ['daemon', status.installed ? (status.ok ? <span className="inline-flex items-center gap-1.5"><StatusDot color="lime" />running</span> : <span className="inline-flex items-center gap-1.5"><StatusDot color="red" />installed, not answering</span>) : (status.building ? <span className="inline-flex items-center gap-1.5"><Spinner className="size-3.5" />compiling…</span> : <span className="inline-flex items-center gap-1.5"><StatusDot color="zinc" />not built</span>)],
    ['bitwarden cli', bwState === 'no-cli' ? <span className="inline-flex items-center gap-1.5"><StatusDot color="red" />not installed</span> : bwState === 'unauthenticated' ? <span className="inline-flex items-center gap-1.5"><StatusDot color="amber" />not logged in</span> : <span className="inline-flex items-center gap-1.5"><StatusDot color="lime" />{bwState}</span>],
    ...(v.email ? [['account', <span className="font-mono text-[12px] text-zinc-700 dark:text-zinc-200">{v.email}</span>]] : []),
    ...(v.server ? [['server', <span className="font-mono text-[12px] text-zinc-700 dark:text-zinc-200">{shortServer}</span>]] : []),
    ['session token', v.hasSession ? <span className="inline-flex items-center gap-1.5"><StatusDot color="lime" />in the login Keychain</span> : <span className="inline-flex items-center gap-1.5"><StatusDot color="red" />not connected</span>],
    ['vault session', v.warm
      ? <span className="inline-flex items-center gap-1.5"><StatusDot color="lime" />warm</span>
      : v.hasSession
        ? <span className="inline-flex items-center gap-1.5"><StatusDot color="zinc" />cold (unlocks on demand)</span>
        : <span className="inline-flex items-center gap-1.5"><StatusDot color="red" />none — connect first</span>],
  ]
  return (
    <div className="grid gap-y-1">
      {rows.map(([k, val]) => (
        <div key={k} className="flex items-center justify-between border-b border-zinc-950/5 py-1.5 dark:border-white/5">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400">{k}</span>
          <span className="text-[13px] text-zinc-700 dark:text-zinc-200">{val}</span>
        </div>
      ))}
    </div>
  )
}

// The connect box (left column, SMSPool-card style). ONE command — `hb-broker setup`
// does the login + token internally with bw's output captured, so the token/passwords
// never print. The "install the CLI" step lives with the status on the right.
function ConnectBox({ status, setupCmd, cli }) {
  const v = status?.vault || {}
  const cliReady = !!v.bwStatus && v.bwStatus !== 'no-cli'
  const needToken = !v.hasSession
  if (!cliReady || !needToken) return null
  const bin = cli || 'hb-broker'
  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/[0.06] p-4">
      <div className="text-[13.5px] font-medium text-amber-800 dark:text-amber-300">Connect your Bitwarden</div>
      <Text className="mt-1 text-[13px] text-zinc-600 dark:text-zinc-400">
        Run this one command. It prompts for your server, email, and master password (typed hidden), then logs in and mints the token <Strong className="text-zinc-700 dark:text-zinc-200">inside the daemon</Strong> — so nothing (no token, no passwords) is ever printed to your terminal. Only the token is stored, in the code-signature-bound Keychain; your master password is never saved.
      </Text>
      <div className="mt-3"><CopyLine text={setupCmd || `${bin} setup`} /></div>
      <Text className="mt-2 text-[12px] text-zinc-500 dark:text-zinc-400">
        <Strong className="text-zinc-600 dark:text-zinc-300">We don't recommend running <Code>bw login</Code> yourself</Strong> — bw prints the session token (full vault access) straight to your terminal.
      </Text>
    </div>
  )
}

function CopyLine({ text }) {
  const [ok, setOk] = useState(false)
  return (
    <button type="button" onClick={async () => { if (await copyText(text)) { setOk(true); setTimeout(() => setOk(false), 1200) } }}
      className="mt-1.5 flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-zinc-950/10 bg-white/60 px-2.5 py-1.5 text-left font-mono text-[12px] text-zinc-700 transition hover:border-zinc-950/20 dark:border-white/10 dark:bg-zinc-900/50 dark:text-zinc-200">
      <span className="truncate">{text}</span>
      <span className="shrink-0 text-[10px] uppercase tracking-wide text-zinc-400">{ok ? 'copied' : 'copy'}</span>
    </button>
  )
}

// Group access levels: off (not granted — hard deny), ask (macOS approval each use),
// auto (silent, unattended). "never" from the daemon collapses to "off" here.
const GROUP_TIERS = [
  { v: 'off',  label: 'off',  hint: 'not granted — agents can\'t touch it' },
  { v: 'ask',  label: 'ask',  hint: 'macOS approval every use' },
  { v: 'auto', label: 'auto', hint: 'always, no prompt — unattended' },
]

function GroupPicker({ policy, groups, onLoadGroups, loadingGroups, onSave, saving, saveMsg }) {
  const [tiers, setTiers] = useState({})     // groupKey → 'off' | 'ask' | 'auto'
  const [idle, setIdle] = useState(3600)
  const meta = useRef({})                    // groupKey → { kind, name, count }

  // Seed from the persisted policy (cheap; no vault unlock) so grants show at once.
  useEffect(() => {
    if (!policy) return
    const g = policy.groups || {}
    const t = {}
    for (const [k, r] of Object.entries(g)) { t[k] = r.tier === 'never' ? 'off' : (r.tier || 'off'); meta.current[k] = { kind: r.kind, name: r.name } }
    setTiers(t)
    setIdle(policy.idleUnlockSec || 3600)
  }, [policy])

  // Merge in the loaded collection/folder list (names + counts) once fetched.
  useEffect(() => {
    if (!groups) return
    for (const g of groups) meta.current[g.key] = { kind: g.kind, name: g.name, count: g.count }
    setTiers((t) => { const n = { ...t }; for (const g of groups) if (!(g.key in n)) n[g.key] = g.tier && g.tier !== 'never' ? g.tier : 'off'; return n })
  }, [groups])

  const keys = Object.keys(meta.current).sort((a, b) => (meta.current[a].name || a).localeCompare(meta.current[b].name || b))
  const setTier = (k, v) => setTiers((t) => ({ ...t, [k]: v }))
  const grantedCount = Object.values(tiers).filter((v) => v && v !== 'off').length

  const save = () => {
    const out = {}
    for (const [k, v] of Object.entries(tiers)) {
      if (v === 'off' || !v) continue
      const m = meta.current[k] || {}
      out[k] = { kind: m.kind || (k.startsWith('fld:') ? 'folder' : 'collection'), name: m.name || k, tier: v }
    }
    onSave({ version: 2, idleUnlockSec: Math.max(60, Number(idle) || 3600), groups: out })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Subheading className="!text-[14px]">Access by collection</Subheading>
        <div className="flex items-center justify-end gap-3">
          <p className="max-w-[16rem] text-right text-[11px] leading-snug text-zinc-400 dark:text-zinc-500">
            Re-reads your live vault from Bitwarden to refresh counts.
          </p>
          <button type="button" onClick={onLoadGroups} disabled={loadingGroups}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-950/10 px-2.5 py-1.5 text-[12px] text-zinc-600 transition hover:border-zinc-950/20 disabled:opacity-50 dark:border-white/10 dark:text-zinc-300">
            {loadingGroups ? <Spinner className="size-3.5" /> : null} {groups ? 'Rescan' : 'Load collections'}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-950/10 dark:border-white/10">
        <table className="w-full min-w-[40rem] text-[13px]">
          <thead>
            <tr className="border-b border-zinc-950/10 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400 dark:border-white/10">
              <th className="px-3 py-2 font-medium">collection / folder</th>
              <th className="px-3 py-2 font-medium">items</th>
              <th className="px-3 py-2 font-medium">access</th>
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 && (
              <tr><td colSpan={3} className="px-3 py-6 text-center text-[13px] text-zinc-400">
                {groups ? 'No collections or folders in this Bitwarden account.' : 'Load your Bitwarden collections to grant access.'}
              </td></tr>
            )}
            {keys.map((k) => {
              const m = meta.current[k] || {}
              const t = tiers[k] || 'off'
              return (
                <tr key={k} className="border-b border-zinc-950/5 last:border-0 dark:border-white/5">
                  <td className="px-3 py-2">
                    <span className="text-zinc-800 dark:text-zinc-100">{m.name || k}</span>
                    <Badge color={m.kind === 'folder' ? 'zinc' : 'sky'} className="ml-2">{m.kind || 'collection'}</Badge>
                  </td>
                  <td className="px-3 py-2 font-mono text-[12px] text-zinc-400">{m.count != null ? m.count : '—'}</td>
                  <td className="px-3 py-2">
                    <div className="inline-flex overflow-hidden rounded-lg border border-zinc-950/10 dark:border-white/10">
                      {GROUP_TIERS.map(({ v, label, hint }) => (
                        <button key={v} type="button" title={hint} onClick={() => setTier(k, v)}
                          className={'cursor-pointer px-2.5 py-1 text-[12px] transition ' + (t === v
                            ? (v === 'auto' ? 'bg-lime-500 text-white dark:bg-lime-500' : v === 'ask' ? 'bg-amber-500 text-white dark:bg-amber-500' : 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900')
                            : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white')}>
                          {label}
                        </button>
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
        <span className="text-[12px] text-zinc-400">{grantedCount} collection{grantedCount === 1 ? '' : 's'} granted</span>
        <label className="flex items-center gap-2 text-[12px] text-zinc-500 dark:text-zinc-400">
          re-lock the vault after
          <input type="number" min="60" value={idle} onChange={(e) => setIdle(e.target.value)} className="w-20 rounded-md border border-zinc-950/10 bg-transparent px-2 py-1 text-right font-mono text-[12px] text-zinc-800 outline-none focus:border-zinc-950/30 dark:border-white/10 dark:text-zinc-100" />
          s idle
        </label>
      </div>

      <div className="flex items-center gap-3">
        <Button color="dark" onClick={save} disabled={saving}><span aria-hidden="true" className="mr-1">🔒</span>{saving ? 'saving…' : 'Save access'}</Button>
        {saveMsg && <span className={'text-[12.5px] ' + (saveMsg.ok ? 'text-lime-600 dark:text-lime-400' : 'text-red-500')}>{saveMsg.text}</span>}
        <span className="text-[11.5px] text-zinc-400">Approves a new or raised grant.</span>
      </div>
    </div>
  )
}

const EVENT_LABEL = {
  type_secret: 'typed password', type_totp: 'typed 2FA code',
  get_secret: 'read password', get_totp: 'read 2FA code',
  policy_set: 'access change', lock: 'locked vault', reset: 'disconnected',
}
const TIER_INK = { auto: 'text-lime-600 dark:text-lime-400', ask: 'text-amber-600 dark:text-amber-400', off: 'text-zinc-400', never: 'text-zinc-400' }

// Session codename — byte-identical to claude5iq / statusline.sh / the tab grouper, so an
// agent shows the SAME emoji + callsign here as it does in the rail, statusline, and
// sessions dashboard. FNV-1a (32-bit) + a murmur3 finalizer.
const CODE_COLORS = { red: '#dc2626', orange: '#ea580c', yellow: '#ca8a04', green: '#16a34a', cyan: '#0891b2', blue: '#2563eb', purple: '#9333ea', pink: '#db2777' }
const CODES = [
  ['🔥', 'red'], ['🍎', 'red'], ['🍓', 'red'], ['🍒', 'red'], ['🌹', 'red'], ['🐞', 'red'],
  ['🦊', 'orange'], ['🍊', 'orange'], ['🦁', 'orange'], ['🐯', 'orange'], ['🥕', 'orange'], ['🏀', 'orange'],
  ['🍋', 'yellow'], ['🌻', 'yellow'], ['⭐', 'yellow'], ['🐝', 'yellow'], ['🍌', 'yellow'], ['🐥', 'yellow'],
  ['🐸', 'green'], ['🍀', 'green'], ['🌵', 'green'], ['🐢', 'green'], ['🌲', 'green'], ['🐍', 'green'],
  ['🐬', 'cyan'], ['🌊', 'cyan'], ['💎', 'cyan'], ['🧊', 'cyan'], ['🐳', 'cyan'], ['💧', 'cyan'],
  ['🐧', 'blue'], ['🫐', 'blue'], ['🦋', 'blue'], ['🌀', 'blue'], ['🌐', 'blue'], ['🐟', 'blue'],
  ['🦄', 'purple'], ['🍇', 'purple'], ['🔮', 'purple'], ['🐙', 'purple'], ['🍆', 'purple'], ['👾', 'purple'],
  ['🌸', 'pink'], ['🐷', 'pink'], ['🦩', 'pink'], ['🍑', 'pink'], ['🌷', 'pink'], ['🌺', 'pink'],
]
function codeHash32(s) {
  let h = 0x811c9dc5
  for (let i = 0; i < (s || '').length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16
  return h >>> 0
}
function codename(id) {
  const [e, c] = CODES[codeHash32(id || '') % CODES.length]
  return { callsign: (id || '').slice(-4).toUpperCase(), emoji: e, hex: CODE_COLORS[c] }
}

function AuditFeed({ events }) {
  if (!events) return <div className="flex items-center gap-2 text-[13px] text-zinc-400"><Spinner className="size-4" /> loading…</div>
  if (events.length === 0) return <Text className="text-[13px] text-zinc-400">No access events yet. Every fill and value request lands here.</Text>
  const resultColor = (e) => (e.result === 'ok' ? 'lime' : e.result === 'denied' ? 'red' : 'zinc')
  return (
    <div className="space-y-1.5">
      {events.map((e, i) => {
        const account = e.item || e.cred   // human name; falls back to whatever id the agent passed
        const cn = codename(e.session)
        return (
          <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-zinc-950/5 py-1.5 text-[12.5px] dark:border-white/5">
            <StatusDot color={resultColor(e)} />
            <span className="font-mono text-[11.5px] text-zinc-400">{(e.ts || '').replace('T', ' ').replace('Z', '')}</span>
            <span className="text-zinc-700 dark:text-zinc-200">{EVENT_LABEL[e.event] || e.event}</span>
            {account && <span className="font-medium text-zinc-900 dark:text-white">{account}</span>}
            {e.username && <span className="text-zinc-400">{e.username}</span>}
            {e.hasTotp && <Badge color="cyan">totp</Badge>}
            {e.host && <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">on {e.host}</span>}
            {e.tier && <TierPill tier={e.tier} />}
            {(e.changes || []).map((c, j) => (
              <span key={j} className="inline-flex items-center gap-1.5">
                <span className="font-medium text-zinc-800 dark:text-zinc-100">{c.name}</span>
                <span className="text-zinc-400">{c.from} →</span>
                <span className={'font-medium ' + (TIER_INK[c.to] || 'text-zinc-500')}>{c.to}</span>
              </span>
            ))}
            {e.result === 'denied' && <span className="text-red-500">{e.reason}</span>}
            <span className="ml-auto inline-flex items-center gap-1 pl-2" title={e.session}>
              <span aria-hidden="true" className="text-[11px]">{cn.emoji}</span>
              <span className="font-mono text-[11px] font-semibold" style={{ color: cn.hex }}>{cn.callsign}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

// One place that explains every macOS prompt hb-broker can raise. Buttons that
// trigger one carry a 🔒 + a one-line specific reason; the detail lives here.
function PromptsCallout() {
  const row = (title, body) => (
    <li className="flex gap-2">
      <span aria-hidden="true" className="mt-px shrink-0 text-zinc-400">🔒</span>
      <span><Strong className="text-zinc-700 dark:text-zinc-200">{title}</Strong> — {body}</span>
    </li>
  )
  return (
    <div className="mt-5 flex gap-4 rounded-xl border border-zinc-950/10 bg-zinc-50/70 p-4 dark:border-white/10 dark:bg-zinc-900/40">
      <div aria-hidden="true" className="shrink-0 text-[34px] leading-none">🔒</div>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-100">What the 🔒 means</div>
        <Text className="mt-1 text-[12.5px] text-zinc-500 dark:text-zinc-400">
          Anything marked 🔒 hands off to macOS's own security — a real prompt no script can fake or click for you. There are three:
        </Text>
        <ul className="mt-2 space-y-1.5 text-[12.5px] text-zinc-500 dark:text-zinc-400">
          {row('macOS approval — approve a grant', 'confirms the change when you grant or raise a collection’s access. Lowering or removing is silent.')}
          {row('macOS approval — an agent uses an “ask” credential', 'each time an agent fills a login you set to ask, you approve it live. auto fills are silent.')}
          {row('“Always Allow” — once per update', 'after the daemon is rebuilt, macOS re-confirms this exact binary may read the vault token (its identity changed).')}
        </ul>
        <Text className="mt-2 text-[12px] text-zinc-400 dark:text-zinc-500">
          The approvals are your Mac’s <Strong className="text-zinc-500 dark:text-zinc-400">login-password</Strong> prompt — a background daemon can’t present the Touch ID sheet, but it’s the same macOS device authentication, unfakeable by any script. Unlocking the vault itself is <Strong className="text-zinc-500 dark:text-zinc-400">silent</Strong> — only this exact binary can read the token. Viewing collections is free (cached, non-secret).
        </Text>
      </div>
    </div>
  )
}

function BitwardenSource({ navigate }) {
  const [status, setStatus] = useState(null)
  const [policy, setPolicy] = useState(null)
  const [audit, setAudit] = useState(null)
  const [groups, setGroups] = useState(null)
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState(null)

  const loadStatus = useCallback(async () => { try { setStatus(await fetch(API + '/broker/status').then((r) => r.json())) } catch {} }, [])
  const loadPolicy = useCallback(async () => { try { const r = await fetch(API + '/broker/policy').then((x) => x.json()); if (r.ok) setPolicy(r.policy) } catch {} }, [])
  const loadAudit = useCallback(async () => { try { const r = await fetch(API + '/broker/audit?n=100').then((x) => x.json()); if (r.ok) setAudit((r.events || []).slice().reverse()) } catch {} }, [])

  // Auto-load the cached collection metadata on mount — no unlock, no prompt
  // (collection names/counts aren't secrets). `needsScan` ⇒ never scanned yet.
  const loadCachedGroups = useCallback(async () => {
    try { const r = await fetch(API + '/broker/groups').then((x) => x.json()); if (r.ok && !r.needsScan) setGroups(r.groups || []) } catch {}
  }, [])

  useEffect(() => { loadStatus(); loadPolicy(); loadAudit(); loadCachedGroups() }, [loadStatus, loadPolicy, loadAudit, loadCachedGroups])
  useEffect(() => {
    const unsub = self.subscribe((f) => {
      if (f.type === 'broker-status' && f.status) setStatus(f.status)                               // pushed on change by the backend watcher
      if (f.type === 'broker-audit' && f.event) setAudit((a) => [f.event, ...(a || [])].slice(0, 200))
    })
    // 45s visible re-GET: presence for the backend watcher + staleness net
    const t = setInterval(() => { if (!document.hidden) loadStatus() }, 45000)
    const onVis = () => { if (!document.hidden) loadStatus() }
    document.addEventListener('visibilitychange', onVis)
    return () => { unsub(); clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
  }, [loadStatus])

  // The button rescans the live vault (unlock via the Keychain token, silent) and refreshes the cache.
  const loadGroups = async () => {
    setLoadingGroups(true)
    try { const r = await postJSON('/broker/refresh'); if (r.ok) setGroups(r.groups || []) } finally { setLoadingGroups(false) }
  }
  const save = async (body) => {
    setSaving(true); setSaveMsg(null)
    try {
      const r = await postJSON('/broker/policy', body)
      if (r.ok) { setPolicy(r.policy); setSaveMsg({ ok: true, text: 'saved' }) }
      else setSaveMsg({ ok: false, text: r.error || r.reason || 'failed' })
    } finally { setSaving(false); setTimeout(() => setSaveMsg(null), 4000) }
  }
  const lock = async () => { await postJSON('/broker/lock'); loadStatus() }
  const rebuild = async () => { setStatus((s) => ({ ...(s || {}), building: true })); await postJSON('/broker/rebuild'); loadStatus() }

  const v = status?.vault
  const badge = !status ? null
    : !status.installed ? <Badge color={status.building ? 'amber' : 'zinc'}>{status.building ? 'building' : 'not built'}</Badge>
    : v?.bwStatus === 'no-cli' ? <Badge color="red">no cli</Badge>
    : v?.bwStatus === 'unauthenticated' ? <Badge color="amber">not logged in</Badge>
    : !v?.hasSession ? <Badge color="amber">setup</Badge>
    : <Badge color="lime">connected</Badge>
  const subtitle = !status ? 'checking…'
    : !status.installed ? 'daemon not built'
    : v?.bwStatus === 'no-cli' ? 'bitwarden cli not installed'
    : v?.bwStatus === 'unauthenticated' ? 'bw not logged in'
    : !v?.hasSession ? 'vault token not connected'
    : v?.warm ? 'agent broker · vault unlocked' : 'agent broker · vault locked'
  const bwReady = !!(status && status.installed && v && v.hasSession && v.bwStatus !== 'no-cli' && v.bwStatus !== 'unauthenticated')

  return (
    <div className="space-y-8">
      <div className="grid gap-5 lg:grid-cols-[1fr_28rem] lg:items-start">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => navigate('')} title="Back to overview" className="inline-flex cursor-pointer items-center gap-1 text-[13px] text-zinc-500 transition hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            </button>
            <img src={`${API}/logo/bitwarden`} alt="" aria-hidden="true" onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} className="size-10 shrink-0 object-contain" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Heading>Bitwarden</Heading>
                {badge}
                <Badge color="violet">enforced</Badge>
              </div>
              <div className="font-mono text-[12px] text-zinc-400">{subtitle}</div>
            </div>
          </div>
          <Text className="mt-3 max-w-md text-[13.5px] text-zinc-500 lg:max-w-2xl dark:text-zinc-400">
            A signed local daemon is the only holder of the Bitwarden session. Agents ask it for an action — <Code>hb_type_secret</Code> / <Code>hb_type_totp</Code> — typed over the broker's own browser session, gated by the collection's access level, an origin check, and a macOS approval. The secret never enters agent code.
          </Text>
          <Text className="mt-3 max-w-md text-[13.5px] text-zinc-500 lg:max-w-2xl dark:text-zinc-400">
            Grant agents a Bitwarden <Strong className="text-zinc-700 dark:text-zinc-200">collection</Strong> (or folder), not individual logins — every item inside inherits the tier, and moving a password in or out of the collection is how you change its access. <Strong className="text-zinc-700 dark:text-zinc-200">auto</Strong> = silent; <Strong className="text-zinc-700 dark:text-zinc-200">ask</Strong> = macOS approval each use. <Strong className="text-zinc-700 dark:text-zinc-200">Only granted collections are reachable</Strong> — every other item in your vault is a hard deny, not even enumerable, so your personal logins are never silently available.
          </Text>
          <PromptsCallout />
          <div className="mt-4 max-w-md empty:hidden lg:max-w-2xl"><ConnectBox status={status} setupCmd={status?.setupCmd} cli={status?.cli} /></div>
        </div>

        <div className="rounded-xl border border-zinc-950/10 p-4 dark:border-white/10">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">Connection</div>
          <div className="mt-2.5"><BrokerStatus status={status} /></div>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <button type="button" onClick={lock} className="cursor-pointer text-[12px] text-zinc-500 underline underline-offset-2 transition hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100">lock vault now</button>
            <span className="text-zinc-300 dark:text-zinc-600">·</span>
            <button type="button" onClick={rebuild} className="cursor-pointer text-[12px] text-zinc-500 underline underline-offset-2 transition hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100">rebuild daemon</button>
            {bwReady && <>
              <span className="text-zinc-300 dark:text-zinc-600">·</span>
              <DisconnectLink name="Bitwarden" endpoint="/broker/disconnect"
                warn="Forgets the session token (from the login Keychain), drops the vault session, and clears your access rules and log. The daemon stays installed."
                lock onDone={() => { loadStatus(); loadPolicy() }} />
            </>}
          </div>
          {v?.bwStatus === 'no-cli' && (
            <div className="mt-4 border-t border-zinc-950/5 pt-3 dark:border-white/5">
              <div className="mb-1.5 text-[12px] text-zinc-500 dark:text-zinc-400">Install the Bitwarden CLI:</div>
              <CopyLine text="brew install bitwarden-cli" />
            </div>
          )}
        </div>
      </div>

      {status && status.policyOk === false && (
        <div className="rounded-xl border border-red-500/50 bg-red-500/[0.07] p-4">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5"><StatusDot color="red" /></span>
            <div className="text-[13px] text-red-700 dark:text-red-300">
              <Strong className="text-red-800 dark:text-red-200">Policy integrity check failed.</Strong> <Code>policy.json</Code> no longer matches its signature — it was edited outside the app, or the daemon binary changed. <Strong className="text-red-800 dark:text-red-200">All grants are suspended</Strong> (nothing is reachable) until you re-save below. If you didn't change anything, treat this as a tamper alert.
            </div>
          </div>
        </div>
      )}

      <GroupPicker policy={policy} groups={groups} onLoadGroups={loadGroups} loadingGroups={loadingGroups} onSave={save} saving={saving} saveMsg={saveMsg} />

      <div>
        <Subheading className="!text-[14px]">Access log</Subheading>
        <Text className="mt-1 mb-3 text-[12.5px] text-zinc-500 dark:text-zinc-400">Every credential request — allowed or denied — with the account, the site it was used on, the tier, and the requesting session. Live.</Text>
        <AuditFeed events={audit} />
      </div>
    </div>
  )
}

export default function Module() {
  const { path, navigate } = window.__atelier.useRoute()
  const { snap, reload, sync, syncing } = useAuthState()
  useStyleOnce('ha-root-style', STYLE_ROOT)

  let active = ''
  if (path === 'methods') active = 'methods'
  else if (path === 'accounts' || path.startsWith('account/')) active = 'accounts'

  let body
  if (path.startsWith('source/')) body = <SourceDetail id={path.slice('source/'.length)} snap={snap} navigate={navigate} reload={reload} onSync={sync} syncing={syncing} />
  else if (path.startsWith('account/')) body = <AccountDetail slug={path.slice('account/'.length)} snap={snap} navigate={navigate} reload={reload} />
  else if (path === 'accounts') body = <AccountsPage snap={snap} navigate={navigate} reload={reload} />
  else if (path === 'methods') body = <MethodsPage snap={snap} reload={reload} navigate={navigate} />
  else if (path === 'skill') body = <SkillView navigate={navigate} />
  else body = <Overview snap={snap} navigate={navigate} />

  return (
    <div className="ha-root space-y-10">
      <Masthead active={active} navigate={navigate} home={path === ''} />
      {body}
    </div>
  )
}
