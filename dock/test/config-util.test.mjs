import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  baseName, wsSlug, parseModules, serializeModules, addToWorkspace,
  removeFromConfig, renameWorkspace, workspacesInConfig, okShape,
} from '../config-util.mjs'

test('baseName', () => {
  assert.equal(baseName('dock'), 'dock')
  assert.equal(baseName('~/pro/x/audio-player'), 'audio-player')
  assert.equal(baseName('!archived'), 'archived')
  assert.equal(baseName({ path: '/a/b/kit' }), 'kit')
  assert.equal(baseName(null), '')
})

test('wsSlug', () => {
  assert.equal(wsSlug('Atelier Modules'), 'atelier-modules')
  assert.equal(wsSlug('global'), 'global-apps')        // reserved → suffixed
  assert.equal(wsSlug('  Weird__Name!! '), 'weird-name')
  assert.equal(wsSlug(''), 'apps')
})

test('parse ⇄ serialize round-trips', () => {
  const modules = [
    '~/a/atelier-chrome', 'dock',
    { workspace: 'tt', modules: ['~/x/audio-player'] },
  ]
  const items = parseModules(modules)
  assert.equal(items.length, 3)
  assert.deepEqual(items.find((i) => i.raw === 'dock').ws, 'global')
  assert.deepEqual(items.find((i) => i.raw === '~/x/audio-player').ws, 'tt')
  assert.deepEqual(serializeModules(items), modules)
})

test('serialize groups workspace apps + keeps globals on top', () => {
  const items = [
    { raw: 'dock', ws: 'global' },
    { raw: '/i/a', ws: 'studio' },
    { raw: '/i/b', ws: 'studio' },
  ]
  assert.deepEqual(serializeModules(items), ['dock', { workspace: 'studio', modules: ['/i/a', '/i/b'] }])
})

test('addToWorkspace creates/extends blocks + dedupes', () => {
  let m = []
  m = addToWorkspace(m, 'global', 'dock')
  m = addToWorkspace(m, 'global', 'dock')             // dup ignored
  assert.deepEqual(m, ['dock'])
  m = addToWorkspace(m, 'studio', '/i/a')
  m = addToWorkspace(m, 'studio', '/i/b')
  assert.deepEqual(m, ['dock', { workspace: 'studio', modules: ['/i/a', '/i/b'] }])
})

test('removeFromConfig drops entries + empty blocks', () => {
  const m = ['dock', { workspace: 'studio', modules: ['/i/a'] }]
  assert.deepEqual(removeFromConfig(m, '/i/a'), ['dock'])     // empty block removed
  assert.deepEqual(removeFromConfig(m, 'dock'), [{ workspace: 'studio', modules: ['/i/a'] }])
})

test('renameWorkspace renames + merges', () => {
  assert.deepEqual(
    renameWorkspace([{ workspace: 'a', modules: ['/x'] }], 'a', 'b'),
    [{ workspace: 'b', modules: ['/x'] }],
  )
  // merge into an existing target block
  assert.deepEqual(
    renameWorkspace([{ workspace: 'b', modules: ['/y'] }, { workspace: 'a', modules: ['/x'] }], 'a', 'b'),
    [{ workspace: 'b', modules: ['/y', '/x'] }],
  )
})

test('workspacesInConfig', () => {
  assert.deepEqual(workspacesInConfig(['dock', { workspace: 'tt', modules: [] }, { workspace: '!deny' }]), ['tt'])
})

test('okShape accepts valid + rejects malformed', () => {
  assert.equal(okShape({ port: 1855, modules: ['dock'], hotReload: true, auth: false }), null)
  assert.equal(okShape({ defaultChrome: 'x', baseUrl: 'u', label: 'n' }), null)
  assert.match(okShape([1, 2]), /JSON object/)
  assert.match(okShape({ modules: 'oops' }), /list/)
  assert.match(okShape({ port: 'abc' }), /number/)
  assert.match(okShape({ hotReload: 'yes' }), /true or false/)
  assert.match(okShape({ auth: 5 }), /false or a module id/)
  assert.match(okShape({ defaultChrome: 3 }), /text/)
})
