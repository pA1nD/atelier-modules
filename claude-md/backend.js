/* claude-md — backend (extracted from claude5iq's backend.js).
 *
 * Instruments read ~/.claude/CLAUDE.md AND ~/.claude/rules/*.md live: the
 * file's top-level chapters, every rule file (with owner markers and
 * @-imports), and "ours" detection — wherever the four Karpathy rules live.
 * Rules files load into every session exactly like CLAUDE.md, so the fleet
 * convention is one owned rule file per concern. One hand:
 * install-global-claudemd — writes the four rules to
 * ~/.claude/rules/instructions.md (migrating an existing CLAUDE.md chapter
 * over verbatim, backups first). Deliberately dumb beyond that: no probing of
 * other tools, no version checks — just parse the folder + headlines. Action
 * progress streams over the shell WS.
 *
 * Pure Node builtins, no deps.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const HOME = os.homedir()
const GLOBAL_CLAUDE_MD = path.join(HOME, '.claude', 'CLAUDE.md')
const RULES_DIR = path.join(HOME, '.claude', 'rules')
const OUR_RULE_FILE = path.join(RULES_DIR, 'instructions.md')

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
// split into raw chunks KEEPING heading lines, so a chapter can be cut out verbatim.
// chunk 0 is the preamble (title null); every other chunk starts with its '# ' line.
function splitTop(txt) {
  const chunks = [{ title: null, lines: [] }]
  for (const line of (txt || '').split('\n')) {
    const m = /^#\s+(.+?)\s*$/.exec(line)
    if (m) chunks.push({ title: m[1], lines: [line] })
    else chunks[chunks.length - 1].lines.push(line)
  }
  return chunks
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

/* ── the rules folder — ~/.claude/rules/*.md, loaded by Claude Code exactly
 * like CLAUDE.md (same injection, @-imports expand the same way). One file per
 * concern; tools own theirs whole via a first-line HTML-comment marker. */
function ruleInfo(p) {
  try {
    const txt = fs.readFileSync(p, 'utf8')
    const managed = /^<!--\s*(.+?)\s*-->/.exec(txt.split('\n', 1)[0] || '')
    const h1 = /^#\s+(.+?)\s*$/m.exec(txt)
    return {
      file: path.basename(p), path: p.replace(HOME, '~'),
      title: h1 ? h1[1] : path.basename(p),
      bytes: Buffer.byteLength(txt), lines: txt.split('\n').length,
      ours: CHAPTER_TITLES.every((t) => txt.includes(t)),
      managedBy: managed ? managed[1] : null,
      imports: [...txt.matchAll(/^@(\S+)\s*$/gm)].map((m) => m[1]),
    }
  } catch { return null }
}
function rulesInfo() {
  let names = []
  try { names = fs.readdirSync(RULES_DIR).filter((f) => f.endsWith('.md')).sort() } catch {}
  return names.map((f) => ruleInfo(path.join(RULES_DIR, f))).filter(Boolean)
}

function snapshot() {
  return {
    now: Date.now(),
    claudemd: { global: claudeMdInfo(GLOBAL_CLAUDE_MD) },
    rules: rulesInfo(),
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
  'install-global-claudemd': { danger: 'destructive', label: 'Install the four rules as a rule file' },
}

function nowStamp() { return new Date().toISOString().replace('T', ' ').slice(0, 19) }

export default {
  async mountRoutes(router, ctx) {
    const slot = ctx.module(ctx.id)

    const emit = (actionId, line, stream = 'stdout') => ctx.broadcast({ type: 'action-log', actionId, stream, line })
    const done = (actionId, payload) => ctx.broadcast({ type: 'action-done', actionId, ...payload })

    const backup = (file) => {
      if (!fs.existsSync(file)) return null
      const b = `${file}.bak-${Date.now()}`
      fs.copyFileSync(file, b)
      return b
    }

    /* ── instruments ── */
    const markWatched = () => { slot.watchedAt = Date.now() }
    router.get('/snapshot', (req, res) => { markWatched(); res.json(snapshot()) })

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
        const s = snapshot()
        const k = snapKey(s)
        if (force || k !== slot.lastSnapKey) { slot.lastSnapKey = k; ctx.broadcast({ type: 'snapshot', snapshot: s }) }
      } catch {}
      finally { slot.watchBusy = false }
    }
    const tickNow = () => { tick(true).catch(() => {}) }
    if (slot.watchTimer) clearInterval(slot.watchTimer)   // an async mountRoutes' teardown is dropped by the shell — never stack watchers
    slot.watchTimer = setInterval(() => { tick().catch(() => {}) }, 5000)


    router.get('/templates/global', (req, res) => res.json({ which: 'global', text: GLOBAL_TEMPLATE }))

    /* ── document readers — the frontend's click-to-read pane ── */
    router.get('/chapter/:i', (req, res) => {
      let txt = ''
      try { txt = fs.readFileSync(GLOBAL_CLAUDE_MD, 'utf8') } catch {}
      const s = topSections(txt)[Number(req.params.i)]
      if (!s) return res.json({ error: 'no such chapter' }, 404)
      res.json({ title: s.title, path: GLOBAL_CLAUDE_MD.replace(HOME, '~'), text: (`# ${s.title}\n` + s.body).replace(/\s+$/, ''), raw: txt })
    })
    router.get('/rule/:file', (req, res) => {
      const file = path.basename(req.params.file)   // no traversal — rules dir only
      if (!file.endsWith('.md')) return res.json({ error: 'bad file' }, 400)
      try {
        const p = path.join(RULES_DIR, file)
        const txt = fs.readFileSync(p, 'utf8')
        res.json({ file, path: p.replace(HOME, '~'), text: txt, raw: txt })
      } catch { return res.json({ error: 'not found' }, 404) }
    })

    /* ── hands ── */
    router.post('/action/:id', async (req, res) => {
      const id = req.params.id
      const def = ACTIONS[id]
      if (!def) return res.json({ error: 'unknown action' }, 404)
      const body = await req.json().catch(() => ({}))
      const confirmed = body && body.confirm === true

      // Destructive actions (these write files under ~/.claude/) must be explicitly confirmed.
      if (def.danger === 'destructive' && !confirmed) {
        return res.json({ needsConfirm: true, danger: def.danger, exists: fs.existsSync(GLOBAL_CLAUDE_MD), info: claudeMdInfo(GLOBAL_CLAUDE_MD) })
      }

      switch (id) {
        case 'install-global-claudemd': {
          // The four rules live in their OWN rule file (~/.claude/rules/instructions.md) —
          // loaded exactly like CLAUDE.md. If a CLAUDE.md chapter already carries them,
          // it's MOVED over verbatim (the user's customized text wins over the template).
          const already = rulesInfo().find((r) => r.ours)
          if (already) { emit(id, `these four rules are already in ${already.path} — nothing to do`, 'ok'); done(id, { ok: true }); tickNow(); return res.json({ ok: true }) }
          fs.mkdirSync(RULES_DIR, { recursive: true })
          let body = GLOBAL_TEMPLATE.trim() + '\n'
          let txt = ''
          try { txt = fs.readFileSync(GLOBAL_CLAUDE_MD, 'utf8') } catch {}
          const chunks = splitTop(txt)
          const oursChunk = chunks.find((c) => c.title && CHAPTER_TITLES.every((t) => c.lines.join('\n').includes(t)))
          if (oursChunk) {
            const b = backup(GLOBAL_CLAUDE_MD); if (b) emit(id, `backed up CLAUDE.md → ${path.basename(b)}`, 'stdout')
            body = oursChunk.lines.join('\n').replace(/\s+$/, '') + '\n'
            const rest = chunks.filter((c) => c !== oursChunk).map((c) => c.lines.join('\n')).join('\n')
              .replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\s+$/, '')
            fs.writeFileSync(GLOBAL_CLAUDE_MD, rest ? rest + '\n' : '')
            emit(id, `moved your "# ${oursChunk.title}" chapter out of CLAUDE.md, verbatim`, 'stdout')
          }
          if (fs.existsSync(OUR_RULE_FILE)) { const b2 = backup(OUR_RULE_FILE); if (b2) emit(id, `backed up existing ${path.basename(OUR_RULE_FILE)} → ${path.basename(b2)}`, 'stdout') }
          fs.writeFileSync(OUR_RULE_FILE, body)
          emit(id, `✓ the four rules now live in ${OUR_RULE_FILE.replace(HOME, '~')} @ ${nowStamp()}`, 'ok')
          done(id, { ok: true })
          tickNow()
          return res.json({ ok: true })
        }
        default:
          return res.json({ error: 'unhandled' }, 500)
      }
    })

    ctx.log('claude-md · mounted')

    return () => {
      if (slot.watchTimer) { clearInterval(slot.watchTimer); slot.watchTimer = null }
    }
  },
}
