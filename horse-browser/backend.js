/* horse-browser — backend (extracted from claude5iq's backend.js).
 *
 * Instruments read the REAL machine and report it live: the horse-browser CDP
 * on :9223 (version, tab count, PID), the browser-harness daemons (each one an
 * agent session driving the browser, name-matched by BU_NAME callsign), the
 * running Claude sessions (as codenames, with cwd), and the tab→session map
 * from the tab-grouper extension. Hands: install browser-harness (uv/pipx from
 * GitHub), install/update horse-browser (npm — @pa1nd/horse-browser), and
 * apply the CLAUDE.md browser config (the package's claude-md.sh) — streaming
 * every line over the shell WebSocket.
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

const execFileP = promisify(execFile)
const HOME = os.homedir()
const PROJECTS_DIR = path.join(HOME, '.claude', 'projects')
const UUID_JSONL = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/
const UUID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/
const CDP = 'http://127.0.0.1:9223'
const HB_NPM = '@pa1nd/horse-browser'
const GLOBAL_CLAUDE_MD = path.join(HOME, '.claude', 'CLAUDE.md')
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
// (a group's title ends in the session's callsign). Returns a { targetId: callsign } map. Chrome's
// CDP exposes no tab→group link, but the extension's service worker does.
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
    // tabs to their CDP target id via chrome.debugger.getTargets (tabId → target).
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
      out.push({ ...codename(id), mtime: st.mtimeMs, age, active: age <= ACTIVE_MS, cwd: cwd ? cwd.replace(HOME, '~') : null })
    }
  }
  out.sort((a, b) => b.mtime - a.mtime)
  return out
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
async function latestHarnessVersion() { const d = await fetchJson('https://pypi.org/pypi/browser-harness/json'); return (d && d.info && d.info.version) || null }
async function latestChromeVersion() { const d = await fetchJson('https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions.json'); return (d && d.channels && d.channels.Stable && d.channels.Stable.version) || null }
async function harnessVersion() {
  const bin = findOnPath('browser-harness'); if (!bin) return null
  try { const { stdout } = await execFileP(bin, ['--version'], { timeout: 3000 }); return (stdout.match(/\d+\.\d+\.\d+/) || [stdout.trim().split('\n')[0]])[0] || null } catch { return null }
}

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
async function latestHorseVersion() {
  const d = await fetchJson('https://registry.npmjs.org/' + encodeURIComponent(HB_NPM))
  return (d && d['dist-tags'] && d['dist-tags'].latest) || null
}

// horse-browser ships claude-md.sh in its package root — it installs/refreshes the
// browser-playbook @-import in ~/.claude/CLAUDE.md.
function hbClaudeMdScript() {
  const root = hbPackageRoot(); if (!root) return null
  const p = path.join(root, 'claude-md.sh')
  try { return fs.existsSync(p) ? p : null } catch { return null }
}
async function browserConfigInfo() {
  const script = hbClaudeMdScript()
  if (!script) return { scriptAvailable: false, upToDate: null }
  // `claude-md.sh check` exits 0 when the import block + symlink are current, non-zero when drifted.
  try { await execFileP('bash', [script, 'check'], { timeout: 5000 }); return { scriptAvailable: true, upToDate: true } }
  catch { return { scriptAvailable: true, upToDate: false } }
}

// version status for every tool the module installs — installed vs upstream, and whether a clean
// update is available. Updates are always a fresh install from the source of truth (uv / npm).
async function computeVersions() {
  const [bh, bhL, hbL, cfg] = await Promise.all([
    harnessVersion(), latestHarnessVersion().catch(() => null),
    latestHorseVersion().catch(() => null),
    browserConfigInfo().catch(() => ({ scriptAvailable: false, upToDate: null })),
  ])
  const hb = hbVersion()
  return {
    'browser-harness': { installed: !!findOnPath('browser-harness'), version: bh, latest: bhL, upToDate: verGE(bh, bhL), action: 'install-browser-harness', via: 'PyPI · uv tool' },
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

/* ── what agents actually read — the managed CLAUDE.md block and the skill
 *    docs it @-imports. claude-md.sh keeps ONE block between
 *    `<!-- horse-browser:begin -->` / `<!-- horse-browser:end -->` markers in
 *    ~/.claude/CLAUDE.md; the block imports the playbooks, and every Claude
 *    Code session loads them at start. Parsed live so the page shows the
 *    exact chain (including the version-agnostic symlink into the installed
 *    browser-harness package). */
// which installed package a doc's REAL path lives in — so the page can say
// where each playbook came from and which command put it there.
function classifyDocSource(realAbs) {
  if (/\/uv\/tools\/browser-harness\//.test(realAbs)) return { pkg: 'browser-harness', via: 'PyPI · uv tool', cmd: 'uv tool install --python 3.12 --upgrade --force browser-harness' }
  if (/\/pipx\/venvs\/browser-harness\//.test(realAbs)) return { pkg: 'browser-harness', via: 'PyPI · pipx', cmd: 'pipx install --force browser-harness' }
  const hbRoot = hbPackageRoot()
  if (hbRoot && (realAbs === hbRoot || realAbs.startsWith(hbRoot + path.sep))) return { pkg: HB_NPM, via: 'npm', cmd: 'npm install -g ' + HB_NPM }
  return null
}

function agentDocs() {
  const short = (p) => p.replace(HOME, '~')
  const out = { blockPresent: false, blockPath: short(GLOBAL_CLAUDE_MD), blockTitle: null, maintainer: null, docs: [] }
  const cm = hbClaudeMdScript()
  if (cm) out.maintainer = short(cm)
  let txt = ''
  try { txt = fs.readFileSync(GLOBAL_CLAUDE_MD, 'utf8') } catch { return out }
  const b = txt.indexOf('<!-- horse-browser:begin')
  const e = txt.indexOf('<!-- horse-browser:end')
  if (b === -1 || e === -1 || e < b) return out
  out.blockPresent = true
  const block = txt.slice(b, e)
  const h1 = /^#\s+(.+?)\s*$/m.exec(block)
  out.blockTitle = h1 ? h1[1] : null
  const imports = [...block.matchAll(/^@(\S+)\s*$/gm)].map((m) => m[1])
  out.docs = imports.map((imp) => {
    const p = /^~(?=\/|$)/.test(imp) ? HOME + imp.slice(1) : imp
    const d = { import: imp, path: short(p), realPath: null, exists: false, bytes: 0, lines: 0, title: null, headings: [], source: null }
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
    } catch {}
    return d
  })
  return out
}

async function snapshot() {
  const [cdp, harness] = await Promise.all([cdpInfo(), harnessInfo()])
  return {
    now: Date.now(),
    tools: {
      'browser-harness': { installed: !!findOnPath('browser-harness') },
      'horse-browser': { installed: !!findOnPath('horse-browser') },
      // the installers the one-click buttons need — surfaced on page load so a
      // missing prerequisite shows up with its install command, not as a failed run
      uv: { installed: !!findOnPath('uv') },
      pipx: { installed: !!findOnPath('pipx') },
      npm: { installed: !!findOnPath('npm') },
    },
    cdp,
    harness,
    versions: await softwareVersions(),
    agentDocs: agentDocs(),
  }
}

function mediaDir(ctx) { return path.join(path.dirname(ctx.dataDir), 'media') }

/* ──────────────────────────── actions ────────────────────────────────────── */
// A registry the frontend mirrors. `danger`: safe | network | destructive.
const ACTIONS = {
  'install-browser-harness': { danger: 'network',     label: 'Install browser-harness' },
  'install-horse-browser':   { danger: 'network',     label: 'Install horse-browser (npm)' },
  'install-browser-config':  { danger: 'destructive', label: 'Install CLAUDE.md browser config' },
}

export default {
  async mountRoutes(router, ctx) {
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
    router.get('/snapshot', async (req, res) => res.json(await snapshot()))

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

    // the live stack: agent sessions → browser-harness daemons → chrome tabs, with a status check per column
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
      const sessions = listSessions().filter((s) => s.age <= RUNNING_MS || resumeIds.has(s.id)).slice(0, 12)
      const [hv, latestH, latestC, tabMap] = await Promise.all([
        cachedLatest('hv', harnessVersion, 3 * 60 * 1000),
        cachedLatest('latestH', latestHarnessVersion),
        cachedLatest('latestC', latestChromeVersion),
        cachedTabGroups(cdp),
      ])
      const chromeVer = cdp.browser ? cdp.browser.replace(/^Chrome\//, '') : null
      return {
        harness: { running: harness.daemons.length > 0, count: harness.daemons.length, daemons: harness.daemons.slice(0, 16), version: hv, latest: latestH, upToDate: verGE(hv, latestH) },
        chrome: { running: cdp.up, version: chromeVer, pid: cdp.pids[0] || null, latest: latestC, upToDate: verGE(chromeVer, latestC) },
        sessions: sessions.map((s) => ({ id: s.id, emoji: s.emoji, callsign: s.callsign, color: s.color, cwd: s.cwd, active: s.active })),
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

    // Serve bundled imagery from the module's media/ folder (data/ doesn't ship). basename()
    // strips any traversal; a missing file is a clean 404, never a thrown read.
    router.get('/images/:name', (req, res) => {
      const name = path.basename(req.params.name || '')
      const ext = path.extname(name).toLowerCase()
      const type = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.gif': 'image/gif' }[ext] || 'application/octet-stream'
      try {
        const body = fs.readFileSync(path.join(mediaDir(ctx), name))
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
        return res.json({ needsConfirm: true, danger: def.danger })
      }

      switch (id) {
        case 'install-browser-harness': {
          // browser-harness is on PyPI now. The flags follow the project's own
          // install doc: --python 3.12 keeps uv from resolving an old release
          // built for older Pythons; --upgrade --force replaces any previous
          // tool install with the latest stable — so install and update are
          // the same command.
          const uv = findOnPath('uv'), pipx = findOnPath('pipx')
          let r
          if (uv) r = await runQuiet(id, uv, ['tool', 'install', '--python', '3.12', '--upgrade', '--force', 'browser-harness'])
          else if (pipx) r = await runQuiet(id, pipx, ['install', '--force', 'browser-harness'])
          else { emit(id, 'need uv (or pipx) to install — get uv at https://astral.sh/uv', 'stderr'); done(id, { ok: false }); return res.json({ ok: false }) }
          slot.verCache = {}; verBust()
          emit(id, r.ok ? '✓ browser-harness installed from PyPI' : `✗ install failed (exit ${r.code})`, r.ok ? 'ok' : 'stderr')
          done(id, { ok: r.ok }); tickNow()
          return res.json({ ok: r.ok })
        }
        case 'install-horse-browser': {
          // npm is the source of truth now — install and update are the same command.
          const npm = findOnPath('npm')
          if (!npm) { emit(id, 'npm not found — install Node.js first (https://nodejs.org)', 'stderr'); done(id, { ok: false }); return res.json({ ok: false }) }
          const r = await runQuiet(id, npm, ['install', '-g', `${HB_NPM}@latest`])
          if (!r.ok) { emit(id, `✗ npm install failed (exit ${r.code})`, 'stderr'); done(id, { ok: false }); tickNow(); return res.json({ ok: false }) }
          emit(id, `✓ ${HB_NPM} installed from npm`, 'ok')
          // also import the browser playbooks into ~/.claude/CLAUDE.md (idempotent, backs up) —
          // the config that lets agents actually drive it. claude-md.sh ships in the package.
          const cmScript = hbClaudeMdScript()
          if (cmScript) {
            emit(id, 'importing the browser playbooks into ~/.claude/CLAUDE.md…', 'stdout')
            const r2 = await runQuiet(id, 'bash', [cmScript, 'apply'])
            emit(id, r2.ok ? '✓ CLAUDE.md browser config applied' : `⚠ claude-md.sh apply failed (exit ${r2.code}) — run "Set up" on the config row`, r2.ok ? 'ok' : 'stderr')
          }
          slot.verCache = {}; verBust()
          done(id, { ok: true }); tickNow()
          return res.json({ ok: true })
        }
        case 'install-browser-config': {
          // claude-md.sh writes the browser-playbook @-import into ~/.claude/CLAUDE.md
          // (idempotent, backs up, re-points the version-agnostic symlink). `apply` = (re)install.
          const script = hbClaudeMdScript()
          if (!script) { emit(id, 'claude-md.sh not found — install horse-browser first', 'stderr'); done(id, { ok: false }); tickNow(); return res.json({ ok: false }) }
          const r = await runStreaming(id, 'bash', [script, 'apply'])
          slot.verCache = {}; verBust(); tickNow()
          return res.json(r)
        }
        default:
          return res.json({ error: 'unhandled' }, 500)
      }
    })

    ctx.log('horse-browser · night console mounted')

    // Teardown: stop the live-push watcher and kill any in-flight installer
    // children on hot-reload + exit. Children are spawned detached (own process
    // group) so we can take the whole group down — no orphaned grandchild.
    return () => {
      if (slot.watchTimer) { clearInterval(slot.watchTimer); slot.watchTimer = null }
      for (const c of slot.children) {
        try { process.kill(-c.pid, 'SIGTERM') } catch {}
        try { c.kill('SIGTERM') } catch {}
      }
      slot.children.clear()
    }
  },
}
