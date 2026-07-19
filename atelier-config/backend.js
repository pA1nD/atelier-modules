// atelier-config — the instance's settings engine. Ported from the marketplace
// dock's Configure surface (004), minus everything marketplace: this module only
// reads and edits THE INSTANCE — atelier.config.json (validated, patch-merged,
// atomically written), workspaces ($dirs + config blocks), path-mounted modules
// (link / unlink / move), a pending-restart tracker + self-restart, the
// start-at-login LaunchAgent for this very instance (macOS launchd, no sudo,
// with the one-time port takeover), a live tee of the server's output, and a
// package-manager doctor. Pure Node builtins, no deps.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import https from 'node:https'
import { spawn } from 'node:child_process'
import { baseName, addToWorkspace, removeFromConfig, renameWorkspace, okShape } from './config-util.mjs'

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return null } }
const exists = (p) => { try { fs.accessSync(p); return true } catch { return false } }

// Read a module's `export const meta` straight from source (same trick the shell
// and the dock use) — enough for name/icon/isChrome/chrome, never executes code.
function parseMeta(file) {
  try {
    const src = fs.readFileSync(file, 'utf8')
    const m = src.match(/export\s+const\s+meta\s*=\s*\{([\s\S]*?)\}/)
    if (!m) return {}
    const pick = (k) => { const r = m[1].match(new RegExp(k + "\\s*:\\s*['\"]([^'\"]*)['\"]")); return r ? r[1] : undefined }
    return { name: pick('name'), icon: pick('icon'), group: pick('group'), isChrome: /\bisChrome\s*:\s*true\b/.test(m[1]), chrome: pick('chrome') }
  } catch { return {} }
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
      headers: { accept: 'application/json', 'user-agent': 'atelier-config' },
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

// compare two version strings — a >= b ? (null if either is unknown)
function verGE(a, b) {
  if (!a || !b) return null
  const pa = (String(a).match(/\d+/g) || []).map(Number), pb = (String(b).match(/\d+/g) || []).map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const x = pa[i] || 0, y = pb[i] || 0; if (x !== y) return x > y }
  return true
}

// Run a shell snippet on this host. Resolves { code, stdout, stderr }.
function sh(cmd, { timeoutMs = 25000 } = {}) {
  return new Promise((resolve) => {
    const proc = spawn('bash', ['-lc', cmd], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    const timer = setTimeout(() => { try { proc.kill('SIGKILL') } catch {} resolve({ code: -1, stdout, stderr: (stderr + '\n[timed out]').trim() }) }, timeoutMs)
    proc.stdout.on('data', (d) => { stdout += d })
    proc.stderr.on('data', (d) => { stderr += d })
    proc.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, stdout, stderr: String(e.message) }) })
    proc.on('exit', (code) => { clearTimeout(timer); resolve({ code: code ?? -1, stdout, stderr }) })
  })
}

// ── launchd plumbing (macOS, gui/<uid>, no sudo) ──────────────────────────────

function agentPaths(label) {
  const home = os.homedir()
  return {
    uid: typeof process.getuid === 'function' ? process.getuid() : 0,
    plistPath: path.join(home, 'Library', 'LaunchAgents', `${label}.plist`),
    laDir: path.join(home, 'Library', 'LaunchAgents'),
    logDir: path.join(home, 'Library', 'Logs'),
  }
}

// Detailed status from `launchctl print gui/<uid>/<label>`, for any user LaunchAgent.
async function agentRuntime(label) {
  if (!label) return null
  const { uid, plistPath } = agentPaths(label)
  const installed = fs.existsSync(plistPath)
  const r = await sh(`launchctl print gui/${uid}/${label} 2>/dev/null`, { timeoutMs: 6000 })
  const loaded = r.code === 0
  const out = r.stdout
  const field = (re) => { const m = out.match(re); return m ? m[1].trim() : null }
  const pid = loaded ? (Number(field(/^\s*pid = (\d+)/m)) || null) : null
  return {
    label, domain: `gui/${uid}`, plistPath: plistPath.replace(os.homedir(), '~'),
    installed, loaded, running: !!pid, pid,
    state: loaded ? field(/^\s*state = (.+)$/m) : null,
    lastExitCode: loaded ? field(/last exit code = (.+)$/m) : null,
    runs: loaded ? field(/^\s*runs = (\d+)/m) : null,
    program: loaded ? field(/^\s*program = (.+)$/m) : null,
  }
}

// launchd never expands ~, so do it ourselves (leading ~, and ~ after =/: in a token).
function expandPlistToken(s) {
  return typeof s === 'string' ? s.replace(/(^|[=:])~(?=\/|$)/g, (_m, p) => p + os.homedir()) : s
}

function managedPlistXml(desc) {
  const { logDir } = agentPaths(desc.label)
  const progArgs = [expandPlistToken(desc.program), ...(desc.args || []).map(expandPlistToken)]
  const wd = desc.workingDirectory ? expandPlistToken(desc.workingDirectory) : null
  const env = desc.env || {}
  const outLog = expandPlistToken(desc.stdout || path.join(logDir, `${desc.label}.out.log`))
  const errLog = expandPlistToken(desc.stderr || path.join(logDir, `${desc.label}.err.log`))
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const wdXml = wd ? `\n\t<key>WorkingDirectory</key><string>${esc(wd)}</string>` : ''
  const envXml = Object.keys(env).length
    ? `\n\t<key>EnvironmentVariables</key><dict>${Object.entries(env).map(([k, v]) => `\n\t\t<key>${esc(k)}</key><string>${esc(expandPlistToken(v))}</string>`).join('')}\n\t</dict>`
    : ''
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>Label</key><string>${esc(desc.label)}</string>
\t<key>ProgramArguments</key>
\t<array>${progArgs.map((a) => `\n\t\t<string>${esc(a)}</string>`).join('')}
\t</array>${wdXml}${envXml}
\t<key>RunAtLoad</key>${desc.runAtLoad === false ? '<false/>' : '<true/>'}
\t<key>KeepAlive</key>${desc.keepAlive === false ? '<false/>' : '<true/>'}
\t<key>ProcessType</key><string>Background</string>
\t<key>StandardOutPath</key><string>${esc(outLog)}</string>
\t<key>StandardErrorPath</key><string>${esc(errLog)}</string>
</dict>
</plist>
`
}

// install | start | stop | restart | uninstall — all gui/<uid>, no sudo. { ok, log }.
async function managedPlistAction(desc, action) {
  const label = desc.label
  if (!label) return { ok: false, log: 'no label for managed plist' }
  const { uid, plistPath, laDir, logDir } = agentPaths(label)
  const dom = `gui/${uid}`
  const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`
  const tail = async (cmd) => { const r = await sh(cmd); return { ok: r.code === 0, log: (r.stdout + r.stderr).trim() } }
  if (action === 'install') {
    fs.mkdirSync(laDir, { recursive: true })
    fs.mkdirSync(logDir, { recursive: true })
    fs.writeFileSync(plistPath, managedPlistXml(desc))
    // Truncate the (append-only) launchd logs so a stale "Port … is in use" line
    // from a previous crash-loop can't make the frontend's port-conflict check
    // misfire on a clean reinstall. bootout first stops any prior job holding them.
    const { stdout: outLog, stderr: errLog } = plistLogPaths(desc)
    return tail(`launchctl bootout ${dom}/${label} 2>/dev/null; : > ${q(errLog)} 2>/dev/null; : > ${q(outLog)} 2>/dev/null; launchctl bootstrap ${dom} ${q(plistPath)} && launchctl enable ${dom}/${label} && launchctl kickstart ${dom}/${label} && echo installed+started`)
  }
  if (action === 'uninstall') return tail(`launchctl bootout ${dom}/${label} 2>/dev/null; rm -f ${q(plistPath)} && echo removed`)
  if (action === 'start')     return tail(`launchctl bootstrap ${dom} ${q(plistPath)} 2>/dev/null; launchctl kickstart ${dom}/${label} && echo started`)
  if (action === 'stop')      return tail(`launchctl bootout ${dom}/${label} && echo stopped`)
  if (action === 'restart')   return tail(`launchctl kickstart -k ${dom}/${label} 2>/dev/null && echo restarted || { launchctl bootstrap ${dom} ${q(plistPath)}; launchctl kickstart ${dom}/${label} && echo started; }`)
  return { ok: false, log: `unknown action ${action}` }
}

// Light read of a plist file: Label + the program it runs (for the inventory).
function readPlistMeta(file) {
  let text
  try { text = fs.readFileSync(file, 'utf8') } catch { return null }
  const label = (text.match(/<key>Label<\/key>\s*<string>([^<]+)<\/string>/) || [])[1] || path.basename(file, '.plist')
  const program = (text.match(/<key>ProgramArguments<\/key>\s*<array>\s*<string>([^<]+)<\/string>/) || [])[1]
    || (text.match(/<key>Program<\/key>\s*<string>([^<]+)<\/string>/) || [])[1] || null
  return { label, program }
}

// Every user LaunchAgent in ~/Library/LaunchAgents, with live run state. Read-only.
async function listInstalledAgents(managedLabels) {
  const dir = path.join(os.homedir(), 'Library', 'LaunchAgents')
  let files = []
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.plist')) } catch { return [] }
  return Promise.all(files.sort().map(async (f) => {
    const meta = readPlistMeta(path.join(dir, f)) || { label: path.basename(f, '.plist'), program: null }
    const rt = await agentRuntime(meta.label)
    return {
      file: f, label: meta.label, program: meta.program,
      running: !!(rt && rt.running), loaded: !!(rt && rt.loaded), pid: rt ? rt.pid : null,
      managed: managedLabels.has(meta.label),
    }
  }))
}

// Tail the last lines of a (possibly large) log file — bounded read of the tail bytes.
function tailFile(p, { lines = 50, maxBytes = 32768 } = {}) {
  let fd
  try {
    const abs = expandPlistToken(p)
    fd = fs.openSync(abs, 'r')
    const size = fs.fstatSync(fd).size
    const start = Math.max(0, size - maxBytes)
    const buf = Buffer.alloc(size - start)
    if (buf.length) fs.readSync(fd, buf, 0, buf.length, start)
    const arr = buf.toString('utf8').split('\n')
    if (start > 0) arr.shift()
    while (arr.length && arr[arr.length - 1] === '') arr.pop()
    return arr.slice(-lines)
  } catch { return [] }
  finally { if (fd !== undefined) try { fs.closeSync(fd) } catch {} }
}

// Resolve a managed descriptor's stdout/stderr log paths (same defaults the builder writes).
function plistLogPaths(desc) {
  const { logDir } = agentPaths(desc.label)
  return {
    stdout: expandPlistToken(desc.stdout || path.join(logDir, `${desc.label}.out.log`)),
    stderr: expandPlistToken(desc.stderr || path.join(logDir, `${desc.label}.err.log`)),
  }
}

export default {
  // Deliberately synchronous: the shell does not await mountRoutes, so an async
  // one returns a Promise and its teardown is silently dropped. Nothing here
  // needs a mount-time await.
  mountRoutes(router, ctx) {
    const slot = ctx.module(ctx.id)
    // The instance root, resolved the same way the shell's own resolveRoot does —
    // NOT from this module's folder: as a path-mount the module can live anywhere
    // (the dock could assume dirname(moduleDir) only because it shipped inside
    // its instance). ATELIER_ROOT is explicit; otherwise the shell infers the
    // root as the parent of the folder the server runs from (PWD survives the
    // atelier/ symlink; argv[1] is the server.js path as a launchd fallback).
    const instanceRoot = process.env.ATELIER_ROOT
      ? path.resolve(process.env.ATELIER_ROOT)
      : path.resolve(process.env.PWD || path.dirname(process.argv[1] || '.'), '..')
    const configFile = path.join(instanceRoot, 'atelier.config.json')
    const home = process.env.HOME || ''

    // ---- activity log (ring buffer, survives hot-reload via the slot) -------
    slot.logs ??= []
    const LOG_MAX = 500
    const pushLog = (level, msg, src) => {
      const clean = String(msg).replace(/\x1b\[[0-9;]*m/g, '').replace(/\s+$/, '')
      if (!clean) return
      const e = { t: Date.now(), level, msg: clean.length > 600 ? clean.slice(0, 600) + '…' : clean, src }
      slot.logs.push(e)
      if (slot.logs.length > LOG_MAX) slot.logs.splice(0, slot.logs.length - LOG_MAX)
      try { ctx.broadcast({ type: 'log', entry: e }) } catch {}
    }
    const logEvent = (level, msg) => pushLog(level, msg, 'config')

    // Tee the process's real stdout/stderr into the log so the Activity tab shows
    // the actual server output (the shell + every module), not just our events.
    // Patched once per process; the sink is repointed at the live slot each mount.
    globalThis.__atelierCfgSink = (level, line) => pushLog(level, line, 'server')
    if (!globalThis.__atelierCfgTee) {
      globalThis.__atelierCfgTee = true
      for (const [stream, base] of [[process.stdout, 'info'], [process.stderr, 'warn']]) {
        const orig = stream.write.bind(stream)
        let buf = ''
        stream.write = (chunk, enc, cb) => {
          try {
            buf += typeof chunk === 'string' ? chunk : Buffer.isBuffer(chunk) ? chunk.toString('utf8') : ''
            let nl
            while ((nl = buf.indexOf('\n')) >= 0) {
              const line = buf.slice(0, nl); buf = buf.slice(nl + 1)
              if (!line.trim()) continue
              const level = /\b(error|err|fail|failed|exception|fatal)\b|✗/i.test(line) ? 'error' : (base === 'warn' || /\bwarn/i.test(line)) ? 'warn' : 'info'
              if (!globalThis.__atelierCfgInTee) {
                globalThis.__atelierCfgInTee = true
                try { globalThis.__atelierCfgSink(level, line) } catch {}
                globalThis.__atelierCfgInTee = false
              }
            }
          } catch {}
          return orig(chunk, enc, cb)
        }
      }
    }

    // ---- restart tracking ----------------------------------------------------
    // The shell reads these settings once at startup; snapshot them the first
    // time this module mounts in the process so we can flag a pending restart.
    const RESTART_KEYS = ['port', 'defaultChrome', 'auth', 'hotReload', 'baseUrl']
    const pickRestart = (c) => { const o = {}; for (const k of RESTART_KEYS) o[k] = c ? c[k] : undefined; return o }
    // Keyed to the resolved file so a snapshot taken against a wrong/missing
    // path (e.g. before ATELIER_ROOT resolution) can never stick around.
    if (!globalThis.__atelierCfgBoot || globalThis.__atelierCfgBoot.file !== configFile) {
      globalThis.__atelierCfgBoot = { file: configFile, snap: pickRestart(readJson(configFile) || {}) }
    }
    const restartStatus = () => {
      const cur = pickRestart(readJson(configFile) || {})
      const keys = RESTART_KEYS.filter((k) => JSON.stringify(globalThis.__atelierCfgBoot.snap[k]) !== JSON.stringify(cur[k]))
      return { pending: keys.length > 0, keys }
    }

    const writeConfig = (cfg) => { const tmp = configFile + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n'); fs.renameSync(tmp, configFile) }
    const expandPath = (p) => (/^~(?=\/|$)/.test(p) ? home + p.slice(1) : p)
    const resolveDir = (entry, ws) => { const p = typeof entry === 'string' ? entry.replace(/^!/, '') : (entry && entry.path); if (!p) return null; return /^(\/|~)/.test(p) ? p.replace(/^~/, home) : path.resolve(instanceRoot, ws === 'global' ? '' : '$' + ws, p) }

    // ---- workspaces ----------------------------------------------------------
    const WS_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/
    const WS_RESERVED = new Set(['atelier', 'api', 'assets', 'modules', 'global'])
    router.get('/workspaces', (req, res) => {
      let dirs = []
      try { dirs = fs.readdirSync(instanceRoot, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name.startsWith('$')).map((d) => d.name.slice(1)) } catch {}
      res.json({ workspaces: [{ id: 'global', kind: 'global' }, ...dirs.map((id) => ({ id, kind: 'ws' }))] })
    })
    router.post('/workspaces/create', async (req, res) => {
      const n = ((await req.json()).name || '').trim()
      if (!WS_RE.test(n)) return res.json({ error: 'Use letters, numbers, and dashes; start with a letter or number.' }, 400)
      if (WS_RESERVED.has(n)) return res.json({ error: `“${n}” is a reserved name.` }, 400)
      const dir = path.join(instanceRoot, '$' + n)
      if (exists(dir)) return res.json({ error: 'That workspace already exists.' }, 400)
      try { fs.mkdirSync(dir, { recursive: true }); logEvent('ok', `Created workspace $${n}`); res.json({ ok: true }) }
      catch (e) { res.json({ error: e.message }, 500) }
    })
    router.post('/workspaces/rename', async (req, res) => {
      const b = await req.json()
      const from = String(b.from || '').trim()
      const to = String(b.to || '').trim()
      if (!from || from === 'global') return res.json({ error: 'That workspace can’t be renamed.' }, 400)
      if (!WS_RE.test(to)) return res.json({ error: 'Use letters, numbers, and dashes; start with a letter or number.' }, 400)
      if (WS_RESERVED.has(to)) return res.json({ error: `“${to}” is a reserved name.` }, 400)
      if (to === from) return res.json({ ok: true, name: to })
      const fromDir = path.join(instanceRoot, '$' + from), toDir = path.join(instanceRoot, '$' + to)
      if (exists(toDir)) return res.json({ error: 'A workspace with that name already exists.' }, 400)
      try {
        if (exists(fromDir)) fs.renameSync(fromDir, toDir); else fs.mkdirSync(toDir, { recursive: true })
        const cfg = readJson(configFile) || {}
        cfg.modules = renameWorkspace(cfg.modules || [], from, to)
        writeConfig(cfg)
        logEvent('ok', `Renamed workspace ${from} → ${to}`)
        res.json({ ok: true, name: to })
      } catch (e) { res.json({ error: e.message }, 500) }
    })
    router.post('/workspaces/delete', async (req, res) => {
      const name = String((await req.json()).name || '').trim()
      if (!name || name === 'global') return res.json({ error: 'That workspace can’t be deleted.' }, 400)
      const cfg = readJson(configFile) || {}
      const block = (cfg.modules || []).find((m) => m && typeof m === 'object' && m.workspace === name && Array.isArray(m.modules))
      if (block && block.modules.length) return res.json({ error: 'Move or unlink its apps first.' }, 400)
      try {
        cfg.modules = (cfg.modules || []).filter((m) => !(m && typeof m === 'object' && m.workspace === name))
        writeConfig(cfg)
        const dir = path.join(instanceRoot, '$' + name)
        if (exists(dir)) { try { fs.rmdirSync(dir) } catch {} }   // removes only if empty — never deletes real files
        logEvent('info', `Deleted workspace ${name}`)
        res.json({ ok: true })
      } catch (e) { res.json({ error: e.message }, 500) }
    })

    // ---- instance (mounted modules with resolved meta) -----------------------
    // Resolves each atelier.config.json modules entry to its dir + meta, so the
    // UI can group apps by workspace and colour them by chrome. Two kinds here:
    //   system — ships in the atelier/ shell folder; never removable
    //   linked — a path-mount from anywhere else; removing only unlinks
    router.get('/instance', (req, res) => {
      const cfg = readJson(configFile) || {}
      const atelierDir = path.resolve(instanceRoot, 'atelier')
      const inside = (dir, base) => { try { const d = path.resolve(dir); return d === base || d.startsWith(base + path.sep) } catch { return false } }
      const meta = {}
      const add = (entry, ws) => {
        let p = typeof entry === 'string' ? entry.replace(/^!/, '') : (entry && entry.path) || null
        if (!p) return
        const id = p.split('/').filter(Boolean).pop()
        const dir = /^(\/|~)/.test(p) ? p.replace(/^~/, home) : path.resolve(instanceRoot, ws === 'global' ? '' : '$' + ws, p)
        let mm = {}; try { mm = parseMeta(path.join(dir, 'frontend.jsx')) } catch {}
        const kind = inside(dir, atelierDir) ? 'system' : 'linked'
        meta[id] = { isChrome: !!mm.isChrome, chrome: mm.chrome || null, icon: mm.icon || null, name: mm.name || id, kind, linked: kind === 'linked', dir }
      }
      for (const m of (cfg.modules || [])) {
        if (m && typeof m === 'object' && Array.isArray(m.modules) && m.workspace) for (const s of m.modules) add(s, String(m.workspace).replace(/^!/, ''))
        else if (m && typeof m === 'object' && m.workspace) { /* include-all block — nothing to resolve */ }
        else add(m, 'global')
      }
      let wsDirs = []
      try { wsDirs = fs.readdirSync(instanceRoot, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name.startsWith('$')).map((d) => d.name.slice(1)) } catch {}
      res.json({ defaultChrome: cfg.defaultChrome || null, workspaces: ['global', ...wsDirs], meta, roots: { atelier: atelierDir, home } })
    })

    // ---- link / unlink / move (pure atelier.config.json edits) ---------------
    router.post('/link', async (req, res) => {
      const b = await req.json().catch(() => ({}))
      const raw = String(b.path || '').trim()
      const ws = String(b.ws || 'global').trim() || 'global'
      if (!raw) return res.json({ error: 'A folder path is required.' }, 400)
      if (ws !== 'global' && !WS_RE.test(ws)) return res.json({ error: 'Invalid workspace name.' }, 400)
      const abs = path.resolve(expandPath(raw))
      let isDir = false; try { isDir = fs.statSync(abs).isDirectory() } catch {}
      if (!isDir) return res.json({ error: `Not a folder: ${raw}` }, 400)
      if (!exists(path.join(abs, 'frontend.jsx')) && !exists(path.join(abs, 'backend.js'))) return res.json({ error: 'That folder isn’t a module (no frontend.jsx or backend.js).' }, 400)
      try {
        if (ws !== 'global') fs.mkdirSync(path.join(instanceRoot, '$' + ws), { recursive: true })
        const cfg = readJson(configFile) || {}
        const before = JSON.stringify(cfg.modules || [])
        cfg.modules = addToWorkspace(cfg.modules || [], ws, raw)   // store as typed — keeps ~ portable
        if (JSON.stringify(cfg.modules) === before) return res.json({ error: 'That module is already linked here.' }, 400)
        writeConfig(cfg)
        logEvent('ok', `Linked ${baseName(raw)} → ${ws}`)
        res.json({ ok: true })
      } catch (e) { res.json({ error: e.message }, 500) }
    })
    router.post('/unlink', async (req, res) => {
      const raw = (await req.json().catch(() => ({}))).raw
      if (raw == null) return res.json({ error: 'raw required' }, 400)
      try {
        const cfg = readJson(configFile) || {}
        cfg.modules = removeFromConfig(cfg.modules || [], raw)
        writeConfig(cfg)
        logEvent('info', `Unlinked ${baseName(typeof raw === 'string' ? raw : (raw && raw.path) || '')}`)
        res.json({ ok: true })
      } catch (e) { res.json({ error: e.message }, 500) }
    })
    router.post('/move', async (req, res) => {
      const b = await req.json().catch(() => ({}))
      const raw = b.raw
      const toWs = String(b.to || 'global').trim() || 'global'
      if (raw == null) return res.json({ error: 'raw required' }, 400)
      if (toWs !== 'global' && !WS_RE.test(toWs)) return res.json({ error: 'Invalid workspace.' }, 400)
      try {
        if (toWs !== 'global') fs.mkdirSync(path.join(instanceRoot, '$' + toWs), { recursive: true })
        const cfg = readJson(configFile) || {}
        cfg.modules = addToWorkspace(removeFromConfig(cfg.modules || [], raw), toWs, raw)
        writeConfig(cfg)
        logEvent('ok', `Moved ${baseName(typeof raw === 'string' ? raw : (raw && raw.path) || '')} → ${toWs}`)
        res.json({ ok: true })
      } catch (e) { res.json({ error: e.message }, 500) }
    })

    // Soft, semantic warnings (not blocking) — surfaced in the General tab.
    const configWarnings = () => {
      const cfg = readJson(configFile) || {}
      const out = []
      const ids = new Set(); const chromeIds = new Set()
      const consider = (entry, ws) => {
        const id = baseName(typeof entry === 'string' ? entry : (entry && entry.path) || ''); if (!id) return
        ids.add(id)
        const dir = resolveDir(entry, ws); let mm = {}; try { mm = parseMeta(path.join(dir, 'frontend.jsx')) } catch {}
        if (mm.isChrome) chromeIds.add(id)
      }
      for (const m of (cfg.modules || [])) { if (m && m.modules) m.modules.forEach((x) => consider(x, String(m.workspace).replace(/^!/, ''))); else consider(m, 'global') }
      if (cfg.defaultChrome && !chromeIds.has(cfg.defaultChrome)) out.push({ key: 'defaultChrome', msg: `Default theme “${cfg.defaultChrome}” isn’t installed — install it or pick another, or apps may not render.` })
      if (typeof cfg.auth === 'string' && cfg.auth && !ids.has(cfg.auth)) out.push({ key: 'auth', msg: `Auth module “${cfg.auth}” isn’t in your apps — sign-in won’t work until it’s added.` })
      return out
    }

    // ---- instance config (atelier.config.json) --------------------------------
    // Hard shape validation (okShape) lives in config-util.mjs; written
    // atomically (tmp + rename). A malformed config can stop Atelier booting.
    router.get('/config', (req, res) => res.json({ config: readJson(configFile) || {}, restart: restartStatus(), warnings: configWarnings() }))
    router.post('/config', async (req, res) => {
      let body; try { body = await req.json() } catch { return res.json({ error: 'Request body was not valid JSON.' }, 400) }
      const config = body && body.config
      const base = body && body.base
      const bad = okShape(config)
      if (bad) return res.json({ error: bad }, 400)
      const cur = readJson(configFile) || {}
      // Patch-merge: if the client sends the `base` it loaded from, write only the
      // keys it actually changed, on top of the CURRENT on-disk config — so a
      // concurrent edit (e.g. a module added to `modules`) isn't clobbered by an
      // unrelated settings save. A changed key that ALSO drifted on disk is a
      // real conflict → reject (409) so the user reloads instead of losing data.
      let out = config
      if (base && typeof base === 'object' && !Array.isArray(base)) {
        const keys = [...new Set([...Object.keys(config || {}), ...Object.keys(base)])]
        const changed = keys.filter((k) => JSON.stringify(config[k]) !== JSON.stringify(base[k]))
        const conflict = changed.filter((k) => JSON.stringify(cur[k]) !== JSON.stringify(base[k]))
        if (conflict.length) return res.json({ error: `“${conflict.join(', ')}” changed on disk (another edit) — your unsaved change was kept out so nothing is overwritten. Reload to get the latest, then re-apply.`, conflict: true }, 409)
        out = { ...cur }
        for (const k of changed) { if (config[k] === undefined) delete out[k]; else out[k] = config[k] }
        const bad2 = okShape(out); if (bad2) return res.json({ error: bad2 }, 400)
      }
      let text
      try { text = JSON.stringify(out, null, 2) + '\n'; JSON.parse(text) } catch { return res.json({ error: 'Config could not be serialized to JSON.' }, 400) }
      try {
        const tmp = configFile + '.tmp'
        fs.writeFileSync(tmp, text)
        fs.renameSync(tmp, configFile)
      } catch (e) { return res.json({ error: e.message }, 500) }
      const changed = [...new Set([...Object.keys(cur), ...Object.keys(out)])].filter((k) => JSON.stringify(cur[k]) !== JSON.stringify(out[k]))
      const r = restartStatus()
      logEvent('ok', `Settings saved${changed.length ? ' · ' + changed.join(', ') : ''}${r.pending ? ' — restart pending' : ''}`)
      res.json({ ok: true, restart: r })
    })

    // ---- restart status + self-restart ----------------------------------------
    router.get('/restart-status', (req, res) => res.json(restartStatus()))
    router.post('/restart', (req, res) => {
      if (globalThis.__atelierCfgRestarting) return res.json({ error: 'Already restarting.' }, 409)
      globalThis.__atelierCfgRestarting = true
      logEvent('warn', 'Restarting Atelier…')
      res.json({ ok: true })
      setTimeout(async () => {
        // Under launchd (the "Start at login" service), KeepAlive relaunches us on
        // exit — so just exit and let it bring us back on the config port. launchd
        // sets XPC_SERVICE_NAME to the job label; a manual `npm run dev` has it '0'.
        const underLaunchd = !!process.env.XPC_SERVICE_NAME && process.env.XPC_SERVICE_NAME !== '0'
        if (underLaunchd) {
          ctx.log('atelier-config · under launchd — exiting; KeepAlive will relaunch')
        } else {
          // Manual launch: re-exec ourselves after the port frees. Detached + a
          // short sleep so the child binds only once this process has exited.
          try {
            spawn('sh', ['-c', 'sleep 1; exec "$0" "$@"', process.execPath, ...process.argv.slice(1)], { cwd: process.cwd(), detached: true, stdio: 'ignore', env: process.env }).unref()
          } catch (e) { ctx.log('atelier-config · restart spawn failed: ' + e.message) }
        }
        process.exit(0)
      }, 250)
    })

    // ---- service: run THIS instance as a managed launchd LaunchAgent ----------
    // The descriptor is built live from the running process, so it always targets
    // the real folder this server runs from, and the plist is a CLEAN `node
    // server.js` — the server reads its port from atelier.config.json, so a port
    // change in General applies on the next restart. If a LaunchAgent for this
    // instance already exists (e.g. installed by another tool), ADOPT its label
    // instead of minting a second job that would fight it for the port.
    const adoptedLabel = () => {
      const { laDir } = agentPaths('x')
      const script = path.join(instanceRoot, 'atelier', 'server.js')
      let files = []
      try { files = fs.readdirSync(laDir).filter((f) => f.endsWith('.plist')) } catch { return null }
      for (const f of files) {
        let text = ''
        try { text = fs.readFileSync(path.join(laDir, f), 'utf8') } catch { continue }
        if (text.includes(script) || (text.includes('server.js') && text.includes(instanceRoot))) {
          return (text.match(/<key>Label<\/key>\s*<string>([^<]+)<\/string>/) || [])[1] || null
        }
      }
      return null
    }
    const currentInstanceDescriptor = () => {
      const node = process.execPath
      const script = path.resolve(process.argv[1] || path.join(instanceRoot, 'atelier', 'server.js'))
      // The shell discovers modules from ATELIER_ROOT (else PWD); pin all of
      // WorkingDirectory / PWD / ATELIER_ROOT to the real instance root. NB:
      // process.cwd() can resolve an atelier/ symlink to the shared shell folder,
      // so instanceRoot (= dirname(moduleDir)) is the correct value.
      const root = process.env.ATELIER_ROOT || instanceRoot
      const port = String(ctx.port)
      const nodeBin = path.dirname(node)
      // Label: adopt an existing agent that already runs this instance, else key
      // it to the instance FOLDER (stable across port changes).
      const slug = path.basename(root).replace(/[^A-Za-z0-9._-]/g, '-')
      return {
        label: adoptedLabel() || `de.pa1nd.atelier.${slug}`,
        name: `This Atelier instance (:${port})`,
        // port rides on the descriptor (for the UI badge + the install takeover),
        // but deliberately NOT in the plist env — the server reads it from config,
        // so editing it in General takes effect on the next restart.
        port,
        desc: `Start this instance at login and keep it running. It reads its port (${port}) and settings from atelier.config.json, so changes there apply on the next restart.`,
        program: node,
        args: [...process.execArgv, script],
        workingDirectory: root,
        env: {
          PWD: root,
          ATELIER_ROOT: root,
          PATH: `${nodeBin}:${process.env.PATH || ''}:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
        },
        keepAlive: true,
        runAtLoad: true,
      }
    }
    const managedDescriptors = () => [currentInstanceDescriptor()]

    // read-only inventory of ~/Library/LaunchAgents + the managed descriptor(s)
    // with live launchd status, for the controllable cards. launchd is macOS-only.
    const plistsPayload = async () => {
      if (process.platform !== 'darwin') return { managed: [], installed: [], unsupported: true }
      const managed = await Promise.all(managedDescriptors().map(async (d) => ({
        label: d.label, name: d.name, desc: d.desc, port: d.port || null,
        command: [expandPlistToken(d.program), ...(d.args || []).map(expandPlistToken)].join(' '),
        daemon: await agentRuntime(d.label),
      })))
      const installed = await listInstalledAgents(new Set(managed.map((m) => m.label)))
      return { managed, installed }
    }
    const markWatched = () => { slot.watchedAt = Date.now() }
    router.get('/plists', async (req, res) => { markWatched(); res.json(await plistsPayload()) })

    /* live push — the plist probe runs `launchctl print` per agent, so the poll
     * lives HERE, once for all viewers: one timer recomputes, diffs, broadcasts
     * only on change; plist actions force a tick. Clients fetch once + listen. */
    const tick = async (force = false) => {
      if (!force && Date.now() - (slot.watchedAt || 0) > 90000) return   // nobody watching → idle (the 45s visible re-fetch stamps us awake)
      if (slot.watchBusy) return
      slot.watchBusy = true
      try {
        const p = await plistsPayload()
        const key = JSON.stringify(p)
        if (force || key !== slot.lastPlistsKey) { slot.lastPlistsKey = key; ctx.broadcast({ type: 'plists', ...p }) }
      } catch {}
      finally { slot.watchBusy = false }
    }
    const tickNow = () => { tick(true).catch(() => {}) }
    slot.watchBusy = false   // reset the guard on every mount
    if (slot.watchTimer) clearInterval(slot.watchTimer)   // never stack watchers across reloads
    slot.watchTimer = setInterval(() => { tick().catch(() => {}) }, 15000)

    // managed-log push — watch the log dir and push the parsed tail on change,
    // so a crash-loop's fresh stderr surfaces without any client poll.
    if (slot.logWatchers) for (const w of slot.logWatchers) { try { w.close() } catch {} }
    const logWatchers = slot.logWatchers = []
    const logTimers = new Map()
    const logsPayload = (desc) => {
      const { stdout, stderr } = plistLogPaths(desc)
      return {
        label: desc.label,
        stderr: tailFile(stderr), stdout: tailFile(stdout),
        stderrPath: stderr.replace(os.homedir(), '~'), stdoutPath: stdout.replace(os.homedir(), '~'),
      }
    }
    if (process.platform === 'darwin') {
      const byDir = new Map()
      for (const desc of managedDescriptors()) {
        const { stdout, stderr } = plistLogPaths(desc)
        for (const f of [stdout, stderr]) {
          const dir = path.dirname(f)
          if (!byDir.has(dir)) byDir.set(dir, [])
          byDir.get(dir).push({ desc, base: path.basename(f) })
        }
      }
      for (const [dir, files] of byDir) {
        try {
          logWatchers.push(fs.watch(dir, (_ev, name) => {
            for (const { desc, base } of files) {
              if (name !== base) continue
              clearTimeout(logTimers.get(desc.label))
              logTimers.set(desc.label, setTimeout(() => ctx.broadcast({ type: 'plist-logs', ...logsPayload(desc) }), 500))
            }
          }))
        } catch {}   // log dir may not exist yet — the initial fetch still works
      }
    }

    // One-time port handoff, used right after install when the freshly-kickstarted
    // LaunchAgent is crash-looping on EADDRINUSE because THIS process (the manual
    // `npm run dev`) still holds the port. We ARE the listener, so we can't free it
    // and respond — instead spawn a DETACHED shell that outlives us: let our
    // response flush, kill ONLY the listener on the port (-sTCP:LISTEN spares
    // connected browser/WS clients), then kickstart the launchd job onto the freed
    // port. The frontend confirms the EADDRINUSE first, fires this, then reconnects.
    // MUST be registered BEFORE the generic /:action route — the shell router
    // matches in registration order with single-segment params.
    router.post('/plists/:label/takeover', (req, res) => {
      if (process.platform !== 'darwin') return res.json({ ok: false, msg: 'macOS only' }, 400)
      const desc = managedDescriptors().find((d) => d.label === req.params.label)
      if (!desc) return res.json({ ok: false, msg: `no managed plist "${req.params.label}"` }, 404)
      const { uid } = agentPaths(desc.label)
      const port = String(desc.port || ctx.port)
      const job = `gui/${uid}/${desc.label}`
      // Absolute tool paths — a detached shell may not inherit a useful PATH.
      const script = `sleep 0.8; /usr/sbin/lsof -ti tcp:${port} -sTCP:LISTEN 2>/dev/null | xargs kill -9 2>/dev/null; sleep 0.5; /bin/launchctl kickstart -k ${job} 2>/dev/null || /bin/launchctl kickstart ${job} 2>/dev/null`
      try {
        const child = spawn('/bin/sh', ['-c', script], { detached: true, stdio: 'ignore' })
        child.on('error', () => {})   // async spawn errors must not fault the shell
        child.unref()
      } catch (e) { return res.json({ ok: false, msg: String(e.message) }, 500) }
      logEvent('warn', `Handing port ${port} off to the launchd service…`)
      res.json({ ok: true })
    })

    // Manage a descriptor (managed labels only — the inventory is read-only).
    router.post('/plists/:label/:action', async (req, res) => {
      const { label, action } = req.params
      if (!['install', 'start', 'stop', 'restart', 'uninstall'].includes(action)) {
        return res.json({ ok: false, msg: 'action must be install|start|stop|restart|uninstall' }, 400)
      }
      const desc = managedDescriptors().find((d) => d.label === label)
      if (!desc) return res.json({ ok: false, msg: `no managed plist "${label}"` }, 404)
      res.json(await managedPlistAction(desc, action))
      tickNow()
    })

    // Tail a managed agent's stdout/stderr logs — the "why" behind a crash-loop.
    router.get('/plists/:label/logs', async (req, res) => {
      const desc = managedDescriptors().find((d) => d.label === req.params.label)
      if (!desc) return res.json({ ok: false, msg: `no managed plist "${req.params.label}"` }, 404)
      res.json(logsPayload(desc))
    })

    // ---- activity log ----------------------------------------------------------
    router.get('/logs', (req, res) => res.json({ logs: slot.logs }))

    // ---- system check ----------------------------------------------------------
    // Does this machine have what Atelier and its modules typically need? Checks
    // the package managers (node/npm/git/uv/brew), reporting version + presence.
    // PATH is widened to the usual bin dirs so a tool installed but off the
    // server's PATH (launchd/nohup) still resolves.
    router.get('/doctor', async (req, res) => {
      const { execFile } = await import('node:child_process')
      const PATH = [process.env.PATH || '', '/opt/homebrew/bin', '/usr/local/bin', home && home + '/.local/bin', home && home + '/.cargo/bin'].filter(Boolean).join(':')
      const env = { ...process.env, PATH }
      const run = (cmd, args) => new Promise((resolve) => {
        let done = false
        const fin = (ok, out) => { if (!done) { done = true; resolve({ ok, out: (out || '').trim() }) } }
        try { const child = execFile(cmd, args, { timeout: 4000, env }, (err, so, se) => fin(!err, (so || '') + (se || ''))); child.on('error', () => fin(false, '')) } catch { fin(false, '') }
      })
      const ver = (s) => { const m = String(s).match(/\d+\.\d+(\.\d+)?/); return m ? m[0] : (String(s).split('\n')[0].trim() || null) }
      const MANAGERS = [
        { key: 'node', label: 'Node.js', cmd: 'node', args: ['--version'], why: 'Runs Atelier and installs npm modules', install: 'nodejs.org' },
        { key: 'npm', label: 'npm', cmd: 'npm', args: ['--version'], why: 'Installs a module’s Node dependencies', install: 'ships with Node' },
        { key: 'git', label: 'Git', cmd: 'git', args: ['--version'], why: 'Clones collections', install: 'git-scm.com' },
        { key: 'uv', label: 'uv', cmd: 'uv', args: ['--version'], why: 'Installs Python deps + CLIs', install: 'astral.sh/uv' },
        { key: 'brew', label: 'Homebrew', cmd: 'brew', args: ['--version'], why: 'Installs system CLIs modules need', install: 'brew.sh' },
      ]
      const managers = []
      for (const m of MANAGERS) { const r = await run(m.cmd, m.args); managers.push({ key: m.key, label: m.label, why: m.why, install: m.install, present: r.ok, version: r.ok ? ver(r.out) : null }) }
      const latest = await latestUpstream()
      for (const m of managers) {
        const u = latest[m.key] || null
        m.latest = u ? u.latest : null
        m.channel = u ? u.channel : null
        m.upToDate = m.present ? verGE(m.version, m.latest) : null
      }
      res.json({ managers })
    })

    // What's actually available upstream — Node against the ACTIVE LTS line
    // (a future-dated LTS cycle doesn't count yet), everything else against
    // its latest stable. Cached 1h; every lookup degrades to null offline.
    const latestUpstream = async () => {
      if (slot.latestUpstream && Date.now() - slot.latestUpstreamAt < 3600000) return slot.latestUpstream
      const now = Date.now()
      const [node, npm, git, uv, brew] = await Promise.all([
        fetchJson('https://endoflife.date/api/nodejs.json').then((cs) => {
          const c = (cs || []).find((c) => c.lts && (c.lts === true || new Date(c.lts).getTime() <= now))
          return c ? { latest: c.latest, channel: 'LTS ' + c.cycle } : null
        }).catch(() => null),
        fetchJson('https://registry.npmjs.org/npm/latest').then((d) => ({ latest: d.version, channel: 'stable' })).catch(() => null),
        fetchJson('https://api.github.com/repos/git/git/tags?per_page=12').then((ts) => {
          const t = (ts || []).find((t) => /^v\d+\.\d+(\.\d+)?$/.test(t.name))   // newest first; skip -rc tags
          return t ? { latest: t.name.slice(1), channel: 'stable' } : null
        }).catch(() => null),
        fetchJson('https://api.github.com/repos/astral-sh/uv/releases/latest').then((d) => ({ latest: String(d.tag_name).replace(/^v/, ''), channel: 'stable' })).catch(() => null),
        fetchJson('https://api.github.com/repos/Homebrew/brew/releases/latest').then((d) => ({ latest: String(d.tag_name).replace(/^v/, ''), channel: 'stable' })).catch(() => null),
      ])
      const out = { node, npm, git, uv, brew }
      if (Object.values(out).some(Boolean)) { slot.latestUpstream = out; slot.latestUpstreamAt = Date.now() }
      return out
    }

    ctx.log('atelier-config · settings mounted')

    return () => {
      if (slot.watchTimer) { clearInterval(slot.watchTimer); slot.watchTimer = null }
      for (const w of logWatchers) { try { w.close() } catch {} }
      for (const t of logTimers.values()) clearTimeout(t)
    }
  },
}
