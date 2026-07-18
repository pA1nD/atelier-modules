/* statusbar — backend (extracted from claude5iq's backend.js).
 *
 * Instruments read the REAL machine and report it live: the running Claude
 * sessions (as emoji codenames, for ch.01), jq + Homebrew on PATH, and whether
 * the statusline is wired into ~/.claude/settings.json. The one hand:
 * install-statusbar — installs jq if missing (via Homebrew), then points
 * settings.json's statusLine at this module's statusline.sh (merged in, never
 * clobbered; backed up first), streaming every line over the shell WebSocket.
 *
 * Pure Node builtins, no deps.
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
const UUID_JSONL = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/
const UUID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/
const ACTIVE_MS = 4 * 60 * 1000           // transcript touched this recently ⇒ mid-turn ("working now")
const RUNNING_MS = 30 * 60 * 1000         // ...this recently ⇒ likely still open ("up and running")
const RECENT_MS = 36 * 60 * 60 * 1000     // discovery window for the session list

/* ── session codename — byte-identical to ./statusline.sh + lib.jsx so the
 *    emoji/colour/callsign this module shows MATCH the terminal, the dashboard
 *    and the tab grouper. FNV-1a (32-bit) + a murmur3 finalizer. */
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

// recent sessions from the transcript dir — codenames only, no tail-parsing needed here.
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
      let st; try { st = fs.statSync(path.join(dir, f)) } catch { continue }
      const age = now - st.mtimeMs
      if (age > RECENT_MS) continue
      const id = f.replace(/\.jsonl$/, '')
      out.push({ ...codename(id), mtime: st.mtimeMs, age, active: age <= ACTIVE_MS })
    }
  }
  out.sort((a, b) => b.mtime - a.mtime)
  return out
}

function readJsonSafe(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return null } }

/* What exactly is wired into settings.json's statusLine? Four honest answers:
 *   'ours'     — the command resolves to THIS module's statusline.sh
 *   'codename' — a different file, but it IS the codename statusline (another
 *                copy, e.g. the Projects module's — detected by fingerprint:
 *                the murmur finalizer constant + the emoji table survive the
 *                comment/prompt-glyph drift between copies)
 *   'other'    — some other statusline entirely (a custom script)
 *   'none'     — no statusLine at all
 * `wired` stays as "any command at all". */
function statuslineInfo(ctx) {
  const ourPath = path.join(path.dirname(ctx.dataDir), 'statusline.sh')
  const s = readJsonSafe(SETTINGS)
  const cmd = s && s.statusLine && s.statusLine.command ? String(s.statusLine.command) : null
  const out = {
    wired: !!cmd, status: 'none',
    command: cmd, commandShort: cmd ? cmd.replace(HOME, '~') : null,
    ourPath: ourPath.replace(HOME, '~'),
  }
  if (!cmd) return out
  out.status = 'other'
  const resolved = cmd.startsWith('~/') ? path.join(HOME, cmd.slice(2)) : cmd
  try { if (fs.realpathSync(resolved) === fs.realpathSync(ourPath)) { out.status = 'ours'; return out } } catch {}
  try {
    const txt = fs.readFileSync(resolved, 'utf8')
    if (txt.includes('0x7feb352d') && txt.includes('EMO=(')) out.status = 'codename'
  } catch {}
  return out
}

async function binVersion(name) {
  const bin = findOnPath(name); if (!bin) return null
  try { const { stdout } = await execFileP(bin, ['--version'], { timeout: 3000 }); return (stdout.match(/\d+\.\d+(?:\.\d+)?/) || [])[0] || null } catch { return null }
}
// non-blocking cache: serve the last result, refresh in the background when stale — the
// frequent snapshot poll must never wait on a subprocess. verBust() forces a refresh after installs.
let _verVal = null, _verAt = 0, _verBusy = false
function verBust() { _verAt = 0 }
async function computeVersions() {
  const jqV = await binVersion('jq')
  return { jq: { installed: !!findOnPath('jq'), version: jqV, latest: null, upToDate: null, via: 'brew' } }
}
async function softwareVersions() {
  if ((!_verVal || Date.now() - _verAt > 90000) && !_verBusy) {
    _verBusy = true
    Promise.resolve().then(computeVersions).then((v) => { _verVal = v; _verAt = Date.now() }).catch(() => {}).finally(() => { _verBusy = false })
  }
  return _verVal
}

async function snapshot(ctx) {
  const claudeProcs = await pgrepClaude()
  const sessions = listSessions()
  // sessions "up and running right now": a live `claude --resume <uuid>` process, OR a
  // transcript touched within the running window. `active` (<4min) = actually mid-turn.
  const resumeIds = new Set()
  for (const p of claudeProcs) { const m = UUID_RE.exec(p.cmd || ''); if (m) resumeIds.add(m[1]) }
  const running = sessions.filter((s) => s.age <= RUNNING_MS || resumeIds.has(s.id))
  const known = new Set(running.map((s) => s.id))
  for (const id of resumeIds) if (!known.has(id)) running.push({ ...codename(id), active: false, mtime: 0, age: Infinity })
  const jq = findOnPath('jq')
  return {
    now: Date.now(),
    tools: { jq: { label: 'jq', installed: !!jq, path: jq } },
    homebrew: { available: !!findOnPath('brew') },
    sessions: {
      total: sessions.length,
      active: running.filter((s) => s.active).length,   // working right now (mid-turn)
      runningCount: running.length,                      // open right now
      running: running.slice(0, 14),
    },
    statusline: statuslineInfo(ctx),
    versions: await softwareVersions(),
  }
}

/* ──────────────────────────── actions ────────────────────────────────────── */
// A registry the frontend mirrors. `danger`: safe | network | destructive.
const ACTIONS = {
  'install-statusbar': { danger: 'destructive', label: 'Set up the status bar' },
}

export default {
  async mountRoutes(router, ctx) {
    const slot = ctx.module(ctx.id)
    slot.children ??= new Set()

    const emit = (actionId, line, stream = 'stdout') => ctx.broadcast({ type: 'action-log', actionId, stream, line })
    const done = (actionId, payload) => ctx.broadcast({ type: 'action-done', actionId, ...payload })

    // Spawn a command, stream every line over the WS, track for teardown.
    // Doesn't emit its own `done` — the action decides when it's finished.
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

    /* ── the live push — the shell WS is the realtime channel, so the poll lives
     *    HERE, server-side, once for all viewers: recompute every few seconds,
     *    broadcast a full snapshot frame ONLY on change. Clients fetch once on
     *    mount, then just listen; an idle machine sends no frames. */
    const snapKey = (s) => JSON.stringify(({ ...s, now: 0, sessions: { ...s.sessions, running: (s.sessions.running || []).map(({ mtime, age, ...r }) => r) } }))
    const tick = async (force = false) => {
      if (slot.watchBusy) return
      slot.watchBusy = true
      try {
        const s = await snapshot(ctx)
        const k = snapKey(s)
        if (force || k !== slot.lastSnapKey) { slot.lastSnapKey = k; ctx.broadcast({ type: 'snapshot', snapshot: s }) }
      } catch {}
      finally { slot.watchBusy = false }
    }
    const tickNow = () => { tick(true).catch(() => {}) }
    if (slot.watchTimer) clearInterval(slot.watchTimer)   // an async mountRoutes' teardown is dropped by the shell — never stack watchers
    slot.watchTimer = setInterval(() => { tick().catch(() => {}) }, 4000)


    /* ── hands ── */
    router.post('/action/:id', async (req, res) => {
      const id = req.params.id
      const def = ACTIONS[id]
      if (!def) return res.json({ error: 'unknown action' }, 404)
      const body = await req.json().catch(() => ({}))
      const confirmed = body && body.confirm === true

      // Destructive actions (this one overwrites settings.json) must be explicitly confirmed.
      if ((def.danger === 'network' || def.danger === 'destructive') && !confirmed) {
        return res.json({ needsConfirm: true, danger: def.danger })
      }

      switch (id) {
        case 'install-statusbar': {
          // dependency: jq (via Homebrew). Homebrew itself is a prerequisite we don't install.
          if (!findOnPath('jq')) {
            if (!findOnPath('brew')) { emit(id, 'Homebrew not found — install it from https://brew.sh first, then try again', 'stderr'); done(id, { ok: false }); tickNow(); return res.json({ ok: false, error: 'no homebrew' }) }
            emit(id, 'jq is missing — installing it with Homebrew…', 'stdout')
            const j = await runQuiet(id, 'brew', ['install', 'jq'])
            if (!j.ok) { emit(id, `✗ jq install failed (exit ${j.code})`, 'stderr'); done(id, { ok: false }); tickNow(); return res.json({ ok: false, error: 'jq install failed' }) }
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
          verBust()
          emit(id, '✓ status bar wired — open a new Claude Code session to see it', 'ok')
          done(id, { ok: true })
          tickNow()
          return res.json({ ok: true })
        }
        default:
          return res.json({ error: 'unhandled' }, 500)
      }
    })

    ctx.log('statusbar · mounted')

    // Teardown: kill any in-flight installer children on hot-reload + exit.
    // Children are spawned detached (own process group) so we can take the
    // whole group down — no orphaned grandchild left behind.
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
