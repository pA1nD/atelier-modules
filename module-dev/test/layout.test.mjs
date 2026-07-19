import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fillTemplate, claudeMdState, installClaudeMd, suggestDirs, isWatched, lineDiff } from '../backend.js'

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'module-dev-test-'))

test('fillTemplate replaces every placeholder', () => {
  const out = fillTemplate('a {{INSTANCE}} b {{MODULES}} c {{CHROMES}} d {{PORT}} e {{INSTANCE}}',
    { INSTANCE: '~/x', MODULES: '~/m', CHROMES: '~/c', PORT: '1844' })
  assert.equal(out, 'a ~/x b ~/m c ~/c d 1844 e ~/x')
  assert.ok(!out.includes('{{'))
})

test('claudeMdState: none / present / ours', () => {
  const d = tmp()
  const f = path.join(d, 'CLAUDE.md')
  assert.equal(claudeMdState(f), 'none')
  fs.writeFileSync(f, '# My own rules\n')
  assert.equal(claudeMdState(f), 'present')
  fs.writeFileSync(f, '<!-- atelier-module-dev: x v1 -->\n# Ours\n')
  assert.equal(claudeMdState(f), 'ours')
})

test('installClaudeMd writes fresh, appends with backup, no-ops on ours', () => {
  const d = tmp()
  const f = path.join(d, 'CLAUDE.md')
  const block = '<!-- atelier-module-dev: t v1 -->\n# Playbook\n'

  const r1 = installClaudeMd(f, block)
  assert.equal(r1.mode, 'written')
  assert.equal(fs.readFileSync(f, 'utf8'), block)

  // ours → no-op, file untouched
  const r2 = installClaudeMd(f, block)
  assert.equal(r2.mode, 'already')
  assert.equal(fs.readFileSync(f, 'utf8'), block)

  // a foreign file → backed up, then appended — never clobbered
  const g = path.join(d, 'other', 'CLAUDE.md')
  fs.mkdirSync(path.dirname(g), { recursive: true })
  fs.writeFileSync(g, '# Existing rules\n')
  const r3 = installClaudeMd(g, block)
  assert.equal(r3.mode, 'appended')
  assert.ok(r3.backup && fs.existsSync(r3.backup))
  assert.equal(fs.readFileSync(r3.backup, 'utf8'), '# Existing rules\n')
  const txt = fs.readFileSync(g, 'utf8')
  assert.ok(txt.startsWith('# Existing rules\n'))
  assert.ok(txt.includes('# Playbook'))
})

test('suggestDirs: numbered siblings, installPath-independent', () => {
  const s = suggestDirs('/home/u/my-studio')
  assert.equal(s.modules, '/home/u/002-my-studio-modules')
  assert.equal(s.chromes, '/home/u/001-my-studio-chromes')
})

test('drift: stale detection and block refresh preserve user content', () => {
  const d = tmp()
  const f = path.join(d, 'CLAUDE.md')
  const v1 = '<!-- atelier-module-dev: t v1 -->\n# Playbook for /old/path\n'
  const v2 = '<!-- atelier-module-dev: t v1 -->\n# Playbook for /new/path\n'

  // whole-file ours: v1 current → 'ours'; against v2 → 'ours-stale'; refresh overwrites
  installClaudeMd(f, v1)
  assert.equal(claudeMdState(f, v1), 'ours')
  assert.equal(claudeMdState(f, v2), 'ours-stale')
  const r = installClaudeMd(f, v2)
  assert.equal(r.mode, 'refreshed')
  assert.ok(fs.existsSync(r.backup))
  assert.equal(fs.readFileSync(f, 'utf8'), v2)
  assert.equal(installClaudeMd(f, v2).mode, 'already')

  // appended-to-yours: refresh replaces only our block, user rules stay on top
  const g = path.join(d, 'appended', 'CLAUDE.md')
  fs.mkdirSync(path.dirname(g), { recursive: true })
  fs.writeFileSync(g, '# My rules\n')
  installClaudeMd(g, v1)
  assert.equal(claudeMdState(g, v2), 'ours-stale')
  const r2 = installClaudeMd(g, v2)
  assert.equal(r2.mode, 'refreshed')
  const txt = fs.readFileSync(g, 'utf8')
  assert.ok(txt.startsWith('# My rules\n'))
  assert.ok(txt.includes('/new/path') && !txt.includes('/old/path'))
  assert.equal(claudeMdState(g, v2), 'ours')
})

test('isWatched: recent heartbeat keeps the watcher awake, silence idles it', () => {
  const now = 1000000
  assert.equal(isWatched(now - 1000, now), true)
  assert.equal(isWatched(now - 90000, now), true)
  assert.equal(isWatched(now - 90001, now), false)
  assert.equal(isWatched(undefined, now), false)
})

test('lineDiff: adds, removals, common core', () => {
  const rows = lineDiff('a\nb\nc', 'a\nX\nc')
  assert.deepEqual(rows.map(r => r.t + r.s), [' a', '-b', '+X', ' c'])
  assert.ok(lineDiff('', 'one\ntwo').every(r => r.t === '+' || r.s === ''))
  assert.deepEqual(lineDiff('same', 'same'), [{ t: ' ', s: 'same' }])
})
