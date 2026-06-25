// marketplace — discover, browse, and manage app marketplaces ("uplinks").
//
// An uplink is a GitHub repo (or local/bundled dir) shaped per docs/reference.md.
// This backend keeps a registry of uplinks, scans them (clone/fetch + parse)
// on an interval and on demand, diffs each scan to surface new/updated apps,
// and serves the catalog + per-app detail to the frontend. Install-apply
// (config path-mount) is the next step — for now /app returns an installHint.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawn } from 'node:child_process'
import { resolveSource, readMarketplace, slugOf, parseMeta } from './scanner.js'
import { mdToHtml } from './markdown.js'
import { baseName, wsSlug, addToWorkspace, removeFromConfig, renameWorkspace, workspacesInConfig, okShape } from './config-util.mjs'

const SCAN_INTERVAL_MS = 20 * 60 * 1000
// No bundled marketplaces — a fresh instance starts empty and the operator adds
// real ones (owner/repo, a git URL, or a local path). See docs/quickstart.md.
const DEFAULT_UPLINKS = []

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return null } }
const exists = (p) => { try { fs.accessSync(p); return true } catch { return false } }
const dataUrl = (file) => {
  const ext = path.extname(file).toLowerCase()
  const mime = ext === '.svg' ? 'image/svg+xml' : ext === '.png' ? 'image/png'
    : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'application/octet-stream'
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`
}

// ── managed launchd plist: run THIS instance as a service (macOS, no sudo) ────
// One "managed" user LaunchAgent dock can install/start/stop/restart/uninstall in
// the gui/<uid> domain — its job is to keep the very instance this server runs
// from alive (start at login, relaunch on crash). The descriptor is built live
// from the running process (currentInstanceDescriptor, in mountRoutes), so it
// always targets the real port + folder. The inventory of ~/Library/LaunchAgents
// is strictly read-only. Ported from the 003 devops module.

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

// Run a command (argv, not a shell string) in `cwd`, streaming each output line to
// `onLine` so a long install (npm/uv) shows progress instead of hanging silently.
// Resolves { code, ok, out } — never rejects, so an install step can record failure
// rather than crash the shared shell process. PATH is widened to the usual bin dirs
// (npm/uv may be off the server's PATH under launchd/nohup).
function runStream(cmd, args, { cwd, timeoutMs = 180000, onLine, env: extraEnv } = {}) {
  return new Promise((resolve) => {
    const home = process.env.HOME || ''
    const PATH = [process.env.PATH || '', '/opt/homebrew/bin', '/usr/local/bin', home && home + '/.local/bin', home && home + '/.cargo/bin'].filter(Boolean).join(':')
    const env = { ...process.env, PATH, ...extraEnv }
    let proc
    try { proc = spawn(cmd, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] }) }
    catch (e) { resolve({ code: -1, ok: false, out: String(e.message) }); return }
    let out = '', bufs = { stdout: '', stderr: '' }
    const pump = (key) => (d) => {
      bufs[key] += d; out += d
      let nl
      while ((nl = bufs[key].indexOf('\n')) >= 0) { const line = bufs[key].slice(0, nl); bufs[key] = bufs[key].slice(nl + 1); if (line.trim() && onLine) try { onLine(line) } catch {} }
    }
    const timer = setTimeout(() => { try { proc.kill('SIGKILL') } catch {} resolve({ code: -1, ok: false, out: (out + '\n[timed out]').trim() }) }, timeoutMs)
    proc.stdout.on('data', pump('stdout'))
    proc.stderr.on('data', pump('stderr'))
    proc.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, ok: false, out: (out + '\n' + e.message).trim() }) })
    proc.on('exit', (code) => { clearTimeout(timer); resolve({ code: code ?? -1, ok: (code ?? -1) === 0, out: out.trim() }) })
  })
}

// Classify an app's `requires[]` (the marketplace manifest schema) into what the
// installer can auto-apply vs. host-touching steps surfaced for the operator.
//   - string 'npm' / 'uv'          → auto (managed runtimes)
//   - { brew: [...] }              → `brew install …`  (host — surfaced, not run)
//   - { uvtool: 'pkg' | [...] }    → `uv tool install …` (host — surfaced)
//   - { script: './x.sh' }         → run the app's own script (host — surfaced)
//   - { note: '…' }                → a human prerequisite (surfaced, never a command)
// Unknown strings (legacy free-text like "Python 3.11+") are kept as notes so a
// pre-schema manifest degrades to "shown, not run" rather than being mis-applied.
function classifyRequires(requires) {
  const r = Array.isArray(requires) ? requires : []
  let npm = false, uv = false
  const steps = []   // { kind, label, cmd? } — host-touching, surfaced not run
  for (const item of r) {
    if (typeof item === 'string') {
      const s = item.trim().toLowerCase()
      if (s === 'npm') npm = true
      else if (s === 'uv') uv = true
      else if (item.trim()) steps.push({ kind: 'note', label: item.trim() })
      continue
    }
    if (!item || typeof item !== 'object') continue
    if (item.brew != null) {
      const pkgs = (Array.isArray(item.brew) ? item.brew : [item.brew]).map(String).filter(Boolean)
      if (pkgs.length) steps.push({ kind: 'brew', label: `Install with Homebrew: ${pkgs.join(', ')}`, cmd: `brew install ${pkgs.join(' ')}` })
    }
    if (item.uvtool != null) {
      const tools = (Array.isArray(item.uvtool) ? item.uvtool : [item.uvtool]).map(String).filter(Boolean)
      for (const t of tools) steps.push({ kind: 'uvtool', label: `Install CLI: ${t}`, cmd: `uv tool install ${t}` })
    }
    if (item.script != null && String(item.script).trim()) {
      const sc = String(item.script).trim()
      steps.push({ kind: 'script', label: `Run the app's setup script: ${sc}`, cmd: sc })
    }
    if (item.note != null && String(item.note).trim()) steps.push({ kind: 'note', label: String(item.note).trim() })
  }
  return { npm, uv, steps }
}

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
  async mountRoutes(router, ctx) {
    const slot = ctx.module(ctx.id)
    const moduleDir = path.dirname(ctx.dataDir)
    const bundledDir = path.join(moduleDir, '_examples')
    const cacheDir = path.join(ctx.dataDir, 'uplinks')
    const uplinksFile = path.join(ctx.dataDir, 'uplinks.json')
    const stateFile = path.join(ctx.dataDir, 'state.json')
    const installsFile = path.join(ctx.dataDir, 'installs.json')   // per-app dependency-apply records

    const saveUplinks = () => { fs.mkdirSync(ctx.dataDir, { recursive: true }); fs.writeFileSync(uplinksFile, JSON.stringify(slot.uplinks, null, 2)) }
    slot.uplinks ??= (Array.isArray(readJson(uplinksFile)) && readJson(uplinksFile).length ? readJson(uplinksFile) : DEFAULT_UPLINKS.slice())
    slot.catalog ??= { marketplaces: [], apps: [], scannedAt: 0 }
    slot.detail ??= {}
    slot.scanning ??= false
    // Per-app dependency-apply records (keyed by app id): { at, ok, error, deps:{npm,uv}, steps:[…] }.
    slot.installs ??= (readJson(installsFile) || {})

    const configFile = path.join(path.dirname(moduleDir), 'atelier.config.json')

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
    const logEvent = (level, msg) => pushLog(level, msg, 'dock')

    // Tee the process's real stdout/stderr into the log so the Activity tab shows
    // the actual server output (the shell + every module), not just dock's events.
    // Patched once per process; the sink is repointed at the live slot each mount.
    globalThis.__atelierDockSink = (level, line) => pushLog(level, line, 'server')
    if (!globalThis.__atelierDockTee) {
      globalThis.__atelierDockTee = true
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
              if (!globalThis.__atelierDockInTee) {
                globalThis.__atelierDockInTee = true
                try { globalThis.__atelierDockSink(level, line) } catch {}
                globalThis.__atelierDockInTee = false
              }
            }
          } catch {}
          return orig(chunk, enc, cb)
        }
      }
    }

    // ---- restart tracking --------------------------------------------------
    // The shell reads these settings once at startup; snapshot them the first
    // time the dock mounts in this process so we can flag a pending restart.
    const RESTART_KEYS = ['port', 'defaultChrome', 'auth', 'hotReload', 'baseUrl']
    const pickRestart = (c) => { const o = {}; for (const k of RESTART_KEYS) o[k] = c ? c[k] : undefined; return o }
    globalThis.__atelierDockBoot ??= pickRestart(readJson(configFile) || {})
    const restartStatus = () => {
      const cur = pickRestart(readJson(configFile) || {})
      const keys = RESTART_KEYS.filter((k) => JSON.stringify(globalThis.__atelierDockBoot[k]) !== JSON.stringify(cur[k]))
      return { pending: keys.length > 0, keys }
    }

    // An uplink is keyed by its source (the repo/path) — its display name comes
    // from the scanned .atelier/marketplace.json, so no user-supplied name needed.
    async function scanOne(u) {
      try {
        const r = await resolveSource(u.source, { cacheDir, bundledDir, log: ctx.log })
        const { marketplace, apps, chromes, base } = readMarketplace(r.dir, slugOf(u.source))
        return { key: slugOf(u.source), source: u.source, dir: r.dir, base, kind: r.kind, sha: r.sha, marketplace, apps, chromes }
      } catch (e) {
        ctx.log(`marketplace · scan "${u.source}" failed: ${e.message}`)
        return { key: slugOf(u.source), source: u.source, error: e.message, marketplace: { id: slugOf(u.source), name: u.source }, apps: [], chromes: [] }
      }
    }

    async function scanAll() {
      if (slot.scanning) return slot.catalog
      slot.scanning = true
      try {
        const prev = readJson(stateFile) || {}
        const hadPrev = Object.keys(prev).length > 0
        const marketplaces = [], apps = [], state = {}
        let added = 0, updated = 0
        for (const u of slot.uplinks) {
          const r = await scanOne(u)
          if (r.error) logEvent('error', `Marketplace “${r.source}” failed — ${r.error}`)
          marketplaces.push({
            key: r.key, source: r.source, kind: r.kind, error: r.error || null,
            ...r.marketplace, appCount: r.apps.length, chromes: r.chromes || [], updatedAt: Date.now(),
          })
          slot.detail[r.key] = { dir: r.dir, base: r.base || r.dir, source: r.source, name: r.marketplace.name, apps: Object.fromEntries(r.apps.map((a) => [a.id, a])) }
          const pm = prev[r.key] || {}
          state[r.key] = {}
          for (const a of r.apps) {
            const isNew = hadPrev && !(a.id in pm)
            const hasUpdate = !!pm[a.id] && pm[a.id] !== a.version
            if (isNew) added++; if (hasUpdate) updated++
            state[r.key][a.id] = a.version
            apps.push({
              uplink: r.key, uplinkName: r.marketplace.name, id: a.id, name: a.name, icon: a.icon,
              tagline: a.tagline, category: a.category, tags: a.tags, version: a.version,
              isNew, hasUpdate, installable: a.installable,
            })
          }
        }
        slot.catalog = { marketplaces, apps, scannedAt: Date.now() }
        try { fs.mkdirSync(ctx.dataDir, { recursive: true }); fs.writeFileSync(stateFile, JSON.stringify(state)) } catch {}
        ctx.broadcast({ type: 'scan', total: apps.length, added, updated, at: Date.now() })
        logEvent(added || updated ? 'ok' : 'info', `Scanned ${marketplaces.length} marketplace(s) · ${apps.length} apps${added ? `, ${added} new` : ''}${updated ? `, ${updated} updated` : ''}`)
        return slot.catalog
      } finally {
        slot.scanning = false
      }
    }
    slot.scanAll = scanAll

    // Kick off the background scanner once per process (survives hot-reload).
    if (!slot.timer) {
      logEvent('info', 'Dock started.')
      scanAll().catch((e) => ctx.log('marketplace · initial scan: ' + e.message))
      slot.timer = setInterval(() => scanAll().catch(() => {}), SCAN_INTERVAL_MS)
    }

    const categories = (apps) => {
      const m = new Map()
      for (const a of apps) m.set(a.category, (m.get(a.category) || 0) + 1)
      return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    }
    const featured = () => {
      const mk = slot.catalog.marketplaces.find((m) => m.featured)
      if (mk) { const a = slot.catalog.apps.find((x) => x.uplink === mk.key && x.id === mk.featured); if (a) return a }
      return slot.catalog.apps[0] || null
    }

    router.get('/catalog', (req, res) => {
      const inst = slot.installedInfo ? slot.installedInfo() : {}
      const mark = (a) => (a ? { ...a, installed: !!inst[a.id], updatable: !!inst[a.id] && inst[a.id].version !== a.version, workspace: inst[a.id] ? inst[a.id].ws : null } : a)
      const apps = slot.catalog.apps.map(mark)
      res.json({ ...slot.catalog, apps, categories: categories(apps), featured: mark(featured()), uplinkCount: slot.uplinks.length })
    })

    router.get('/app', (req, res) => {
      const { uplink, id } = req.query
      const d = slot.detail[uplink]; const a = d?.apps?.[id]
      if (!a) return res.json({ error: 'not found' }, 404)
      const appDir = path.join(d.base || d.dir, id)
      const mpRoot = path.resolve(d.dir)
      // Screenshots are curated in the marketplace's apps[] and shipped in the
      // marketplace itself (paths relative to its root, or https URLs) — modules
      // stay clean. Inline local files as data URLs.
      const screenshots = (a.screenshots || []).map((s) => {
        if (/^https?:/i.test(s)) return s
        const target = path.resolve(d.dir, s)
        if (target.startsWith(mpRoot) && exists(target)) { try { return dataUrl(target) } catch {} }
        return null
      }).filter(Boolean)
      const inf = (slot.installedInfo ? slot.installedInfo() : {})[id]
      const plan = classifyRequires(a.requires)   // what Get will auto-apply vs. surface
      const nodeDeps = Object.keys(((readJson(path.join(appDir, 'package.json')) || {}).dependencies) || {})
      const planSteps = plan.steps.filter((s) => !(s.kind === 'note' && nodeDeps.includes(s.label)))
      res.json({
        ...a, uplink, uplinkName: d.name, source: d.source,
        descriptionHtml: mdToHtml(a.description || ''),
        screenshots,
        installed: !!inf, updatable: !!inf && inf.version !== a.version, workspace: inf ? inf.ws : null,
        installHint: a.installable && exists(appDir) ? { path: appDir } : null,
        deps: { npm: plan.npm || nodeDeps.length > 0, uv: plan.uv || exists(path.join(appDir, 'requirements.txt')) },
        systemSteps: planSteps,                           // manual steps this app declares
        install: slot.installs[id] || null,               // last dependency-apply record (if installed)
      })
    })

    router.get('/uplinks', (req, res) => res.json({
      uplinks: slot.uplinks.map((u) => {
        const mk = slot.catalog.marketplaces.find((m) => m.key === slugOf(u.source)) || {}
        return { source: u.source, name: mk.name || null, addedAt: u.addedAt || null, appCount: mk.appCount || 0, chromes: mk.chromes || [], kind: mk.kind || null, error: mk.error || null }
      }),
      scannedAt: slot.catalog.scannedAt,
    }))

    router.post('/uplinks/add', async (req, res) => {
      const { source } = await req.json()
      const src = (source || '').trim()
      if (!src) return res.json({ error: 'a source is required' }, 400)
      if (slot.uplinks.some((u) => u.source === src)) return res.json({ error: 'that marketplace is already added' }, 400)
      slot.uplinks.push({ source: src, addedAt: Date.now() })
      saveUplinks()
      await scanAll()
      const mk = slot.catalog.marketplaces.find((m) => m.key === slugOf(src)) || {}
      if (mk.error) { logEvent('error', `Couldn’t add “${src}” — ${mk.error}`); return res.json({ error: mk.error }) }
      logEvent('ok', `Added marketplace “${mk.name || src}” · ${mk.appCount || 0} apps`)
      res.json({ ok: true, name: mk.name || src, appCount: mk.appCount || 0 })
    })

    router.post('/uplinks/remove', async (req, res) => {
      const { source } = await req.json()
      const u = slot.uplinks.find((x) => x.source === source)
      slot.uplinks = slot.uplinks.filter((x) => x.source !== source)
      delete slot.detail[slugOf(source)]
      saveUplinks()
      logEvent('info', `Removed marketplace ${source}`)
      // best-effort: drop a git clone's cache
      if (u && !/^(bundled:|\/|~|\.\/)/.test(u.source)) {
        try { fs.rmSync(path.join(cacheDir, slugOf(u.source)), { recursive: true, force: true }) } catch {}
      }
      await scanAll()
      res.json({ ok: true })
    })

    router.post('/scan', async (req, res) => { await scanAll(); res.json({ ok: true, total: slot.catalog.apps.length }) })

    // ---- workspaces --------------------------------------------------------
    const WS_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/
    const WS_RESERVED = new Set(['atelier', 'api', 'assets', 'modules', 'global'])
    router.get('/workspaces', (req, res) => {
      const root = path.dirname(moduleDir)
      let dirs = []
      try { dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name.startsWith('$')).map((d) => d.name.slice(1)) } catch {}
      res.json({ workspaces: [{ id: 'global', kind: 'global' }, ...dirs.map((id) => ({ id, kind: 'ws' }))] })
    })
    router.post('/workspaces/create', async (req, res) => {
      const n = ((await req.json()).name || '').trim()
      if (!WS_RE.test(n)) return res.json({ error: 'Use letters, numbers, and dashes; start with a letter or number.' }, 400)
      if (WS_RESERVED.has(n)) return res.json({ error: `“${n}” is a reserved name.` }, 400)
      const dir = path.join(path.dirname(moduleDir), '$' + n)
      if (exists(dir)) return res.json({ error: 'That workspace already exists.' }, 400)
      try { fs.mkdirSync(dir, { recursive: true }); logEvent('ok', `Created workspace $${n}`); res.json({ ok: true }) }
      catch (e) { res.json({ error: e.message }, 500) }
    })
    router.post('/workspaces/rename', async (req, res) => {
      const b = await req.json()
      const from = String(b.from || '').trim()
      const raw = String(b.to || '').trim()
      if (!from || from === 'global') return res.json({ error: 'That workspace can’t be renamed.' }, 400)
      if (!raw) return res.json({ error: 'A new name is required.' }, 400)
      const to = wsSlug(raw)
      if (to === from) return res.json({ ok: true, name: to })
      const root = path.dirname(moduleDir)
      const fromDir = path.join(root, '$' + from), toDir = path.join(root, '$' + to)
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
      if (block && block.modules.length) return res.json({ error: 'Move or uninstall its apps first.' }, 400)
      try {
        cfg.modules = (cfg.modules || []).filter((m) => !(m && typeof m === 'object' && m.workspace === name))
        writeConfig(cfg)
        const dir = path.join(path.dirname(moduleDir), '$' + name)
        if (exists(dir)) { try { fs.rmdirSync(dir) } catch {} }   // removes only if empty — never deletes real files
        logEvent('info', `Deleted workspace ${name}`)
        res.json({ ok: true })
      } catch (e) { res.json({ error: e.message }, 500) }
    })

    // ---- instance (installed modules with resolved meta) -------------------
    // Resolves each atelier.config.json modules entry to its dir + meta, so the
    // Configure UI can group apps by workspace and colour them by chrome.
    router.get('/instance', (req, res) => {
      const root = path.dirname(moduleDir)
      const home = process.env.HOME || ''
      const cfg = readJson(path.join(root, 'atelier.config.json')) || {}
      // Three kinds:
      //   system    — ships in the atelier/ shell folder (e.g. dock); never removable
      //   installed — dock fetched it into its own data folder
      //   linked    — referenced from anywhere else (a path-mount); removing only unlinks
      const dockData = path.resolve(ctx.dataDir)
      const atelierDir = path.resolve(root, 'atelier')
      const inside = (dir, base) => { try { const d = path.resolve(dir); return d === base || d.startsWith(base + path.sep) } catch { return false } }
      const meta = {}
      const add = (entry, ws) => {
        let p = typeof entry === 'string' ? entry.replace(/^!/, '') : (entry && entry.path) || null
        if (!p) return
        const id = p.split('/').filter(Boolean).pop()
        const dir = /^(\/|~)/.test(p) ? p.replace(/^~/, home) : path.resolve(root, ws === 'global' ? '' : '$' + ws, p)
        let mm = {}; try { mm = parseMeta(path.join(dir, 'frontend.jsx')) } catch {}
        const kind = inside(dir, atelierDir) ? 'system' : inside(dir, dockData) ? 'installed' : 'linked'
        const entryMeta = { isChrome: !!mm.isChrome, chrome: mm.chrome || null, icon: mm.icon || null, name: mm.name || id, kind, linked: kind === 'linked', dir }
        if (kind === 'installed') {
          const ver = (readJson(path.join(dir, 'package.json')) || {}).version || '0.0.0'
          const inCatalog = (slot.catalog.apps || []).filter((a) => a.id === id)
          const newer = inCatalog.find((a) => a.version && a.version !== ver)
          entryMeta.version = ver
          entryMeta.orphaned = inCatalog.length === 0   // source marketplace is gone
          entryMeta.updatable = !!newer && !entryMeta.orphaned
          if (newer) entryMeta.updateUplink = newer.uplink
        }
        meta[id] = entryMeta
      }
      for (const m of (cfg.modules || [])) {
        if (m && typeof m === 'object' && Array.isArray(m.modules) && m.workspace) for (const s of m.modules) add(s, String(m.workspace).replace(/^!/, ''))
        else if (m && typeof m === 'object' && m.workspace) { /* include-all block — nothing to resolve */ }
        else add(m, 'global')
      }
      let wsDirs = []
      try { wsDirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name.startsWith('$')).map((d) => d.name.slice(1)) } catch {}
      res.json({ defaultChrome: cfg.defaultChrome || null, workspaces: ['global', ...wsDirs], meta, roots: { data: dockData, atelier: atelierDir, home } })
    })

    // Wipe an INSTALLED module's data dir (<module>/data). Resolved server-side
    // from the config + heavily guarded: only ever deletes a `data` folder that
    // lives strictly inside this instance — never a linked module's external dir.
    router.post('/module/wipe-data', async (req, res) => {
      const id = String((await req.json()).id || '').trim()
      if (!id) return res.json({ error: 'id required' }, 400)
      const root = path.dirname(moduleDir); const home = process.env.HOME || ''
      const dockData = path.resolve(ctx.dataDir)   // only ever delete inside here
      const cfg = readJson(configFile) || {}
      let dir = null
      const consider = (entry, ws) => {
        let p = typeof entry === 'string' ? entry.replace(/^!/, '') : (entry && entry.path) || null
        if (!p || p.split('/').filter(Boolean).pop() !== id) return
        dir = /^(\/|~)/.test(p) ? p.replace(/^~/, home) : path.resolve(root, ws === 'global' ? '' : '$' + ws, p)
      }
      for (const m of (cfg.modules || [])) {
        if (m && typeof m === 'object' && Array.isArray(m.modules) && m.workspace) for (const s of m.modules) consider(s, String(m.workspace).replace(/^!/, ''))
        else if (m && typeof m === 'object' && m.workspace) { /* skip */ } else consider(m, 'global')
      }
      if (!dir) return res.json({ error: 'module not found' }, 404)
      const dirAbs = path.resolve(dir)
      // Only installed modules (those dock placed inside its own data dir) have removable data.
      if (dirAbs !== dockData && !dirAbs.startsWith(dockData + path.sep)) return res.json({ error: 'refusing — this module is linked, not installed; its data lives outside dock' }, 400)
      const dataDir = path.join(dirAbs, 'data')
      try {
        if (exists(dataDir)) fs.rmSync(dataDir, { recursive: true, force: true })
        logEvent('warn', `Wiped data for “${id}” (${dataDir})`)
        res.json({ ok: true })
      } catch (e) { res.json({ error: e.message }, 500) }
    })

    // ---- install / update / uninstall --------------------------------------
    // Install = copy the app into dock's own data folder (dock/data/installed/
    // <marketplace>/<id>) and mount it into a workspace named after the
    // marketplace. That makes it a true "installed" app, decoupled from re-scans.
    const instanceRoot = path.dirname(moduleDir)
    const installRoot = path.join(ctx.dataDir, 'installed')
    const home = process.env.HOME || ''
    const writeConfig = (cfg) => { const tmp = configFile + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n'); fs.renameSync(tmp, configFile) }
    const resolveDir = (entry, ws) => { const p = typeof entry === 'string' ? entry.replace(/^!/, '') : (entry && entry.path); if (!p) return null; return /^(\/|~)/.test(p) ? p.replace(/^~/, home) : path.resolve(instanceRoot, ws === 'global' ? '' : '$' + ws, p) }
    const insideInstall = (dir) => { const a = path.resolve(dir), r = path.resolve(installRoot); return a === r || a.startsWith(r + path.sep) }

    // Which apps are installed (path inside installRoot) + their copied version.
    const installedInfo = () => {
      const cfg = readJson(configFile) || {}
      const map = {}
      const consider = (entry, ws) => {
        const dir = resolveDir(entry, ws); if (!dir || !insideInstall(dir)) return
        const pkg = readJson(path.join(dir, 'package.json')) || {}
        map[baseName(typeof entry === 'string' ? entry : entry.path)] = { dir: path.resolve(dir), ws, version: pkg.version || '0.0.0', entry }
      }
      for (const m of (cfg.modules || [])) { if (m && m.modules) m.modules.forEach((x) => consider(x, String(m.workspace).replace(/^!/, ''))); else consider(m, 'global') }
      return map
    }
    slot.installedInfo = installedInfo

    // Never copy these — deps are (re)installed separately, VCS/junk shouldn't ship.
    const SKIP_COPY = new Set(['node_modules', '.git', '.DS_Store', '.atelier'])
    const copyFilter = (src) => !SKIP_COPY.has(path.basename(src))
    // Copy an app folder from a marketplace into the install root. Returns dest path.
    const copyInto = (src, dest) => {
      if (!exists(src)) throw new Error('source is missing — try a re-scan')
      fs.rmSync(dest, { recursive: true, force: true })
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.cpSync(src, dest, { recursive: true, filter: copyFilter })
      return dest
    }
    const copyApp = (uplink, id, ws) => {
      const d = slot.detail[uplink]
      if (!d || !d.apps || !d.apps[id]) throw new Error('app not found — try a re-scan')
      return copyInto(path.join(d.base || d.dir, id), path.join(installRoot, ws, id))
    }

    const saveInstalls = () => { try { fs.mkdirSync(ctx.dataDir, { recursive: true }); fs.writeFileSync(installsFile, JSON.stringify(slot.installs, null, 2)) } catch {} }

    // Apply an app's dependencies into its install dir after the files are copied.
    // npm/uv are auto-applied (idempotent, re-runnable); host-touching steps (brew,
    // uvtool, script, note) are SURFACED for the operator, never run here — they run
    // arbitrary host commands and need human consent. Streams progress to the
    // Activity log over the WS, records the outcome, and resolves a result object.
    // Runs async (spawn) so it never blocks the shared single-process shell.
    const applyDeps = async (app, dir, id) => {
      const cls = classifyRequires(app && app.requires)
      const { npm, uv } = cls
      const hasPkg = exists(path.join(dir, 'package.json'))
      const pkg = readJson(path.join(dir, 'package.json')) || {}
      const nodeDeps = Object.keys(pkg.dependencies || {})
      const hasNodeDeps = nodeDeps.length > 0
      const hasReqs = exists(path.join(dir, 'requirements.txt'))
      // Legacy manifests list node package names in `requires` (scanner's default);
      // those become auto-applied npm deps, not manual notes — drop the duplicates.
      const steps = cls.steps.filter((s) => !(s.kind === 'note' && nodeDeps.includes(s.label)))
      // Apply npm when the manifest asks for it OR the copied app actually carries
      // node deps (scanner derives `requires` from pkg.dependencies, so a clean app
      // may name packages rather than the "npm" keyword — either way it needs npm).
      const wantNpm = (npm || hasNodeDeps) && hasPkg
      const wantUv = (uv || hasReqs)
      const result = { at: Date.now(), ok: true, error: null, deps: {}, steps, ran: [] }
      const onLine = (line) => logEvent('info', `${id}: ${line}`)

      if (wantNpm) {
        const hasLock = exists(path.join(dir, 'package-lock.json')) || exists(path.join(dir, 'npm-shrinkwrap.json'))
        const args = hasLock ? ['ci'] : ['install']
        logEvent('info', `Installing Node deps for “${id}” (npm ${args[0]})…`)
        ctx.broadcast({ type: 'install-progress', id, step: 'npm', status: 'running' })
        const r = await runStream('npm', [...args, '--no-audit', '--no-fund'], { cwd: dir, timeoutMs: 240000, onLine })
        result.ran.push('npm')
        result.deps.npm = { ok: r.ok, manager: 'npm', command: `npm ${args.join(' ')}`, code: r.code }
        if (!r.ok) { result.ok = false; result.deps.npm.tail = r.out.split('\n').slice(-8).join('\n'); logEvent('error', `npm ${args[0]} failed for “${id}” (exit ${r.code})`) }
        else logEvent('ok', `Node deps ready for “${id}”`)
        ctx.broadcast({ type: 'install-progress', id, step: 'npm', status: r.ok ? 'ok' : 'error' })
      }

      if (wantUv) {
        if (!hasReqs) {
          // 'uv' was requested but there's nothing declarative to install — surface it.
          result.steps = [...result.steps, { kind: 'note', label: 'Declared “uv” but no requirements.txt was shipped — add one or a script.' }]
        } else {
          logEvent('info', `Setting up Python venv for “${id}” (uv)…`)
          ctx.broadcast({ type: 'install-progress', id, step: 'uv', status: 'running' })
          const venv = path.join(dir, '.venv')
          const v1 = await runStream('uv', ['venv', venv], { cwd: dir, timeoutMs: 120000, onLine })
          let v2 = v1
          if (v1.ok) v2 = await runStream('uv', ['pip', 'install', '--python', venv, '-r', 'requirements.txt'], { cwd: dir, timeoutMs: 600000, onLine })
          result.ran.push('uv')
          const ok = v1.ok && v2.ok
          result.deps.uv = { ok, manager: 'uv', command: `uv venv .venv && uv pip install --python .venv -r requirements.txt`, code: ok ? 0 : (v1.ok ? v2.code : v1.code) }
          if (!ok) { result.ok = false; result.deps.uv.tail = (v1.ok ? v2 : v1).out.split('\n').slice(-8).join('\n'); logEvent('error', `uv setup failed for “${id}”`) }
          else logEvent('ok', `Python venv ready for “${id}”`)
          ctx.broadcast({ type: 'install-progress', id, step: 'uv', status: ok ? 'ok' : 'error' })
        }
      }

      if (result.steps.length) logEvent('warn', `“${id}” needs ${result.steps.length} manual system step(s) — see the app page.`)
      slot.installs[id] = result
      saveInstalls()
      ctx.broadcast({ type: 'install-done', id, ok: result.ok, steps: result.steps })
      return result
    }
    slot.applyDeps = applyDeps

    router.post('/install', async (req, res) => {
      const { uplink, id } = await req.json()
      const d = slot.detail[uplink]
      const app = d && d.apps && d.apps[id]
      if (!app) return res.json({ error: 'app not found' }, 404)
      const mk = slot.catalog.marketplaces.find((m) => m.key === uplink) || {}
      const ws = wsSlug(mk.id || mk.name || d.name || uplink)
      try {
        const dest = copyApp(uplink, id, ws)
        if (ws !== 'global') fs.mkdirSync(path.join(instanceRoot, '$' + ws), { recursive: true })
        const cfg = readJson(configFile) || {}
        cfg.modules = addToWorkspace(cfg.modules || [], ws, dest)
        // Auto-install the app's theme if the marketplace ships it and it's absent.
        let chrome = null
        let chromeDest = null
        const want = app.chrome
        if (want) {
          const present = cfg.defaultChrome === want || (cfg.modules || []).some((m) => baseName(typeof m === 'string' ? m : (m.path || '')) === want || (m && m.modules && m.modules.some((x) => baseName(x) === want)))
          const chromeSrc = path.join(d.base || d.dir, want)
          if (!present && exists(chromeSrc)) {
            const cdest = copyInto(chromeSrc, path.join(installRoot, ws, want))
            cfg.modules = addToWorkspace(cfg.modules, 'global', cdest)
            chrome = want; chromeDest = cdest
          }
        }
        // Apply dependencies BEFORE the config write that mounts the module — so the
        // app only ever mounts with its deps already in place (no broken first load).
        // npm/uv run here; brew/uvtool/script/note are surfaced (not run). The chrome
        // (if just installed) gets the same treatment.
        const depResult = await applyDeps(app, dest, id)
        // The chrome isn't in d.apps (chromes are filtered out of the catalog), so
        // its deps are driven by the files it ships (package.json / requirements.txt).
        if (chrome && chromeDest) {
          try { await applyDeps({}, chromeDest, chrome) } catch (e) { ctx.log('dock · chrome dep-apply: ' + e.message) }
        }
        writeConfig(cfg)
        logEvent('ok', `Installed “${app.name || id}” into workspace ${ws}${chrome ? ` (+ theme ${chrome})` : ''}`)
        res.json({ ok: true, workspace: ws, chrome, deps: depResult.deps, depsOk: depResult.ok, systemSteps: depResult.steps })
      } catch (e) { res.json({ error: e.message }, 500) }
    })

    router.post('/update', async (req, res) => {
      const { uplink, id } = await req.json()
      const inf = installedInfo()[id]
      if (!inf) return res.json({ error: 'not installed' }, 404)
      try {
        const ws = inf.ws === undefined || inf.ws === 'global' ? wsSlug((slot.catalog.marketplaces.find((m) => m.key === uplink) || {}).id || uplink) : inf.ws
        // re-copy over the existing install, preserving its data/ folder
        const d = slot.detail[uplink]; if (!d || !d.apps || !d.apps[id]) throw new Error('app not found — try a re-scan')
        const src = path.join(d.base || d.dir, id)
        const data = path.join(inf.dir, 'data'); const hasData = exists(data)
        const tmpData = inf.dir + '.data.bak'
        if (hasData) fs.renameSync(data, tmpData)
        copyInto(src, inf.dir)
        if (hasData) { fs.rmSync(path.join(inf.dir, 'data'), { recursive: true, force: true }); fs.renameSync(tmpData, path.join(inf.dir, 'data')) }
        // Re-apply deps for the new version before remounting (idempotent re-run).
        const depResult = await applyDeps(d.apps[id], inf.dir, id)
        // Files under dock/data aren't watched, so re-write the config to nudge the
        // shell into reloading — that remounts the module with its new code.
        writeConfig(readJson(configFile) || {})
        logEvent('ok', `Updated “${id}”`)
        res.json({ ok: true, deps: depResult.deps, depsOk: depResult.ok, systemSteps: depResult.steps })
      } catch (e) { res.json({ error: e.message }, 500) }
    })

    router.post('/uninstall', async (req, res) => {
      const { id, wipeData } = await req.json()
      const inf = installedInfo()[id]
      if (!inf) return res.json({ error: 'installed app not found' }, 404)
      const dir = inf.dir
      if (!insideInstall(dir)) return res.json({ error: 'refusing' }, 400)
      try {
        const cfg = readJson(configFile) || {}
        cfg.modules = removeFromConfig(cfg.modules, inf.entry)
        cfg.modules = pruneInstalledChromes(cfg)
        if (wipeData) fs.rmSync(dir, { recursive: true, force: true })
        else if (exists(dir)) for (const f of fs.readdirSync(dir)) { if (f !== 'data') fs.rmSync(path.join(dir, f), { recursive: true, force: true }) }
        // tidy up the now-empty marketplace install folder
        try { const parent = path.dirname(dir); if (exists(parent) && !fs.readdirSync(parent).length) fs.rmdirSync(parent) } catch {}
        if (slot.installs[id]) { delete slot.installs[id]; saveInstalls() }
        writeConfig(cfg)
        logEvent('warn', `Uninstalled “${id}”${wipeData ? ' + data' : ' (kept data)'}`)
        res.json({ ok: true })
      } catch (e) { res.json({ error: e.message }, 500) }
    })

    // Per-app dependency-apply record — what ran (npm/uv) and any manual system
    // steps (brew/uvtool/script/note) the operator still needs to apply.
    router.get('/install-state', (req, res) => {
      const id = String(req.query.id || '')
      if (id) return res.json({ install: slot.installs[id] || null })
      res.json({ installs: slot.installs })
    })

    // ---- link / unlink / move : immediate config writes (like install) -----
    // These edit atelier.config.json on disk right away (read-modify-write), so a
    // staged UI edit can never be silently clobbered by a later install.
    const expandPath = (p) => (/^~(?=\/|$)/.test(p) ? home + p.slice(1) : p)
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
        cfg.modules = pruneInstalledChromes({ ...cfg, modules: removeFromConfig(cfg.modules || [], raw) })
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

    // Drop installed chromes nothing needs anymore (not default, not used by an app).
    function pruneInstalledChromes(cfg) {
      const used = new Set(); if (cfg.defaultChrome) used.add(cfg.defaultChrome)
      const metaOf = (entry, ws) => { const dir = resolveDir(entry, ws); let mm = {}; try { mm = parseMeta(path.join(dir, 'frontend.jsx')) } catch {} return { dir, mm } }
      const walk = (fn) => { for (const m of (cfg.modules || [])) { if (m && m.modules) m.modules.forEach((x) => fn(x, String(m.workspace).replace(/^!/, ''))); else fn(m, 'global') } }
      walk((e, ws) => { const { mm } = metaOf(e, ws); if (!mm.isChrome && mm.chrome) used.add(mm.chrome) })
      const keep = (e, ws) => {
        const { dir, mm } = metaOf(e, ws); if (!mm.isChrome) return true
        const id = baseName(typeof e === 'string' ? e : (e.path || ''))
        if (id === cfg.defaultChrome || used.has(id) || !insideInstall(dir)) return true
        try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
        logEvent('info', `Removed unused theme “${id}”`)
        return false
      }
      const out = []
      for (const m of (cfg.modules || [])) {
        if (m && m.modules && m.workspace) { const mods = m.modules.filter((x) => keep(x, String(m.workspace).replace(/^!/, ''))); if (mods.length) out.push({ ...m, modules: mods }) }
        else if (keep(m, 'global')) out.push(m)
      }
      return out
    }

    // Soft, semantic warnings (not blocking) — surfaced in the Configure UI.
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

    // ---- instance config (atelier.config.json) -----------------------------
    // Hard shape validation (okShape) + warnings live in config-util.mjs; written
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
      // concurrent install/edit (e.g. a module added to `modules`) isn't clobbered
      // by an unrelated settings save. A changed key that ALSO drifted on disk is a
      // real conflict → reject (409) so the user reloads instead of losing data.
      let out = config
      if (base && typeof base === 'object' && !Array.isArray(base)) {
        const keys = [...new Set([...Object.keys(config || {}), ...Object.keys(base)])]
        const changed = keys.filter((k) => JSON.stringify(config[k]) !== JSON.stringify(base[k]))
        const conflict = changed.filter((k) => JSON.stringify(cur[k]) !== JSON.stringify(base[k]))
        if (conflict.length) return res.json({ error: `“${conflict.join(', ')}” changed on disk (an install or another edit) — your unsaved change was kept out so nothing is overwritten. Reload to get the latest, then re-apply.`, conflict: true }, 409)
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

    // ---- restart status + self-restart -------------------------------------
    router.get('/restart-status', (req, res) => res.json(restartStatus()))
    router.post('/restart', (req, res) => {
      if (globalThis.__atelierDockRestarting) return res.json({ error: 'Already restarting.' }, 409)
      globalThis.__atelierDockRestarting = true
      logEvent('warn', 'Restarting Atelier…')
      res.json({ ok: true })
      setTimeout(async () => {
        // Under launchd (the "Start at login" service), KeepAlive relaunches us on
        // exit — so just exit and let it bring us back on the config port. launchd
        // sets XPC_SERVICE_NAME to the job label; a manual `npm run dev` has it '0'.
        const underLaunchd = !!process.env.XPC_SERVICE_NAME && process.env.XPC_SERVICE_NAME !== '0'
        if (underLaunchd) {
          ctx.log('dock · under launchd — exiting; KeepAlive will relaunch')
        } else {
          // Manual launch: re-exec ourselves after the port frees. Detached + a
          // short sleep so the child binds only once this process has exited.
          try {
            const { spawn } = await import('node:child_process')
            spawn('sh', ['-c', 'sleep 1; exec "$0" "$@"', process.execPath, ...process.argv.slice(1)], { cwd: process.cwd(), detached: true, stdio: 'ignore', env: process.env }).unref()
          } catch (e) { ctx.log('dock · restart spawn failed: ' + e.message) }
        }
        process.exit(0)
      }, 250)
    })

    // ---- service: run THIS instance as a managed launchd LaunchAgent
    // The descriptor is built live from the running process, so it always targets
    // the real folder this server runs from, and the plist is a CLEAN `node
    // server.js` (no port-killing wrapper) — at login / after a crash the port is
    // already free, so nothing needs killing, and the server reads its port from
    // atelier.config.json, so a port change in General applies on the next restart.
    // The one moment a conflict exists is install (the manual `npm run dev` still
    // holds the port) — that's handled once, deliberately, by /plists/:label/takeover
    // below. The /plists inventory of ~/Library/LaunchAgents is read-only.
    // (instanceRoot is declared above.)
    const currentInstanceDescriptor = () => {
      const node = process.execPath
      const script = path.resolve(process.argv[1] || path.join(instanceRoot, 'atelier', 'server.js'))
      // The shell discovers modules from ATELIER_ROOT (else PWD); pin all of
      // WorkingDirectory / PWD / ATELIER_ROOT to the real instance root. NB:
      // process.cwd() resolves the atelier/ symlink to the shared shell folder, so
      // it is the wrong value here — instanceRoot (= dirname(moduleDir)) is the 004
      // root next to atelier.config.json.
      const root = process.env.ATELIER_ROOT || instanceRoot
      const port = String(ctx.port)
      const nodeBin = path.dirname(node)
      // Label is keyed to the instance FOLDER, not the port — the port can change
      // in General (the server reads it from config), and a port-derived label
      // would orphan the running LaunchAgent (KeepAlive relaunches the old label)
      // and leave stray per-port plists. The folder is the stable identity.
      const slug = path.basename(root).replace(/[^A-Za-z0-9._-]/g, '-')
      return {
        label: `de.pa1nd.atelier.${slug}`,
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
    // with live launchd status, for the controllable cards. launchd is macOS-only,
    // so anywhere else this returns an empty, unsupported state — the frontend
    // polls this every 12s, and without the guard a non-darwin host would log an
    // error each time.
    router.get('/plists', async (req, res) => {
      if (process.platform !== 'darwin') return res.json({ managed: [], installed: [], unsupported: true })
      const managed = await Promise.all(managedDescriptors().map(async (d) => ({
        label: d.label, name: d.name, desc: d.desc, port: d.port || null,
        command: [expandPlistToken(d.program), ...(d.args || []).map(expandPlistToken)].join(' '),
        daemon: await agentRuntime(d.label),
      })))
      const installed = await listInstalledAgents(new Set(managed.map((m) => m.label)))
      res.json({ managed, installed })
    })

    // One-time port handoff, used right after install when the freshly-kickstarted
    // LaunchAgent is crash-looping on EADDRINUSE because THIS process (the manual
    // `npm run dev`) still holds the port. We ARE the listener, so we can't free it
    // and respond — instead spawn a DETACHED shell that outlives us: let our
    // response flush, kill ONLY the listener on the port (-sTCP:LISTEN spares
    // connected browser/WS clients), then kickstart the launchd job onto the freed
    // port. The frontend confirms the EADDRINUSE first, fires this, then reconnects.
    // MUST be registered BEFORE the generic /:action route — the shell router
    // matches in registration order with single-segment params, so the generic
    // route would otherwise swallow `takeover` as an (invalid) action.
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
    })

    // Tail a managed agent's stdout/stderr logs — the "why" behind a crash-loop.
    router.get('/plists/:label/logs', async (req, res) => {
      const desc = managedDescriptors().find((d) => d.label === req.params.label)
      if (!desc) return res.json({ ok: false, msg: `no managed plist "${req.params.label}"` }, 404)
      const { stdout, stderr } = plistLogPaths(desc)
      res.json({
        stderr: tailFile(stderr), stdout: tailFile(stdout),
        stderrPath: stderr.replace(os.homedir(), '~'), stdoutPath: stdout.replace(os.homedir(), '~'),
      })
    })

    // ---- activity log ------------------------------------------------------
    router.get('/logs', (req, res) => res.json({ logs: slot.logs }))

    // ---- system check ------------------------------------------------------
    // Does this machine have what the marketplace needs to install + run apps?
    // Checks the package managers (node/npm/git/uv/brew) and every system tool
    // the catalog's apps declare in requires (brew / uvtool), reporting version
    // + presence. PATH is widened to the usual bin dirs so a tool installed but
    // off the server's PATH (launchd/nohup) still resolves.
    router.get('/doctor', async (req, res) => {
      const { execFile } = await import('node:child_process')
      const home = process.env.HOME || ''
      const PATH = [process.env.PATH || '', '/opt/homebrew/bin', '/usr/local/bin', home && home + '/.local/bin', home && home + '/.cargo/bin'].filter(Boolean).join(':')
      const env = { ...process.env, PATH }
      const run = (cmd, args) => new Promise((resolve) => {
        let done = false
        const fin = (ok, out) => { if (!done) { done = true; resolve({ ok, out: (out || '').trim() }) } }
        try { const child = execFile(cmd, args, { timeout: 4000, env }, (err, so, se) => fin(!err, (so || '') + (se || ''))); child.on('error', () => fin(false, '')) } catch { fin(false, '') }
      })
      const ver = (s) => { const m = String(s).match(/\d+\.\d+(\.\d+)?/); return m ? m[0] : (String(s).split('\n')[0].trim() || null) }

      const MANAGERS = [
        { key: 'node', label: 'Node.js', cmd: 'node', args: ['--version'], why: 'Runs Atelier and installs npm apps', install: 'nodejs.org' },
        { key: 'npm', label: 'npm', cmd: 'npm', args: ['--version'], why: 'Installs an app’s Node dependencies', install: 'ships with Node' },
        { key: 'git', label: 'Git', cmd: 'git', args: ['--version'], why: 'Clones marketplaces', install: 'git-scm.com' },
        { key: 'uv', label: 'uv', cmd: 'uv', args: ['--version'], why: 'Installs Python deps + CLIs', install: 'astral.sh/uv' },
        { key: 'brew', label: 'Homebrew', cmd: 'brew', args: ['--version'], why: 'Installs system CLIs apps need', install: 'brew.sh' },
      ]
      const managers = []
      for (const m of MANAGERS) { const r = await run(m.cmd, m.args); managers.push({ key: m.key, label: m.label, why: m.why, install: m.install, present: r.ok, version: r.ok ? ver(r.out) : null }) }

      // Aggregate the system tools declared across the catalog's apps. The string
      // entries ("npm"/"uv") are managers (above); only {brew}/{uvtool} are tools.
      const map = new Map()
      for (const a of (slot.catalog?.apps || [])) {
        for (const r of (a.requires || [])) {
          if (!r || typeof r !== 'object') continue
          const add = (name, manager) => { const k = manager + ':' + name; if (!map.has(k)) map.set(k, { name, manager, neededBy: new Set() }); map.get(k).neededBy.add(a.name || a.id) }
          for (const n of (Array.isArray(r.brew) ? r.brew : r.brew ? [r.brew] : [])) add(String(n), 'brew')
          for (const n of (Array.isArray(r.uvtool) ? r.uvtool : r.uvtool ? [r.uvtool] : [])) add(String(n), 'uvtool')
        }
      }
      const tools = []
      for (const t of map.values()) {
        const w = await run('which', [t.name])
        let version = null
        if (w.ok) { const v = await run(t.name, ['--version']); if (v.ok) version = ver(v.out) }
        tools.push({ name: t.name, manager: t.manager, present: w.ok, path: w.ok ? w.out.split('\n')[0] : null, version, neededBy: [...t.neededBy] })
      }
      res.json({ managers, tools })
    })

    // ---- docs (rendered in-app) --------------------------------------------
    // Our own guides + the Atelier shell's reference docs (read-only, the same
    // way the catalyst chrome surfaces them). Shell docs sit next to this module
    // at ../atelier/docs and get an `atelier-` slug prefix + the 'atelier' group.
    const docsDir = path.join(moduleDir, 'docs')
    const atelierDocsDir = path.join(moduleDir, '..', 'atelier', 'docs')
    const GUIDE_ORDER = ['build-first-module', 'quickstart', 'reference']
    const ATELIER_ORDER = ['readme', 'modules', 'workspaces', 'auth']
    const docTitle = (txt, slug) => { const m = txt.match(/^#\s+(.+)$/m); return m ? m[1].trim() : slug }
    const listDir = (dir, order, group, prefix = '') => {
      let files = []
      try { files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.md')) } catch { return [] }
      return files.map((f) => {
        const stem = f.replace(/\.md$/i, '')
        let title = stem; try { title = docTitle(fs.readFileSync(path.join(dir, f), 'utf8'), stem) } catch {}
        return { slug: prefix + stem.toLowerCase(), title, group }
      }).sort((a, b) => {
        const ia = order.indexOf(a.slug.slice(prefix.length)), ib = order.indexOf(b.slug.slice(prefix.length))
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.title.localeCompare(b.title)
      })
    }
    const listDocs = () => [...listDir(docsDir, GUIDE_ORDER, 'guide'), ...listDir(atelierDocsDir, ATELIER_ORDER, 'atelier', 'atelier-')]
    const resolveDoc = (slug) => {
      const atelier = slug.startsWith('atelier-')
      const dir = atelier ? atelierDocsDir : docsDir
      const stem = atelier ? slug.slice('atelier-'.length) : slug
      let file = null
      try { file = fs.readdirSync(dir).find((f) => f.toLowerCase().endsWith('.md') && f.replace(/\.md$/i, '').toLowerCase() === stem) } catch {}
      return file ? path.join(dir, file) : null
    }
    router.get('/docs', (req, res) => res.json({ docs: listDocs() }))
    router.get('/doc', (req, res) => {
      const slug = String(req.query.slug || '')
      if (!/^[a-z0-9-]+$/i.test(slug)) return res.json({ error: 'bad slug' }, 400)
      let txt
      try { txt = fs.readFileSync(resolveDoc(slug), 'utf8') } catch { return res.json({ error: 'not found' }, 404) }
      const m = txt.match(/^#\s+(.+)$/m)
      const title = m ? m[1].trim() : slug
      const body = m ? txt.replace(m[0], '') : txt
      res.json({ slug, title, html: mdToHtml(body, { shift: 0, min: 1, max: 6 }) })
    })

    return () => { if (slot.timer) { clearInterval(slot.timer); slot.timer = null } }
  },
}
