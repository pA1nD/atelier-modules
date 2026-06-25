// Pure helpers for reading/editing atelier.config.json `modules`. Shared by the
// dock backend, frontend, and tests — NO fs, NO DOM, so it's trivially testable.
// (The config write path is the one place a bad value can stop Atelier booting,
//  so this logic is unit-tested in test/config-util.test.mjs.)

export const RESERVED = new Set(['atelier', 'api', 'assets', 'modules', 'global'])

// Last path segment of a module entry (string path/name or {path}). Strips a
// leading "!" (deny marker). Returns '' for anything unrecognized.
export const baseName = (p) => {
  const s = typeof p === 'string' ? p : (p && typeof p === 'object' && typeof p.path === 'string' ? p.path : '')
  return String(s).replace(/^!/, '').split('/').filter(Boolean).pop() || ''
}

// Turn a marketplace name/id into a safe workspace slug.
export function wsSlug(name) {
  const v = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  return !v || RESERVED.has(v) ? (v ? v + '-apps' : 'apps') : v
}

// config.modules ⇄ a flat editable list of { raw, ws, extra? } items.
export function parseModules(modules) {
  const items = []
  for (const m of modules || []) {
    if (m && typeof m === 'object' && Array.isArray(m.modules) && m.workspace) {
      const ws = String(m.workspace).replace(/^!/, '')
      for (const sub of m.modules) items.push({ raw: sub, ws })
    } else if (m && typeof m === 'object' && m.workspace) {
      items.push({ raw: m, ws: 'global', extra: true })
    } else {
      items.push({ raw: m, ws: 'global' })
    }
  }
  return items
}

export function serializeModules(items) {
  const globals = items.filter((i) => i.ws === 'global' && !i.extra).map((i) => i.raw)
  const byWs = {}
  items.filter((i) => i.ws !== 'global' && !i.extra).forEach((i) => { (byWs[i.ws] ||= []).push(i.raw) })
  const blocks = Object.entries(byWs).map(([ws, mods]) => ({ workspace: ws, modules: mods }))
  return [...globals, ...blocks, ...items.filter((i) => i.extra).map((i) => i.raw)]
}

// Add a path-mount to a workspace block (or top-level for 'global'), deduped.
export function addToWorkspace(modules, ws, p) {
  const out = (modules || []).slice()
  if (ws === 'global') { if (!out.some((m) => m === p)) out.push(p); return out }
  let block = out.find((m) => m && typeof m === 'object' && m.workspace === ws && Array.isArray(m.modules))
  if (!block) { block = { workspace: ws, modules: [] }; out.push(block) }
  if (!block.modules.includes(p)) block.modules.push(p)
  return out
}

// Remove a module entry (by exact match) from top-level or any workspace block;
// drop now-empty workspace blocks.
export function removeFromConfig(modules, p) {
  return (modules || []).map((m) => {
    if (typeof m === 'string') return m === p ? null : m
    if (m && Array.isArray(m.modules)) { const mods = m.modules.filter((x) => x !== p); return mods.length ? { ...m, modules: mods } : null }
    return m
  }).filter((m) => m != null)
}

// Rename a workspace block (and merge into an existing `to` block if present).
export function renameWorkspace(modules, from, to) {
  const out = []
  let toBlock = (modules || []).find((m) => m && typeof m === 'object' && m.workspace === to && Array.isArray(m.modules))
  for (const m of modules || []) {
    if (m && typeof m === 'object' && Array.isArray(m.modules) && m.workspace === from) {
      if (toBlock && toBlock !== m) { toBlock.modules.push(...m.modules.filter((x) => !toBlock.modules.includes(x))); continue }
      out.push({ ...m, workspace: to }); toBlock = out[out.length - 1]
    } else out.push(m)
  }
  return out
}

// List the workspace names referenced by config blocks.
export function workspacesInConfig(modules) {
  return [...new Set((modules || []).filter((m) => m && typeof m === 'object' && m.workspace && !String(m.workspace).startsWith('!')).map((m) => String(m.workspace)))]
}

// Hard shape check before writing — a malformed config can stop Atelier booting.
export function okShape(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return 'Config must be a JSON object (not an array or a value).'
  if ('modules' in c && !Array.isArray(c.modules)) return '“modules” must be a list.'
  if ('port' in c && c.port != null && !Number.isFinite(Number(c.port))) return '“port” must be a number.'
  if ('hotReload' in c && typeof c.hotReload !== 'boolean') return '“hotReload” must be true or false.'
  if ('auth' in c && !(c.auth === false || typeof c.auth === 'string')) return '“auth” must be false or a module id.'
  for (const k of ['label', 'baseUrl', 'defaultChrome']) if (k in c && c[k] != null && typeof c[k] !== 'string') return `“${k}” must be text.`
  return null
}
