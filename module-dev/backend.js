// module-dev — the three-folder layout for serious agent development, installed.
//
// Teaches and sets up the split this collection is built with:
//   instance folder  — runs the instance (config, .env, shell). The wiring.
//   modules folder   — every module's working copy. The workshop agents edit.
//   chromes folder   — the themes. Cross-cutting, hands off from module tasks.
// The instance and chromes folders get CLAUDE.md playbooks (shipped as
// templates, filled
// with THIS instance's real paths, appended with a backup when a file already
// exists — never clobbered), and atelier.config.json gets the installPath
// wiring so `atelier add` follows the layout automatically. A migration scan
// lists what still lives in the wrong folder, with a copyable agent brief.
//
// Pure Node builtins, no deps.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const MARKER = 'atelier-module-dev:'   // every template's first line carries it

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return null } }
const exists = (p) => { try { fs.accessSync(p); return true } catch { return false } }

// Read a module's `export const meta` straight from source — never executes code.
function parseMeta(file) {
  try {
    const src = fs.readFileSync(file, 'utf8')
    const m = src.match(/export\s+const\s+meta\s*=\s*\{([\s\S]*?)\}/)
    if (!m) return {}
    return { isChrome: /\bisChrome\s*:\s*true\b/.test(m[1]) }
  } catch { return {} }
}

/* ── pure helpers (exported for the test suite) ────────────────────────────── */

export function fillTemplate(tpl, vars) {
  return tpl.replace(/\{\{(INSTANCE|MODULES|CHROMES|PORT)\}\}/g, (_, k) => String(vars[k] ?? ''))
}

// 'ours' — our block present and it matches what we'd write today ·
// 'ours-stale' — our block present but the filled template drifted (the
// instance's paths/port changed, or a newer template shipped) · 'present' —
// a CLAUDE.md exists that isn't ours · 'none'. Our block always runs from the
// marker line to the end of the file (we only ever write or append it there).
export function claudeMdState(file, expected) {
  let txt = null
  try { txt = fs.readFileSync(file, 'utf8') } catch { return 'none' }
  const i = txt.indexOf(MARKER)
  if (i === -1) return 'present'
  if (expected == null) return 'ours'
  const start = txt.lastIndexOf('\n', i) + 1
  return txt.slice(start).trim() === expected.trim() ? 'ours' : 'ours-stale'
}

// Line diff (LCS): rows of { t: ' '|'+'|'-', s } — '+' = only in the playbook,
// '-' = only in the current file. Small inputs (a few hundred lines), so the
// O(n·m) table is fine.
export function lineDiff(aText, bText) {
  const a = String(aText ?? '').split('\n'), b = String(bText ?? '').split('\n')
  const n = a.length, m = b.length
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
  const rows = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) { rows.push({ t: ' ', s: a[i] }); i++; j++ }
    else if (L[i + 1][j] >= L[i][j + 1]) { rows.push({ t: '-', s: a[i] }); i++ }
    else { rows.push({ t: '+', s: b[j] }); j++ }
  }
  while (i < n) rows.push({ t: '-', s: a[i++] })
  while (j < m) rows.push({ t: '+', s: b[j++] })
  return rows
}

// Aligned side-by-side diff. Lines matching after whitespace normalization
// count as SAME (a re-wrap is not a change); runs of removed/added lines are
// paired in order into single 'mod' rows with word-level segments, so a
// reworded line reads as one change, not a delete plus an insert.
// Rows: { k: 'same'|'mod'|'del'|'add', l, r, lseg?, rseg? } — segs are
// [text, changed] pairs.
const normLine = (s) => String(s).replace(/\s+/g, ' ').trim()

function wordSegs(a, b) {
  const at = String(a).split(/(\s+)/), bt = String(b).split(/(\s+)/)
  const n = at.length, m = bt.length
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    L[i][j] = at[i] === bt[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
  const ls = [], rs = []
  const push = (arr, text, changed) => {
    if (!text) return
    const last = arr[arr.length - 1]
    if (last && last[1] === changed) last[0] += text
    else arr.push([text, changed])
  }
  let i = 0, j = 0
  while (i < n && j < m) {
    if (at[i] === bt[j]) { push(ls, at[i], false); push(rs, bt[j], false); i++; j++ }
    else if (L[i + 1][j] >= L[i][j + 1]) { push(ls, at[i], true); i++ }
    else { push(rs, bt[j], true); j++ }
  }
  while (i < n) { push(ls, at[i], true); i++ }
  while (j < m) { push(rs, bt[j], true); j++ }
  return { lseg: ls, rseg: rs }
}

export function alignDiff(aText, bText) {
  const a = String(aText ?? '').split('\n'), b = String(bText ?? '').split('\n')
  const an = a.map(normLine), bn = b.map(normLine)
  const n = a.length, m = b.length
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    L[i][j] = an[i] === bn[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
  const rows = []
  let i = 0, j = 0
  const flush = (dels, adds) => {
    const k = Math.min(dels.length, adds.length)
    for (let x = 0; x < k; x++) rows.push({ k: 'mod', l: dels[x], r: adds[x], ...wordSegs(dels[x], adds[x]) })
    for (let x = k; x < dels.length; x++) rows.push({ k: 'del', l: dels[x], r: null })
    for (let x = k; x < adds.length; x++) rows.push({ k: 'add', l: null, r: adds[x] })
  }
  let dels = [], adds = []
  while (i < n && j < m) {
    if (an[i] === bn[j]) { flush(dels, adds); dels = []; adds = []; rows.push({ k: 'same', l: a[i], r: b[j] }); i++; j++ }
    else if (L[i + 1][j] >= L[i][j + 1]) { dels.push(a[i]); i++ }
    else { adds.push(b[j]); j++ }
  }
  while (i < n) dels.push(a[i++])
  while (j < m) adds.push(b[j++])
  flush(dels, adds)
  return rows
}

// Watch gate: the backend scans only while some tab marked itself watching
// recently (GET /snapshot on mount + a 45s presence heartbeat while visible).
// An unwatched instance's timer still fires, but does no work at all.
export function isWatched(watchedAt, now, ttlMs = 90000) {
  return now - (watchedAt || 0) <= ttlMs
}

// Suggested default folders: numbered siblings of the instance, so they sort
// next to it in a sensible order — 001 chromes (rarely touched), 002 modules
// (the workshop). Only a suggestion: installPath, when set, always wins.
export function suggestDirs(instanceRoot) {
  const base = path.basename(instanceRoot)
  const parent = path.dirname(instanceRoot)
  return { modules: path.join(parent, '002-' + base + '-modules'), chromes: path.join(parent, '001-' + base + '-chromes') }
}

// none → write · present → back up, then append our block · ours-current →
// no-op · ours-stale → back up, then REPLACE our block (marker line → EOF)
// with the freshly filled one — anything of yours above it stays untouched.
export function installClaudeMd(file, content) {
  let txt = null
  try { txt = fs.readFileSync(file, 'utf8') } catch {}
  const stamp = () => file + '.bak-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  if (txt == null) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, content)
    return { mode: 'written', backup: null }
  }
  const i = txt.indexOf(MARKER)
  if (i === -1) {
    const backup = stamp()
    fs.copyFileSync(file, backup)
    fs.appendFileSync(file, '\n\n' + content)
    return { mode: 'appended', backup }
  }
  const start = txt.lastIndexOf('\n', i) + 1
  if (txt.slice(start).trim() === content.trim()) return { mode: 'already', backup: null }
  const backup = stamp()
  fs.copyFileSync(file, backup)
  fs.writeFileSync(file, txt.slice(0, start) + content)
  return { mode: 'refreshed', backup }
}

export default {
  // Synchronous on purpose: the shell doesn't await mountRoutes, so an async
  // one would get its teardown silently dropped.
  mountRoutes(router, ctx) {
    const slot = ctx.module(ctx.id)
    const home = process.env.HOME || os.homedir()
    // The instance root, the way the shell's own resolveRoot finds it — NOT
    // from this module's folder (a path-mount can live anywhere).
    const instanceRoot = process.env.ATELIER_ROOT
      ? path.resolve(process.env.ATELIER_ROOT)
      : path.resolve(process.env.PWD || path.dirname(process.argv[1] || '.'), '..')
    const configFile = path.join(instanceRoot, 'atelier.config.json')

    const expand = (p) => (typeof p === 'string' && /^~(?=\/|$)/.test(p) ? home + p.slice(1) : p)
    const tilde = (p) => (typeof p === 'string' && p.startsWith(home + '/') ? '~' + p.slice(home.length) : p)
    const inside = (dir, base) => { try { const d = path.resolve(dir); const b = path.resolve(base); return d === b || d.startsWith(b + path.sep) } catch { return false } }

    const template = (name) => { try { return fs.readFileSync(path.join(HERE, 'templates', name + '.md'), 'utf8') } catch { return null } }
    const vars = (modulesDir, chromesDir) => ({ INSTANCE: tilde(instanceRoot), MODULES: tilde(modulesDir || ''), CHROMES: tilde(chromesDir || ''), PORT: String(ctx.port) })

    // Where the modules / chromes folders are (configured via installPath) or
    // would be (suggested siblings of the instance folder).
    const resolvePaths = () => {
      const cfg = readJson(configFile) || {}
      const ip = cfg.installPath || {}
      const sug = suggestDirs(instanceRoot)
      const modules = ip.modules ? path.resolve(expand(ip.modules)) : sug.modules
      const chromes = ip.chromes ? path.resolve(expand(ip.chromes)) : sug.chromes
      return { cfg, modules, chromes, configured: { modules: !!ip.modules, chromes: !!ip.chromes } }
    }

    // Every config module entry resolved to a folder + where it SHOULD live.
    const classifyMounts = (cfg, modulesDir, chromesDir) => {
      const items = []
      const consider = (entry, ws) => {
        const p = typeof entry === 'string' ? entry.replace(/^!/, '') : (entry && entry.path) || null
        if (!p) return
        const id = p.split('/').filter(Boolean).pop()
        const dir = /^(\/|~)/.test(p) ? expand(p) : path.resolve(instanceRoot, ws === 'global' ? '' : '$' + ws, p)
        if (id === ctx.id) { items.push({ id, ws, dir: tilde(dir), kind: 'ok' }); return }
        const isChrome = !!parseMeta(path.join(dir, 'frontend.jsx')).isChrome
        let kind = 'ok'
        if (inside(dir, path.join(instanceRoot, 'atelier'))) kind = 'ok'            // the shell's own
        else if (inside(dir, instanceRoot)) kind = isChrome ? 'to-chromes' : 'to-modules'   // lives INSIDE the instance
        else if (isChrome && !inside(dir, chromesDir)) kind = 'to-chromes'
        else if (!isChrome && !inside(dir, modulesDir) && !inside(dir, chromesDir)) kind = 'external'
        items.push({ id, ws, dir: tilde(dir), isChrome, kind })
      }
      for (const m of (cfg.modules || [])) {
        if (m && typeof m === 'object' && Array.isArray(m.modules) && m.workspace) for (const s of m.modules) consider(s, String(m.workspace).replace(/^!/, ''))
        else if (m && typeof m === 'object' && m.workspace) { /* include-all block */ }
        else consider(m, 'global')
      }
      return items
    }

    const snapshot = () => {
      const { cfg, modules, chromes, configured } = resolvePaths()
      const mounts = classifyMounts(cfg, modules, chromes)
      const expected = (name) => { const t = template(name); return t ? fillTemplate(t, vars(modules, chromes)) : null }
      const mdState = (dir, name) => claudeMdState(path.join(dir, 'CLAUDE.md'), expected(name))
      const s = {
        now: Date.now(),
        lastTickAt: slot.lastTickAt || 0,
        instanceRoot: tilde(instanceRoot),
        port: ctx.port,
        paths: {
          instance: { path: tilde(instanceRoot), exists: true, claudemd: mdState(instanceRoot, 'instance') },
          modules: { path: tilde(modules), exists: exists(modules), configured: configured.modules },   // just a container — no CLAUDE.md; work happens in its subfolders
          chromes: { path: tilde(chromes), exists: exists(chromes), configured: configured.chromes, claudemd: exists(chromes) ? mdState(chromes, 'chromes') : 'none' },
        },
        migration: {
          toModules: mounts.filter((m) => m.kind === 'to-modules'),
          toChromes: mounts.filter((m) => m.kind === 'to-chromes'),
          external: mounts.filter((m) => m.kind === 'external'),
          ok: mounts.filter((m) => m.kind === 'ok').length,
        },
      }
      s.done = {
        folders: s.paths.modules.exists && s.paths.chromes.exists,
        installPath: configured.modules && configured.chromes,
        mdInstance: ['ours', 'present'].includes(s.paths.instance.claudemd),
        mdChromes: ['ours', 'present'].includes(s.paths.chromes.claudemd),
        migration: s.migration.toModules.length + s.migration.toChromes.length === 0,
      }
      return s
    }

    // The snapshot GET is also the presence heartbeat: the frontend re-GETs it
    // every 45s while visible (single-flight, fixed cadence), which stamps the
    // watcher awake AND heals any frame the WS lost across a reconnect.
    const markWatched = () => { slot.watchedAt = Date.now() }
    router.get('/snapshot', (req, res) => { markWatched(); res.json(snapshot()) })

    /* live push — one server-side watcher for all viewers: tick, diff,
     * broadcast only on change; actions force a tick. */
    const snapKey = (s) => JSON.stringify({ ...s, now: 0 })
    const tick = (force = false) => {
      if (!force && !isWatched(slot.watchedAt, Date.now())) return   // nobody watching → idle
      slot.lastTickAt = Date.now()
      try {
        const s = snapshot()
        const k = snapKey(s)
        if (force || k !== slot.lastSnapKey) { slot.lastSnapKey = k; ctx.broadcast({ type: 'snapshot', snapshot: s }) }
      } catch {}
    }
    const tickNow = () => tick(true)
    if (slot.watchTimer) clearInterval(slot.watchTimer)   // never stack watchers across reloads
    slot.watchTimer = setInterval(() => tick(), 5000)

    // Validate a proposed folder path: absolute (or ~), outside the instance
    // folder, and not nested inside its counterpart.
    const checkDir = (raw, otherAbs) => {
      const p = expand(String(raw || '').trim())
      if (!p || !path.isAbsolute(p)) return { error: 'Use an absolute path (or ~/…).' }
      const abs = path.resolve(p)
      if (inside(abs, instanceRoot)) return { error: 'Keep it OUTSIDE the instance folder — that separation is the point.' }
      if (otherAbs && (inside(abs, otherAbs) || inside(otherAbs, abs))) return { error: 'The modules and chromes folders must not contain each other.' }
      return { abs }
    }

    // Create both folders (mkdir -p — a no-op when they exist).
    router.post('/action/folders', async (req, res) => {
      const b = await req.json().catch(() => ({}))
      const cur = resolvePaths()
      const mod = checkDir(b.modules || tilde(cur.modules), null)
      if (mod.error) return res.json({ error: 'Modules folder: ' + mod.error }, 400)
      const chr = checkDir(b.chromes || tilde(cur.chromes), mod.abs)
      if (chr.error) return res.json({ error: 'Chromes folder: ' + chr.error }, 400)
      try {
        fs.mkdirSync(mod.abs, { recursive: true })
        fs.mkdirSync(chr.abs, { recursive: true })
        ctx.log(`module-dev · folders ready: ${tilde(mod.abs)} · ${tilde(chr.abs)}`)
        res.json({ ok: true, modules: tilde(mod.abs), chromes: tilde(chr.abs) })
      } catch (e) { res.json({ error: e.message }, 500) }
      tickNow()
    })

    // Wire installPath in atelier.config.json (atomic read-modify-write; paths
    // stored ~-relative so the config stays portable).
    router.post('/action/installpath', async (req, res) => {
      const b = await req.json().catch(() => ({}))
      const cur = resolvePaths()
      const mod = checkDir(b.modules || tilde(cur.modules), null)
      if (mod.error) return res.json({ error: 'Modules folder: ' + mod.error }, 400)
      const chr = checkDir(b.chromes || tilde(cur.chromes), mod.abs)
      if (chr.error) return res.json({ error: 'Chromes folder: ' + chr.error }, 400)
      try {
        const cfg = readJson(configFile) || {}
        cfg.installPath = { ...(cfg.installPath || {}), modules: tilde(mod.abs), chromes: tilde(chr.abs) }
        const tmp = configFile + '.tmp'
        fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n')
        fs.renameSync(tmp, configFile)
        ctx.log('module-dev · installPath wired')
        res.json({ ok: true })
      } catch (e) { res.json({ error: e.message }, 500) }
      tickNow()
    })

    // Install one folder's CLAUDE.md playbook — filled with THIS instance's
    // real paths; an existing file is backed up and appended to, never clobbered.
    router.post('/action/claudemd', async (req, res) => {
      const target = String((await req.json().catch(() => ({}))).target || '')
      if (!['instance', 'chromes'].includes(target)) return res.json({ error: 'target must be instance|chromes' }, 400)
      const { modules, chromes } = resolvePaths()
      const dir = target === 'instance' ? instanceRoot : chromes
      if (!exists(dir)) return res.json({ error: 'That folder doesn’t exist yet — create the folders first.' }, 400)
      const tpl = template(target)
      if (!tpl) return res.json({ error: 'template missing from the module' }, 500)
      try {
        const r = installClaudeMd(path.join(dir, 'CLAUDE.md'), fillTemplate(tpl, vars(modules, chromes)))
        ctx.log(`module-dev · CLAUDE.md ${r.mode} in ${tilde(dir)}${r.backup ? ` (backup: ${path.basename(r.backup)})` : ''}`)
        res.json({ ok: true, ...r, backup: r.backup ? tilde(r.backup) : null })
      } catch (e) { res.json({ error: e.message }, 500) }
      tickNow()
    })

    // What would change: the current file (our block only, when ours) vs the
    // freshly filled template — '-' rows are yours, '+' rows are the playbook's.
    router.get('/claudemd-diff/:target', (req, res) => {
      const target = String(req.params.target || '')
      if (!['instance', 'chromes'].includes(target)) return res.json({ error: 'target must be instance|chromes' }, 404)
      const { modules, chromes } = resolvePaths()
      const dir = target === 'instance' ? instanceRoot : chromes
      const tpl = template(target)
      if (!tpl) return res.json({ error: 'template missing' }, 500)
      const expected = fillTemplate(tpl, vars(modules, chromes))
      let cur = ''
      try { cur = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8') } catch {}
      const i = cur.indexOf(MARKER)
      const base = i !== -1 ? cur.slice(cur.lastIndexOf('\n', i) + 1) : cur
      res.json({ target, state: claudeMdState(path.join(dir, 'CLAUDE.md'), expected), rows: alignDiff(base, expected) })
    })

    // Preview a filled template (the UI shows what would be written).
    router.get('/template/:name', (req, res) => {
      const name = String(req.params.name || '')
      if (!['instance', 'chromes'].includes(name)) return res.json({ error: 'unknown template' }, 404)
      const { modules, chromes } = resolvePaths()
      const tpl = template(name)
      if (!tpl) return res.json({ error: 'template missing' }, 500)
      res.json({ name, content: fillTemplate(tpl, vars(modules, chromes)) })
    })

    // The migration brief — a complete, copyable playbook for an agent to move
    // what still lives in the wrong folder. Moving folders on a running
    // instance is deliberate work, so it's handed to an agent, not a button.
    router.get('/brief', (req, res) => {
      const s = snapshot()
      const items = [...s.migration.toModules.map((m) => ({ ...m, dest: s.paths.modules.path })),
                     ...s.migration.toChromes.map((m) => ({ ...m, dest: s.paths.chromes.path }))]
      const lines = items.map((m) => `- \`${m.id}\` (workspace \`${m.ws}\`) — currently \`${m.dir}\` → move into \`${m.dest}/\``)
      res.json({ brief: `# Migrate this Atelier to the three-folder layout

Instance: \`${s.instanceRoot}\` · modules folder: \`${s.paths.modules.path}\` · chromes folder: \`${s.paths.chromes.path}\`.
Config: \`${s.instanceRoot}/atelier.config.json\` — the single wiring point. Edit it carefully (valid JSON, one change at a time); the shell reloads on every save.

## Modules to move
${lines.length ? lines.join('\n') : '- nothing — the layout is already clean'}

## Per module, in this order
1. Move the folder: \`mv <current-dir> <destination>/\` (keep the folder name — it is the module id; its \`data/\` runtime state travels with it).
2. Update its entry in \`atelier.config.json\`: replace the old entry (a bare name or old path) with the new path (\`~\`-relative), in the SAME workspace block it was in.
3. Reload the module's page and hit one of its API routes — both must work before you touch the next module.

## Verify when done
- Every moved module renders and its \`/api/<ws>/<id>/...\` routes answer.
- \`atelier.config.json\` has no leftover entries pointing into the instance folder.
- The module-dev checklist shows the migration step green.

Rules: never edit anything inside \`${s.instanceRoot}/atelier/\`; move ONE module at a time; if a module breaks after its move, put the folder back and restore its old config entry before continuing.` })
    })

    ctx.log('module-dev · layout module mounted')

    return () => { if (slot.watchTimer) { clearInterval(slot.watchTimer); slot.watchTimer = null } }
  },
}
