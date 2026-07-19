/* claude-md — backend (extracted from claude5iq's backend.js).
 *
 * Instruments read ~/.claude/CLAUDE.md live: its top-level chapters (with
 * "ours" detection — the section carrying all four Karpathy rules), size, and
 * whether the Horse Browser playbook @-import is current. Hands:
 * install-global-claudemd — APPENDS the four-rule block (never clobbers; the
 * file is backed up first), and install-browser-config — re-applies the
 * horse-browser claude-md.sh import. Every action streams over the shell WS.
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
const GLOBAL_CLAUDE_MD = path.join(HOME, '.claude', 'CLAUDE.md')

/* ── reading the file ─────────────────────────────────────────────────────── */
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

/* ── the Horse Browser playbooks import (shares this file) ─────────────────
 * horse-browser ships claude-md.sh in its package root; resolve it from the
 * launcher on PATH (through the npm bin symlink or a dev-repo symlink). */
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
function hbClaudeMdScript() {
  try {
    const bin = findOnPath('horse-browser'); if (!bin) return null
    const p = path.join(path.dirname(path.dirname(fs.realpathSync(bin))), 'claude-md.sh')
    return fs.existsSync(p) ? p : null
  } catch { return null }
}
async function browserConfigInfo() {
  const script = hbClaudeMdScript()
  if (!script) return { scriptAvailable: false, upToDate: null }
  // `claude-md.sh check` exits 0 when the import block + symlink are current, non-zero when drifted.
  try { await execFileP('bash', [script, 'check'], { timeout: 5000 }); return { scriptAvailable: true, upToDate: true } }
  catch { return { scriptAvailable: true, upToDate: false } }
}
// non-blocking cache: the frequent snapshot poll must never wait on a subprocess.
let _cfgVal = null, _cfgAt = 0, _cfgBusy = false
function cfgBust() { _cfgAt = 0 }
async function cachedConfigInfo() {
  if ((!_cfgVal || Date.now() - _cfgAt > 90000) && !_cfgBusy) {
    _cfgBusy = true
    Promise.resolve().then(browserConfigInfo).then((v) => { _cfgVal = v; _cfgAt = Date.now() }).catch(() => {}).finally(() => { _cfgBusy = false })
  }
  return _cfgVal
}

async function snapshot() {
  return {
    now: Date.now(),
    claudemd: { global: claudeMdInfo(GLOBAL_CLAUDE_MD) },
    versions: { 'browser-config': await cachedConfigInfo() },
  }
}

/* ──────────────────────────── the template ───────────────────────────────── */
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

/* ──────────────────────────── actions ────────────────────────────────────── */
// A registry the frontend mirrors. `danger`: safe | network | destructive.
const ACTIONS = {
  'install-global-claudemd': { danger: 'destructive', label: 'Add the four rules to CLAUDE.md' },
  'install-browser-config':  { danger: 'destructive', label: 'Import the browser playbooks' },
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

    const backup = (file) => {
      if (!fs.existsSync(file)) return null
      const b = `${file}.bak-${Date.now()}`
      fs.copyFileSync(file, b)
      return b
    }

    /* ── instruments ── */
    const markWatched = () => { slot.watchedAt = Date.now() }
    router.get('/snapshot', async (req, res) => { markWatched(); res.json(await snapshot()) })

    /* ── the live push — the shell WS is the realtime channel, so the poll lives
     *    HERE, server-side, once for all viewers: recompute every few seconds,
     *    broadcast a full snapshot frame ONLY on change. Clients fetch once on
     *    mount, then just listen; an idle machine sends no frames. */
    const snapKey = (s) => JSON.stringify(({ ...s, now: 0 }))
    const tick = async (force = false) => {
      if (!force && Date.now() - (slot.watchedAt || 0) > 90000) return   // nobody watching → idle (the 45s visible re-GET stamps us awake)
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


    router.get('/templates/global', (req, res) => res.json({ which: 'global', text: GLOBAL_TEMPLATE }))

    /* ── hands ── */
    router.post('/action/:id', async (req, res) => {
      const id = req.params.id
      const def = ACTIONS[id]
      if (!def) return res.json({ error: 'unknown action' }, 404)
      const body = await req.json().catch(() => ({}))
      const confirmed = body && body.confirm === true

      // Destructive actions (these write ~/.claude/CLAUDE.md) must be explicitly confirmed.
      if (def.danger === 'destructive' && !confirmed) {
        return res.json({ needsConfirm: true, danger: def.danger, exists: fs.existsSync(GLOBAL_CLAUDE_MD), info: claudeMdInfo(GLOBAL_CLAUDE_MD) })
      }

      switch (id) {
        case 'install-global-claudemd': {
          // Append the Karpathy block (the whole chapter) — never clobber the rest of the file.
          const info = claudeMdInfo(GLOBAL_CLAUDE_MD)
          if (info.hasOurs) { emit(id, 'these four rules are already in your CLAUDE.md — nothing to do', 'ok'); done(id, { ok: true }); tickNow(); return res.json({ ok: true }) }
          fs.mkdirSync(path.dirname(GLOBAL_CLAUDE_MD), { recursive: true })
          let existing = ''
          try { existing = fs.readFileSync(GLOBAL_CLAUDE_MD, 'utf8') } catch {}
          if (existing.trim()) { const b = backup(GLOBAL_CLAUDE_MD); if (b) emit(id, `backed up existing CLAUDE.md → ${path.basename(b)}`, 'stdout') }
          const next = existing.trim() ? existing.replace(/\n*$/, '') + '\n\n' + GLOBAL_TEMPLATE.trim() + '\n' : GLOBAL_TEMPLATE.trim() + '\n'
          fs.writeFileSync(GLOBAL_CLAUDE_MD, next)
          emit(id, `✓ added the four rules to ${GLOBAL_CLAUDE_MD.replace(HOME, '~')} @ ${nowStamp()}`, 'ok')
          done(id, { ok: true })
          tickNow()
          return res.json({ ok: true })
        }
        case 'install-browser-config': {
          // claude-md.sh writes the browser-playbook @-import into ~/.claude/CLAUDE.md
          // (idempotent, backs up, re-points the version-agnostic symlink). `apply` = (re)install.
          const script = hbClaudeMdScript()
          if (!script) { emit(id, 'claude-md.sh not found — install horse-browser first (the Horse Browser module)', 'stderr'); done(id, { ok: false }); tickNow(); return res.json({ ok: false }) }
          const r = await runStreaming(id, 'bash', [script, 'apply'])
          cfgBust(); tickNow()
          return res.json(r)
        }
        default:
          return res.json({ error: 'unhandled' }, 500)
      }
    })

    ctx.log('claude-md · mounted')

    // Teardown: kill any in-flight children on hot-reload + exit.
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
