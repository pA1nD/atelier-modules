/* claude — onboarding mission-control backend.
 *
 * The module is an interactive onboarding for the five things that make Claude
 * Code sing on this machine: session codenames, the statusline, the two
 * CLAUDE.md files, the browser stack (browser-harness + horse-browser), and
 * gwx. This backend is its *instruments* and its *hands*:
 *
 *   • instruments — read the REAL system and report it live: which tools are on
 *     PATH, the horse-browser CDP on :9223 (version, tab count, PID), the
 *     running Claude sessions (as emoji codenames), gwx accounts + auth, the
 *     wired statusline, and whether the two CLAUDE.md files exist.
 *   • hands — take action straight from the page: launch horse-browser, smoke
 *     the harness, install gwx, wire the statusline, install the global
 *     CLAUDE.md — streaming every line of output back over the shell WebSocket.
 *
 * Pure Node builtins, no deps. Destructive/outward actions refuse to run
 * without an explicit confirm and always back up before they overwrite.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)
const HOME = os.homedir()
const PROJECTS_DIR = path.join(HOME, '.claude', 'projects')
const SETTINGS = path.join(HOME, '.claude', 'settings.json')
const GLOBAL_CLAUDE_MD = path.join(HOME, '.claude', 'CLAUDE.md')
const GWX_ACCOUNTS = path.join(HOME, '.config', 'gwx', 'accounts.list')
const UUID_JSONL = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/
const UUID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/
const CDP = 'http://127.0.0.1:9223'
const ACTIVE_MS = 4 * 60 * 1000           // transcript touched this recently ⇒ mid-turn ("working now")
const RUNNING_MS = 30 * 60 * 1000         // ...this recently ⇒ likely still open ("up and running")
const RECENT_MS = 36 * 60 * 60 * 1000     // discovery window for the session list

/* ── session codename — byte-identical to projects/statusline.sh + frontend.jsx
 *    so the emoji/colour/callsign this module shows MATCH the dashboard, the
 *    statusline and the tab grouper. FNV-1a (32-bit) + a murmur3 finalizer. */
const CODE_COLORS = { red: '#dc2626', orange: '#ea580c', yellow: '#ca8a04', green: '#16a34a', cyan: '#0891b2', blue: '#2563eb', purple: '#9333ea', pink: '#db2777' }
const CODES = [
  ['🔥','red'],['🍎','red'],['🍓','red'],['🍒','red'],['🌹','red'],['🐞','red'],
  ['🦊','orange'],['🍊','orange'],['🦁','orange'],['🐯','orange'],['🥕','orange'],['🏀','orange'],
  ['🍋','yellow'],['🌻','yellow'],['⭐','yellow'],['🐝','yellow'],['🍌','yellow'],['🐥','yellow'],
  ['🐸','green'],['🍀','green'],['🌵','green'],['🐢','green'],['🌲','green'],['🐍','green'],
  ['🐬','cyan'],['🌊','cyan'],['💎','cyan'],['🧊','cyan'],['🐳','cyan'],['💧','cyan'],
  ['🐧','blue'],['🫐','blue'],['🦋','blue'],['🌀','blue'],['🌐','blue'],['🐟','blue'],
  ['🦄','purple'],['🍇','purple'],['🔮','purple'],['🐙','purple'],['🍆','purple'],['👾','purple'],
  ['🌸','pink'],['🐷','pink'],['🦩','pink'],['🍑','pink'],['🌷','pink'],['🌺','pink'],
]
function hash32(s) {
  let h = 0x811c9dc5
  for (let i = 0; i < (s || '').length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16
  return h >>> 0
}
function codename(id) {
  const [e, c] = CODES[hash32(id || '') % CODES.length]
  return { id, callsign: (id || '').slice(-4).toUpperCase(), emoji: e, color: c, hex: CODE_COLORS[c] }
}

/* ── tool discovery — PATH-robust (the atelier process PATH may not carry
 *    ~/.local/bin), so we also probe the usual install dirs directly. */
function findOnPath(name) {
  const dirs = [
    ...(process.env.PATH || '').split(':'),
    path.join(HOME, '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin',
  ]
  for (const d of dirs) {
    if (!d) continue
    const p = path.join(d, name)
    try { fs.accessSync(p, fs.constants.X_OK); return p } catch {}
  }
  return null
}

async function cdpInfo() {
  const out = { up: false, browser: null, protocol: null, tabs: 0, tabSample: [], pids: [] }
  try {
    const r = await fetch(`${CDP}/json/version`, { signal: AbortSignal.timeout(1500) })
    if (r.ok) {
      const v = await r.json()
      out.up = true
      out.browser = v.Browser || null
      out.protocol = v['Protocol-Version'] || null
    }
  } catch {}
  if (out.up) {
    try {
      const r = await fetch(`${CDP}/json/list`, { signal: AbortSignal.timeout(1500) })
      if (r.ok) {
        const list = await r.json()
        const pages = (Array.isArray(list) ? list : []).filter(
          (t) => t.type === 'page' && !String(t.url || '').startsWith('chrome://') && !String(t.url || '').startsWith('devtools://')
        )
        out.tabs = pages.length
        out.tabSample = pages.slice(0, 12).map((t) => {
          let domain = '', path = ''
          try { const u = new URL(t.url); domain = u.hostname.replace(/^www\./, ''); path = (u.pathname + u.search).replace(/\/+$/, '') } catch {}
          return { title: String(t.title || '').slice(0, 48), domain, path: path.slice(0, 40) }
        })
      }
    } catch {}
    out.pids = await listeningPids(9223)
  }
  return out
}

async function listeningPids(port) {
  try {
    const { stdout } = await execFileP('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { timeout: 2500 })
    return [...new Set(stdout.split('\n').map((s) => s.trim()).filter(Boolean))].map(Number)
  } catch { return [] }
}

async function pgrepClaude() {
  // Real `claude` CLI processes (best-effort) — the raw "what's up" truth, kept
  // separate from the transcript-derived live-session count.
  try {
    const { stdout } = await execFileP('pgrep', ['-fl', 'claude'], { timeout: 2500 })
    return stdout.split('\n').map((s) => s.trim()).filter(Boolean)
      .map((l) => { const i = l.indexOf(' '); return { pid: Number(l.slice(0, i)), cmd: l.slice(i + 1) } })
      .filter((p) => p.pid && p.pid !== process.pid)
      // keep the interactive CLI, drop our own helpers / this server / the grep itself
      .filter((p) => /(^|\/)claude( |$)/.test(p.cmd) && !/mcp-server|statusline|backend\.js|pgrep/.test(p.cmd))
  } catch { return [] }
}

/* ── transcript tailer — read the last bytes of a session .jsonl to recover its
 *    cwd and last human prompt without parsing the whole file. */
function tailText(file, maxBytes = 96 * 1024) {
  let fd
  try {
    fd = fs.openSync(file, 'r')
    const { size } = fs.fstatSync(fd)
    const start = Math.max(0, size - maxBytes)
    const len = size - start
    const buf = Buffer.alloc(len)
    fs.readSync(fd, buf, 0, len, start)
    return buf.toString('utf8')
  } catch { return '' } finally { if (fd !== undefined) try { fs.closeSync(fd) } catch {} }
}
function sessionDetail(file) {
  let cwd = null, lastPrompt = null
  const lines = tailText(file).split('\n')
  for (const ln of lines) {
    if (!ln.trim()) continue
    let o; try { o = JSON.parse(ln) } catch { continue }
    if (o.cwd) cwd = o.cwd
    if (o.type === 'user') {
      const c = o.message && o.message.content
      if (typeof c === 'string') { const t = c.trim(); if (t && !t.startsWith('<')) lastPrompt = t }
    }
  }
  return { cwd, lastPrompt }
}
function listSessions({ withDetail = true } = {}) {
  const now = Date.now()
  const out = []
  let dirs = []
  try { dirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()) } catch {}
  for (const d of dirs) {
    const dir = path.join(PROJECTS_DIR, d.name)
    let files = []
    try { files = fs.readdirSync(dir).filter((f) => UUID_JSONL.test(f)) } catch {}
    for (const f of files) {
      const full = path.join(dir, f)
      let st; try { st = fs.statSync(full) } catch { continue }
      const age = now - st.mtimeMs
      if (age > RECENT_MS) continue
      const id = f.replace(/\.jsonl$/, '')
      const rec = { ...codename(id), mtime: st.mtimeMs, age, active: age <= ACTIVE_MS, cwd: null, lastPrompt: null }
      if (withDetail) { const dt = sessionDetail(full); rec.cwd = dt.cwd ? dt.cwd.replace(HOME, '~') : null; rec.lastPrompt = dt.lastPrompt }
      out.push(rec)
    }
  }
  out.sort((a, b) => b.mtime - a.mtime)
  return out
}

function readJsonSafe(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return null } }

function statuslineInfo() {
  const s = readJsonSafe(SETTINGS)
  const cmd = s && s.statusLine && s.statusLine.command ? String(s.statusLine.command) : null
  let flavor = null
  if (cmd) {
    const base = path.basename(cmd)
    if (base === 'statusline-ses.sh' || /horse-browser\/statusline\.sh/.test(cmd)) flavor = 'ses'
    else if (base === 'statusline.sh' || /projects\/statusline\.sh/.test(cmd)) flavor = 'codename'
    else flavor = 'custom'
  }
  return { wired: !!cmd, command: cmd, flavor }
}

const CHAPTER_TITLES = ['Think Before Coding', 'Simplicity First', 'Surgical Changes', 'Goal-Driven Execution']
// split a markdown doc into its top-level (single-#) sections: title → next # (or end).
function topSections(txt) {
  const out = []; let cur = null
  for (const line of (txt || '').split('\n')) {
    const m = /^#\s+(.+?)\s*$/.exec(line)   // single '# ' only — '## ' has no whitespace after the first '#'
    if (m) { cur = { title: m[1], body: '' }; out.push(cur) }
    else if (cur) cur.body += line + '\n'
  }
  return out
}
function claudeMdInfo(file) {
  try {
    const txt = fs.readFileSync(file, 'utf8')
    const present = CHAPTER_TITLES.filter((t) => txt.includes(t))
    // a section is "ours" if its body carries all four rules — the Karpathy block.
    const sections = topSections(txt).map((s) => ({ title: s.title, ours: CHAPTER_TITLES.every((t) => s.body.includes(t)) }))
    const hasOurs = sections.some((s) => s.ours)
    return { exists: true, path: file.replace(HOME, '~'), bytes: Buffer.byteLength(txt), lines: txt.split('\n').length, chapters: present, hasFourChapters: present.length === 4, sections, hasOurs }
  } catch { return { exists: false, path: file.replace(HOME, '~'), bytes: 0, lines: 0, chapters: [], hasFourChapters: false, sections: [], hasOurs: false } }
}

function instanceRoot(ctx) { return path.dirname(path.dirname(ctx.dataDir)) }   // <root>/claude/data → <root>
function localClaudeMd(ctx) { return path.join(instanceRoot(ctx), 'CLAUDE.md') }
function imagesDir(ctx) { return path.join(ctx.dataDir, 'images') }

function gwxInfo() {
  const bin = findOnPath('gwx'), gws = findOnPath('gws')
  let accounts = []
  try { accounts = fs.readFileSync(GWX_ACCOUNTS, 'utf8').split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#')) } catch {}
  return { installed: !!bin, bin, gwsInstalled: !!gws, accounts }
}

// browser-harness: installed? + how many live harness daemons (≈ agent sessions
// connected to the browser; each BU_NAME gets its own persistent daemon).
async function harnessInfo() {
  // daemons are persistent, keyed by BU_NAME ("lane") — not by Claude session, so we surface the lane.
  let pids = []
  try { const { stdout } = await execFileP('pgrep', ['-f', 'browser_harness.daemon'], { timeout: 2500 }); pids = stdout.split('\n').map((s) => Number(s.trim())).filter(Boolean) } catch {}
  const daemons = pids.map((pid) => ({ pid, name: null }))
  if (pids.length) {
    try {
      const { stdout } = await execFileP('ps', ['eww', '-p', pids.join(',')], { timeout: 3000 })
      for (const line of stdout.split('\n')) {
        const pid = Number((line.trim().match(/^\d+/) || [])[0]); if (!pid) continue
        const m = line.match(/\bBU_NAME=(\S+)/), d = daemons.find((x) => x.pid === pid)
        if (d && m) d.name = m[1]
      }
    } catch {}
  }
  return { installed: !!findOnPath('browser-harness'), sessions: daemons.length, daemons }
}

// compare two version strings — a >= b ? (null if either is unknown)
function verGE(a, b) {
  if (!a || !b) return null
  const pa = (String(a).match(/\d+/g) || []).map(Number), pb = (String(b).match(/\d+/g) || []).map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const x = pa[i] || 0, y = pb[i] || 0; if (x !== y) return x > y }
  return true
}
async function fetchJson(url, ms = 6000) { const r = await fetch(url, { signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error('http ' + r.status); return r.json() }
async function latestHarnessVersion() { const d = await fetchJson('https://pypi.org/pypi/browser-harness/json'); return (d && d.info && d.info.version) || null }
async function latestChromeVersion() { const d = await fetchJson('https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions.json'); return (d && d.channels && d.channels.Stable && d.channels.Stable.version) || null }
async function harnessVersion() {
  const bin = findOnPath('browser-harness'); if (!bin) return null
  try { const { stdout } = await execFileP(bin, ['--version'], { timeout: 3000 }); return (stdout.match(/\d+\.\d+\.\d+/) || [stdout.trim().split('\n')[0]])[0] || null } catch { return null }
}

const TOOLS = [
  { id: 'claude', label: 'Claude Code' },
  { id: 'browser-harness', label: 'browser-harness' },
  { id: 'horse-browser', label: 'horse-browser' },
  { id: 'gwx', label: 'gwx' },
  { id: 'gws', label: 'gws' },
  { id: 'jq', label: 'jq' },
  { id: 'codex', label: 'codex' },
]

async function snapshot(ctx) {
  const [cdp, claudeProcs, harness] = await Promise.all([cdpInfo(), pgrepClaude(), harnessInfo()])
  const sessions = listSessions({ withDetail: false })
  // sessions "up and running right now": a live `claude --resume <uuid>` process, OR a
  // transcript touched within the running window. `active` (<4min) = actually mid-turn.
  const resumeIds = new Set()
  for (const p of claudeProcs) { const m = UUID_RE.exec(p.cmd || ''); if (m) resumeIds.add(m[1]) }
  const running = sessions.filter((s) => s.age <= RUNNING_MS || resumeIds.has(s.id))
  const known = new Set(running.map((s) => s.id))
  for (const id of resumeIds) if (!known.has(id)) running.push({ ...codename(id), active: false, mtime: 0, age: Infinity })
  const tools = {}
  for (const t of TOOLS) { const p = findOnPath(t.id); tools[t.id] = { label: t.label, installed: !!p, path: p } }
  return {
    now: Date.now(),
    tools,
    cdp,
    harness,
    homebrew: { available: !!findOnPath('brew') },
    procs: { claude: claudeProcs },
    sessions: {
      total: sessions.length,
      active: running.filter((s) => s.active).length,   // working right now (mid-turn)
      runningCount: running.length,                      // open right now
      running: running.slice(0, 14),
      top: sessions.slice(0, 8),
    },
    gwx: gwxInfo(),
    statusline: statuslineInfo(),
    claudemd: { global: claudeMdInfo(GLOBAL_CLAUDE_MD), local: claudeMdInfo(localClaudeMd(ctx)) },
  }
}

/* ──────────────────────────── templates ──────────────────────────────────── */
const GLOBAL_TEMPLATE = `# Instructions

**Tradeoff: These guidelines bias toward caution over speed. For trivial tasks, use judgment!**

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.
`

const LOCAL_TEMPLATE = `# <Project name>

Short, durable rules for THIS repo — the things an agent can't infer from the
code or git history, and the constraints it must never cross.

## What this project is

One paragraph: the goal, the shape, the one thing that matters most.

## Rules

- The non-obvious constraint that bites if ignored.
- The boundary that must not be crossed (don't edit X, don't add deps to Y).
- The verify step: how you know a change is correct (tests, a render check).

## Pointers

@./docs/README.md     # import deeper docs so they load with this file
`

/* ──────────────────────────── actions ────────────────────────────────────── */
// A registry the frontend mirrors. `danger`: safe | network | destructive.
const ACTIONS = {
  'launch-horse':            { danger: 'safe',        label: 'Launch horse-browser' },
  'smoke-harness':           { danger: 'safe',        label: 'Smoke-test browser-harness' },
  'gwx-whoami':              { danger: 'safe',        label: 'Check gwx auth' },
  'install-gwx':             { danger: 'network',     label: 'Install gwx' },
  'wire-statusline':         { danger: 'destructive', label: 'Wire the statusline' },
  'install-statusbar':       { danger: 'destructive', label: 'Set up the status bar' },
  'install-global-claudemd': { danger: 'destructive', label: 'Install global CLAUDE.md' },
  'install-browser-harness': { danger: 'network',     label: 'Install browser-harness' },
  'install-horse-browser':   { danger: 'network',     label: 'Install horse-browser' },
}

function nowStamp() { return new Date().toISOString().replace('T', ' ').slice(0, 19) }

export default {
  async mountRoutes(router, ctx) {
    const slot = ctx.module(ctx.id)
    slot.children ??= new Set()

    const emit = (actionId, line, stream = 'stdout') => ctx.broadcast({ type: 'action-log', actionId, stream, line })
    const done = (actionId, payload) => ctx.broadcast({ type: 'action-done', actionId, ...payload })

    // Spawn a command, stream every line over the WS, track for teardown.
    const runStreaming = (actionId, cmd, args, opts = {}) => new Promise((resolve) => {
      emit(actionId, `$ ${cmd} ${args.join(' ')}`.trim(), 'cmd')
      let child
      try { child = spawn(cmd, args, { detached: true, env: { ...process.env, ...opts.env }, cwd: opts.cwd }) }
      catch (e) { emit(actionId, `failed to spawn: ${e.message}`, 'stderr'); return resolve({ ok: false, error: e.message }) }
      slot.children.add(child)
      const onData = (stream) => (buf) => String(buf).split('\n').forEach((l) => { if (l.length) emit(actionId, l, stream) })
      child.stdout?.on('data', onData('stdout'))
      child.stderr?.on('data', onData('stderr'))
      child.on('error', (e) => { emit(actionId, e.message, 'stderr') })
      child.on('close', (code) => {
        slot.children.delete(child)
        const ok = code === 0
        emit(actionId, ok ? `✓ done (exit ${code})` : `✗ exit ${code}`, ok ? 'ok' : 'stderr')
        done(actionId, { ok, code, pid: child.pid })
        resolve({ ok, code, pid: child.pid })
      })
    })

    // like runStreaming, but doesn't emit its own `done` — for multi-step actions.
    const runQuiet = (actionId, cmd, args, opts = {}) => new Promise((resolve) => {
      emit(actionId, `$ ${cmd} ${args.join(' ')}`.trim(), 'cmd')
      let child
      try { child = spawn(cmd, args, { detached: true, env: { ...process.env, ...opts.env }, cwd: opts.cwd }) }
      catch (e) { emit(actionId, `failed to spawn: ${e.message}`, 'stderr'); return resolve({ ok: false, error: e.message }) }
      slot.children.add(child)
      const onData = (s) => (b) => String(b).split('\n').forEach((l) => l.length && emit(actionId, l, s))
      child.stdout?.on('data', onData('stdout')); child.stderr?.on('data', onData('stderr'))
      child.on('error', (e) => emit(actionId, e.message, 'stderr'))
      child.on('close', (code) => { slot.children.delete(child); resolve({ ok: code === 0, code }) })
    })

    const backup = (file) => {
      if (!fs.existsSync(file)) return null
      const b = `${file}.bak-${Date.now()}`
      fs.copyFileSync(file, b)
      return b
    }

    /* ── instruments ── */
    router.get('/snapshot', async (req, res) => res.json(await snapshot(ctx)))

    router.get('/sessions', (req, res) => {
      const all = listSessions({ withDetail: true })
      res.json({ now: Date.now(), activeMs: ACTIVE_MS, current: codename(req.query.current || ''), sessions: all })
    })

    // the live stack: agent sessions → browser-harness daemons → chrome tabs, with a status check per column
    slot.verCache ??= {}
    const cachedLatest = async (key, fn, ttl = 20 * 60 * 1000) => {
      const c = slot.verCache[key]
      if (c && Date.now() - c.at < ttl) return c.val
      let val = null; try { val = await fn() } catch {}
      slot.verCache[key] = { at: Date.now(), val }
      return val
    }
    router.get('/processes', async (req, res) => {
      const [cdp, harness, claudeProcs] = await Promise.all([cdpInfo(), harnessInfo(), pgrepClaude()])
      const resumeIds = new Set()
      for (const p of claudeProcs) { const m = UUID_RE.exec(p.cmd || ''); if (m) resumeIds.add(m[1]) }
      const sessions = listSessions({ withDetail: true }).filter((s) => s.age <= RUNNING_MS || resumeIds.has(s.id)).slice(0, 12)
      const [hv, latestH, latestC] = await Promise.all([
        cachedLatest('hv', harnessVersion, 3 * 60 * 1000),
        cachedLatest('latestH', latestHarnessVersion),
        cachedLatest('latestC', latestChromeVersion),
      ])
      const chromeVer = cdp.browser ? cdp.browser.replace(/^Chrome\//, '') : null
      res.json({
        skill: { installed: harness.installed },
        harness: { running: harness.daemons.length > 0, count: harness.daemons.length, daemons: harness.daemons.slice(0, 16), version: hv, latest: latestH, upToDate: verGE(hv, latestH) },
        chrome: { running: cdp.up, version: chromeVer, pid: cdp.pids[0] || null, latest: latestC, upToDate: verGE(chromeVer, latestC) },
        sessions: sessions.map((s) => ({ emoji: s.emoji, callsign: s.callsign, color: s.color, cwd: s.cwd, active: s.active })),
        tabs: cdp.tabSample.map((t) => ({ title: t.title, domain: t.domain, agent: t.title.startsWith('🐴') || t.title.startsWith('🐎') })),
      })
    })

    router.get('/gwx/whoami', async (req, res) => {
      const bin = findOnPath('gwx')
      if (!bin) return res.json({ ok: false, installed: false, accounts: gwxInfo().accounts })
      try {
        const { stdout, stderr } = await execFileP(bin, ['whoami'], { timeout: 25000, env: { ...process.env, GWX_TIMEOUT: '15' } })
        res.json({ ok: true, installed: true, raw: (stdout || stderr || '').trim(), accounts: gwxInfo().accounts })
      } catch (e) {
        res.json({ ok: false, installed: true, raw: (e.stdout || e.stderr || e.message || '').toString().trim(), accounts: gwxInfo().accounts })
      }
    })

    // the rewritten gws workflow skills gwx ships (cached locally) — for the "explore all" modal
    router.get('/gwx/skills', (req, res) => {
      const dir = path.join(HOME, '.cache/gwx/skills-rewritten')
      const skills = []
      try {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          if (!e.isDirectory()) continue
          let desc = ''
          try { const m = /\bdescription:\s*"([^"]+)"/.exec(fs.readFileSync(path.join(dir, e.name, 'SKILL.md'), 'utf8').slice(0, 2000)); if (m) desc = m[1].trim() } catch {}
          const kind = e.name.startsWith('persona-') ? 'persona' : e.name.startsWith('recipe-') ? 'recipe' : e.name.startsWith('gws-workflow') ? 'workflow' : 'api'
          skills.push({ id: e.name, desc: desc.slice(0, 160), kind })
        }
      } catch {}
      skills.sort((a, b) => a.id.localeCompare(b.id))
      res.json({ count: skills.length, skills })
    })

    // one skill's full SKILL.md (basename-guarded) — for the modal's click-through view
    router.get('/gwx/skill/:id', (req, res) => {
      const id = path.basename(req.params.id || '')
      try { res.json({ id, content: fs.readFileSync(path.join(HOME, '.cache/gwx/skills-rewritten', id, 'SKILL.md'), 'utf8') }) }
      catch { res.json({ id, content: null }, 404) }
    })

    router.get('/claudemd/:which', (req, res) => {
      const which = req.params.which
      const file = which === 'global' ? GLOBAL_CLAUDE_MD : which === 'local' ? localClaudeMd(ctx) : null
      if (!file) return res.json({ error: 'unknown' }, 404)
      const info = claudeMdInfo(file)
      let content = null
      try { content = fs.readFileSync(file, 'utf8') } catch {}
      res.json({ ...info, which, content })
    })

    router.get('/templates/:which', (req, res) => {
      const t = req.params.which === 'global' ? GLOBAL_TEMPLATE : req.params.which === 'local' ? LOCAL_TEMPLATE : null
      if (t == null) return res.json({ error: 'unknown' }, 404)
      res.json({ which: req.params.which, text: t })
    })

    router.get('/actions', (req, res) => res.json({ actions: ACTIONS }))

    // Serve bundled imagery (data/images is not served by the shell). basename()
    // strips any traversal; a missing file is a clean 404, never a thrown read.
    router.get('/images/:name', (req, res) => {
      const name = path.basename(req.params.name || '')
      const ext = path.extname(name).toLowerCase()
      const type = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.gif': 'image/gif' }[ext] || 'application/octet-stream'
      try {
        const body = fs.readFileSync(path.join(imagesDir(ctx), name))
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=3600' })
        res.end(body)
      } catch { res.writeHead(404); res.end('not found') }
    })

    /* ── hands ── */
    router.post('/action/:id', async (req, res) => {
      const id = req.params.id
      const def = ACTIONS[id]
      if (!def) return res.json({ error: 'unknown action' }, 404)
      const body = await req.json().catch(() => ({}))
      const confirmed = body && body.confirm === true

      // Outward / destructive actions must be explicitly confirmed.
      if ((def.danger === 'network' || def.danger === 'destructive') && !confirmed) {
        const preflight = {}
        if (id === 'install-global-claudemd') { preflight.exists = fs.existsSync(GLOBAL_CLAUDE_MD); preflight.info = claudeMdInfo(GLOBAL_CLAUDE_MD) }
        if (id === 'wire-statusline') preflight.current = statuslineInfo()
        return res.json({ needsConfirm: true, danger: def.danger, ...preflight })
      }

      switch (id) {
        case 'launch-horse': {
          const bin = findOnPath('horse-browser')
          if (!bin) { emit(id, 'horse-browser not found on PATH', 'stderr'); return res.json({ ok: false, error: 'not installed' }) }
          const r = await runStreaming(id, bin, [])
          ctx.broadcast({ type: 'snapshot-dirty' })
          return res.json(r)
        }
        case 'smoke-harness': {
          const bin = findOnPath('browser-harness')
          if (!bin) { emit(id, 'browser-harness not found on PATH', 'stderr'); done(id, { ok: false }); return res.json({ ok: false, error: 'not installed' }) }
          // A focus-safe, tab-free smoke: prove the harness boots and can see the CDP endpoint.
          const py = 'import os\nprint("harness ok · BU_CDP_URL=" + os.environ.get("BU_CDP_URL","(unset)"))\ntry:\n    import json,urllib.request\n    v=json.load(urllib.request.urlopen(os.environ.get("BU_CDP_URL","http://127.0.0.1:9223")+"/json/version",timeout=2))\n    print("connected ·", v.get("Browser"))\nexcept Exception as e:\n    print("CDP not reachable:", e)\n'
          emit(id, `$ ${bin}  (BU_CDP_URL=${CDP})`, 'cmd')
          let child
          try { child = spawn(bin, [], { detached: true, env: { ...process.env, BU_CDP_URL: CDP } }) }
          catch (e) { emit(id, `failed to spawn: ${e.message}`, 'stderr'); done(id, { ok: false }); return res.json({ ok: false, error: e.message }) }
          slot.children.add(child)
          let settled = false
          const finish = (payload) => { if (settled) return; settled = true; slot.children.delete(child); done(id, payload); res.json(payload) }
          const onData = (stream) => (b) => String(b).split('\n').forEach((l) => l.length && emit(id, l, stream))
          child.stdout?.on('data', onData('stdout'))
          child.stderr?.on('data', onData('stderr'))
          child.on('error', (e) => { emit(id, e.message, 'stderr'); finish({ ok: false, error: e.message }) })
          child.on('close', (code) => { emit(id, code === 0 ? '✓ harness reachable' : `✗ exit ${code}`, code === 0 ? 'ok' : 'stderr'); finish({ ok: code === 0, code, pid: child.pid }) })
          try { child.stdin.write(py); child.stdin.end() } catch {}
          return
        }
        case 'install-browser-harness': {
          const uv = findOnPath('uv'), pipx = findOnPath('pipx')
          let r
          if (uv) r = await runQuiet(id, uv, ['tool', 'install', '--force', 'git+https://github.com/browser-use/browser-harness'])
          else if (pipx) r = await runQuiet(id, pipx, ['install', '--force', 'git+https://github.com/browser-use/browser-harness'])
          else { emit(id, 'need uv (or pipx) to install — get uv at https://astral.sh/uv', 'stderr'); done(id, { ok: false }); return res.json({ ok: false }) }
          slot.verCache = {}
          emit(id, r.ok ? '✓ browser-harness installed from GitHub' : `✗ install failed (exit ${r.code})`, r.ok ? 'ok' : 'stderr')
          done(id, { ok: r.ok }); ctx.broadcast({ type: 'snapshot-dirty' })
          return res.json({ ok: r.ok })
        }
        case 'install-horse-browser': {
          if (!findOnPath('git')) { emit(id, 'git not found on PATH', 'stderr'); done(id, { ok: false }); return res.json({ ok: false }) }
          const dir = path.join(HOME, 'horse-browser')
          if (!fs.existsSync(dir)) {
            const r1 = await runQuiet(id, 'git', ['clone', '--depth', '1', 'https://github.com/pA1nD/horse-browser.git', dir])
            if (!r1.ok) { emit(id, `✗ clone failed (exit ${r1.code})`, 'stderr'); done(id, { ok: false }); return res.json({ ok: false }) }
          } else emit(id, `using existing checkout at ${dir.replace(HOME, '~')}`, 'stdout')
          const installer = path.join(dir, 'install.sh')
          if (!fs.existsSync(installer)) { emit(id, 'install.sh not found in the repo', 'stderr'); done(id, { ok: false }); return res.json({ ok: false }) }
          const r2 = await runQuiet(id, 'bash', [installer], { cwd: dir })
          slot.verCache = {}
          emit(id, r2.ok ? '✓ horse-browser installed' : `✗ install.sh failed (exit ${r2.code})`, r2.ok ? 'ok' : 'stderr')
          done(id, { ok: r2.ok }); ctx.broadcast({ type: 'snapshot-dirty' })
          return res.json({ ok: r2.ok })
        }
        case 'gwx-whoami': {
          const bin = findOnPath('gwx')
          if (!bin) { emit(id, 'gwx not installed', 'stderr'); done(id, { ok: false }); return res.json({ ok: false }) }
          const r = await runStreaming(id, bin, ['whoami'], { env: { GWX_TIMEOUT: '15' } })
          ctx.broadcast({ type: 'snapshot-dirty' })
          return res.json(r)
        }
        case 'install-gwx': {
          const r = await runStreaming(id, 'bash', ['-lc', 'curl -fsSL https://raw.githubusercontent.com/pA1nD/gwx/main/install.sh | bash'])
          ctx.broadcast({ type: 'snapshot-dirty' })
          return res.json(r)
        }
        case 'wire-statusline': {
          // Portable: wire to a statusline shipped INSIDE this module, so it exists
          // wherever the module is installed (not a developer's absolute path).
          const which = body.which === 'horse' ? 'horse' : 'codename'
          const target = path.join(path.dirname(ctx.dataDir), which === 'horse' ? 'statusline-ses.sh' : 'statusline.sh')
          emit(id, `wiring statusLine → ${target.replace(HOME, '~')}`, 'cmd')
          if (!fs.existsSync(target)) { emit(id, `statusline script not found: ${target}`, 'stderr'); done(id, { ok: false }); return res.json({ ok: false, error: 'script missing' }) }
          // Distinguish absent from present-but-malformed: never clobber a settings.json we can't parse.
          let s
          if (fs.existsSync(SETTINGS)) {
            s = readJsonSafe(SETTINGS)
            if (s === null) { emit(id, 'settings.json is not valid JSON — refusing to overwrite (fix it by hand)', 'stderr'); done(id, { ok: false }); return res.json({ ok: false, error: 'settings.json unparseable' }) }
          } else s = {}
          const b = backup(SETTINGS); if (b) emit(id, `backed up settings.json → ${path.basename(b)}`, 'stdout')
          try { fs.chmodSync(target, 0o755) } catch {}
          s.statusLine = { type: 'command', command: target }
          fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2) + '\n')
          emit(id, `✓ statusLine set (${which}) — open a new Claude Code session to see it`, 'ok')
          done(id, { ok: true })
          ctx.broadcast({ type: 'snapshot-dirty' })
          return res.json({ ok: true, command: target })
        }
        case 'install-statusbar': {
          // dependency: jq (via Homebrew). Homebrew itself is a prerequisite we don't install.
          if (!findOnPath('jq')) {
            if (!findOnPath('brew')) { emit(id, 'Homebrew not found — install it from https://brew.sh first, then try again', 'stderr'); done(id, { ok: false }); ctx.broadcast({ type: 'snapshot-dirty' }); return res.json({ ok: false, error: 'no homebrew' }) }
            emit(id, 'jq is missing — installing it with Homebrew…', 'stdout')
            const j = await runQuiet(id, 'brew', ['install', 'jq'])
            if (!j.ok) { emit(id, `✗ jq install failed (exit ${j.code})`, 'stderr'); done(id, { ok: false }); ctx.broadcast({ type: 'snapshot-dirty' }); return res.json({ ok: false, error: 'jq install failed' }) }
            emit(id, '✓ jq installed', 'ok')
          } else emit(id, 'jq already installed ✓', 'ok')
          const target = path.join(path.dirname(ctx.dataDir), 'statusline.sh')
          if (!fs.existsSync(target)) { emit(id, `statusline.sh missing: ${target}`, 'stderr'); done(id, { ok: false }); return res.json({ ok: false, error: 'script missing' }) }
          let s = {}
          if (fs.existsSync(SETTINGS)) { s = readJsonSafe(SETTINGS); if (s === null) { emit(id, 'settings.json is not valid JSON — refusing to overwrite (fix it by hand)', 'stderr'); done(id, { ok: false }); return res.json({ ok: false, error: 'settings unparseable' }) } }
          const b = backup(SETTINGS); if (b) emit(id, `backed up settings.json → ${path.basename(b)}`, 'stdout')
          try { fs.chmodSync(target, 0o755) } catch {}
          s.statusLine = { type: 'command', command: target }
          fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2) + '\n')
          emit(id, '✓ status bar wired — open a new Claude Code session to see it', 'ok')
          done(id, { ok: true })
          ctx.broadcast({ type: 'snapshot-dirty' })
          return res.json({ ok: true })
        }
        case 'install-global-claudemd': {
          // Append the Karpathy block (the whole part) — never clobber the rest of the file.
          const info = claudeMdInfo(GLOBAL_CLAUDE_MD)
          if (info.hasOurs) { emit(id, 'these four rules are already in your CLAUDE.md — nothing to do', 'ok'); done(id, { ok: true }); ctx.broadcast({ type: 'snapshot-dirty' }); return res.json({ ok: true }) }
          fs.mkdirSync(path.dirname(GLOBAL_CLAUDE_MD), { recursive: true })
          let existing = ''
          try { existing = fs.readFileSync(GLOBAL_CLAUDE_MD, 'utf8') } catch {}
          if (existing.trim()) { const b = backup(GLOBAL_CLAUDE_MD); if (b) emit(id, `backed up existing CLAUDE.md → ${path.basename(b)}`, 'stdout') }
          const next = existing.trim() ? existing.replace(/\n*$/, '') + '\n\n' + GLOBAL_TEMPLATE.trim() + '\n' : GLOBAL_TEMPLATE.trim() + '\n'
          fs.writeFileSync(GLOBAL_CLAUDE_MD, next)
          emit(id, `✓ added the four rules to ${GLOBAL_CLAUDE_MD.replace(HOME, '~')} @ ${nowStamp()}`, 'ok')
          done(id, { ok: true })
          ctx.broadcast({ type: 'snapshot-dirty' })
          return res.json({ ok: true })
        }
        default:
          return res.json({ error: 'unhandled' }, 500)
      }
    })

    ctx.log('claude · onboarding mission-control mounted')

    // Teardown: kill any in-flight installer/launcher children on hot-reload + exit.
    // Children are spawned detached (own process group) so we can take the whole
    // group down — no orphaned `curl` grandchild left behind by a `curl | bash`.
    return () => {
      for (const c of slot.children) {
        try { process.kill(-c.pid, 'SIGTERM') } catch {}
        try { c.kill('SIGTERM') } catch {}
      }
      slot.children.clear()
    }
  },
}
