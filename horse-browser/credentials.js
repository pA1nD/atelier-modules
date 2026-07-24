/*
 * horse-browser/credentials.js — the credential subsystem (Bitwarden broker).
 *
 * Folded in from the retired hb-auth module (2026-07-24). The ENFORCED
 * Bitwarden broker: a signed local daemon (./broker.js + ./native/) holds the
 * only vault session and gates every credential by collection policy + an
 * origin check read from the browser + a native macOS approval. Plus the
 * managed agent helpers (atelier_login_helpers.py) and the credential-hint hook.
 *
 * The security line: a secret never enters the LLM's context. The broker TYPES
 * passwords over its own CDP session; TOTP codes self-expire. This backend's
 * HTTP API serves only NON-secret data — statuses, policy, helper source, the
 * granted-items index (names/usernames/hosts only).
 *
 * `mountCredentials(router, ctx)` registers all `/broker/*`, `/helpers/*`,
 * `/hints*`, `/selfheal`, `/state`, `/skill.md` routes and returns a teardown.
 * The daemon lives in ~/Library/Application Support/hb-broker (OUTSIDE the
 * module tree) so hot-reload and agent edits can't touch the running boundary.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { brokerCall, ensureDaemon, rebuildDaemon, startAuditTail, stopAuditTail,
         brokerInstalled, SETUP_CMD, BIN as BROKER_BIN } from './broker.js'

// --- shell probe -------------------------------------------------------------
// Run a command, capture stdout, never throw. bash -lc so PATH/brew resolve.
function run(cmd, timeoutMs = 8000) {
  return new Promise((resolve) => {
    let out = '', err = ''
    let p
    try {
      p = spawn('bash', ['-lc', cmd], { stdio: ['ignore', 'pipe', 'pipe'] })
    } catch {
      return resolve({ code: 1, out: '', err: 'spawn failed' })
    }
    const t = setTimeout(() => { try { p.kill('SIGKILL') } catch {} }, timeoutMs)
    p.stdout.on('data', (d) => { out += d })
    p.stderr.on('data', (d) => { err += d })
    p.on('error', () => { clearTimeout(t); resolve({ code: 1, out: '', err: 'spawn error' }) })
    p.on('close', (code) => { clearTimeout(t); resolve({ code, out: out.trim(), err: err.trim() }) })
  })
}

const shortHome = (p) => (p && p.startsWith(os.homedir()) ? '~' + p.slice(os.homedir().length) : p)

// --- login methods registry --------------------------------------------------
// impl:false = roadmap. `/state` computes each method's tri-state
// (roadmap | available | configured).
const METHODS = [
  { id: 'bitwarden', kind: 'password', name: 'Bitwarden (broker)', impl: true, enforced: true,
    helpers: ['hb_creds', 'hb_type_secret', 'hb_type_totp', 'hb_get_totp', 'hb_get_secret'],
    requires: 'bw installed + logged in, and the broker set up (macOS approval) — see the Credentials page',
    desc: 'ENFORCED path: a signed local daemon holds the only vault session and gates every credential by the Bitwarden COLLECTION it lives in (auto | ask-approval | never) + an origin check read from the browser. Access is managed by moving items between collections; the password is typed over the broker\'s OWN CDP session, so it never enters agent code — a boundary, not a convention.' },
  { id: 'email-code', kind: 'email', name: 'Email code', impl: false,
    desc: 'One-time code fetched from a mailbox the agent may read. Roadmap.' },
  { id: 'onepassword', kind: 'password', name: '1Password CLI (op)', impl: false,
    desc: 'First-party agent tooling exists — a candidate password source. Roadmap.' },
]

// --- the agent helpers we document + detect ----------------------------------
// A registry so the UI renders every entry; `marker` is how we detect it on disk.
const HELPERS = [
  { name: 'hb_creds', signature: 'hb_creds()', marker: 'def hb_creds',
    summary: 'The agent\'s allow-list: non-secret metadata of every login in a granted Bitwarden collection — [{item, username, hosts, tier, hasTotp}].' },
  { name: 'hb_type_secret', signature: 'hb_type_secret(cred, target)', marker: 'def hb_type_secret',
    summary: 'ENFORCED: the broker types cred\'s Bitwarden password at the focused field of tab `target` — origin-checked, policy-gated, never returned to you.' },
  { name: 'hb_type_totp', signature: 'hb_type_totp(cred, target)', marker: 'def hb_type_totp',
    summary: 'ENFORCED: the broker types cred\'s current TOTP at the focused field (auto-advances 6-box widgets).' },
  { name: 'hb_get_totp', signature: 'hb_get_totp(cred)', marker: 'def hb_get_totp',
    summary: 'ENFORCED: the current 6-digit TOTP for cred as a value (self-expiring; safe fallback for odd widgets).' },
  { name: 'hb_get_secret', signature: 'hb_get_secret(cred)', marker: 'def hb_get_secret',
    summary: 'ENFORCED: cred\'s password as a value — a macOS approval every time; for non-web use (CLI/env) only. Avoid printing it.' },
]

// The canonical helper source. Kept BYTE-IDENTICAL to what hb-auth shipped so an
// already-installed chain is adopted, not re-flagged as outdated. Secrets never
// enter the LLM context: the broker types passwords over its own CDP session.
function buildHelperCode() {
  return `# --- hb-auth agent helpers (Bitwarden broker) -----------------------------------
# Managed by the atelier hb-auth module — overwritten on every install/update from
# its Methods page. Put your own tweaks in agent_helpers.py (under different names).
# Secrets never enter the LLM context: the broker daemon types passwords over its
# own CDP session; TOTP codes are self-expiring.
import json as _json
import os as _os

# --- hb-auth broker helpers (Bitwarden, ENFORCED) -------------------------------
# These do NOT read a vault here. They ask the signed local broker daemon, which
# holds the only Bitwarden session and enforces access + an origin check + a macOS
# approval that this process cannot skip. A password is TYPED by the broker over its own CDP
# session — it never enters this process or your transcript. TOTP codes self-expire,
# so those may be returned. \`cred\` is the BITWARDEN ITEM NAME (the hb-auth hint on
# the login page tells you the exact name to use); whether you may use it, and
# whether it prompts, is decided by which Bitwarden collection it lives in — you
# can't widen that. \`target\` is your OWN CDP target id (the tab you drive); YOU
# focus the field first with a trusted click, the broker types into focus.
import socket as _bk_socket

_BK_SOCK = _os.path.expanduser("~/Library/Application Support/hb-broker/broker.sock")
_BK_SESSION = _os.environ.get("CLAUDE_CODE_SESSION_ID", "agent")

def _bk(req, timeout=120):
    req.setdefault("session", _BK_SESSION)
    s = _bk_socket.socket(_bk_socket.AF_UNIX, _bk_socket.SOCK_STREAM); s.settimeout(timeout)
    try:
        s.connect(_BK_SOCK)
    except OSError as e:
        raise RuntimeError("hb-broker daemon not running (%s). See the module's Broker page." % e)
    s.sendall((_json.dumps(req) + "\\n").encode())
    buf = b""
    while b"\\n" not in buf:
        chunk = s.recv(65536)
        if not chunk:
            break
        buf += chunk
    s.close()
    r = _json.loads(buf.split(b"\\n", 1)[0].decode())
    if not r.get("ok"):
        raise RuntimeError("hb-broker %s denied: %s (%s)" % (req.get("op"), r.get("error"), r.get("reason")))
    return r

def hb_type_secret(cred, target):
    """Broker types cred's Bitwarden password at the focused field of tab \`target\`. Origin-checked, policy-gated."""
    r = _bk({"op": "type_secret", "cred": cred, "target": target})
    return "typed %d chars for %s" % (r["typed"], cred)

def hb_type_totp(cred, target):
    """Broker types cred's current TOTP at the focused field of \`target\` (auto-advances 6-box widgets)."""
    r = _bk({"op": "type_totp", "cred": cred, "target": target})
    return "typed %d-digit code" % r["typed"]

def hb_get_totp(cred):
    """The current 6-digit TOTP for cred (self-expiring; safe fallback for odd widgets)."""
    return _bk({"op": "get_totp", "cred": cred})["value"]

def hb_get_secret(cred):
    """cred's password as a value — a macOS approval every time; for non-web use (CLI/env). Do not print it."""
    return _bk({"op": "get_secret", "cred": cred})["value"]

def hb_creds():
    """The credentials you may use: [{item,username,hosts,tier,hasTotp}] — only items in a
    Bitwarden collection the operator granted agents, never the whole vault. Pass 'item' above."""
    return _bk({"op": "list"})["items"]
`
}

// The managed helper file + its load-once stub. Kept BYTE-IDENTICAL to hb-auth's
// so an already-installed stub is adopted, not orphaned. The pre-2026-07-24
// `atelier-login` (LastPass-era) stub block is stripped on install/self-heal so a
// migrated chain never double-loads the file.
const LOGIN_HELPERS_FILE = 'atelier_login_helpers.py'
const LOGIN_STUB_BEGIN = '# >>> hb-auth: agent helpers (managed loader — do not edit) >>>'
const LOGIN_STUB = `${LOGIN_STUB_BEGIN}
# The hb-auth agent helpers (Bitwarden broker) live in ${LOGIN_HELPERS_FILE}
# next to this file. The atelier hb-auth module owns THAT file and overwrites it on
# update — your own code here is never touched. Install/update from the module's
# Methods page.
try:
    import os as _al_os
    _al_path = _al_os.path.join(_al_os.path.dirname(_al_os.path.abspath(__file__)), "${LOGIN_HELPERS_FILE}")
    exec(compile(open(_al_path).read(), _al_path, "exec"))
except Exception as _al_err:
    import sys as _al_sys
    print("hb-auth: couldn't load ${LOGIN_HELPERS_FILE} (%r) — reinstall from the hb-auth module" % (_al_err,), file=_al_sys.stderr)
# <<< hb-auth <<<
`
// The retired LastPass-era stub block — recognized and removed on install.
const LEGACY_STUB_RE = /\n*# >>> atelier-login:[^\n]*\n[\s\S]*?# <<< atelier-login <<<\n?/g

// horse-browser's harness auto-loads <workspace>/agent_helpers.py on every call.
function helperFile() {
  const cands = [
    process.env.BH_AGENT_WORKSPACE && path.join(process.env.BH_AGENT_WORKSPACE, 'agent_helpers.py'),
    path.join(os.homedir(), '.config/browser-harness/agent-workspace/agent_helpers.py'),
  ].filter(Boolean)
  for (const c of cands) { try { if (fs.existsSync(c)) return c } catch {} }
  return cands[0] || null
}

function helperState(code) {
  const file = helperFile()
  let contents = ''
  let fileExists = false
  try { if (file && fs.existsSync(file)) { fileExists = true; contents = fs.readFileSync(file, 'utf8') } } catch {}
  const modPath = file ? path.join(path.dirname(file), LOGIN_HELPERS_FILE) : null
  let modSrc = null
  try { modSrc = modPath && fs.existsSync(modPath) ? fs.readFileSync(modPath, 'utf8') : null } catch {}
  const stubWired = contents.includes(LOGIN_STUB_BEGIN)
  return {
    file: file ? shortHome(file) : null,
    fileExists,
    code,
    moduleFile: {
      path: modPath ? shortHome(modPath) : null,
      exists: !!modSrc,
      current: modSrc === code,
    },
    stubWired,
    // an older hand-pasted copy inline in agent_helpers.py — loads first, so the
    // module file wins once installed; flagged so the operator can prune it
    inlineLegacy: HELPERS.some((h) => contents.includes(h.marker)),
    helpers: HELPERS.map((h) => ({
      name: h.name, signature: h.signature, summary: h.summary,
      installed: (stubWired && !!modSrc && modSrc.includes(h.marker)) || contents.includes(h.marker),
    })),
  }
}

// --- self-heal ---------------------------------------------------------------
// Keeps the login load-chain wired without a manual click. Persisted so the
// operator can switch it off (default ON — robustness is the whole point).
function selfHealCfg(ctx) { return path.join(ctx.dataDir, 'cred-selfheal.json') }
function selfHealEnabled(ctx) {
  try {
    const v = JSON.parse(fs.readFileSync(selfHealCfg(ctx), 'utf8')).enabled
    if (typeof v === 'boolean') return v
  } catch {}
  return true
}
function setSelfHeal(ctx, on) {
  fs.mkdirSync(ctx.dataDir, { recursive: true })
  fs.writeFileSync(selfHealCfg(ctx), JSON.stringify({ enabled: !!on }, null, 2))
}

// (Re)write the module-owned login file and wire the load-once stub into
// agent_helpers.py exactly once. Idempotent — writes only what's missing/changed.
function installLoginHelpers(code) {
  const file = helperFile()
  if (!file) return { ok: false, error: 'horse-browser harness workspace not found' }
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const modPath = path.join(path.dirname(file), LOGIN_HELPERS_FILE)
    let modSrc = null
    try { modSrc = fs.readFileSync(modPath, 'utf8') } catch {}
    let wroteFile = false
    if (modSrc !== code) { fs.writeFileSync(modPath, code); wroteFile = true }
    let contents = ''
    try { contents = fs.readFileSync(file, 'utf8') } catch {}
    // migrate: strip the LastPass-era stub block so the file never double-loads
    const stripped = contents.replace(LEGACY_STUB_RE, '\n')
    let wiredStub = false
    if (!stripped.includes(LOGIN_STUB_BEGIN)) {
      fs.writeFileSync(file, (stripped.trim() ? stripped.replace(/\n*$/, '\n\n') : '') + LOGIN_STUB)
      wiredStub = true
    } else if (stripped !== contents) {
      fs.writeFileSync(file, stripped)
    }
    return { ok: true, wroteFile, wiredStub }
  } catch (e) { return { ok: false, error: String(e) } }
}

// Repairs when the chain is broken (stub missing / module file absent). General
// content staleness (a reworded helper we ship) is left to the explicit Update button.
function maybeSelfHeal(ctx, code) {
  if (!selfHealEnabled(ctx)) return { enabled: false, ran: false }
  const st = helperState(code)
  const broken = !st.stubWired || !st.moduleFile.exists
  if (!broken) return { enabled: true, ran: false }
  return { enabled: true, ran: true, repaired: installLoginHelpers(code) }
}

// --- the copy-pasteable agent skill (templated with this box's URL) ----------
function renderSkill({ adminBase }) {
  return `---
name: horse-browser-login
description: Log into a website as an agent without the secret ever entering your context. The Bitwarden broker TYPES the password over CDP (origin-checked and policy-gated).
---

# Skill — log into a site (Horse Browser credentials)

You drive a browser over CDP (horse-browser). The Horse Browser credentials broker
signs a user in without the password or 2FA code ever entering your context, through
the **Bitwarden broker** — a signed local daemon that holds the only vault session and
TYPES credentials for you over its own CDP session; you never see the value.

## The flow

1. See what you may use — non-secret metadata, your allow-list (only items in a
   collection the operator granted appear):

       hb_creds()   # -> [{item, username, hosts, tier, hasTotp}, …]

2. Open the login page; keep your tab's CDP target id (the tab you drive — e.g. the id
   \`bh_open(url)\` returns).
3. Type the USERNAME yourself with trusted input — it's non-secret (from hb_creds).
4. Focus the password field, then have the broker type the password:

       hb_type_secret("<item>", target)   # returns a char count, never the value

   It's origin-checked (the tab's real URL must match the item's stored URIs) and
   policy-gated; an \`ask\`-tier item prompts the operator for a macOS approval, an
   \`auto\` one is silent.
5. Submit (click the login button). If a 2FA field appears and the item has TOTP:

       hb_type_totp("<item>", target)

6. \`wait_for_load()\` and confirm you're signed in.

On any login page the broker prints a hint naming the exact item to use.
\`hb_get_secret("<item>")\` / \`hb_get_totp("<item>")\` return a value for non-web (CLI/env)
use — a macOS approval each time; never print it.

## Rules
- To find accounts, call \`hb_creds()\` — that's your allow-list (the accounts you may use).
  On any login page the broker also prints a hint naming the exact item. Never guess names.
- Do NOT run \`bw\` yourself. The broker holds the only Bitwarden session (a raw \`bw\` can't
  reach it), any CLI setup is the operator's one-time job, and the hb_* helpers keep the
  secret out of your context. Always go through the helpers.
- Never print, echo, or paste a password or OTP code. The helpers resolve them internally.
- Live status of the tooling on this machine: \`curl -s ${adminBase}/state\`

## If a helper is missing
If \`hb_creds\` / \`hb_type_secret\` is undefined, fetch the source:
\`curl -s ${adminBase}/state | jq -r .helper.code\` and append it to the agent_helpers.py
path that same response reports — or install it from the Horse Browser credentials page.
`
}

// --- page hints (horse-browser hints.d) --------------------------------------
// horse-browser calls every executable in ~/.config/horse-browser/hints.d/ on the
// first navigation to a host; our hook curls GET /hints?url=… and prints the reply.
// A host with a bound Bitwarden credential → an hb_type_secret hint.
const HINT_BROKER_DEFAULT = `hb-broker (enforced) can sign in here: focus the field, then hb_type_secret("{item}", target) — the password is typed by the broker and never printed. TOTP: hb_type_totp("{item}", target).`

function hintsCfgPath(ctx) { return path.join(ctx.dataDir, 'cred-hints.json') }
function hintTemplates(ctx) {
  let saved = {}
  try { saved = JSON.parse(fs.readFileSync(hintsCfgPath(ctx), 'utf8')) || {} } catch {}
  const broker = (saved.broker && String(saved.broker).trim()) ? String(saved.broker) : HINT_BROKER_DEFAULT
  return { broker }
}
const applyHint = (tpl, vars) => tpl.replace(/\{(name|host|item)\}/g, (_, k) => vars[k] ?? '')

const HOOK_PATH = path.join(os.homedir(), '.config/horse-browser/hints.d/atelier-hb-auth')
const HOOK_MARKER = 'atelier-hb-auth — horse-browser hints.d hook'
function hookScript(apiBase) {
  const origin = apiBase.replace(/(^https?:\/\/[^/]+).*/, '$1')
  const apiPath = apiBase.slice(origin.length)
  return `#!/bin/sh
# ${HOOK_MARKER}. Called as: <hook> <url>.
# Asks the local Horse Browser module whether the Bitwarden broker has a
# credential for this URL's site and prints its one-line hint (or nothing). All
# vault logic lives server-side — this file is just the wire. Installed by the
# module; reinstall from its Credentials page after a port or mount change.
exec curl -sf -m 2 --get --data-urlencode "url=$1" \\
  "\${ATELIER_BASE:-${origin}}${apiPath}/hints"
`
}
// The pre-merge hook filenames — removed when we install ours.
const LEGACY_HOOK_PATHS = [path.join(os.homedir(), '.config/horse-browser/hints.d/atelier-lastpass')]
function hookStatus(apiBase) {
  let src = null
  try { src = fs.readFileSync(HOOK_PATH, 'utf8') } catch {}
  let exec = false
  try { exec = !!src && !!(fs.statSync(HOOK_PATH).mode & 0o111) } catch {}
  const canonical = hookScript(apiBase)
  const state = !src ? 'missing' : !exec ? 'stale' : src === canonical ? 'ok' : src.includes(HOOK_MARKER) ? 'stale' : 'foreign'
  return { path: shortHome(HOOK_PATH), state }
}
function installHook(apiBase) {
  try {
    fs.mkdirSync(path.dirname(HOOK_PATH), { recursive: true })
    fs.writeFileSync(HOOK_PATH, hookScript(apiBase), { mode: 0o755 })
    fs.chmodSync(HOOK_PATH, 0o755)
    // retire any older hook of ours (never a foreign file)
    for (const lp of LEGACY_HOOK_PATHS) {
      try { if (fs.readFileSync(lp, 'utf8').includes('horse-browser hints.d hook')) fs.unlinkSync(lp) } catch {}
    }
    return { ok: true }
  } catch (e) { return { ok: false, error: String(e) } }
}
// Re-assert a hook WE installed once it has drifted (stale URL / lost +x). Never
// creates a missing hook (that's the Install button's job) and never overwrites a
// foreign file. This is what migrates the hb-auth-era hook URL to horse-browser.
function maybeSelfHealHook(ctx, apiBase) {
  if (!selfHealEnabled(ctx)) return { enabled: false, ran: false }
  let src = null
  try { src = fs.readFileSync(HOOK_PATH, 'utf8') } catch {}
  if (src == null || !src.includes(HOOK_MARKER)) return { enabled: true, ran: false }
  let exec = false
  try { exec = !!(fs.statSync(HOOK_PATH).mode & 0o111) } catch {}
  if (src === hookScript(apiBase) && exec) return { enabled: true, ran: false }
  return { enabled: true, ran: true, repaired: installHook(apiBase) }
}

// ── mount the whole credential subsystem onto the module router ──────────────
export function mountCredentials(router, ctx) {
  // Loopback API base — the hints.d hook curls it (GET /hints). Fixed per process.
  const LOOPBACK = `http://127.0.0.1:${ctx.port}/api/${ctx.qualifiedId}`
  const HELPER_CODE = buildHelperCode()

  // Bring up the credential-broker daemon (compile-on-first-run + launchd) and
  // start streaming its audit log over the module WS. Fire-and-forget: the build
  // can take ~30s, and the Credentials page polls status meanwhile.
  const brokerSlot = ctx.module(ctx.id)
  ensureDaemon(ctx, brokerSlot).catch((e) => ctx.log(`horse-browser broker: ensure failed: ${e.message}`))
  startAuditTail(ctx, brokerSlot)
  const publicBase = (req) => {
    const proto = (req.headers['x-forwarded-proto'] || 'http').toString().split(',')[0].trim()
    const host = (req.headers['x-forwarded-host'] || req.headers.host || `localhost:${ctx.port}`).toString().split(',')[0].trim()
    return `${proto}://${host}/api/${ctx.qualifiedId}`
  }
  // Method tri-states.
  const methodStates = () => METHODS.map((m) => {
    let state = 'roadmap'
    if (m.impl && m.id === 'bitwarden') state = brokerInstalled() ? 'configured' : 'available'
    return { id: m.id, kind: m.kind, name: m.name, impl: m.impl, enforced: !!m.enforced, helpers: m.helpers || [], requires: m.requires || null, desc: m.desc, state }
  })

  // --- state (helper + methods + self-heal; agent skill points here) --------
  router.get('/state', async (req, res) => {
    maybeSelfHeal(ctx, HELPER_CODE)
    maybeSelfHealHook(ctx, LOOPBACK)
    res.json({
      helper: helperState(HELPER_CODE),
      methods: methodStates(),
      selfHeal: selfHealEnabled(ctx),
    })
  })

  // --- credential hint for a URL — consumed by the hints.d hook ------------
  router.get('/hints', async (req, res) => {
    let host = ''
    try { host = (new URL(new URL(req.url, 'http://x').searchParams.get('url')).hostname || '').replace(/^www\./, '') } catch {}
    if (!host) { res.writeHead(204); return res.end() }
    if (!brokerInstalled()) { res.writeHead(204); return res.end() }
    let item = null
    try { const r = await brokerCall({ op: 'hint', host }, 3000); item = r?.match?.item || null } catch {}
    if (!item) { res.writeHead(204); return res.end() }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(applyHint(hintTemplates(ctx).broker, { item, host }))
  })

  router.get('/hints-config', (req, res) => {
    maybeSelfHealHook(ctx, LOOPBACK)
    const tpls = hintTemplates(ctx)
    res.json({
      broker: { template: tpls.broker, default: HINT_BROKER_DEFAULT, isDefault: tpls.broker === HINT_BROKER_DEFAULT },
      placeholders: { '{item}': 'the Bitwarden item name', '{host}': "the site's host" },
      hook: hookStatus(LOOPBACK),
      selfHeal: selfHealEnabled(ctx),
    })
  })
  router.post('/hints-config', async (req, res) => {
    let body = {}
    try { body = await req.json() } catch {}
    const cur = (() => { try { return JSON.parse(fs.readFileSync(hintsCfgPath(ctx), 'utf8')) || {} } catch { return {} } })()
    const next = { ...cur }
    if ('broker' in body) {
      const t = String(body.broker ?? '').trim()
      if (!t || t === HINT_BROKER_DEFAULT) delete next.broker
      else next.broker = t
    }
    try {
      if (Object.keys(next).length === 0) { try { fs.unlinkSync(hintsCfgPath(ctx)) } catch {} }
      else { fs.mkdirSync(ctx.dataDir, { recursive: true }); fs.writeFileSync(hintsCfgPath(ctx), JSON.stringify(next, null, 2)) }
    } catch (e) { return res.json({ ok: false, error: String(e) }, 500) }
    const tpls = hintTemplates(ctx)
    res.json({ ok: true, broker: { template: tpls.broker, isDefault: tpls.broker === HINT_BROKER_DEFAULT } })
  })

  // --- helpers install / self-heal toggle / hook install -------------------
  router.post('/helpers/install', (req, res) => {
    const r = installLoginHelpers(HELPER_CODE)
    if (!r.ok) return res.json({ ok: false, error: r.error }, 500)
    res.json({ ok: true, helper: helperState(HELPER_CODE) })
  })

  router.get('/selfheal', (req, res) => res.json({ enabled: selfHealEnabled(ctx) }))
  router.post('/selfheal', async (req, res) => {
    let body = {}
    try { body = await req.json() } catch {}
    try { setSelfHeal(ctx, !!body.enabled) } catch (e) { return res.json({ ok: false, error: String(e) }, 500) }
    const repaired = selfHealEnabled(ctx) ? maybeSelfHeal(ctx, HELPER_CODE) : { enabled: false, ran: false }
    res.json({ ok: true, enabled: selfHealEnabled(ctx), repaired, helper: helperState(HELPER_CODE) })
  })

  router.post('/hints-hook/install', (req, res) => {
    const r = installHook(LOOPBACK)
    if (!r.ok) return res.json({ ok: false, error: r.error }, 500)
    res.json({ ok: true, hook: hookStatus(LOOPBACK) })
  })

  router.get('/skill.md', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' })
    res.end(renderSkill({ adminBase: publicBase(req) }))
  })

  // --- broker: status / policy / audit / credentials -----------------------
  // All non-secret. Policy writes are PROPOSED to the daemon, which applies
  // downgrades freely and demands Touch ID for any upgrade — so the module (and
  // an agent editing it) cannot silently self-promote a credential.
  const markWatched = () => { brokerSlot.brokerWatchedAt = Date.now() }
  const brokerStatusPayload = async () => {
    const s = await brokerCall({ op: 'status', session: 'ui' })
    return { ...s, installed: brokerInstalled(), building: !!brokerSlot.brokerBuilding, setupCmd: SETUP_CMD, cli: `"${BROKER_BIN}"` }
  }
  router.get('/broker/status', async (_req, res) => {
    markWatched()
    const s = await brokerStatusPayload()
    if (s.reason === 'timeout' && brokerSlot.lastStatus) return res.json(brokerSlot.lastStatus)
    res.json(s)
  })

  // status push — one watcher for every viewer. Broadcast on change only;
  // mutating broker routes force a frame so viewers converge instantly.
  const sortedKey = (v) => JSON.stringify(v, (_k, val) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.keys(val).sort().reduce((o, k) => ((o[k] = val[k]), o), {})
      : val)
  const brokerStatusTick = async (force = false) => {
    if (!force && Date.now() - (brokerSlot.brokerWatchedAt || 0) > 90000) return   // nobody watching → idle
    if (brokerSlot.statusBusy) { if (force) brokerSlot.statusForcePending = true; return }
    brokerSlot.statusBusy = true
    try {
      const s = await brokerStatusPayload()
      if (s.reason === 'timeout') return   // transient, not a state — don't flap viewers
      brokerSlot.lastStatus = s
      const key = sortedKey(s)
      if (force || key !== brokerSlot.lastStatusKey) { brokerSlot.lastStatusKey = key; ctx.broadcast({ type: 'broker-status', status: s }) }
    } catch {}
    finally {
      brokerSlot.statusBusy = false
      if (brokerSlot.statusForcePending) { brokerSlot.statusForcePending = false; brokerStatusTick(true).catch(() => {}) }
    }
  }
  const brokerStatusNow = () => { brokerStatusTick(true).catch(() => {}) }
  brokerSlot.statusBusy = false          // reset transient guards on every mount —
  brokerSlot.statusForcePending = false  // a reload mid-RPC must never strand them
  if (brokerSlot.statusTimer) clearInterval(brokerSlot.statusTimer)
  brokerSlot.statusTimer = setInterval(() => { brokerStatusTick().catch(() => {}) }, 10000)
  router.get('/broker/policy', async (_req, res) => res.json(await brokerCall({ op: 'policy_get' })))
  router.post('/broker/policy', async (req, res) => {
    let body = {}; try { body = await req.json() } catch {}
    res.json(await brokerCall({ op: 'policy_set', policy: body, session: 'ui' }, 60000))  // may Touch-ID
    brokerStatusNow()
  })
  router.get('/broker/groups', async (_req, res) => res.json(await brokerCall({ op: 'groups', session: 'ui' }, 60000)))
  router.post('/broker/refresh', async (_req, res) => { res.json(await brokerCall({ op: 'refresh', session: 'ui' }, 60000)); brokerStatusNow() })
  router.get('/broker/reachable', async (_req, res) => res.json(await brokerCall({ op: 'list', session: 'ui' }, 60000)))
  router.get('/broker/audit', async (req, res) => {
    const n = Math.min(500, Number(new URL(req.url, 'http://x').searchParams.get('n')) || 100)
    res.json(await brokerCall({ op: 'audit_tail', n }))
  })
  router.post('/broker/lock', async (_req, res) => { res.json(await brokerCall({ op: 'lock', session: 'ui' })); brokerStatusNow() })
  router.post('/broker/rebuild', async (_req, res) => { await rebuildDaemon(ctx, brokerSlot); res.json({ ok: true, installed: brokerInstalled() }); brokerStatusNow() })

  router.post('/broker/disconnect', async (_req, res) => {
    const r = await brokerCall({ op: 'reset', session: 'ui' }, 60000)
    res.json({ ...r, manual: r.ok ? 'Run `bw logout` in a terminal to end the Bitwarden CLI session and revoke the token. The broker has forgotten the token and your access rules.' : null })
    brokerStatusNow()
  })

  // Teardown — stop the broker status push + audit tail on hot-reload / shutdown.
  return () => {
    if (brokerSlot.statusTimer) { clearInterval(brokerSlot.statusTimer); brokerSlot.statusTimer = null }
    stopAuditTail(brokerSlot)
  }
}
