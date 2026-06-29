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
        out.tabSample = pages.slice(0, 16).map((t) => {
          let domain = '', path = ''
          try { const u = new URL(t.url); domain = u.hostname.replace(/^www\./, ''); path = (u.pathname + u.search).replace(/\/+$/, '') } catch {}
          return { id: t.id, title: String(t.title || '').slice(0, 48), domain, path: path.slice(0, 40) }
        })
      }
    } catch {}
    out.pids = await listeningPids(9223)
  }
  return out
}

// ask the horse-browser tab-grouper extension which open tabs belong to which session group
// (a group's title is the session's callsign). Returns a { targetId: callsign } map. Chrome's CDP
// exposes no tab→group link, but the extension's service worker does, via self.listTabs(label).
async function tabGroups() {
  let ws
  try {
    const targets = await fetchJson(`${CDP}/json/list`, 2000)
    const sw = (Array.isArray(targets) ? targets : []).find((t) => t.type === 'service_worker' && /chrome-extension/.test(t.url || ''))
    if (!sw || !sw.webSocketDebuggerUrl) return {}
    ws = new WebSocket(sw.webSocketDebuggerUrl)
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', () => rej(new Error('ws'))); setTimeout(() => rej(new Error('timeout')), 2000) })
    let mid = 0
    const send = (method, params) => new Promise((res, rej) => {
      const id = ++mid, to = setTimeout(() => rej(new Error('eval timeout')), 2500)
      const handler = (e) => { let m; try { m = JSON.parse(e.data) } catch { return } if (m.id === id) { clearTimeout(to); ws.removeEventListener('message', handler); res(m) } }
      ws.addEventListener('message', handler)
      ws.send(JSON.stringify({ id, method, params }))
    })
    // group titles look like "🥕 AE14" — the last 4 chars are the session callsign. Map each group's
    // tabs to their CDP target id via chrome.debugger.getTargets (tabId → target), like the 003 module;
    // self.listTabs's exact-title match misses the emoji-prefixed title.
    const expr = `(async () => {
      const dbg = await chrome.debugger.getTargets()
      const tgt = {}; for (const d of dbg) if (d.tabId) tgt[d.tabId] = d.id
      const groups = await chrome.tabGroups.query({})
      const out = {}
      for (const g of groups) {
        const cs = (g.title || '').trim().slice(-4).toUpperCase()
        const tabs = await chrome.tabs.query({ groupId: g.id })
        for (const t of tabs) { const id = tgt[t.id]; if (id) out[id] = cs }
      }
      return out
    })()`
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    return (r.result && r.result.result && r.result.result.value) || {}
  } catch { return {} }
  finally { try { ws && ws.close() } catch {} }
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
function imagesDir(ctx) { return path.join(path.dirname(ctx.dataDir), 'media') }

function gwxInfo() {
  const bin = findOnPath('gwx'), gws = findOnPath('gws')
  let accounts = []
  try { accounts = fs.readFileSync(GWX_ACCOUNTS, 'utf8').split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#')) } catch {}
  // "logged in" = the account has stored OAuth credentials locally (gwx logout clears credentials.enc)
  const accountsDir = path.join(path.dirname(GWX_ACCOUNTS), 'accounts')
  const authed = accounts.filter((a) => { try { return fs.existsSync(path.join(accountsDir, a, 'credentials.enc')) } catch { return false } })
  return { installed: !!bin, bin, gwsInstalled: !!gws, accounts, authed }
}

// browser-harness: installed? + how many live harness daemons (≈ agent sessions
// connected to the browser; each BU_NAME gets its own persistent daemon).
async function harnessInfo() {
  // each daemon's BU_NAME is `cc-<session id>`, so its last 4 chars are the agent's callsign —
  // that's how we name-match a daemon back to the agent session that started it.
  let pids = []
  try { const { stdout } = await execFileP('pgrep', ['-f', 'browser_harness.daemon'], { timeout: 2500 }); pids = stdout.split('\n').map((s) => Number(s.trim())).filter(Boolean) } catch {}
  const daemons = pids.map((pid) => ({ pid, name: null, callsign: null }))
  if (pids.length) {
    try {
      const { stdout } = await execFileP('ps', ['eww', '-p', pids.join(',')], { timeout: 3000 })
      for (const line of stdout.split('\n')) {
        const pid = Number((line.trim().match(/^\d+/) || [])[0]); if (!pid) continue
        const m = line.match(/\bBU_NAME=(\S+)/), d = daemons.find((x) => x.pid === pid)
        if (d && m) { d.name = m[1]; d.callsign = m[1].slice(-4).toUpperCase() }
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
async function binVersion(name) {
  const bin = findOnPath(name); if (!bin) return null
  try { const { stdout } = await execFileP(bin, ['--version'], { timeout: 3000 }); return (stdout.match(/\d+\.\d+(?:\.\d+)?/) || [])[0] || null } catch { return null }
}
async function latestNpmVersion(pkg) { const d = await fetchJson('https://registry.npmjs.org/' + encodeURIComponent(pkg) + '/latest'); return (d && d.version) || null }

// horse-browser ships claude-md.sh, which installs/refreshes the browser-playbook @-import in
// ~/.claude/CLAUDE.md. Resolve it from the launcher symlink on PATH (so it works wherever the repo
// lives), falling back to the module's own clone at ~/horse-browser.
function hbClaudeMdScript() {
  const tries = []
  try { const l = findOnPath('horse-browser'); if (l) tries.push(path.join(path.dirname(path.dirname(fs.realpathSync(l))), 'claude-md.sh')) } catch {}
  tries.push(path.join(HOME, 'horse-browser', 'claude-md.sh'))
  return tries.find((p) => { try { return fs.existsSync(p) } catch { return false } }) || null
}
async function browserConfigInfo() {
  const script = hbClaudeMdScript()
  if (!script) return { scriptAvailable: false, upToDate: null }
  // `claude-md.sh check` exits 0 when the import block + symlink are current, non-zero when drifted.
  try { await execFileP('bash', [script, 'check'], { timeout: 5000 }); return { scriptAvailable: true, upToDate: true } }
  catch { return { scriptAvailable: true, upToDate: false } }
}

// version status for every tool the module installs — installed vs upstream, and whether a clean
// update is available. We only ever update by re-running the install (git / uv / npm / official
// installer), never by reusing a kept copy — so `action` is always a clean fresh pull.
async function computeVersions() {
  const [bh, bhL, gwxV, gwsV, gwsL, jqV, cfg] = await Promise.all([
    binVersion('browser-harness'), latestHarnessVersion().catch(() => null),
    binVersion('gwx'), binVersion('gws'), latestNpmVersion('@googleworkspace/cli').catch(() => null), binVersion('jq'),
    browserConfigInfo().catch(() => ({ scriptAvailable: false, upToDate: null })),
  ])
  return {
    'browser-harness': { installed: !!findOnPath('browser-harness'), version: bh, latest: bhL, upToDate: verGE(bh, bhL), action: 'install-browser-harness', via: 'git · uv tool' },
    'horse-browser':   { installed: !!findOnPath('horse-browser'), version: null, latest: null, upToDate: null, action: 'install-horse-browser', via: 'git clone' },
    'browser-config':  { scriptAvailable: cfg.scriptAvailable, installed: cfg.scriptAvailable && cfg.upToDate === true, upToDate: cfg.upToDate, action: 'install-browser-config', via: 'claude-md.sh' },
    'gwx':             { installed: !!findOnPath('gwx'), version: gwxV, latest: null, upToDate: null, action: 'install-gwx', via: 'official installer' },
    'gws':             { installed: !!findOnPath('gws'), version: gwsV, latest: gwsL, upToDate: verGE(gwsV, gwsL), action: 'install-gwx', via: 'npm · via gwx' },
    'jq':              { installed: !!findOnPath('jq'), version: jqV, latest: null, upToDate: null, via: 'brew' },
  }
}
// non-blocking cache: serve the last result, refresh in the background when stale — the frequent
// snapshot poll must never wait on subprocesses + network. verBust() forces a refresh after installs.
let _verVal = null, _verAt = 0, _verBusy = false
function verBust() { _verAt = 0 }
async function softwareVersions() {
  if ((!_verVal || Date.now() - _verAt > 90000) && !_verBusy) {
    _verBusy = true
    Promise.resolve().then(computeVersions).then((v) => { _verVal = v; _verAt = Date.now() }).catch(() => {}).finally(() => { _verBusy = false })
  }
  return _verVal
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
    versions: await softwareVersions(),
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
  'gwx-whoami':              { danger: 'safe',        label: 'Check gwx auth' },
  'install-gwx':             { danger: 'network',     label: 'Install gwx' },
  'install-statusbar':       { danger: 'destructive', label: 'Set up the status bar' },
  'install-global-claudemd': { danger: 'destructive', label: 'Install global CLAUDE.md' },
  'install-browser-harness': { danger: 'network',     label: 'Install browser-harness' },
  'install-horse-browser':   { danger: 'network',     label: 'Install horse-browser' },
  'install-browser-config':  { danger: 'destructive', label: 'Install CLAUDE.md browser config' },
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
      const [hv, latestH, latestC, tabMap] = await Promise.all([
        cachedLatest('hv', harnessVersion, 3 * 60 * 1000),
        cachedLatest('latestH', latestHarnessVersion),
        cachedLatest('latestC', latestChromeVersion),
        cdp.up ? tabGroups() : Promise.resolve({}),
      ])
      const chromeVer = cdp.browser ? cdp.browser.replace(/^Chrome\//, '') : null
      res.json({
        skill: { installed: harness.installed },
        harness: { running: harness.daemons.length > 0, count: harness.daemons.length, daemons: harness.daemons.slice(0, 16), version: hv, latest: latestH, upToDate: verGE(hv, latestH) },
        chrome: { running: cdp.up, version: chromeVer, pid: cdp.pids[0] || null, latest: latestC, upToDate: verGE(chromeVer, latestC) },
        sessions: sessions.map((s) => ({ emoji: s.emoji, callsign: s.callsign, color: s.color, cwd: s.cwd, active: s.active })),
        tabs: cdp.tabSample.map((t) => ({ title: t.title, domain: t.domain, agent: t.title.startsWith('🐴') || t.title.startsWith('🐎'), callsign: tabMap[t.id] || null })),
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

    // Serve bundled imagery from the module's media/ folder (data/ doesn't ship). basename()
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
        return res.json({ needsConfirm: true, danger: def.danger, ...preflight })
      }

      switch (id) {
        case 'install-browser-harness': {
          const uv = findOnPath('uv'), pipx = findOnPath('pipx')
          let r
          if (uv) r = await runQuiet(id, uv, ['tool', 'install', '--force', 'git+https://github.com/browser-use/browser-harness'])
          else if (pipx) r = await runQuiet(id, pipx, ['install', '--force', 'git+https://github.com/browser-use/browser-harness'])
          else { emit(id, 'need uv (or pipx) to install — get uv at https://astral.sh/uv', 'stderr'); done(id, { ok: false }); return res.json({ ok: false }) }
          slot.verCache = {}; verBust()
          emit(id, r.ok ? '✓ browser-harness installed from GitHub' : `✗ install failed (exit ${r.code})`, r.ok ? 'ok' : 'stderr')
          done(id, { ok: r.ok }); ctx.broadcast({ type: 'snapshot-dirty' })
          return res.json({ ok: r.ok })
        }
        case 'install-horse-browser': {
          if (!findOnPath('git')) { emit(id, 'git not found on PATH', 'stderr'); done(id, { ok: false }); return res.json({ ok: false }) }
          const dir = path.join(HOME, 'horse-browser')
          // Always start from a clean clone. Reusing a stale/partial checkout from a
          // failed run is exactly what makes the retry fail — so remove it first.
          if (fs.existsSync(dir)) { emit(id, `removing previous checkout at ${dir.replace(HOME, '~')} for a clean install`, 'stdout'); try { fs.rmSync(dir, { recursive: true, force: true }) } catch (e) { emit(id, `could not remove ${dir}: ${e.message}`, 'stderr'); done(id, { ok: false }); return res.json({ ok: false }) } }
          const r1 = await runQuiet(id, 'git', ['clone', '--depth', '1', 'https://github.com/pA1nD/horse-browser.git', dir])
          if (!r1.ok) { emit(id, `✗ clone failed (exit ${r1.code})`, 'stderr'); done(id, { ok: false }); return res.json({ ok: false }) }
          const installer = path.join(dir, 'install.sh')
          if (!fs.existsSync(installer)) { emit(id, 'install.sh not found in the repo', 'stderr'); done(id, { ok: false }); return res.json({ ok: false }) }
          const r2 = await runQuiet(id, 'bash', [installer], { cwd: dir })
          emit(id, r2.ok ? '✓ horse-browser installed' : `✗ install.sh failed (exit ${r2.code})`, r2.ok ? 'ok' : 'stderr')
          // also import the browser playbooks into ~/.claude/CLAUDE.md (idempotent, backs up) — the
          // config that lets agents actually drive it. claude-md.sh ships in the repo we just cloned.
          if (r2.ok) {
            const cmScript = path.join(dir, 'claude-md.sh')
            if (fs.existsSync(cmScript)) {
              emit(id, 'importing the browser playbooks into ~/.claude/CLAUDE.md…', 'stdout')
              const r3 = await runQuiet(id, 'bash', [cmScript, 'apply'])
              emit(id, r3.ok ? '✓ CLAUDE.md browser config applied' : `⚠ claude-md.sh apply failed (exit ${r3.code}) — set it up from the chapter`, r3.ok ? 'ok' : 'stderr')
            }
          }
          slot.verCache = {}; verBust()
          done(id, { ok: r2.ok }); ctx.broadcast({ type: 'snapshot-dirty' })
          return res.json({ ok: r2.ok })
        }
        case 'install-browser-config': {
          // horse-browser's claude-md.sh writes the browser-playbook @-import into ~/.claude/CLAUDE.md
          // (idempotent, backs up, re-points the version-agnostic symlink). `apply` = (re)install.
          const script = hbClaudeMdScript()
          if (!script) { emit(id, 'claude-md.sh not found — install horse-browser first', 'stderr'); done(id, { ok: false }); ctx.broadcast({ type: 'snapshot-dirty' }); return res.json({ ok: false }) }
          const r = await runStreaming(id, 'bash', [script, 'apply'])
          slot.verCache = {}; verBust(); ctx.broadcast({ type: 'snapshot-dirty' })
          return res.json(r)
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
          slot.verCache = {}; verBust(); ctx.broadcast({ type: 'snapshot-dirty' })
          return res.json(r)
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
