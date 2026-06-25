// scanner.js — read a marketplace "uplink" and build its catalog.
//
// An uplink is a directory with `.atelier/marketplace.json` and EITHER an
// `apps/` folder of module folders OR an inline `apps: [...]` array in the
// manifest (or both — folder apps win by id). Sources resolve to a directory:
//   bundled:<name>   → ships with this module (<module>/_examples/<name>)
//   /abs · ~/p · ./p → a local directory (dev)
//   owner/repo · URL → a GitHub repo, shallow-cloned/fetched into the cache

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const GROUP_CAT = { reading: 'Reading', tools: 'Tools', dev: 'Dev', data: 'Data', docs: 'Docs', lab: 'Lab' }

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return null } }
const exists = (p) => { try { fs.accessSync(p); return true } catch { return false } }
// Names never treated as apps when scanning a repo root.
const RESERVED = new Set(['atelier', 'api', 'assets', 'modules', 'global', 'node_modules', 'apps', 'data', 'docs', 'shims', 'test'])
const isModuleDir = (p) => exists(path.join(p, 'frontend.jsx')) || exists(path.join(p, 'backend.js'))
const titleCase = (s) => s.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
const firstLine = (md) => {
  if (!md) return ''
  const l = md.split('\n').map((x) => x.trim()).find((x) => x && !x.startsWith('#') && !x.startsWith('!') && !x.startsWith('```'))
  return l ? l.replace(/[*_`>[\]()]/g, '').slice(0, 180) : ''
}

// Pull `export const meta = {...}` from a frontend.jsx WITHOUT importing it.
export function parseMeta(file) {
  try {
    const src = fs.readFileSync(file, 'utf8')
    const m = src.match(/export\s+const\s+meta\s*=\s*\{([\s\S]*?)\}/)
    if (!m) return {}
    const pick = (k) => { const r = m[1].match(new RegExp(k + "\\s*:\\s*['\"]([^'\"]*)['\"]")); return r ? r[1] : undefined }
    // Core rename: a chrome declares meta.isChrome; an app names its chrome via meta.chrome.
    return { name: pick('name'), icon: pick('icon'), group: pick('group'), isChrome: /\bisChrome\s*:\s*true\b/.test(m[1]), chrome: pick('chrome') }
  } catch { return {} }
}

function git(args, cwd, extraEnv) {
  return new Promise((res, rej) => {
    const env = extraEnv ? { ...process.env, ...extraEnv } : process.env
    const p = spawn('git', args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = '', err = ''
    p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (err += d))
    p.on('close', (code) => (code === 0 ? res(out.trim()) : rej(new Error(err.trim() || `git ${args[0]} exited ${code}`))))
    p.on('error', rej)
  })
}

export const slugOf = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

// Best-effort: have `gh` configure git's credential helper for github.com so
// clone/fetch authenticate as the signed-in user (works for PRIVATE repos). It's
// idempotent, so we run it once per process before the first github operation.
// No `gh`? skip silently — public repos still clone, private ones get the clear
// auth error below. We never embed a token in the URL (it'd land in .git/config).
let _ghSetupDone = false
function ghSetupGit() {
  if (_ghSetupDone) return Promise.resolve()
  _ghSetupDone = true
  return new Promise((resolve) => {
    let p
    try { p = spawn('gh', ['auth', 'setup-git'], { stdio: ['ignore', 'ignore', 'ignore'] }) }
    catch { return resolve() }
    p.on('error', () => resolve())
    p.on('close', () => resolve())
  })
}

const isAuthError = (msg) => /authentication|could not read username|terminal prompts disabled|403|permission denied|access denied|repository not found|fatal: could not read/i.test(String(msg))

// Resolve a source string to a local directory, cloning/fetching git sources.
export async function resolveSource(source, { cacheDir, bundledDir, log }) {
  if (source.startsWith('bundled:')) return { dir: path.join(bundledDir, source.slice(8)), kind: 'bundled' }
  if (/^(\/|~|\.\/)/.test(source)) return { dir: source.replace(/^~/, process.env.HOME || ''), kind: 'local' }

  const url = /^(https?:|git@)/.test(source) ? source : `https://github.com/${source}.git`
  const dir = path.join(cacheDir, slugOf(source))
  const isGithubHttps = /^https?:\/\/github\.com\//i.test(url) || !/^(https?:|git@)/.test(source)
  // For github https sources, configure git auth via gh first so private repos work.
  if (isGithubHttps) await ghSetupGit()
  // Never let git block on an interactive credential prompt — fail fast instead, so
  // a private repo without auth surfaces a clear error rather than hanging the scan.
  const noPrompt = { GIT_TERMINAL_PROMPT: '0' }
  try {
    if (exists(path.join(dir, '.git'))) {
      await git(['fetch', '--depth', '1', 'origin'], dir, noPrompt)
      await git(['reset', '--hard', 'origin/HEAD'], dir)
    } else {
      fs.mkdirSync(cacheDir, { recursive: true })
      await git(['clone', '--depth', '1', url, dir], undefined, noPrompt)
    }
  } catch (e) {
    if (isGithubHttps && isAuthError(e.message)) {
      throw new Error('private repo or no access — run `gh auth login` (or check repo access), then re-scan')
    }
    throw e
  }
  let sha = ''; try { sha = await git(['rev-parse', '--short', 'HEAD'], dir) } catch {}
  return { dir, kind: 'git', sha }
}

// Fields a marketplace's apps[] entry may set, overriding what's auto-detected
// from the module — so modules stay clean and the marketplace curates listings
// (screenshots especially) in its own config.
const OV_FIELDS = ['name', 'icon', 'tagline', 'category', 'tags', 'version', 'author', 'homepage', 'requires', 'screenshots', 'description']

// An app's listing is auto-detected from the module — meta (name/icon/group) +
// package.json (version/keywords/author/node deps) + README.md (tagline = first
// line, description = whole) — then the marketplace's apps[] override wins.
function readApp(base, id, ov = {}) {
  const dir = path.join(base, id)
  const has = (f) => exists(path.join(dir, f))
  const meta = has('frontend.jsx') ? parseMeta(path.join(dir, 'frontend.jsx')) : {}
  const pkg = readJson(path.join(dir, 'package.json')) || {}
  let readme = ''; try { readme = fs.readFileSync(path.join(dir, 'README.md'), 'utf8') } catch {}
  const author = typeof pkg.author === 'string' ? pkg.author : (pkg.author && pkg.author.name) || null
  const app = {
    id,
    name: meta.name || titleCase(id),
    icon: meta.icon || 'box',
    tagline: firstLine(readme),
    category: (meta.group && (GROUP_CAT[meta.group] || titleCase(meta.group))) || 'Other',
    tags: Array.isArray(pkg.keywords) ? pkg.keywords : [],
    version: pkg.version || '0.0.0',
    author,
    homepage: null,
    description: readme,
    screenshots: [],
    surfaces: [has('frontend.jsx') && 'UI', has('backend.js') && 'API'].filter(Boolean),
    requires: Object.keys(pkg.dependencies || {}),  // node deps; other runtimes go in apps[] requires
    installable: has('frontend.jsx') || has('backend.js'),
    isChrome: !!meta.isChrome,
    chrome: meta.chrome || null,  // which chrome this app renders in
  }
  for (const k of OV_FIELDS) if (ov[k] !== undefined) app[k] = ov[k]
  return app
}

// An apps[] entry with no matching module folder — a purely-declared listing.
function inlineApp(ov) {
  return {
    id: ov.id,
    name: ov.name || titleCase(ov.id || 'app'),
    icon: ov.icon || 'box',
    tagline: ov.tagline || '',
    category: ov.category || 'Other',
    tags: ov.tags || [],
    version: ov.version || '0.0.0',
    author: ov.author || null,
    homepage: ov.homepage || null,
    description: ov.description || '',
    screenshots: ov.screenshots || [],
    surfaces: ov.surfaces || [],
    requires: ov.requires || [],
    installable: false,
  }
}

// Read a resolved uplink directory → { marketplace, apps, base }.
// Apps are the module folders under apps/ — or, when there's no apps/, at the
// repo root — so any repo of modules is a marketplace once you add the manifest.
export function readMarketplace(dir, fallbackId) {
  const mf = readJson(path.join(dir, '.atelier', 'marketplace.json'))
  if (!mf) throw new Error('missing .atelier/marketplace.json')
  const marketplace = {
    id: mf.id || fallbackId,
    name: mf.name || mf.label || fallbackId,   // accept `label` as an alias for `name`
    description: mf.description || '',
    icon: mf.icon || 'store',
    accent: mf.accent || '#2563eb',
    publisher: mf.publisher || null,
    homepage: mf.homepage || null,
    featured: mf.featured || null,
  }
  // apps[] in the manifest = per-app overrides (keyed by id), plus any inline-only listings.
  const overrides = new Map((Array.isArray(mf.apps) ? mf.apps : []).filter((a) => a && a.id).map((a) => [a.id, a]))
  const appsDir = path.join(dir, 'apps')
  const hasAppsDir = exists(appsDir)
  const base = hasAppsDir ? appsDir : dir
  let ids = []
  try {
    ids = fs.readdirSync(base, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !/^[._\-\s]/.test(d.name) && !RESERVED.has(d.name))
      .map((d) => d.name)
      .filter((id) => hasAppsDir || isModuleDir(path.join(base, id)))
  } catch {}
  const discovered = new Set(ids)
  const all = [
    ...ids.map((id) => readApp(base, id, overrides.get(id) || {})),
    ...[...overrides.values()].filter((ov) => !discovered.has(ov.id)).map(inlineApp),
  ]
  // Chromes are modules with meta.chrome=true — kept separate from browsable apps.
  const chromes = all.filter((a) => a.isChrome).map((a) => ({ id: a.id, name: a.name, icon: a.icon }))
  const apps = all.filter((a) => !a.isChrome)
  return { marketplace, apps, chromes, base }
}
