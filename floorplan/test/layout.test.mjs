import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fillTemplate, claudeMdState, installClaudeMd } from '../backend.js'

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'floorplan-test-'))

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
  fs.writeFileSync(f, '<!-- atelier-floorplan: x v1 -->\n# Ours\n')
  assert.equal(claudeMdState(f), 'ours')
})

test('installClaudeMd writes fresh, appends with backup, no-ops on ours', () => {
  const d = tmp()
  const f = path.join(d, 'CLAUDE.md')
  const block = '<!-- atelier-floorplan: t v1 -->\n# Playbook\n'

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
