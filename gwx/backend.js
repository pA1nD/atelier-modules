/* gwx — backend (extracted from claude5iq's backend.js).
 *
 * Instruments read the REAL machine: the gwx account registry
 * (~/.config/gwx/accounts.list) with per-account sign-in state (stored OAuth
 * credentials), gwx/gws versions (gws checked against npm), and the rewritten
 * skill catalogue cached at ~/.cache/gwx/skills-rewritten. Hands: check
 * sign-in (gwx whoami) and install/update gwx (the official installer from
 * GitHub) — streaming every line over the shell WebSocket.
 *
 * Pure Node builtins, no deps.
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
const GWX_ACCOUNTS = path.join(HOME, '.config', 'gwx', 'accounts.list')
const SKILLS_DIR = path.join(HOME, '.cache', 'gwx', 'skills-rewritten')

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

function gwxInfo() {
  const bin = findOnPath('gwx'), gws = findOnPath('gws')
  let accounts = []
  try { accounts = fs.readFileSync(GWX_ACCOUNTS, 'utf8').split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#')) } catch {}
  // "signed in" = the account has stored OAuth credentials locally (gwx logout clears credentials.enc)
  const accountsDir = path.join(path.dirname(GWX_ACCOUNTS), 'accounts')
  const authed = accounts.filter((a) => { try { return fs.existsSync(path.join(accountsDir, a, 'credentials.enc')) } catch { return false } })
  return { installed: !!bin, bin, gwsInstalled: !!gws, accounts, authed }
}

/* ── versions ──────────────────────────────────────────────────────────────── */
// compare two version strings — a >= b ? (null if either is unknown)
function verGE(a, b) {
  if (!a || !b) return null
  const pa = (String(a).match(/\d+/g) || []).map(Number), pb = (String(b).match(/\d+/g) || []).map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const x = pa[i] || 0, y = pb[i] || 0; if (x !== y) return x > y }
  return true
}
/* fetch JSON — via node:http(s), NOT global fetch: Node's happy-eyeballs gives
 * each address only 250ms by default, which silently kills every hostname
 * connection on a slow link (~300ms TCP RTT observed here) while curl works. */
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
async function binVersion(name) {
  const bin = findOnPath(name); if (!bin) return null
  try { const { stdout } = await execFileP(bin, ['--version'], { timeout: 3000 }); return (stdout.match(/\d+\.\d+(?:\.\d+)?/) || [])[0] || null } catch { return null }
}
async function latestNpmVersion(pkg) {
  const d = await fetchJson('https://registry.npmjs.org/' + encodeURIComponent(pkg) + '/latest')
  return (d && d.version) || null
}
async function computeVersions() {
  const [gwxV, gwxL, gwsV, gwsL] = await Promise.all([
    binVersion('gwx'), latestNpmVersion('@pa1nd/gwx').catch(() => null),
    binVersion('gws'), latestNpmVersion('@googleworkspace/cli').catch(() => null),
  ])
  return {
    gwx: { installed: !!findOnPath('gwx'), version: gwxV, latest: gwxL, upToDate: verGE(gwxV, gwxL), action: 'install-gwx', via: 'npm' },
    gws: { installed: !!findOnPath('gws'), version: gwsV, latest: gwsL, upToDate: verGE(gwsV, gwsL), action: 'install-gwx', via: 'npm · via gwx' },
  }
}
// non-blocking cache: serve the last result, refresh in the background when stale — the
// frequent snapshot poll must never wait on subprocesses + network. verBust() after installs.
let _verVal = null, _verAt = 0, _verBusy = false
function verBust() { _verAt = 0 }
async function softwareVersions() {
  if ((!_verVal || Date.now() - _verAt > 90000) && !_verBusy) {
    _verBusy = true
    Promise.resolve().then(computeVersions).then((v) => { _verVal = v; _verAt = Date.now() }).catch(() => {}).finally(() => { _verBusy = false })
  }
  return _verVal
}

async function snapshot() {
  return { now: Date.now(), gwx: gwxInfo(), versions: await softwareVersions() }
}

/* ──────────────────────────── actions ────────────────────────────────────── */
// A registry the frontend mirrors. `danger`: safe | network | destructive.
const ACTIONS = {
  'gwx-whoami':  { danger: 'safe',    label: 'Check gwx sign-in' },
  'install-gwx': { danger: 'network', label: 'Install gwx' },
}

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

    /* ── instruments ── */
    router.get('/snapshot', async (req, res) => res.json(await snapshot()))

    /* ── the live push — the shell WS is the realtime channel, so the poll lives
     *    HERE, server-side, once for all viewers: recompute every few seconds,
     *    broadcast a full snapshot frame ONLY on change. Clients fetch once on
     *    mount, then just listen; an idle machine sends no frames. */
    const snapKey = (s) => JSON.stringify(({ ...s, now: 0 }))
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
    if (slot.watchTimer) clearInterval(slot.watchTimer)   // an async mountRoutes' teardown is dropped by the shell — never stack watchers
    slot.watchTimer = setInterval(() => { tick().catch(() => {}) }, 5000)


    // the rewritten gws workflow skills gwx ships (cached locally) — for the "explore all" modal
    router.get('/gwx/skills', (req, res) => {
      const skills = []
      try {
        for (const e of fs.readdirSync(SKILLS_DIR, { withFileTypes: true })) {
          if (!e.isDirectory()) continue
          let desc = ''
          try { const m = /\bdescription:\s*"([^"]+)"/.exec(fs.readFileSync(path.join(SKILLS_DIR, e.name, 'SKILL.md'), 'utf8').slice(0, 2000)); if (m) desc = m[1].trim() } catch {}
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
      try { res.json({ id, content: fs.readFileSync(path.join(SKILLS_DIR, id, 'SKILL.md'), 'utf8') }) }
      catch { res.json({ id, content: null }, 404) }
    })

    /* ── hands ── */
    router.post('/action/:id', async (req, res) => {
      const id = req.params.id
      const def = ACTIONS[id]
      if (!def) return res.json({ error: 'unknown action' }, 404)
      const body = await req.json().catch(() => ({}))
      const confirmed = body && body.confirm === true

      // Outward actions must be explicitly confirmed.
      if (def.danger === 'network' && !confirmed) {
        return res.json({ needsConfirm: true, danger: def.danger })
      }

      switch (id) {
        case 'gwx-whoami': {
          const bin = findOnPath('gwx')
          if (!bin) { emit(id, 'gwx not installed', 'stderr'); done(id, { ok: false }); return res.json({ ok: false }) }
          const r = await runStreaming(id, bin, ['whoami'], { env: { GWX_TIMEOUT: '15' } })
          tickNow()
          return res.json(r)
        }
        case 'install-gwx': {
          // npm is the source of truth — install and update are the same command.
          const npm = findOnPath('npm')
          if (!npm) { emit(id, 'npm not found — install Node.js first (https://nodejs.org)', 'stderr'); done(id, { ok: false }); return res.json({ ok: false }) }
          const r = await runStreaming(id, npm, ['install', '-g', '@pa1nd/gwx@latest'])
          verBust(); tickNow()
          return res.json(r)
        }
        default:
          return res.json({ error: 'unhandled' }, 500)
      }
    })

    ctx.log('gwx · mounted')

    // Teardown: kill any in-flight installer children on hot-reload + exit.
    // Children are spawned detached (own process group) so we can take the
    // whole group down — no orphaned `curl` grandchild left behind by `curl | bash`.
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
