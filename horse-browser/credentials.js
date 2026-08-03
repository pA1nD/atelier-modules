/*
 * horse-browser/credentials.js — the credential subsystem (Bitwarden broker).
 * Vault stays warm until an explicit lock/disconnect (no idle timeout); the board warms it on open.
 *
 * The ENFORCED
 * Bitwarden broker: a signed local daemon (./broker.js + ./native/) holds the
 * only vault session and gates every credential by collection policy + an
 * origin check read from the browser + a native macOS approval. Plus the
 * broker helper plugin (plugins/atelier_login.py) and the credential-hint hook.
 *
 * The security line: a secret never enters the LLM's context. The broker TYPES
 * passwords over its own CDP session; TOTP codes self-expire. This backend's
 * HTTP API serves only NON-secret data — statuses, policy, helper source, the
 * granted-items index (names/usernames/hosts only).
 *
 * `mountCredentials(router, ctx)` registers all `/broker/*`, `/helpers/*`,
 * `/hints*`, `/state`, `/skill.md` routes and returns a teardown.
 * The daemon lives in ~/Library/Application Support/hb-broker (OUTSIDE the
 * module tree) so hot-reload and agent edits can't touch the running boundary.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { brokerCall, ensureDaemon, startAuditTail, stopAuditTail,
         brokerInstalled, SETUP_CMD, BIN as BROKER_BIN } from './broker.js'

const shortHome = (p) => (p && p.startsWith(os.homedir()) ? '~' + p.slice(os.homedir().length) : p)

// --- login methods registry --------------------------------------------------
// impl:false = roadmap. `/state` computes each method's tri-state
// (roadmap | available | configured).
const METHODS = [
  { id: 'bitwarden', kind: 'password', name: 'Bitwarden (broker)', impl: true, enforced: true,
    helpers: ['list_login_profiles', 'type_secret', 'type_totp', 'get_totp'],
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
  { name: 'list_login_profiles', signature: 'list_login_profiles()', marker: 'def list_login_profiles',
    summary: 'The agent\'s allow-list: safe, non-secret metadata of every login in a granted Bitwarden collection — [{item, username, hosts, tier, hasTotp}]. No passwords or codes.' },
  { name: 'type_secret', signature: 'type_secret(cred, target)', marker: 'def type_secret',
    summary: 'ENFORCED: the broker types cred\'s Bitwarden password at the focused field of tab `target` — origin-checked, policy-gated, never returned to you.' },
  { name: 'type_totp', signature: 'type_totp(cred, target)', marker: 'def type_totp',
    summary: 'ENFORCED: the broker types cred\'s current TOTP at the focused field (auto-advances 6-box widgets).' },
  { name: 'get_totp', signature: 'get_totp(cred)', marker: 'def get_totp',
    summary: 'ENFORCED: the current 6-digit TOTP for cred as a value — self-expiring, single-use; the fallback for broken 2FA widgets type_totp can\'t drive. (There is no get for the password — it is only ever TYPED.)' },
]

// The canonical plugin source. Editing it marks installed copies as drifted —
// the install/update path rewrites them to this. Secrets never enter the LLM
// context: the broker types passwords over its own CDP session.
function buildHelperCode() {
  return `# --- Bitwarden broker verbs — a horse-browser plugin (atelier) -----------
# Managed by the atelier horse-browser module: a plugin in <workspace>/plugins/, auto-loaded by
# the harness and overwritten on every install/update. Put your own tweaks in agent_helpers.py,
# which loads LAST and wins; the broker's security is enforced in the daemon regardless.
# Secrets never enter the LLM context: the broker daemon types passwords over its
# own CDP session; TOTP codes are self-expiring.
import json as _json
import os as _os

# --- broker verbs (Bitwarden, ENFORCED) -----------------------------------------
# These do NOT read a vault here. They ask the signed local broker daemon, which
# holds the only Bitwarden session and enforces access + an origin check + a macOS
# approval that this process cannot skip. A password is TYPED by the broker over its own CDP
# session — it never enters this process or your transcript. TOTP codes self-expire,
# so those may be returned. \`cred\` is the BITWARDEN ITEM NAME (the 🐴 vault hint on
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

def type_secret(cred, target):
    """Broker types cred's Bitwarden password at the focused field of tab \`target\`. Origin-checked, policy-gated."""
    r = _bk({"op": "type_secret", "cred": cred, "target": target})
    return "typed %d chars for %s" % (r["typed"], cred)

def type_totp(cred, target):
    """Broker types cred's current TOTP at the focused field of \`target\` (auto-advances 6-box widgets)."""
    r = _bk({"op": "type_totp", "cred": cred, "target": target})
    return "typed %d-digit code" % r["typed"]

def get_totp(cred):
    """The current 6-digit TOTP for cred, returned as a value — self-expiring (~30s),
    single-use. Use it when type_totp can't drive a broken 2FA widget (per-character
    boxes, custom inputs): read the code, then type it yourself. There is no get for
    the PASSWORD — a password is only ever TYPED by the broker, never returned."""
    return _bk({"op": "get_totp", "cred": cred})["value"]

def list_login_profiles():
    """Your allow-list of sign-in targets: [{item,username,hosts,tier,hasTotp}] — SAFE,
    NON-SECRET metadata only (no passwords, no codes), and only for items in a Bitwarden
    collection the operator granted, never the whole vault. Pass 'item' to type_secret."""
    return _bk({"op": "list"})["items"]

# deprecated aliases: renamed verbs kept as warn-once shims so an already-running agent session
# (which learned an old name) gets the new verb + a notice, not a NameError. creds was renamed
# to list_login_profiles — the old name read like credential-dumping to safety classifiers.
def _renamed(old, new):
    import sys as _s
    _t = globals()[new]
    def _sh(*a, **k):
        _s.stderr.write("horse-browser: %s() was renamed to %s() — update your script.\\n" % (old, new))
        return _t(*a, **k)
    _sh._renamed_to = new
    return _sh
for _o, _n in {"creds": "list_login_profiles", "hb_creds": "list_login_profiles", "hb_type_secret": "type_secret", "hb_type_totp": "type_totp", "hb_get_totp": "get_totp"}.items():
    globals()[_o] = _renamed(_o, _n)

# get_secret was REMOVED: the broker never hands back a password — it only TYPES it
# (type_secret). A tombstone so an agent that learned the old name gets a clear reason.
def _gone(*a, **k):
    raise RuntimeError("get_secret was removed — the broker never returns a password. "
                       "Use type_secret(cred, target) to have the broker TYPE it into the focused field.")
get_secret = hb_get_secret = _gone
`
}

// The broker helpers ship as a horse-browser PLUGIN: <workspace>/plugins/atelier_login.py, which
// the harness auto-loads (precedence: core < plugins < the agent's own agent_helpers.py — last wins).
// No stub is appended to agent_helpers.py anymore; on install we migrate any user off the old models.
const PLUGIN_FILE = 'atelier_login.py'                  // the plugin's filename, under plugins/
// Present in the code we generate, so a file at that path can be identified as ours before we
// overwrite or delete it — the same guarantee the hook and the safety rule already had.
const PLUGIN_MARKER = 'Managed by the atelier horse-browser module'
const LEGACY_HELPERS_FILE = 'atelier_login_helpers.py'  // the pre-plugin sibling file — removed on migration
// Old stub blocks once appended to agent_helpers.py (LastPass-era + hb-auth) — stripped on install.
const LEGACY_STUB_RE = /\n*# >>> atelier-login:[^\n]*\n[\s\S]*?# <<< atelier-login <<<\n?/g
const HB_STUB_RE = /\n*# >>> hb-auth:[^\n]*\n[\s\S]*?# <<< hb-auth <<<\n?/g

// horse-browser's harness auto-loads <workspace>/agent_helpers.py on every call.
function helperFile() {
  const cands = [
    process.env.BH_AGENT_WORKSPACE && path.join(process.env.BH_AGENT_WORKSPACE, 'agent_helpers.py'),
    path.join(os.homedir(), '.config/browser-harness/agent-workspace/agent_helpers.py'),
  ].filter(Boolean)
  for (const c of cands) { try { if (fs.existsSync(c)) return c } catch {} }
  return cands[0] || null
}

function workspaceDir() { const f = helperFile(); return f ? path.dirname(f) : null }

// same PATH scan as the main backend's findOnPath (not imported — that would be circular)
function hbOnPath() {
  const H = os.homedir()
  const dirs = [
    ...String(process.env.PATH || '').split(':'),
    path.join(H, '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin',
    path.join(H, '.local', 'share', 'fnm', 'aliases', 'default', 'bin'), path.join(H, '.volta', 'bin'), path.join(H, '.asdf', 'shims'), '/opt/local/bin',
  ]
  for (const d of dirs) { if (!d) continue; try { fs.accessSync(path.join(d, 'horse-browser'), fs.constants.X_OK); return true } catch {} }
  return false
}
function pluginFile() { const ws = workspaceDir(); return ws ? path.join(ws, 'plugins', PLUGIN_FILE) : null }

function helperState(code) {
  const agentFile = helperFile()
  const ws = workspaceDir()
  const modPath = pluginFile()
  let modSrc = null
  try { modSrc = modPath && fs.existsSync(modPath) ? fs.readFileSync(modPath, 'utf8') : null } catch {}
  let fileExists = false
  try { fileExists = !!(agentFile && fs.existsSync(agentFile)) } catch {}
  let harnessReady = false
  try { harnessReady = !!(ws && fs.existsSync(ws)) } catch {}
  return {
    file: agentFile ? shortHome(agentFile) : null,
    fileExists,
    harnessReady,   // the harness workspace exists → we can install the plugin (was proxied by fileExists)
    code,
    moduleFile: {
      path: modPath ? shortHome(modPath) : null,
      exists: !!modSrc,
      current: modSrc === code,
    },
    helpers: HELPERS.map((h) => ({
      name: h.name, signature: h.signature, summary: h.summary,
      installed: !!modSrc && modSrc.includes(h.marker),
    })),
  }
}

// --- self-heal ---------------------------------------------------------------
// Always on, no toggle: the broker plugin re-writes itself whenever it drifts — robustness is
// the whole point, so it isn't optional.

// (Re)write the plugin at <workspace>/plugins/atelier_login.py and migrate any user off the old
// stub model. Idempotent — writes only what's missing/changed; never touches the operator's code.
function installLoginHelpers(code) {
  const ws = workspaceDir()
  if (!ws) return { ok: false, error: 'horse-browser harness workspace not found' }
  try {
    const pdir = path.join(ws, 'plugins')
    fs.mkdirSync(pdir, { recursive: true })
    const modPath = path.join(pdir, PLUGIN_FILE)
    let modSrc = null
    try { modSrc = fs.readFileSync(modPath, 'utf8') } catch {}
    // Never clobber a file that isn't ours. The hook and the safety rule both check their marker
    // before writing; this one didn't, so an operator's own atelier_login.py was overwritten (and,
    // in removeAgentIntegration, deleted) without a word.
    if (modSrc !== null && !modSrc.includes(PLUGIN_MARKER)) {
      return { ok: false, foreign: true,
        error: `${shortHome(modPath)} exists but wasn't written by this module (no marker) — refusing to overwrite it. Move it aside, then install again.` }
    }
    let wroteFile = false
    if (modSrc !== code) { fs.writeFileSync(modPath, code); wroteFile = true }
    // migrate: strip any stub we ever appended to agent_helpers.py (leaving the operator's own
    // code), and remove the old sibling helpers file the plugin supersedes.
    const agentFile = path.join(ws, 'agent_helpers.py')
    let contents = ''
    try { contents = fs.readFileSync(agentFile, 'utf8') } catch {}
    const stripped = contents.replace(LEGACY_STUB_RE, '\n').replace(HB_STUB_RE, '\n')
    let migrated = false
    if (stripped !== contents) {
      fs.writeFileSync(agentFile, stripped.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, ''))
      migrated = true
    }
    try { fs.unlinkSync(path.join(ws, LEGACY_HELPERS_FILE)) } catch {}
    return { ok: true, wroteFile, migrated }
  } catch (e) { return { ok: false, error: String(e) } }
}

/* ── the AGENT-INTEGRATION PACKAGE — verb plugin + hint hook + always-on rule.
 * One unit: installed together, removed together, governed by ONE persisted
 * toggle (data/agent-integration.json, default ON — it ships with the
 * credential feature). While ON and the daemon exists, self-heal keeps all
 * three CURRENT (absent or drifted → rewritten); OFF removes our files and
 * nothing resurrects them. A FOREIGN file (no marker) is never touched. */
function aiCfgPath(ctx) { return path.join(ctx.dataDir, 'agent-integration.json') }
function integrationEnabled(ctx) {
  try { return JSON.parse(fs.readFileSync(aiCfgPath(ctx), 'utf8')).enabled !== false } catch { return true }
}
// Returns the write error, or null on success. Swallowing it meant the route answered ok while
// the flag on disk still said the opposite — and since integrationEnabled() defaults to true when
// the file is unreadable, the next /state read would resurrect all three files the caller had
// just asked to remove.
function setIntegrationEnabled(ctx, enabled) {
  try {
    fs.mkdirSync(ctx.dataDir, { recursive: true })
    fs.writeFileSync(aiCfgPath(ctx), JSON.stringify({ enabled: !!enabled }, null, 2))
    return null
  } catch (e) { return String((e && e.message) || e) }
}
function installAgentIntegration(code, apiBase) {
  const plugin = installLoginHelpers(code)
  const hook = installHook(apiBase)
  const authRule = installAuthRule()
  return { ok: plugin.ok !== false && hook.ok !== false && authRule.ok !== false, plugin, hook, authRule }
}
function removeAgentIntegration() {
  // Marker-gated like the two below it — untoggling must not delete a file we didn't write.
  try { const p = pluginFile(); if (p && fs.readFileSync(p, 'utf8').includes(PLUGIN_MARKER)) fs.unlinkSync(p) } catch {}
  try { if (fs.readFileSync(HOOK_PATH, 'utf8').includes(HOOK_MARKER)) fs.unlinkSync(HOOK_PATH) } catch {}
  try { if (fs.readFileSync(AUTH_RULE_PATH, 'utf8').includes(AUTH_RULE_MARKER)) fs.unlinkSync(AUTH_RULE_PATH) } catch {}
}

// While the package is ON, keep the plugin CURRENT — absent or drifted, rewrite.
function maybeSelfHeal(ctx, code) {
  if (!brokerInstalled() || !integrationEnabled(ctx)) return { ran: false }
  const st = helperState(code)
  if (st.moduleFile.exists && st.moduleFile.current) return { ran: false }
  return { ran: true, repaired: installLoginHelpers(code) }
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

       list_login_profiles()   # -> [{item, username, hosts, tier, hasTotp}, …]

2. Open the login page; keep your tab's CDP target id (the tab you drive — e.g. the id
   \`bh_open(url)\` returns).
3. Type the USERNAME yourself — it's non-secret (from list_login_profiles). Use the
   PAVED verb \`type_into("<css>", "<username>")\` (real, trusted key events). Do NOT
   hand-roll a per-character \`Input.dispatchKeyEvent\` loop — it's flaky AND a
   char-by-char keystroke loop trips agent safety classifiers.
4. Focus the password field, then have the broker type the password:

       type_secret("<item>", target)   # returns a char count, never the value

   It's origin-checked (the tab's real URL must match the item's stored URIs) and
   policy-gated; an \`ask\`-tier item prompts the operator for a macOS approval, an
   \`auto\` one is silent.
5. Submit (click the login button). If a 2FA field appears and the item has TOTP:

       type_totp("<item>", target)

6. \`wait_for_load()\` and confirm you're signed in.

On any login page the broker prints a hint naming the exact item to use.
There is NO way to read a password back — it is only ever typed (type_secret). If
a 2FA form is broken and type_totp can't drive it, \`get_totp("<item>")\` returns the
current self-expiring code so you can type it yourself; never print it.

## Rules
- To find accounts, call \`list_login_profiles()\` — your allow-list (the accounts you may use).
  On any login page the broker also prints a hint naming the exact item. Never guess names.
- Do NOT run \`bw\` yourself. The broker holds the only Bitwarden session (a raw \`bw\` can't
  reach it), any CLI setup is the operator's one-time job, and the broker verbs keep the
  secret out of your context. Always go through them.
- Never print, echo, or paste a password or OTP code. The verbs resolve them internally.
- Live status of the tooling on this machine: \`curl -s ${adminBase}/state\`

## If a verb is missing
If \`list_login_profiles\` / \`type_secret\` is undefined, fetch the plugin source:
\`curl -s ${adminBase}/state | jq -r .helper.code\` and write it to the plugin path that
same response reports (\`.helper.moduleFile.path\`) — or install it from the Horse
Browser credentials page.
`
}

// --- page hints (horse-browser hints.d) --------------------------------------
// horse-browser calls every executable in ~/.config/horse-browser/hints.d/ on the
// first navigation to a host; our hook curls GET /hints?url=… and prints the reply.
// A host with a bound Bitwarden credential → an type_secret hint, rendered live by
// renderHint() from the actual match (id, username, tier, hasTotp) — no editable template.

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
  if (!brokerInstalled() || !integrationEnabled(ctx)) return { enabled: true, ran: false }
  let src = null
  try { src = fs.readFileSync(HOOK_PATH, 'utf8') } catch {}
  if (src != null && !src.includes(HOOK_MARKER)) return { enabled: true, ran: false }   // a foreign hook — never touch
  let exec = false
  try { exec = !!(src != null && fs.statSync(HOOK_PATH).mode & 0o111) } catch {}
  if (src === hookScript(apiBase) && exec) return { enabled: true, ran: false }
  return { enabled: true, ran: true, repaired: installHook(apiBase) }   // absent or drifted → (re)write
}

// --- agent rule file (~/.claude/rules/horse-browser-auth.md) ------------------
// The always-on SAFETY NET: the trust model + protocol, and ZERO accounts (the "which account"
// answer is the live per-page hint + list_login_profiles, never a static list). Kept a SEPARATE rule file,
// atelier-owned — the package's `claude-md.sh apply` overwrites its own horse-browser.md verbatim
// on every install/update, so an appended block would be wiped; a separate file survives it. Claude
// Code loads every file in ~/.claude/rules/ always-on, so the agent gets both.
const AUTH_RULE_PATH = path.join(os.homedir(), '.claude/rules/horse-browser-auth.md')
const AUTH_RULE_MARKER = 'atelier-hb-auth: managed by the atelier horse-browser module'
const AUTH_RULE = `# Browser credentials (broker)
<!-- ${AUTH_RULE_MARKER} — reinstall from its Credentials page -->

This browser has a credential broker — a signed local daemon that holds the vault session.
Some sites have a stored login you can use; you never see or handle the secret.

- Never type a password or OTP yourself — not from memory, a screenshot, or anything the
  operator pasted. Only the broker types secrets.
- When a 🐴 vault hint names an item: focus the field, then \`type_secret("<item>", target)\`
  (TOTP: \`type_totp("<item>", target)\`). It is typed over the broker's own session,
  origin-checked, and returned to you as a char count — never the value.
- Auto vs ask is the broker's call, not yours: an \`auto\` item signs in silently; an \`ask\` item
  prompts the operator to approve; a \`never\` item is refused. You just make the call.
- No hint? List reachable logins with \`list_login_profiles\`. Still nothing for this site → stop and ask the
  operator; don't improvise a login.
`
function authRuleStatus() {
  let src = null
  try { src = fs.readFileSync(AUTH_RULE_PATH, 'utf8') } catch {}
  const state = !src ? 'missing' : src === AUTH_RULE ? 'ok' : src.includes(AUTH_RULE_MARKER) ? 'stale' : 'foreign'
  return { path: shortHome(AUTH_RULE_PATH), state }
}
function installAuthRule() {
  try {
    fs.mkdirSync(path.dirname(AUTH_RULE_PATH), { recursive: true })
    fs.writeFileSync(AUTH_RULE_PATH, AUTH_RULE)
    return { ok: true }
  } catch (e) { return { ok: false, error: String(e) } }
}
// The always-on SAFETY rule is not optional and not a per-row setting: re-assert it on every
// status read, INDEPENDENT of the Auto-repair toggle (unlike the helper chain / hook), so it can't
// silently drift or vanish. A FOREIGN file (one we didn't write — no marker) is the only thing left
// untouched; the card surfaces that as a manual Replace.
function maybeSelfHealAuthRule(ctx) {
  if (!brokerInstalled() || !integrationEnabled(ctx)) return { ran: false, state: authRuleStatus().state }
  const st = authRuleStatus()
  if (st.state === 'ok' || st.state === 'foreign') return { ran: false, state: st.state }
  installAuthRule()
  return { ran: true, state: authRuleStatus().state }
}

// Tier-aware lead prepended to the page hint, so the agent knows whether landing on this login
// will sign in silently (auto) or prompt the operator (ask). Non-customisable — it reflects the
// ENFORCED policy, unlike the how-to template the operator can edit.
// One reachable login → a single concise line. The "broker types it, never printed" explanation
// lives in the always-on rule, so the hint is just the signal: WHO (username), the tier (what to
// expect), and the exact call. Always uses the item ID (unambiguous — required when two items
// share a name), and shows TOTP only when the item actually has one.
function credLine(m) {
  const tier = m.tier === 'ask' ? 'ask — prompts you' : 'auto'
  const totp = m.hasTotp ? ` · 2FA: type_totp("${m.id}", target)` : ''
  return `${m.username || m.item} (${tier}) → type_secret("${m.id}", target)${totp}`
}
function renderHint(ctx, match, host) {
  const matches = (Array.isArray(match.matches) && match.matches.length) ? match.matches : [match]
  // Cold hint = served from the non-secret cache (vault not warm). The fill still works — it
  // re-warms on first use (~5s) — so this just tells the agent not to bail early / expect staleness.
  const cold = match.cold ? '\n  vault cold — fill still works (re-warms on first use, ~5s)' : ''
  if (matches.length === 1) return 'vault login available · ' + credLine(matches[0]) + cold
  return `${matches.length} vault logins available here — pick one:\n` + matches.map((m) => '  • ' + credLine(m)).join('\n') + cold
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
  // heal an EXISTING daemon at mount — never bootstrap one. The credential
  // feature installs ONLY via the operator's explicit button on the board.
  if (brokerInstalled()) {
    ensureDaemon(ctx).catch((e) => ctx.log(`horse-browser broker: ensure failed: ${e.message}`))
  }
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
    maybeSelfHealAuthRule(ctx)
    res.json({
      integration: { enabled: integrationEnabled(ctx) },
      helper: helperState(HELPER_CODE),
      methods: methodStates(),
    })
  })

  // --- credential hint for a URL — consumed by the hints.d hook ------------
  router.get('/hints', async (req, res) => {
    let host = ''
    try { host = (new URL(new URL(req.url, 'http://x').searchParams.get('url')).hostname || '').replace(/^www\./, '') } catch {}
    if (!host) { res.writeHead(204); return res.end() }
    if (!brokerInstalled()) { res.writeHead(204); return res.end() }
    let match = null
    try { const r = await brokerCall({ op: 'hint', host }, 3000); match = r?.match || null } catch {}
    if (!match || !match.item) { res.writeHead(204); return res.end() }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(renderHint(ctx, match, host))
  })

  router.get('/hints-config', (req, res) => {
    maybeSelfHealHook(ctx, LOOPBACK)
    maybeSelfHealAuthRule(ctx)
    res.json({
      enabled: integrationEnabled(ctx),
      hook: hookStatus(LOOPBACK),
      authRule: authRuleStatus(),
    })
  })

  // --- the agent-integration package: one unit, one toggle -------------------
  router.post('/agent-integration', async (req, res) => {
    const body = await req.json().catch(() => ({}))
    const enabled = body.enabled !== false
    if (enabled && !brokerInstalled()) return res.json({ ok: false, error: 'install the credential broker daemon first (native/install.sh)' }, 409)
    if (enabled) {
      // persist ON only after the writes SUCCEED — otherwise the toggle reads
      // "installed" over a half-written integration and the setup skill declares
      // a false success.
      const r = installAgentIntegration(HELPER_CODE, LOOPBACK)
      if (!r.ok) return res.json({ ok: false, error: r.plugin?.error || r.hook?.error || r.authRule?.error || 'failed to write one or more agent-side files', ...r }, 500)
      const err = setIntegrationEnabled(ctx, true)
      if (err) return res.json({ ok: false, error: `the agent-side files were written, but the on/off flag could not be saved (${err}) — the toggle would not stick`, ...r }, 500)
    } else {
      // Flag first: if it can't be written, stop rather than removing the files while the flag
      // still reads "on" — the next /state read would put them straight back.
      const err = setIntegrationEnabled(ctx, false)
      if (err) return res.json({ ok: false, error: `could not save the off state (${err}) — leaving the integration in place rather than removing files that would be reinstalled` }, 500)
      removeAgentIntegration()
    }
    res.json({ ok: true, enabled, helper: helperState(HELPER_CODE), hook: hookStatus(LOOPBACK), authRule: authRuleStatus() })
  })
  router.post('/authrule/install', (req, res) => {
    const r = installAuthRule()
    if (!r.ok) return res.json({ ok: false, error: r.error }, 500)
    res.json({ ok: true, authRule: authRuleStatus() })
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
    return { ...s, installed: brokerInstalled(), hbInstalled: hbOnPath(), setupCmd: SETUP_CMD, cli: `"${BROKER_BIN}"` }
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
    // policy_set is a FULL REPLACE. Defaulting a broken body to {} meant an empty or malformed
    // POST silently revoked every grant — and since revoking is a downgrade, no Touch ID fired
    // and the caller still got ok:true. Fail the request instead of guessing.
    let body
    try { body = await req.json() } catch (e) {
      return res.json({ ok: false, reason: 'bad-request', error: `could not read the policy body (${e && e.message || e}) — refusing, because an unreadable body would revoke every grant` }, 400)
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.json({ ok: false, reason: 'bad-request', error: 'policy body must be an object of group rules' }, 400)
    }
    res.json(await brokerCall({ op: 'policy_set', policy: body, session: 'ui' }, 60000))  // may Touch-ID
    brokerStatusNow()
  })
  router.get('/broker/groups', async (_req, res) => res.json(await brokerCall({ op: 'groups', session: 'ui' }, 60000)))
  // `pull` = whether to also pull from the Bitwarden server: true/'always' for the operator's
  // explicit Rescan, 'if-stale' for the board's mount warm (the daemon then gates it to at most
  // once an hour across all triggers), absent to only index the local snapshot.
  router.post('/broker/refresh', async (req, res) => {
    let pull = false
    try { const b = await req.json(); pull = b && b.pull } catch {}
    res.json(await brokerCall({ op: 'refresh', pull, session: 'ui' }, 60000))
    brokerStatusNow()
  })
  router.get('/broker/reachable', async (_req, res) => res.json(await brokerCall({ op: 'list', session: 'ui' }, 60000)))
  router.post('/broker/sync', async (_req, res) => { res.json(await brokerCall({ op: 'sync', session: 'ui' }, 60000)); brokerStatusNow() })
  router.get('/broker/audit', async (req, res) => {
    const n = Math.min(500, Number(new URL(req.url, 'http://x').searchParams.get('n')) || 100)
    res.json(await brokerCall({ op: 'audit_tail', n }))
  })
  router.post('/broker/lock', async (_req, res) => { res.json(await brokerCall({ op: 'lock', session: 'ui' })); brokerStatusNow() })
  router.post('/broker/lock-soft', async (_req, res) => { res.json(await brokerCall({ op: 'lock_soft', session: 'ui' })); brokerStatusNow() })
  // There is deliberately NO install/rebuild endpoint — installing the daemon
  // is the setup agent's job, via the readable native/install.sh (see
  // GET /setup.md). The module only heals an existing daemon at mount.

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
