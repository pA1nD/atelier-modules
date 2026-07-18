/* hb-display — backend. The Horse Browser's display & health story, live.
 *
 * Instruments: the display census (main-display sleep state + non-builtin
 * displays via CoreGraphics ctypes, clamshell via ioreg), DeskPad presence
 * (installed / running), and the launcher's incident journal
 * (~/.config/horse-browser/heal.log — wedge heals, forced relaunches,
 * display-asleep episodes, each with why-context). Hands: install DeskPad
 * (brew cask, confirm-gated) and launch it — streaming over the shell WS.
 *
 * Why this module exists: with the display asleep (esp. clamshell — lid
 * closed, box kept awake by SSH) WindowServer composites nothing, so agent
 * screenshots hang. Waking the panel is worse: macOS force-re-blanks a closed
 * lid ~10s after ANY wake and Chrome drops every CDP websocket on that flap
 * (measured 2026-07-11). The clean fix is a virtual display that never
 * sleeps — DeskPad (audited: 436 lines, sandboxed, no network entitlement).
 *
 * Pure Node builtins, no deps. Same conventions as the horse-browser module:
 * outward actions refuse without confirm; children tracked + killed on
 * hot-reload/shutdown.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)
const HOME = os.homedir()
const DESKPAD_APP = '/Applications/DeskPad.app'
// the Horse Browser's CDP endpoint — same override the hb-broker daemon honors
const CDP_PORT = process.env.HB_CDP_PORT || '9223'

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
    const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`, { signal: AbortSignal.timeout(1500) })
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

function mediaDir(ctx) { return path.join(path.dirname(ctx.dataDir), 'media') }

// A registry the frontend mirrors. `danger`: safe | network.
const ACTIONS = {
  'install-deskpad': { danger: 'network', label: 'Install DeskPad (brew)' },
  'launch-deskpad':  { danger: 'safe',    label: 'Launch DeskPad' },
}

export default {
  async mountRoutes(router, ctx) {
    const slot = ctx.module(ctx.id)
    slot.children ??= new Set()

    const emit = (actionId, line, stream = 'stdout') => ctx.broadcast({ type: 'action-log', actionId, stream, line })
    const done = (actionId, payload) => ctx.broadcast({ type: 'action-done', actionId, ...payload })

    // Spawn a command, stream every line over the WS, track for teardown.
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
    const snapshot = async () => ({ now: Date.now(), deskpad: await deskpadInfo() })
    router.get('/snapshot', async (req, res) => res.json(await snapshot()))
    router.get('/heal-log', (req, res) => res.json(healLog()))

    /* ── the live push — the shell WS is the realtime channel, so the poll lives
     *    HERE, server-side, once for all viewers: recompute every few seconds,
     *    broadcast a full snapshot frame ONLY on change. Clients fetch once on
     *    mount, then just listen; an idle machine sends no frames. */
    const snapKey = (s) => JSON.stringify({ ...s, now: 0 })
    const tick = async (force = false) => {
      if (slot.watchBusy) return
      slot.watchBusy = true
      try {
        const s = await snapshot()
        const k = snapKey(s)
        if (force || k !== slot.lastSnapKey) { slot.lastSnapKey = k; ctx.broadcast({ type: 'snapshot', snapshot: s }) }
      } catch {}
      finally { slot.watchBusy = false }
    }
    const tickNow = () => { tick(true).catch(() => {}) }
    slot.watchBusy = false   // reset the guard on every mount — a reload mid-probe must never strand it
    if (slot.watchTimer) clearInterval(slot.watchTimer)   // an async mountRoutes' teardown is dropped by the shell — never stack watchers
    slot.watchTimer = setInterval(() => { tick().catch(() => {}) }, 4000)

    // heal.log push — the launcher appends incidents; watch the dir (survives
    // atomic saves, works before the file exists) and push the parsed tail.
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

    // the live compositing check: display census + a real timed screenshot probe.
    // Runs on page open and on the Recheck button — not on the snapshot poll
    // (each check is a real capture; on a broken box it costs the full timeout).
    router.get('/compositing', async (req, res) => {
      const [display, probe] = await Promise.all([displayInfo(), paintProbe()])
      res.json({ now: Date.now(), display, probe })
    })

    // Serve bundled imagery from the module's media/ folder (basename-guarded).
    router.get('/images/:name', (req, res) => {
      const name = path.basename(req.params.name || '')
      const ext = path.extname(name).toLowerCase()
      const type = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' }[ext] || 'application/octet-stream'
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
      if (def.danger === 'network' && body?.confirm !== true) {
        return res.json({ needsConfirm: true, danger: def.danger })
      }

      switch (id) {
        case 'install-deskpad': {
          const brew = findOnPath('brew')
          if (!brew) { emit(id, 'brew not found — install Homebrew first (https://brew.sh)', 'stderr'); done(id, { ok: false }); return res.json({ ok: false }) }
          const r = await runQuiet(id, brew, ['install', '--cask', 'deskpad'])
          if (!r.ok) { emit(id, `✗ brew install failed (exit ${r.code})`, 'stderr'); done(id, { ok: false }); tickNow(); return res.json({ ok: false }) }
          emit(id, '✓ DeskPad installed (notarized release, sha256-pinned by brew)', 'ok')
          // launch by path — LaunchServices may not know the name seconds after install
          const r2 = await runQuiet(id, 'open', [DESKPAD_APP])
          emit(id, r2.ok ? '✓ DeskPad launched' : '⚠ installed but not launched — use the Launch button', r2.ok ? 'ok' : 'stderr')
          emit(id, 'first run: approve the Screen Recording prompt once (it mirrors only its own virtual display) — then the virtual display registers', 'stdout')
          done(id, { ok: true }); tickNow()
          return res.json({ ok: true })
        }
        case 'launch-deskpad': {
          if (!fs.existsSync(DESKPAD_APP)) { emit(id, 'DeskPad is not installed — install it first', 'stderr'); done(id, { ok: false }); return res.json({ ok: false }) }
          const r = await runQuiet(id, 'open', [DESKPAD_APP])
          emit(id, r.ok ? '✓ DeskPad launched' : `✗ open failed (exit ${r.code})`, r.ok ? 'ok' : 'stderr')
          done(id, { ok: r.ok }); tickNow()
          return res.json({ ok: r.ok })
        }
        default:
          return res.json({ error: 'unhandled' }, 500)
      }
    })

    ctx.log('hb-display · display & health mounted')

    // Teardown: stop the watcher + heal-log watch, kill installer children.
    return () => {
      if (slot.watchTimer) { clearInterval(slot.watchTimer); slot.watchTimer = null }
      clearTimeout(healTimer)
      try { healWatcher && healWatcher.close() } catch {}
      for (const c of slot.children) {
        try { process.kill(-c.pid, 'SIGTERM') } catch {}
        try { c.kill('SIGTERM') } catch {}
      }
      slot.children.clear()
    }
  },
}
