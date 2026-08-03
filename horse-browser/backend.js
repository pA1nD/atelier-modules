/* horse-browser — backend.
 *
 * Instruments read the REAL machine and report it live: the horse-browser CDP
 * (HB_CDP_PORT, default 9223 — 0.9.7 gives each browser its own port), the
 * version, tab count, PID, the horse-harness daemons (each one an
 * agent session driving the browser, matched back to its session via the
 * HORSE_SESSION env), the running Claude sessions (as codenames, with cwd),
 * and the tab→session map from the tab-grouper extension. Hands: install/
 * update horse-browser (npm — @pa1nd/horse-browser, which vendors the harness
 * and builds its Python venv in postinstall), rebuild that venv
 * (`horse-browser harness-setup`), and apply the browser rule file
 * (~/.claude/rules/horse-browser.md, written by the package's claude-md.sh) —
 * streaming every line over the shell WebSocket.
 *
 * Pure Node builtins, no deps. Outward actions refuse to run without an
 * explicit confirm; children are tracked and killed on hot-reload + shutdown.
 */

import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import os from 'node:os'
import path from 'node:path'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mountCredentials } from './credentials.js'
import { brokerInstalled, SETUP_CMD, INSTALL as BROKER_INSTALL } from './broker.js'

const execFileP = promisify(execFile)
const HOME = os.homedir()
const PROJECTS_DIR = path.join(HOME, '.claude', 'projects')
const UUID_JSONL = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/
const UUID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/
// The one CDP port for this instance — every reader derives from it (0.9.7+
// gives each browser its own port; nothing may assume 9223).
const CDP_PORT = Number(process.env.HB_CDP_PORT || 9223)
const CDP = `http://127.0.0.1:${CDP_PORT}`
const HB_NPM = '@pa1nd/horse-browser'
const DESKPAD_APP = '/Applications/DeskPad.app'
const HB_RULES_MD = path.join(HOME, '.claude', 'rules', 'horse-browser.md')
const ACTIVE_MS = 4 * 60 * 1000           // transcript touched this recently ⇒ mid-turn ("working now")
const RUNNING_MS = 30 * 60 * 1000         // ...this recently ⇒ likely still open
const RECENT_MS = 36 * 60 * 60 * 1000     // discovery window for the session list

/* ── session codename — byte-identical to the statusline + dashboard hash
 *    (FNV-1a 32-bit + murmur3 finalizer), so the wall's names match. */
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
    // node version managers with STABLE bin dirs — so npm/node resolve even when
    // atelier runs under a managed launcher whose PATH never saw a shell init
    // (nvm has no stable symlink; nvm users start servers from shells anyway)
    path.join(HOME, '.local', 'share', 'fnm', 'aliases', 'default', 'bin'),
    path.join(HOME, '.volta', 'bin'),
    path.join(HOME, '.asdf', 'shims'),
    '/opt/local/bin',
  ]
  for (const d of dirs) {
    if (!d) continue
    const p = path.join(d, name)
    try { fs.accessSync(p, fs.constants.X_OK); return p } catch {}
  }
  return null
}

async function cdpInfo() {
  const out = { up: false, browser: null, protocol: null, port: CDP_PORT, tabs: 0, tabSample: [], pids: [] }
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
    out.pids = await listeningPids(CDP_PORT)
  }
  return out
}

// ask the horse-browser tab-grouper extension which open tabs belong to which session group
// (a group's title ends in the session's callsign). Returns a { targetId: callsign } map. Chrome's
// CDP exposes no tab→group link, but the extension's service worker does.
// Evaluate an async expression in one extension service worker over its own CDP WS.
// Returns { value } on success or null on any failure (wrong worker, no permission, timeout).
async function swEval(swUrl, expr) {
  let ws
  try {
    ws = new WebSocket(swUrl)
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', () => rej(new Error('ws'))); setTimeout(() => rej(new Error('timeout')), 2000) })
    let mid = 0
    const send = (method, params) => new Promise((res, rej) => {
      const id = ++mid, to = setTimeout(() => rej(new Error('eval timeout')), 2500)
      const handler = (e) => { let m; try { m = JSON.parse(e.data) } catch { return } if (m.id === id) { clearTimeout(to); ws.removeEventListener('message', handler); res(m) } }
      ws.addEventListener('message', handler)
      ws.send(JSON.stringify({ id, method, params }))
    })
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    if (r.result && r.result.exceptionDetails) return null   // wrong worker (e.g. chrome.tabGroups undefined)
    return r.result && r.result.result ? { value: r.result.result.value } : null
  } catch { return null }
  finally { try { ws && ws.close() } catch {} }
}
async function tabGroups() {
  const targets = await fetchJson(`${CDP}/json/list`, 2000).catch(() => [])
  // A profile can host OTHER extensions' service workers — pick ours by trying each
  // until one answers with our tab-grouper API (0.9.7: the launcher's extension is
  // no longer guaranteed to be the first worker in the list).
  const workers = (Array.isArray(targets) ? targets : []).filter((t) => t.type === 'service_worker' && /chrome-extension/.test(t.url || '') && t.webSocketDebuggerUrl)
  // group titles look like "🥕 AE14" — the last 4 chars are the session callsign. Map each group's
  // tabs to their CDP target id via chrome.debugger.getTargets (tabId → target).
  const expr = `(async () => {
    if (!chrome.tabGroups || !chrome.debugger) throw new Error('not the tab-grouper')
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
  for (const w of workers) {
    const r = await swEval(w.webSocketDebuggerUrl, expr)
    if (r && r.value && typeof r.value === 'object') return r.value   // ours answered
  }
  return {}
}

/* ── display & health (agent vision) ──────────
 * Why: with the display asleep (esp. clamshell — lid closed, box kept awake by
 * SSH) WindowServer composites nothing, so agent screenshots hang; waking a
 * closed lid is worse (macOS re-blanks ~10s later and Chrome drops every CDP
 * websocket on the flap — measured 2026-07-11). The clean fix is a virtual
 * display that never sleeps — DeskPad (audited: 436 lines, sandboxed, no
 * network entitlement). macOS-only; every probe degrades to nulls elsewhere. */
async function displayInfo() {
  // display census via CoreGraphics ctypes (~80ms): main-display sleep state +
  // how many online displays aren't the built-in panel (≈ virtual/external).
  const py = [
    'import ctypes, json',
    'cg = ctypes.CDLL("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics")',
    'n = ctypes.c_uint32(0)',
    'ids = (ctypes.c_uint32 * 16)()',
    'cg.CGGetOnlineDisplayList(16, ids, ctypes.byref(n))',
    'ext = sum(1 for i in range(n.value) if not cg.CGDisplayIsBuiltin(ids[i]))',
    'print(json.dumps({"asleep": bool(cg.CGDisplayIsAsleep(cg.CGMainDisplayID())), "online": n.value, "external": ext}))',
  ].join('\n')
  let disp = null
  try { const { stdout } = await execFileP('python3', ['-c', py], { timeout: 4000 }); disp = JSON.parse(stdout) } catch {}
  let clamshell = null
  try {
    const { stdout } = await execFileP('ioreg', ['-r', '-k', 'AppleClamshellState', '-d', '1'], { timeout: 2500 })
    clamshell = /"AppleClamshellState" = Yes/.test(stdout)
  } catch {}
  return { ...(disp || {}), clamshell }
}

async function deskpadInfo() {
  let installed = false
  try { installed = fs.existsSync(DESKPAD_APP) } catch {}
  let running = false
  try { const { stdout } = await execFileP('pgrep', ['-x', 'DeskPad'], { timeout: 1500 }); running = !!stdout.trim() } catch {}
  return { installed, running, display: await displayInfo() }
}

/* paintProbe — the ground truth for "do screenshots work right now": a REAL
 * 1×1 Page.captureScreenshot against the horse browser, timed. It needs a
 * composited frame, so it hangs exactly when nothing is being drawn (display
 * asleep, wedged GPU) — a miss past the deadline means no compositing, not a
 * slow page. Read-only: probes, never heals. */
async function paintProbe(timeoutMs = 3500) {
  let pages = []
  try {
    const r = await fetch(`${CDP}/json/list`, { signal: AbortSignal.timeout(1500) })
    if (!r.ok) return { status: 'no-browser', ms: null }
    pages = (await r.json()).filter((t) => t.type === 'page' && t.webSocketDebuggerUrl)
  } catch { return { status: 'no-browser', ms: null } }
  if (!pages.length) return { status: 'no-page', ms: null }
  const t0 = Date.now()
  return await new Promise((resolve) => {
    let ws, done = false
    const finish = (status) => {
      if (done) return
      done = true
      clearTimeout(timer)
      try { ws && ws.close() } catch {}
      resolve({ status, ms: status === 'ok' ? Date.now() - t0 : null })
    }
    const timer = setTimeout(() => finish('hang'), timeoutMs)
    try { ws = new WebSocket(pages[0].webSocketDebuggerUrl) } catch { return finish('no-page') }
    ws.addEventListener('open', () => ws.send(JSON.stringify({ id: 1, method: 'Page.captureScreenshot', params: { format: 'png', clip: { x: 0, y: 0, width: 1, height: 1, scale: 1 } } })))
    ws.addEventListener('message', (e) => { try { if (JSON.parse(e.data).id === 1) finish('ok') } catch {} })
    ws.addEventListener('error', () => finish('no-page'))
  })
}

/* heal.log — one tab-separated line per incident, written by bin/horse-browser;
 * we only read it. Format: ts \t event \t k=v context fields. */
function healLog(limit = 200) {
  const p = path.join(HOME, '.config', 'horse-browser', 'heal.log')
  let lines = []
  try { lines = fs.readFileSync(p, 'utf8').split('\n').filter(Boolean) } catch {}
  const total = lines.length
  const entries = lines.slice(-limit).map((ln) => {
    const [ts, event, ...rest] = ln.split('\t')
    const detail = rest.join(' ').trim()
    const fields = {}
    for (const m of detail.matchAll(/([A-Za-z_]+)=(\S+)/g)) fields[m[1]] = m[2]
    return { ts, event: event || 'unknown', detail, fields }
  }).reverse()
  return { path: p.replace(HOME, '~'), total, entries }
}

async function listeningPids(port) {
  try {
    const { stdout } = await execFileP('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { timeout: 2500 })
    return [...new Set(stdout.split('\n').map((s) => s.trim()).filter(Boolean))].map(Number)
  } catch { return [] }
}

async function pgrepClaude() {
  // Real `claude` CLI processes (best-effort) — used to catch open-but-quiet sessions.
  try {
    const { stdout } = await execFileP('pgrep', ['-fl', 'claude'], { timeout: 2500 })
    return stdout.split('\n').map((s) => s.trim()).filter(Boolean)
      .map((l) => { const i = l.indexOf(' '); return { pid: Number(l.slice(0, i)), cmd: l.slice(i + 1) } })
      .filter((p) => p.pid && p.pid !== process.pid)
      .filter((p) => /(^|\/)claude( |$)/.test(p.cmd) && !/mcp-server|statusline|backend\.js|pgrep/.test(p.cmd))
  } catch { return [] }
}

/* ── transcript tailer — read the last bytes of a session .jsonl to recover its
 *    cwd without parsing the whole file. */
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
function sessionCwd(file) {
  let cwd = null
  for (const ln of tailText(file).split('\n')) {
    if (!ln.trim()) continue
    let o; try { o = JSON.parse(ln) } catch { continue }
    if (o.cwd) cwd = o.cwd
  }
  return cwd
}
function listSessions() {
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
      const cwd = sessionCwd(full)
      out.push({ ...codename(id), mtime: st.mtimeMs, startMs: st.birthtimeMs || st.ctimeMs, age, active: age <= ACTIVE_MS, cwd: cwd ? cwd.replace(HOME, '~') : null })
    }
  }
  out.sort((a, b) => b.mtime - a.mtime)
  return out
}
// the snapshot and the processes builder both want the session list each tick —
// one 2s memo instead of walking the transcripts (and tailing for cwd) twice
let _sessCache = { at: 0, v: [] }
function listSessionsCached() {
  if (Date.now() - _sessCache.at > 2000) _sessCache = { at: Date.now(), v: listSessions() }
  return _sessCache.v
}

/* Rules load when a session STARTS — so agents already running when the rule
 * file lands (or gets updated) are flying blind until nudged or restarted.
 * A session's transcript birthtime approximates its start. */
function ruleMtimeMs() { try { return fs.statSync(HB_RULES_MD).mtimeMs } catch { return 0 } }
function staleAgents() {
  const rm = ruleMtimeMs()
  if (!rm) return { count: 0, sessions: [] }
  const stale = listSessionsCached().filter((s) => s.age <= RUNNING_MS && s.startMs && s.startMs < rm)
  return { count: stale.length, sessions: stale.slice(0, 8).map((s) => ({ callsign: s.callsign, emoji: s.emoji, color: s.color })) }
}

// horse-harness: the CDP driver vendored inside the horse-browser package —
// "installed" means the package's harness venv is built (npm postinstall, or
// `horse-browser harness-setup`). Live daemons ≈ agent sessions connected to
// the browser; pre-0.9 `browser_harness.daemon` leftovers still match, flagged
// legacy so the wall can show them for what they are.
async function harnessInfo() {
  // each daemon carries its agent's session id in HORSE_SESSION (plus a BU_NAME
  // like `hb-<sess-tail>[-lane]`); the session id's last 4 chars are the
  // callsign the wall's codenames use — that's how a daemon name-matches back
  // to the agent session that started it. The `-m` anchor keeps pgrep from
  // matching shells that merely mention the daemon in their command text.
  let pids = []
  try { const { stdout } = await execFileP('pgrep', ['-f', '\\-m (browser|horse)_harness\\.daemon'], { timeout: 2500 }); pids = stdout.split('\n').map((s) => Number(s.trim())).filter(Boolean) } catch {}
  const daemons = pids.map((pid) => ({ pid, name: null, callsign: null, legacy: false }))
  if (pids.length) {
    try {
      const { stdout } = await execFileP('ps', ['eww', '-p', pids.join(',')], { timeout: 3000 })
      for (const line of stdout.split('\n')) {
        const pid = Number((line.trim().match(/^\d+/) || [])[0]); if (!pid) continue
        const d = daemons.find((x) => x.pid === pid); if (!d) continue
        d.legacy = /browser_harness\.daemon/.test(line)
        const bu = line.match(/\bBU_NAME=(\S+)/); if (bu) d.name = bu[1]
        const sess = line.match(/\bHORSE_SESSION=(\S+)/)
        const tail = sess ? sess[1] : (d.name || '')
        if (tail) d.callsign = tail.slice(-4).toUpperCase()
      }
    } catch {}
  }
  return { installed: harnessReady(), sessions: daemons.length, daemons }
}

// compare two version strings — a >= b ? (null if either is unknown)
function verGE(a, b) {
  if (!a || !b) return null
  const pa = (String(a).match(/\d+/g) || []).map(Number), pb = (String(b).match(/\d+/g) || []).map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const x = pa[i] || 0, y = pb[i] || 0; if (x !== y) return x > y }
  return true
}
/* fetch JSON — via node:http(s), NOT global fetch. Node's happy-eyeballs gives
 * each address only 250ms by default (autoSelectFamilyAttemptTimeout); on a
 * slow link (~300ms TCP RTT observed here) that silently kills EVERY hostname
 * connection while curl works fine — which is why `latest` versions came back
 * null. A 2s per-attempt timeout keeps the IPv6→IPv4 fallback without the
 * false timeouts. */
function fetchJson(url, ms = 8000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http
    const req = lib.get(url, {
      autoSelectFamily: true,
      autoSelectFamilyAttemptTimeout: 2000,
      headers: { accept: 'application/json' },
      timeout: ms,
    }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('http ' + res.statusCode)) }
      let b = ''
      res.setEncoding('utf8')
      res.on('data', (c) => { b += c })
      res.on('end', () => { try { resolve(JSON.parse(b)) } catch (e) { reject(e) } })
    })
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
  })
}
async function latestChromeVersion() { const d = await fetchJson('https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions.json'); return (d && d.channels && d.channels.Stable && d.channels.Stable.version) || null }

/* ── horse-browser via npm ──────────────────────────────────────────────────
 * The launcher on PATH resolves (through the npm bin symlink, or a dev-repo
 * symlink) into the package root — read its package.json for the installed
 * version. NEVER run `horse-browser --version`: the launcher's whole job is to
 * bring the browser up first, so that "version check" would launch Chrome. */
function hbPackageRoot() {
  try {
    const bin = findOnPath('horse-browser'); if (!bin) return null
    return path.dirname(path.dirname(fs.realpathSync(bin)))   // <root>/bin/horse-browser → <root>
  } catch { return null }
}
function hbVersion() {
  const root = hbPackageRoot(); if (!root) return null
  try { return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version || null } catch { return null }
}
// the vendored harness is ready when the package's venv python exists — built
// by npm postinstall / install.sh, rebuildable via `horse-browser harness-setup`.
function harnessReady() {
  const root = hbPackageRoot(); if (!root) return false
  try { fs.accessSync(path.join(root, 'harness', '.venv', 'bin', 'python3'), fs.constants.X_OK); return true } catch { return false }
}
async function latestHorseVersion() {
  const d = await fetchJson('https://registry.npmjs.org/' + encodeURIComponent(HB_NPM))
  return (d && d['dist-tags'] && d['dist-tags'].latest) || null
}

// horse-browser ships claude-md.sh in its package root — it installs/refreshes the
// browser rule file at ~/.claude/rules/horse-browser.md (loaded like CLAUDE.md).
function hbClaudeMdScript() {
  const root = hbPackageRoot(); if (!root) return null
  const p = path.join(root, 'claude-md.sh')
  try { return fs.existsSync(p) ? p : null } catch { return null }
}
async function browserConfigInfo() {
  const script = hbClaudeMdScript()
  if (!script) return { scriptAvailable: false, upToDate: null }
  // `claude-md.sh check` exits 0 when the rule file + symlink are current, non-zero when drifted.
  try { await execFileP('bash', [script, 'check'], { timeout: 5000 }); return { scriptAvailable: true, upToDate: true } }
  catch { return { scriptAvailable: true, upToDate: false } }
}

// version status for every tool the module installs — installed vs upstream, and whether a clean
// update is available. Updates are always a fresh install from the source of truth (npm).
async function computeVersions() {
  const [hbL, cfg] = await Promise.all([
    latestHorseVersion().catch(() => null),
    browserConfigInfo().catch(() => ({ scriptAvailable: false, upToDate: null })),
  ])
  const hb = hbVersion()
  return {
    // the vendored harness isn't tracked separately — it IS the package; its
    // venv readiness rides in snapshot.harness.installed instead.
    'horse-browser':   { installed: !!findOnPath('horse-browser'), version: hb, latest: hbL, upToDate: verGE(hb, hbL), action: 'install-horse-browser', via: 'npm' },
    'browser-config':  { scriptAvailable: cfg.scriptAvailable, installed: cfg.scriptAvailable && cfg.upToDate === true, upToDate: cfg.upToDate, action: 'install-browser-config', via: 'claude-md.sh' },
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

/* ── what agents actually read — ONE self-contained rule file at
 *    ~/.claude/rules/horse-browser.md (claude-md.sh copies the package's
 *    RULE.md verbatim; rules files load into every Claude Code session at
 *    start exactly like CLAUDE.md) plus ONE on-demand manual (the package's
 *    MANUAL.md, printed by `horse-browser skill` — never in the always-on
 *    context). No @-imports since v0.9. Both parsed live so the page shows
 *    the exact text agents get. */
// which installed package a doc's REAL path lives in — so the page can say
// where each doc came from and which command put it there.
function classifyDocSource(realAbs) {
  const hbRoot = hbPackageRoot()
  if (hbRoot && (realAbs === hbRoot || realAbs.startsWith(hbRoot + path.sep))) return { pkg: HB_NPM, via: 'npm', cmd: 'npm install -g ' + HB_NPM }
  return null
}

// Parse public top-level `def name(...):` + the first line of its docstring — powers the verb
// popups on the docs page, so a verb's description comes from its OWN code, not a hardcoded map.
function verbDocs(body) {
  const lines = body.split('\n')
  const out = {}
  for (let i = 0; i < lines.length; i++) {
    const m = /^def\s+([A-Za-z]\w*)\s*\(/.exec(lines[i])
    if (!m || m[1].startsWith('_')) continue
    let j = i
    while (j < lines.length && !/:\s*$/.test(lines[j].replace(/#.*$/, ''))) j++   // end of signature
    let k = j + 1
    while (k < lines.length && lines[k].trim() === '') k++
    const open = /^\s*[rubfRUBF]{0,2}("""|''')/.exec(lines[k] || '')
    if (!open) continue
    const q = open[1]
    const rest = lines[k].slice(lines[k].indexOf(q) + 3)
    const end = rest.indexOf(q)
    let first = end >= 0 ? rest.slice(0, end) : rest
    let kk = k
    while (!first.trim() && kk + 1 < lines.length && !lines[kk].includes(q)) { kk++; if (lines[kk].includes(q)) break; first = lines[kk] }
    first = first.replace(/\s+/g, ' ').trim()
    if (first) out[m[1]] = first.length > 180 ? first.slice(0, 179) + '…' : first
  }
  return out
}
function agentDocs() {
  const short = (p) => p.replace(HOME, '~')
  const out = { blockPresent: false, blockPath: short(HB_RULES_MD), blockTitle: null, maintainer: null, docs: [] }
  const cm = hbClaudeMdScript()
  if (cm) out.maintainer = short(cm)
  const read = (p, extra) => {
    const d = { path: short(p), realPath: null, exists: false, bytes: 0, lines: 0, title: null, headings: [], source: null, ...extra }
    try {
      const isLink = fs.lstatSync(p).isSymbolicLink()
      const real = fs.realpathSync(p)   // resolves the doc's true home even through intermediate links
      if (isLink) d.realPath = short(real)
      d.source = classifyDocSource(real)
      const body = fs.readFileSync(p, 'utf8')
      d.exists = true
      d.bytes = Buffer.byteLength(body)
      d.lines = body.split('\n').length
      const t = /^#\s+(.+?)\s*$/m.exec(body)
      d.title = t ? t[1] : path.basename(p)
      d.headings = [...body.matchAll(/^##\s+(.+?)\s*$/gm)].map((m) => m[1]).slice(0, 14)
      if (/\.py$/.test(p)) d.verbs = verbDocs(body)   // {name: first-docstring-line} for the popups
    } catch {}
    return d
  }
  const rule = read(HB_RULES_MD, { import: short(HB_RULES_MD), kind: 'rule' })
  out.blockPresent = rule.exists
  out.blockTitle = rule.title
  out.docs = [rule]
  // the atelier module's always-on credential rule — module-written, so it has no npm
  // source, but it IS in ~/.claude/rules and loads every session, so list it beside the rule
  const authRuleMd = path.join(HOME, '.claude', 'rules', 'horse-browser-auth.md')
  out.docs.push(read(authRuleMd, { import: short(authRuleMd), kind: 'auth-rule' }))
  const root = hbPackageRoot()
  if (root) out.docs.push(read(path.join(root, 'MANUAL.md'), { import: 'horse-browser skill', kind: 'manual' }))
  // the verb source files, so the docs page can Read each one (whitelisted here → /agent-doc serves
  // them): core (helpers/input) + every plugin under plugins/ + the operator's own agent_helpers.py
  const wsDir = path.join(HOME, '.config', 'browser-harness', 'agent-workspace')
  const hh = root ? path.join(root, 'harness', 'horse_harness') : null
  let plugins = []
  try { plugins = fs.readdirSync(path.join(wsDir, 'plugins')).filter((f) => f.endsWith('.py')).sort().map((f) => path.join(wsDir, 'plugins', f)) } catch {}
  for (const vf of [hh && path.join(hh, 'helpers.py'), hh && path.join(hh, 'input.py'), ...plugins, path.join(wsDir, 'agent_helpers.py')].filter(Boolean)) {
    out.docs.push(read(vf, { import: short(vf), kind: 'verb-file' }))
  }
  return out
}

// Site skills — per-host playbooks the agent reads on navigation: domain-skills/<domain.tld>/*.md
// in the agent workspace (the harness surfaces one when the tab's host matches). Pure fs + cheap, so
// the summary (counts + hosts) rides the snapshot poll; the full tree with content is its own route.
const SKILLS_DIR = path.join(HOME, '.config', 'browser-harness', 'agent-workspace', 'domain-skills')
function siteSkillHosts() {
  const hosts = []
  let dirs = []
  try { dirs = fs.readdirSync(SKILLS_DIR, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort() } catch {}
  for (const host of dirs) {
    let files = []
    try { files = fs.readdirSync(path.join(SKILLS_DIR, host)).filter((f) => f.endsWith('.md')).sort() } catch { continue }
    if (files.length) hosts.push({ host, files })
  }
  return hosts
}
function siteSkillsSummary() {
  const hosts = siteSkillHosts()
  return { dir: SKILLS_DIR.replace(HOME, '~'), hostCount: hosts.length,
    fileCount: hosts.reduce((n, h) => n + h.files.length, 0),
    hosts: hosts.map((h) => ({ host: h.host, count: h.files.length })) }
}
function siteSkillsTree() {
  const out = []
  for (const { host, files } of siteSkillHosts()) {
    const skills = files.map((name) => {
      const abs = path.join(SKILLS_DIR, host, name)
      let body = '', bytes = 0, title = name
      try {
        body = fs.readFileSync(abs, 'utf8'); bytes = Buffer.byteLength(body)
        const t = /^#\s+(.+?)\s*$/m.exec(body); if (t) title = t[1]
      } catch {}
      if (body.length > 65536) body = body.slice(0, 65536) + '\n\n… (truncated)'
      return { name, path: abs.replace(HOME, '~'), bytes, title, body }
    })
    out.push({ host, skills })
  }
  return { dir: SKILLS_DIR.replace(HOME, '~'), hosts: out }
}

// The authoritative verb list, by tier — from `horse-browser verbs --json` (harness introspection,
// not a hardcoded map). Powers the docs page's three tiers. ~1-2s (harness import), so it's cached
// and fetched by its own route, off the snapshot poll.
/* The cache lives on the module SLOT, not in module scope: a hot reload builds a fresh module
   graph, so a module-scope cache was empty again after every backend edit — and the next /verbs
   then took the full cold path, holding one of the browser's ~6 sockets for up to 12s. The slot
   survives reloads, so the cold path now happens about once per process instead of once per edit.
   _verbsPending stays module-scope: an in-flight promise belongs to the graph that created it. */
let _verbsPending = null
function verbsSlot(ctx) { const s = ctx.module(ctx.id); s.verbs ??= { at: 0, rows: null }; return s.verbs }
async function refreshVerbs(ctx) {
  const hb = findOnPath('horse-browser')   // resolve the binary — bare `horse-browser` is empty under a managed-launcher PATH
  let rows = []
  if (hb) {
    try {
      const { stdout } = await execFileP(hb, ['verbs', '--json'], { timeout: 12000 })
      const parsed = JSON.parse(stdout)
      if (Array.isArray(parsed)) {
        const root = hbPackageRoot()
        rows = parsed.map((r) => ({    // shorten source paths for display: package → <pkg>, home → ~
          ...r,
          file: root && r.file && r.file.startsWith(root) ? '<pkg>' + r.file.slice(root.length) : (r.file || '').replace(HOME, '~'),
        }))
      }
    } catch {}
  }
  const slot = verbsSlot(ctx)
  slot.at = Date.now(); slot.rows = rows
  return rows
}
// Never hold the request: fresh cache → return it; stale → return stale NOW and
// refresh in the background; only a genuinely cold call awaits (single-flight,
// so concurrent page loads share one harness import instead of spawning many).
async function harnessVerbs(ctx) {
  const slot = verbsSlot(ctx)
  if (slot.rows && Date.now() - slot.at < 15000) return slot.rows
  if (!_verbsPending) _verbsPending = refreshVerbs(ctx).finally(() => { _verbsPending = null })
  if (slot.rows) return slot.rows
  return _verbsPending
}

async function snapshot() {
  const [cdp, harness, deskpad] = await Promise.all([cdpInfo(), harnessInfo(), deskpadInfo()])
  return {
    now: Date.now(),
    deskpad,
    tools: {
      'horse-browser': { installed: !!findOnPath('horse-browser') },
      // the installer the one-click button needs — surfaced on page load so a
      // missing prerequisite shows up with its install command, not as a failed run
      npm: { installed: !!findOnPath('npm') },
    },
    cdp,
    harness,
    versions: await softwareVersions(),
    agentDocs: agentDocs(),
    siteSkills: siteSkillsSummary(),
    staleAgents: staleAgents(),
  }
}

function mediaDir(ctx) { return path.join(path.dirname(ctx.dataDir), 'media') }

/* ──────────────────────────── actions ────────────────────────────────────── */
// A registry the frontend mirrors. `danger`: safe | network | destructive.
// Installation is an AGENT task (see GET /setup.md) — the module keeps only the
// deterministic wiring helpers it owns: applying the rule file (a script the
// package ships) and launching an already-installed DeskPad.
const ACTIONS = {
  'install-browser-config':  { danger: 'destructive', label: 'Install browser rule file' },
  'launch-deskpad':          { danger: 'safe',        label: 'Launch DeskPad' },
}

export default {
  /* NOT async, deliberately. The shell does `const teardown = plug.mountRoutes(...)` and keeps it
     only `if (typeof teardown === 'function'` — an async function returns a Promise, so the
     teardown below was silently discarded on every mount: spawned installer children were never
     SIGTERM'd on hot-reload or shutdown (they reparent to init), and on a real unmount the
     watchers and timers outlived the module. Nothing here awaits at the top level, so the
     keyword bought nothing. Keep it sync — see the slot-clearing at mount start, which exists
     only because this used to be broken. */
  mountRoutes(router, ctx) {
    const slot = ctx.module(ctx.id)
    slot.children ??= new Set()
    slot.verCache ??= {}

    const emit = (actionId, line, stream = 'stdout') => ctx.broadcast({ type: 'action-log', actionId, stream, line })
    const done = (actionId, payload) => ctx.broadcast({ type: 'action-done', actionId, ...payload })

    // Spawn a command, stream every line over the WS, track for teardown.
    const runStreaming = (actionId, cmd, args, opts = {}) => new Promise((resolve) => {
      emit(actionId, `$ ${cmd} ${args.join(' ')}`.trim(), 'cmd')
      let child
      try { child = spawn(cmd, args, { detached: true, env: { ...process.env, ...opts.env }, cwd: opts.cwd }) }
      catch (e) { emit(actionId, `failed to spawn: ${e.message}`, 'stderr'); return resolve({ ok: false, error: e.message }) }
      slot.children.add(child)
      const onData = (s) => (b) => String(b).split('\n').forEach((l) => l.length && emit(actionId, l, s))
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

    /* ── instruments ── */
    const markWatched = () => { slot.watchedAt = Date.now() }
    router.get('/snapshot', async (req, res) => { markWatched(); res.json(await snapshot()) })

    // the full text of one imported agent doc — whitelisted against the docs the
    // managed block actually imports, so this can never read an arbitrary path.
    router.get('/agent-doc', (req, res) => {
      const want = String(req.query.path || '')
      const hit = agentDocs().docs.find((d) => d.path === want && d.exists)
      if (!hit) return res.json({ error: 'unknown doc' }, 404)
      const abs = /^~(?=\/|$)/.test(hit.path) ? HOME + hit.path.slice(1) : hit.path
      try { res.json({ path: hit.path, content: fs.readFileSync(abs, 'utf8') }) }
      catch { res.json({ error: 'unreadable' }, 500) }
    })

    // The SETUP SKILL — the manual, generated live with this machine's state.
    // Installation is an agent task (a button can't survive foreign systems);
    // the module stays the instrument panel the agent verifies against.
    router.get('/setup.md', async (req, res) => {
      const proto = (req.headers['x-forwarded-proto'] || 'http').toString().split(',')[0].trim()
      const host = (req.headers['x-forwarded-host'] || req.headers.host || `localhost:${ctx.port}`).toString().split(',')[0].trim()
      const base = `${proto}://${host}/api/${ctx.qualifiedId}`
      const horse = !!findOnPath('horse-browser')
      const venv = harnessReady()
      const docs = agentDocs()
      const rule = !!docs.blockPresent
      const daemon = brokerInstalled()
      const dp = await deskpadInfo()
      const mark = (ok) => (ok ? '✅' : '⬜')
      res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' })
      // ?part=browser|credentials|display scopes the skill to one group; default = everything
      const part = String(req.query.part || 'all')
      const want = {
        browser: part === 'all' || part === 'browser',
        credentials: part === 'all' || part === 'credentials',
        display: part === 'all' || part === 'display',
      }
      const state = [
        want.browser && `- ${mark(horse && venv)} horse-browser installed${horse && venv ? '' : horse ? ' (bin present, harness venv missing)' : ''}`,
        want.browser && `- ${mark(rule)} browser rule applied (~/.claude/rules/horse-browser.md)`,
        want.credentials && `- ${mark(daemon)} credential broker daemon${part === 'all' ? ' (optional)' : ''}`,
        want.display && `- ${mark(!!(dp.installed && dp.running))} DeskPad virtual display${part === 'all' ? ' (optional)' : ''}`,
      ].filter(Boolean).join('\n')
      const browserMd = `## Install the browser package

Find this machine's node (≥ 20) however it's managed — don't assume a manager. Then:

\`\`\`
npm install -g @pa1nd/horse-browser
\`\`\`

postinstall builds the vendored Python venv (needs python3 ≥ 3.11, uses uv when
present). If the venv didn't build: \`horse-browser harness-setup\`.
NEVER probe with \`horse-browser --version\` — the launcher starts the browser;
\`horse-browser status\` is the safe check.
Verify: snapshot → \`tools['horse-browser'].installed\` and \`harness.installed\` both true.

## Wire up the agents (always-on rule)

\`\`\`
horse-browser rule apply
\`\`\`

Verify: snapshot → \`agentDocs.blockPresent\` true.
Agent sessions already running when the rule lands don't have it — the board
lists them under "Wired up"; tell the operator to nudge or restart those.`
      const credentialsMd = `## Credential broker${horse ? '' : ' — requires the browser package first'}

How it works: a small signed daemon becomes the ONLY holder of the Bitwarden
session; agents ask it to TYPE passwords over CDP, so the secret never enters
any agent's context. There is no install API — everything below is a readable
script or a file the module writes. Two moments in here are the operator's
alone — they're marked; stop and hand over when you reach them.

1 · Install the Bitwarden CLI (\`bw\`) — the daemon shells it for every vault
read, so it must be on PATH before setup. Use this machine's package manager
(don't assume brew):

\`\`\`
brew install bitwarden-cli    # or: npm i -g @bitwarden/cli · your distro's pkg
\`\`\`

Verify: \`bw --version\` prints a version. (Don't run \`bw login\` yourself — the
daemon owns the session; step 4 connects it.)

2 · Read, then run the install script (compiles the Swift daemon out of tree,
ad-hoc signs it with the hardened runtime, writes the LaunchAgent plist, and
bootstraps it under launchd — \`--rebuild\` forces a recompile; needs the Xcode
Command Line Tools):

\`\`\`
sh "${BROKER_INSTALL}"
\`\`\`

The daemon's first start does one bare Keychain read, and macOS shows a
permission prompt. Why: the broker keeps the Bitwarden session token (= full
vault access) in a Keychain item whose access list is bound to the daemon's
code signature — so ONLY this exact signed binary can ever read it. A freshly
(re)compiled binary has a new signature, so macOS asks the machine's owner to
authorize it: the OPERATOR enters their login password and clicks "Always
Allow" (plain "Allow" would re-prompt on every read, and a prompt appearing
mid-login would stall agents). The startup read exists to front-load this
prompt to a moment a human is present. Getting re-asked after a rebuild is a
feature — it tells the operator the boundary binary changed. Never approve
these prompts yourself: an agent authorizing its own access to the vault
token would defeat the entire boundary.

3 · The agent-side package — ONE unit of three module-templated files (the
module knows its own loopback URL and canonical verb code, which is why this
is an endpoint, not a script): the verb plugin
(\`agent-workspace/plugins/atelier_login.py\`), the per-site hint hook
(\`~/.config/horse-browser/hints.d/atelier-hb-auth\`), and the always-on rule
(\`~/.claude/rules/horse-browser-auth.md\`). Installed together, removed
together; the operator can toggle it later in the board's Agent-integration
panel, and the module keeps all three current while it's on:

\`\`\`
curl -X POST ${base}/agent-integration -H 'Content-Type: application/json' -d '{"enabled":true}'
\`\`\`

4 · HAND OVER to the operator:

1. The OPERATOR runs \`${SETUP_CMD}\` in their own terminal — the Bitwarden
   master password must never pass through you.
2. Collection grants happen in the board UI with Touch ID — operator only.

Verify: \`${base}/broker/status\` → \`installed\` and \`ok\` true, then \`vault.hasSession\`.

5 · Teach yourself the login skill. The always-on rule only reaches sessions
STARTED after this install — your own session predates it, so read the skill
directly (generated live, includes the exact verbs and the flow):

\`\`\`
curl -s ${base}/skill.md
\`\`\`

That is also how any agent learns it on demand — hand another session the line
\`I'm giving you a skill — read it and use it: ${base}/skill.md\`, or point it at
\`horse-browser skill\` for the deeper browser manual. Once the operator has
granted collections, prove it end-to-end: call \`list_login_profiles()\` and
confirm your allow-list comes back.`
      const displayMd = `## Lid-closed vision (DeskPad)

\`\`\`
brew install --cask deskpad && open -a DeskPad
\`\`\`

First launch: the OPERATOR approves the Screen Recording prompt once (it
mirrors only its own virtual display). No brew? Any install path works.

Keep it running across reboots — a login item, NOT launchd (it's a regular
sandboxed app, not a daemon):

\`\`\`
osascript -e 'tell application "System Events" to make login item at end with properties {path:"/Applications/DeskPad.app", hidden:true}'
\`\`\`

macOS may ask to allow controlling "System Events" — that approval is the
OPERATOR's. (Manual alternative: System Settings → General → Login Items → + DeskPad.)
Verify: snapshot → \`deskpad.installed\` and \`deskpad.running\`.`
      const scopeName = part === 'all' ? 'the Horse Browser stack' : part === 'browser' ? 'the Horse Browser package + agent wiring' : part === 'credentials' ? 'the Bitwarden credential broker' : 'the lid-closed virtual display'
      // ?bare=1 → just the step sections (the wizard page renders these — same
      // source the agent reads, no drift)
      if (req.query.bare) {
        return res.end([want.browser && browserMd, want.credentials && credentialsMd, want.display && displayMd].filter(Boolean).join('\n\n') + '\n')
      }
      res.end(`---
name: horse-browser-setup${part === 'all' ? '' : '-' + part}
description: Set up ${scopeName} on this machine — an agent-run install, verified live against the control board, with the human-only moments handed to the operator.
---

# Skill — set up ${scopeName}

You are installing on THIS machine. The control board is the source of truth —
verify every step against it and report what turned green. This machine may be
unlike any you've seen (node via nvm/fnm/volta/brew/…, no brew, custom shells,
proxies): figure it out your way, then verify.

## This machine right now (generated live)

${state}

Verify anytime:
\`curl -s ${base}/snapshot\` → \`tools['horse-browser'].installed\`, \`harness.installed\`, \`agentDocs.blockPresent\`, \`deskpad\`
\`curl -s ${base}/broker/status\` → \`installed\` (the daemon)

${[want.browser && browserMd, want.credentials && credentialsMd, want.display && displayMd].filter(Boolean).join('\n\n')}

## Rules

- Verify against the board after every step — never declare done from exit codes alone.
- The human moments (master password, macOS approvals) are the operator's; stop and say so.
- Narrate progress with THIS document's section names ("Install the browser
  package", "Wire up the agents", "Credential broker", "Lid-closed vision") —
  never invent your own step numbers: the operator is watching the board, and
  your numbering must not collide with its steps.
- Unusual machine? Solve it your way, then verify the same endpoints.
`)
    })

    // every loaded verb by tier (core / plugin:<file> / local), introspected from the harness
    router.get('/verbs', async (req, res) => res.json(await harnessVerbs(ctx)))

    // per-host site skills (domain-skills/<host>/*.md) — the full tree with content, for the explorer page
    router.get('/site-skills', (req, res) => res.json(siteSkillsTree()))

    // the live stack: agent sessions → horse-harness daemons → chrome tabs, with a status check per column
    const cachedLatest = async (key, fn, ttl = 20 * 60 * 1000) => {
      const c = slot.verCache[key]
      if (c && Date.now() - c.at < ttl) return c.val
      let val = null; try { val = await fn() } catch {}
      slot.verCache[key] = { at: Date.now(), val }
      return val
    }
    // the tab→session map costs a WebSocket round-trip to the extension's service
    // worker, so memoize it on the open-tab fingerprint (+ a short TTL for group
    // membership changes that don't change the tab set).
    const cachedTabGroups = async (cdp) => {
      if (!cdp.up) return {}
      const key = cdp.tabSample.map((t) => t.id).sort().join(',')
      const c = slot.tabMapCache
      if (c && c.key === key && Date.now() - c.at < 30000) return c.val
      const val = await tabGroups()
      slot.tabMapCache = { key, at: Date.now(), val }
      return val
    }
    const buildProcesses = async () => {
      const [cdp, harness, claudeProcs] = await Promise.all([cdpInfo(), harnessInfo(), pgrepClaude()])
      const resumeIds = new Set()
      for (const p of claudeProcs) { const m = UUID_RE.exec(p.cmd || ''); if (m) resumeIds.add(m[1]) }
      const ruleMs = ruleMtimeMs()
      const sessions = listSessionsCached().filter((s) => s.age <= RUNNING_MS || resumeIds.has(s.id)).slice(0, 12)
      const [latestH, latestC, tabMap] = await Promise.all([
        cachedLatest('latestHb', latestHorseVersion),
        cachedLatest('latestC', latestChromeVersion),
        cachedTabGroups(cdp),
      ])
      const hv = hbVersion()   // the harness is vendored — its version IS the package's
      const chromeVer = cdp.browser ? cdp.browser.replace(/^Chrome\//, '') : null
      return {
        harness: { running: harness.daemons.length > 0, count: harness.daemons.length, daemons: harness.daemons.slice(0, 16), version: hv, latest: latestH, upToDate: verGE(hv, latestH) },
        chrome: { running: cdp.up, version: chromeVer, port: cdp.port, pid: cdp.pids[0] || null, latest: latestC, upToDate: verGE(chromeVer, latestC) },
        sessions: sessions.map((s) => ({ id: s.id, emoji: s.emoji, callsign: s.callsign, color: s.color, cwd: s.cwd, active: s.active, preRule: !!(ruleMs && s.startMs && s.startMs < ruleMs) })),
        tabs: cdp.tabSample.map((t) => ({ title: t.title, domain: t.domain, agent: t.title.startsWith('🐴') || t.title.startsWith('🐎'), callsign: tabMap[t.id] || null })),
      }
    }
    router.get('/processes', async (req, res) => res.json(await buildProcesses()))

    /* ── the live push — the shell WS is the realtime channel, so the poll lives
     *    HERE, server-side, once for all viewers. Nothing in this stack emits
     *    events we could subscribe to for free (the CDP tab list, pgrep'd
     *    daemons, and transcript mtimes are all outside our process), so one
     *    watcher recomputes every few seconds and broadcasts ONLY on change —
     *    clients fetch once on mount, then just listen. An idle machine sends
     *    no frames at all. */
    const tick = async (force = false) => {
      if (!force && Date.now() - (slot.watchedAt || 0) > 90000) return   // nobody watching → idle (the 45s visible re-GET stamps us awake)
      if (slot.watchBusy) return
      slot.watchBusy = true
      try {
        const s = await snapshot()
        const sKey = JSON.stringify({ ...s, now: 0 })
        if (force || sKey !== slot.lastSnapKey) { slot.lastSnapKey = sKey; ctx.broadcast({ type: 'snapshot', snapshot: s }) }
        const p = await buildProcesses()
        const pKey = JSON.stringify(p)
        if (force || pKey !== slot.lastProcKey) { slot.lastProcKey = pKey; ctx.broadcast({ type: 'processes', processes: p }) }
      } catch {}
      finally { slot.watchBusy = false }
    }
    const tickNow = () => { tick(true).catch(() => {}) }
    if (slot.watchTimer) clearInterval(slot.watchTimer)   // an async mountRoutes' teardown is dropped by the shell — never stack watchers
    slot.watchTimer = setInterval(() => { tick().catch(() => {}) }, 4000)

    // the live compositing check: display census + a real timed screenshot probe.
    // Runs on page open and on the Recheck button — not on the snapshot poll
    // (each check is a real capture; on a broken box it costs the full timeout).
    router.get('/compositing', async (req, res) => {
      // deskpadInfo() carries the same display census (one CoreGraphics call) plus the
      // virtual-display install/run state, so "works now" can also say "lid-proof?".
      const [dp, probe] = await Promise.all([deskpadInfo(), paintProbe()])
      res.json({ now: Date.now(), display: dp.display, probe, deskpad: { installed: dp.installed, running: dp.running } })
    })

    // heal.log — the launcher's incident journal; fetch once, then the dir
    // watcher pushes the parsed tail on change (survives atomic saves, works
    // before the file exists).
    router.get('/heal-log', (req, res) => res.json(healLog()))
    const HEAL_DIR = path.join(HOME, '.config', 'horse-browser')
    if (slot.healWatcher) { try { slot.healWatcher.close() } catch {} }
    let healTimer = null
    let healWatcher = null
    try {
      healWatcher = slot.healWatcher = fs.watch(HEAL_DIR, (_ev, name) => {
        if (name !== 'heal.log') return
        clearTimeout(healTimer)
        healTimer = setTimeout(() => ctx.broadcast({ type: 'heal-log', log: healLog() }), 300)
      })
    } catch {}

    // Serve bundled imagery from the module's media/ folder (data/ doesn't ship). basename()
    // strips any traversal; a missing file is a clean 404, never a thrown read.
    router.get('/images/:name', (req, res) => {
      const name = path.basename(req.params.name || '')
      const ext = path.extname(name).toLowerCase()
      const type = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.gif': 'image/gif' }[ext] || 'application/octet-stream'
      // stream, don't buffer — the story-wall JPGs run to ~1.4 MB and a sync read
      // of that per request stalls the shared event loop
      /* basename() blocks traversal (and the router matches the RAW path, so %2f can't sneak a
         separator in) — but basename('..') is '..', which resolves to the module directory. A
         directory OPENS fine, so the old code sent a 200 and only hit EISDIR on the first read,
         after the headers were already out: writeHead(404) then threw and the socket was killed.
         Require a regular file before answering, so a bad name is a clean 404. */
      const file = path.join(mediaDir(ctx), name)
      fs.stat(file, (err, st) => {
        if (err || !st.isFile()) { try { res.writeHead(404); res.end('not found') } catch { res.destroy() } ; return }
        const s = fs.createReadStream(file)
        s.on('error', () => { res.destroy() })   // mid-stream failure: headers are already sent
        s.once('open', () => { res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=3600' }); s.pipe(res) })
      })
    })

    /* ── hands ── */
    // The actual work of an action — never touches the response. Progress and the
    // result reach the UI over the shell WS (action-log / action-done frames).
    const runAction = async (id) => {
      switch (id) {
        case 'install-browser-config': {
          // claude-md.sh writes the browser rule file at ~/.claude/rules/horse-browser.md
          // (idempotent, re-points the version-agnostic symlink). `apply` = (re)install.
          const script = hbClaudeMdScript()
          if (!script) { emit(id, 'claude-md.sh not found — install horse-browser first', 'stderr'); done(id, { ok: false }); tickNow(); return }
          await runStreaming(id, 'bash', [script, 'apply'])
          slot.verCache = {}; verBust(); tickNow()
          return
        }
        case 'launch-deskpad': {
          if (!fs.existsSync(DESKPAD_APP)) { emit(id, 'DeskPad is not installed — install it first', 'stderr'); done(id, { ok: false }); return }
          const r = await runQuiet(id, 'open', [DESKPAD_APP])
          emit(id, r.ok ? '✓ DeskPad launched' : `✗ open failed (exit ${r.code})`, r.ok ? 'ok' : 'stderr')
          done(id, { ok: r.ok }); tickNow()
          return
        }
        default:
          emit(id, 'unhandled action', 'stderr'); done(id, { ok: false })
      }
    }

    router.post('/action/:id', async (req, res) => {
      const id = req.params.id
      const def = ACTIONS[id]
      if (!def) return res.json({ error: 'unknown action' }, 404)
      const body = await req.json().catch(() => ({}))
      const confirmed = body && body.confirm === true

      // Outward / destructive actions must be explicitly confirmed.
      if ((def.danger === 'network' || def.danger === 'destructive') && !confirmed) {
        return res.json({ needsConfirm: true, danger: def.danger })
      }

      // Fire the job and answer immediately — an npm/brew install runs for minutes,
      // and a held response eats one of the browser's ~6 sockets for this origin.
      runAction(id).catch((e) => { emit(id, String(e?.message || e), 'stderr'); done(id, { ok: false }) })
      res.json({ started: true }, 202)
    })

    // The credential subsystem (Bitwarden broker).
    // It registers its own /broker/*, /helpers/*, /hints*, /state, /skill.md
    // routes and manages the signed daemon; returns its own teardown. Both this
    // and the credential watcher clear their slot timers at mount start, so a
    // dropped async teardown (shell gap) can't stack watchers.
    const credTeardown = mountCredentials(router, ctx)

    ctx.log('horse-browser · control board mounted')

    // Teardown: stop the live-push watcher + heal-log watch, the credential
    // subsystem, and kill any in-flight installer children on hot-reload + exit.
    // Children are spawned detached (own process group) so we take the whole group down.
    return () => {
      if (slot.watchTimer) { clearInterval(slot.watchTimer); slot.watchTimer = null }
      clearTimeout(healTimer)
      try { healWatcher && healWatcher.close() } catch {}
      try { credTeardown && credTeardown() } catch {}
      for (const c of slot.children) {
        try { process.kill(-c.pid, 'SIGTERM') } catch {}
        try { c.kill('SIGTERM') } catch {}
      }
      slot.children.clear()
    }
  },
}
