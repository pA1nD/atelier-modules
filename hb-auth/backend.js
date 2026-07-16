/*
 * hb-auth — the credentials & login-methods manager for Horse Browser.
 *
 * Sibling of the `browser` (how the machine works) and `hb-stealth` (passing
 * unnoticed) modules. This one is "getting in": it owns the account registry
 * (a recipe book layered over the shared LastPass vault), the login *methods*
 * (LastPass password + LastPass TOTP today; email/SMS codes on the roadmap),
 * the managed agent helpers (`lastpass_fill`, `otp_code`, and the full-flow
 * `hb_login`), and the credential-hint hook.
 *
 * The security line, unchanged from the browser module: a secret never enters
 * the LLM's context. Passwords and TOTP codes are read from the `lpass` CLI
 * *inside* the browser-harness python process and typed into the page over CDP.
 * This backend's HTTP API serves only NON-secret data — the vault index (item
 * names / usernames / urls, exactly what `lpass ls` shows), hosts, login
 * recipes/selectors, statuses, and helper source. It never serves `lpass show`
 * output. `data/` holds no secret by construction — there is no password or
 * TOTP-seed field in any schema; seeds live in LastPass.
 *
 * The only things it writes outside its own folder are operator-invoked (or
 * drift-repair of module-owned files): the hints.d hook, the managed
 * `atelier_login_helpers.py`, and a one-time load stub appended to
 * agent_helpers.py. The stub marker + helper filename are inherited
 * byte-identical from the browser module so an already-installed chain is
 * adopted, never orphaned.
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

// --- the downloadable(s) this approach needs ---------------------------------
// `check`/`version`/`latest` are read-only. `install`/`update` are shown to the
// operator as copyable commands — this module never runs them.
const TOOLS = [
  {
    id: 'lastpass-cli',
    name: 'LastPass CLI',
    bin: 'lpass',
    desc: 'Reads credentials from your LastPass vault in the terminal — the clean way for an agent to fetch a login, instead of driving the browser plugin.',
    from: 'Homebrew (macOS) · apt / dnf / source (Linux)',
    repo: 'https://github.com/lastpass/lastpass-cli',
    docs: 'https://lastpass.github.io/lastpass-cli/lpass.1.html',
    check: 'command -v lpass >/dev/null 2>&1 && echo yes',
    // "LastPass CLI v1.6.1.GIT" → "1.6.1"
    version: "lpass --version 2>/dev/null | grep -oE 'v?[0-9]+\\.[0-9]+\\.[0-9]+' | head -1 | sed 's/^v//'",
    // newest git tag, e.g. "1.6.1"
    latest: "git ls-remote --tags --refs https://github.com/lastpass/lastpass-cli 'v*' 2>/dev/null | sed 's#.*/v##' | sort -V | tail -1",
    install: 'brew install lastpass-cli',
    update: 'brew upgrade lastpass-cli',
  },
]

async function toolStatus(t, getLatest) {
  const [chk, ver, lat] = await Promise.all([run(t.check), run(t.version), getLatest(t)])
  const installed = chk.code === 0 && /yes/.test(chk.out)
  const current = installed && ver.out ? ver.out : null
  const latest = lat.out || null
  const upToDate = installed && current && latest ? current === latest : null
  let abs = null
  if (installed) { const w = await run('command -v ' + t.bin); abs = w.out || null }
  return {
    installed,
    current,
    latest,
    upToDate,
    path: abs ? shortHome(abs) : null,
    error: !latest && lat.err ? 'upstream check failed (no network?)' : null,
  }
}

// Prerequisites we only *detect* — installed/managed in Dev Tools or by the OS.
const PREREQS = [
  { id: 'horse-browser', name: 'Horse Browser', bin: 'horse-browser', why: 'the dedicated browser hb_login drives', managedIn: 'Dev Tools' },
  { id: 'browser-harness', name: 'Browser Harness', bin: 'browser-harness', why: 'the CDP driver + where the helpers live', managedIn: 'Dev Tools' },
  { id: 'brew', name: 'Homebrew', bin: 'brew', why: 'installs lastpass-cli on macOS', managedIn: 'system' },
]
async function prereqStatus(p) {
  const w = await run(`command -v ${p.bin} >/dev/null 2>&1 && echo yes`)
  return { id: p.id, name: p.name, why: p.why, managedIn: p.managedIn, installed: /yes/.test(w.out) }
}

// Live `lpass` session. The shell backend runs as the same user as whoever ran
// `lpass login`, so it reaches the same per-user agent via the ~/.lpass socket —
// no auth of our own. Reports account + the index (id/name/username/url) only;
// never a password (no `lpass show`).
async function sessionStatus() {
  const inst = await run('command -v lpass >/dev/null 2>&1 && echo yes')
  if (!/yes/.test(inst.out)) return { installed: false, loggedIn: false, account: null, items: null, logins: [] }
  const st = await run('lpass status')                 // "Logged in as X." (0) | "Not logged in." (1)
  const loggedIn = st.code === 0 && /logged in as/i.test(st.out)
  const m = st.out.match(/logged in as\s+(.+?)\.?\s*$/i)
  let logins = []
  if (loggedIn) {
    // id | name | username | url — the allow-list index. Never a password.
    const ls = await run("lpass ls --format '%ai|%an|%au|%al' 2>/dev/null")
    logins = (ls.out || '').split('\n').filter(Boolean).map((line) => {
      const [id, name, username, url] = line.split('|')
      return { id: id || '', name: name || '', username: username || '', url: url || '' }
    })
  }
  return { installed: true, loggedIn, account: loggedIn && m ? m[1] : null, items: loggedIn ? logins.length : null, logins }
}

// --- login methods registry --------------------------------------------------
// Each account references a method by `source` id. impl:false = roadmap. `/state`
// computes each method's tri-state (roadmap | available | configured) so email/SMS
// slot in later as: a new entry here + one new branch in hb_login, zero migration.
const METHODS = [
  { id: 'lastpass', kind: 'password', name: 'LastPass password', impl: true,
    helpers: ['lp_field', 'lastpass_fill'], requires: 'lpass installed + logged in',
    desc: 'lpass show --password inside the helper process, typed over CDP — never printed.' },
  { id: 'lastpass-otp', kind: 'totp', name: 'LastPass TOTP', impl: true,
    helpers: ['otp_code', 'otp_fill'], requires: 'a TOTP secret stored on the vault item',
    desc: 'lpass show --otp <item> — LastPass holds the TOTP seed; the 6-digit code is generated in-process.' },
  { id: 'email-code', kind: 'email', name: 'Email code', impl: false,
    desc: 'One-time code fetched from a mailbox the agent may read. Roadmap: per-account source = { source:"email-code", mailbox }.' },
  { id: 'sms-code', kind: 'sms', name: 'SMS code', impl: true,
    helpers: ['sms_code'], requires: 'an SMSPool rental number + SMSPOOL_API_KEY in the instance .env',
    desc: 'A 2FA SMS delivered to your SMSPool rental number — polled server-side, parsed, and typed in. The code never enters the model.' },
  { id: 'bitwarden', kind: 'password', name: 'Bitwarden (broker)', impl: true, enforced: true,
    helpers: ['hb_type_secret', 'hb_type_totp', 'hb_get_totp', 'hb_get_secret'],
    requires: 'bw installed + logged in, and the broker set up (macOS approval) — see the Broker page',
    desc: 'ENFORCED path: a signed local daemon holds the only vault session and gates every credential by the Bitwarden COLLECTION it lives in (auto | ask-approval | never) + an origin check read from the browser. Access is managed by moving items between collections; the password is typed over the broker\'s OWN CDP session, so it never enters agent code — a boundary, not a convention.' },
  { id: 'onepassword', kind: 'password', name: '1Password CLI (op)', impl: false,
    desc: 'First-party agent tooling exists — a candidate password source. Roadmap.' },
]

// --- the agent helpers we document + detect ----------------------------------
// A registry so the UI renders every entry; `marker` is how we detect it on disk.
const HELPERS = [
  { name: 'hb_login', signature: 'hb_login(site)  # slug or host', marker: 'def hb_login',
    summary: 'Full flow: fetch the non-secret recipe, open the login page, fill from LastPass, submit, answer a TOTP prompt, verify, and report the result back — signs in end-to-end.' },
  { name: 'lastpass_fill', signature: 'lastpass_fill(name, user_css, pass_css, submit_css=None)', marker: 'def lastpass_fill',
    summary: 'Fetch a login from LastPass and type it into the page over CDP — the password never enters the LLM context.' },
  { name: 'lp_field', signature: "lp_field(name, field)  # field: 'username' | 'password'", marker: 'def lp_field',
    summary: 'Read a single field of a LastPass item (used by lastpass_fill).' },
  { name: 'otp_code', signature: 'otp_code(name)', marker: 'def otp_code',
    summary: 'The current 6-digit TOTP for a LastPass item that has a TOTP secret stored.' },
  { name: 'otp_fill', signature: 'otp_fill(otp_css, name, submit_css=None)', marker: 'def otp_fill',
    summary: 'Type the current TOTP code for an item into a field, optionally submit.' },
  { name: 'sms_code', signature: 'sms_code(after_id=0, timeout=120)', marker: 'def sms_code',
    summary: 'Wait for a new inbound 2FA SMS on the SMSPool rental and return its code — used by hb_login for SMS 2FA.' },
  { name: 'hb_type_secret', signature: 'hb_type_secret(cred, target)', marker: 'def hb_type_secret',
    summary: 'ENFORCED: the broker types cred\'s Bitwarden password at the focused field of tab `target` — origin-checked, policy-gated, never returned to you.' },
  { name: 'hb_type_totp', signature: 'hb_type_totp(cred, target)', marker: 'def hb_type_totp',
    summary: 'ENFORCED: the broker types cred\'s current TOTP at the focused field (auto-advances 6-box widgets).' },
  { name: 'hb_get_totp', signature: 'hb_get_totp(cred)', marker: 'def hb_get_totp',
    summary: 'ENFORCED: the current 6-digit TOTP for cred as a value (self-expiring; safe fallback for odd widgets).' },
  { name: 'hb_get_secret', signature: 'hb_get_secret(cred)', marker: 'def hb_get_secret',
    summary: 'ENFORCED: cred\'s password as a value — a macOS approval every time; for non-web use (CLI/env) only. Avoid printing it.' },
]

// The canonical helper source, templated with this module's loopback API base so
// hb_login can reach /recipe + /report. Deterministic (ctx.port is fixed per
// process), so helperState's equality checks stay stable across reloads.
function buildHelperCode(base) {
  return `# --- hb-auth login helpers (LastPass) -------------------------------------------
# Managed by the atelier hb-auth module — overwritten on every install/update from
# its Methods page. Put your own tweaks in agent_helpers.py (under different names).
# Secrets never enter the LLM context: passwords and TOTP codes are fetched from
# the LastPass CLI inside this python process and typed into the page over CDP.
# Requires a live 'lpass' session — once per boot:
#   LPASS_AGENT_TIMEOUT=0 lpass login <agent-account>
import json as _json
import os as _os
import subprocess as _sp
import urllib.parse as _uq
import urllib.request as _ur

# Templated by the module at install time; override per-shell with HB_AUTH_BASE.
_HB_BASE = "${base}"

def _hb_api(path, payload=None):
    """GET (payload=None) or POST (payload=dict) a NON-secret hb-auth endpoint."""
    url = _os.environ.get("HB_AUTH_BASE", _HB_BASE) + path
    data = _json.dumps(payload).encode() if payload is not None else None
    req = _ur.Request(url, data=data,
                      headers={"Content-Type": "application/json"} if data else {})
    with _ur.urlopen(req, timeout=6) as r:
        return _json.loads(r.read().decode() or "{}")

# ---- granular helpers -----------------------------------------------------------

def lp_field(name, field):
    """Read one field ('username' | 'password') of LastPass item \`name\`."""
    return _sp.check_output(["lpass", "show", "--" + field, name], text=True).strip()

def otp_code(name):
    """Current TOTP code for LastPass item \`name\` (a TOTP secret must be stored on it)."""
    return _sp.check_output(["lpass", "show", "--otp", name], text=True).strip()

# cdp("Runtime.evaluate") not js(): in the agent_helpers namespace only cdp is in scope.
def _focus(css):
    cdp("Runtime.evaluate", expression=f"document.querySelector({css!r}).focus()")

def _click(css):
    cdp("Runtime.evaluate", expression=f"document.querySelector({css!r}).click()")

def _exists(css):
    r = cdp("Runtime.evaluate", expression=f"!!document.querySelector({css!r})",
            returnByValue=True)
    try:
        return bool(r["result"]["value"])
    except Exception:
        return False

def lastpass_fill(name, user_css, pass_css, submit_css=None):
    """Fill (and optionally submit) a login form from the dedicated LastPass vault.
    \`name\` = the LastPass item name, e.g. 'github.com'. Values are typed natively
    via CDP (Input.insertText) so React/site listeners fire — and are never printed."""
    _focus(user_css)
    cdp("Input.insertText", text=lp_field(name, "username"))
    _focus(pass_css)
    cdp("Input.insertText", text=lp_field(name, "password"))
    if submit_css:
        _click(submit_css)

def otp_fill(otp_css, name, submit_css=None):
    """Type the current TOTP code for item \`name\` into \`otp_css\`, optionally submit."""
    _focus(otp_css)
    cdp("Input.insertText", text=otp_code(name))
    if submit_css:
        _click(submit_css)

def _sms_latest_id():
    """Highest SMS id currently in the SMSPool rental inbox (a baseline to poll past)."""
    try:
        return int(_hb_api("/sms/latest-id").get("id") or 0)
    except Exception:
        return 0

def sms_code(after_id=0, timeout=120, poll=5):
    """Wait for a NEW inbound 2FA SMS (id > after_id) on the SMSPool rental number and
    return its code as digits, or None on timeout. hb-auth reads the SMS server-side —
    the code is typed into the page over CDP, never returned to the model."""
    import time as _t
    deadline = _t.time() + timeout
    while _t.time() < deadline:
        try:
            r = _hb_api("/sms-code?afterId=%d" % int(after_id or 0))
            if r.get("ok"):
                return r.get("code")
        except Exception:
            pass
        _t.sleep(poll)
    return None

# ---- full flow ------------------------------------------------------------------

def hb_login(site):
    """Log into a registered site end-to-end and report the outcome to hb-auth.
    \`site\` = an hb-auth account slug ('github') or host ('github.com'). Fetches the
    NON-secret recipe over HTTP, opens the login page, fills the credential from
    LastPass, submits, answers a TOTP prompt when the account has one, verifies,
    then POSTs {state, detail} back so the registry updates itself.
    Returns {'ok', 'state', 'detail'} — never a secret.
    States: verified | 2fa-blocked | broken | no-recipe."""
    try:
        r = _hb_api("/recipe?site=" + _uq.quote(str(site)))
    except Exception as e:
        return {"ok": False, "state": "no-recipe", "detail": "hb-auth unreachable: %r" % (e,)}
    if not r.get("ok"):
        return {"ok": False, "state": "no-recipe", "detail": r.get("error", "unknown site")}
    a = r["account"]; rec = a.get("recipe") or {}; item = a["lpassItem"]
    out = {"ok": False, "state": "broken", "detail": ""}
    methods = a.get("methods") or {}
    sms_base = _sms_latest_id() if methods.get("sms") else 0   # baseline BEFORE submit
    try:
        bh_open(a["loginUrl"]); wait_for_load()
        if not rec.get("user") or not rec.get("pass"):
            out.update(state="no-recipe",
                       detail="no selectors saved yet — learn them once, save on the account page")
            return out
        if rec.get("flow") == "two-step":
            _focus(rec["user"]); cdp("Input.insertText", text=lp_field(item, "username"))
            _click(rec.get("next") or rec.get("submit")); wait_for_load()
            _focus(rec["pass"]); cdp("Input.insertText", text=lp_field(item, "password"))
            if rec.get("submit"): _click(rec["submit"])
        else:
            lastpass_fill(item, rec["user"], rec["pass"], rec.get("submit"))
        wait_for_load()
        if rec.get("otp") and _exists(rec["otp"]):
            if methods.get("totp"):
                otp_fill(rec["otp"], item, rec.get("otpSubmit") or rec.get("submit"))
                wait_for_load()
            elif methods.get("sms"):
                code = sms_code(sms_base)
                if not code:
                    out.update(state="2fa-blocked", detail="no SMS code arrived within the wait window")
                    return out
                _focus(rec["otp"]); cdp("Input.insertText", text=code)
                if rec.get("otpSubmit") or rec.get("submit"):
                    _click(rec.get("otpSubmit") or rec.get("submit"))
                wait_for_load()
            else:
                out.update(state="2fa-blocked",
                           detail="OTP prompt shown; no TOTP or SMS method on this account")
                return out
        ok = _exists(rec["success"]) if rec.get("success") else not _exists(rec["pass"])
        out.update(ok=ok, state="verified" if ok else "broken",
                   detail="" if ok else "post-login check failed — page may have changed")
        return out
    except Exception as e:
        out.update(state="broken", detail="%s: %.200s" % (type(e).__name__, e))
        return out
    finally:
        try:
            _hb_api("/report", {"site": a.get("slug") or str(site),
                                "state": out["state"], "detail": out["detail"]})
        except Exception:
            pass

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

// The managed helper file + its load-once stub. Marker strings are inherited
// BYTE-IDENTICAL from the browser module so an already-installed stub is adopted,
// not orphaned. The stub is appended to the END of agent_helpers.py, so the
// module file's defs win over any older hand-pasted copy earlier in the file.
const LOGIN_HELPERS_FILE = 'atelier_login_helpers.py'
const LOGIN_STUB_BEGIN = '# >>> atelier-login: LastPass helpers (managed loader — do not edit) >>>'
const LOGIN_STUB = `${LOGIN_STUB_BEGIN}
# The LastPass login helpers live in ${LOGIN_HELPERS_FILE} next to this file. The
# atelier hb-auth module owns THAT file and overwrites it on update — your own code
# here is never touched. Install/update from the module's Methods page.
try:
    import os as _al_os
    _al_path = _al_os.path.join(_al_os.path.dirname(_al_os.path.abspath(__file__)), "${LOGIN_HELPERS_FILE}")
    exec(compile(open(_al_path).read(), _al_path, "exec"))
except Exception as _al_err:
    import sys as _al_sys
    print("atelier-login: couldn't load ${LOGIN_HELPERS_FILE} (%r) — reinstall from the hb-auth module" % (_al_err,), file=_al_sys.stderr)
# <<< atelier-login <<<
`

// browser-harness auto-loads <workspace>/agent_helpers.py on every call. Find it.
// Identical twin of the browser module's helperFile() so both resolve the same file.
function helperFile() {
  const cands = [
    process.env.BH_AGENT_WORKSPACE && path.join(process.env.BH_AGENT_WORKSPACE, 'agent_helpers.py'),
    path.join(os.homedir(), '.config/browser-harness/agent-workspace/agent_helpers.py'),
  ].filter(Boolean)
  for (const c of cands) { try { if (fs.existsSync(c)) return c } catch {} }
  return cands[0] || null
}

// the _HB_BASE = "..." line embedded in the managed file, if any
function embeddedBase(src) {
  const m = (src || '').match(/_HB_BASE = "([^"]*)"/)
  return m ? m[1] : null
}

function helperState(code, base) {
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
      baseDrift: !!modSrc && embeddedBase(modSrc) !== base,
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
function selfHealCfg(ctx) { return path.join(ctx.dataDir, 'selfheal.json') }
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
  if (!file) return { ok: false, error: 'browser-harness workspace not found' }
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const modPath = path.join(path.dirname(file), LOGIN_HELPERS_FILE)
    let modSrc = null
    try { modSrc = fs.readFileSync(modPath, 'utf8') } catch {}
    let wroteFile = false
    if (modSrc !== code) { fs.writeFileSync(modPath, code); wroteFile = true }
    let contents = ''
    try { contents = fs.readFileSync(file, 'utf8') } catch {}
    let wiredStub = false
    if (!contents.includes(LOGIN_STUB_BEGIN)) {
      fs.writeFileSync(file, (contents ? contents.replace(/\n*$/, '\n\n') : '') + LOGIN_STUB)
      wiredStub = true
    }
    return { ok: true, wroteFile, wiredStub }
  } catch (e) { return { ok: false, error: String(e) } }
}

// Repairs when the chain is broken (stub missing / module file absent) OR when the
// embedded API base has drifted (a port/mount change) — that base line is
// 100% module-owned, so re-asserting it is safe. General content staleness (a
// reworded helper we ship) is left to the explicit Update button.
function maybeSelfHeal(ctx, code, base) {
  if (!selfHealEnabled(ctx)) return { enabled: false, ran: false }
  const st = helperState(code, base)
  const broken = !st.stubWired || !st.moduleFile.exists || st.moduleFile.baseDrift
  if (!broken) return { enabled: true, ran: false }
  return { enabled: true, ran: true, repaired: installLoginHelpers(code) }
}

// --- account registry (data/accounts.json) -----------------------------------
// The recipe book layered over the shared vault. No secret field exists here.
function accountsPath(ctx) { return path.join(ctx.dataDir, 'accounts.json') }
function loadAccounts(ctx) {
  try {
    const j = JSON.parse(fs.readFileSync(accountsPath(ctx), 'utf8'))
    if (j && j.accounts) return j
  } catch {}
  return { version: 1, accounts: {} }
}
function saveAccounts(ctx, data) {
  fs.mkdirSync(ctx.dataDir, { recursive: true })
  const tmp = accountsPath(ctx) + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, accountsPath(ctx))
}

const hostFromUrl = (u) => { try { return (new URL(u).hostname || '').replace(/^www\./, '') } catch { return '' } }
const isVaultHost = (h) => h && h !== 'group' && h !== 'sn'

function deriveSlug(host, existing) {
  let base = (host || '').replace(/^www\./, '')
  const parts = base.split('.')
  base = (parts.length > 1 ? parts.slice(0, -1).join('-') : base) || 'account'
  base = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'account'
  let slug = base, n = 2
  while (existing[slug]) slug = `${base}-${n++}`
  return slug
}

const EMPTY_RECIPE = { user: '', pass: '', submit: '', next: '', otp: '', otpSubmit: '', success: '', flow: 'single', notes: '' }

// Non-secret projection served to the helper (and the UI). By construction there
// is nothing secret to omit — this is the whole account.
function pubAccount(a, extra = {}) {
  return {
    slug: a.slug, label: a.label, host: a.host, loginUrl: a.loginUrl,
    lpassItem: a.lpassItem, lpassId: a.lpassId || null, username: a.username || '',
    methods: a.methods || {}, recipe: { ...EMPTY_RECIPE, ...(a.recipe || {}) },
    status: a.status || { state: 'untested' }, agentNotes: a.agentNotes || '',
    createdAt: a.createdAt, updatedAt: a.updatedAt, ...extra,
  }
}

const recipeComplete = (a) => !!(a && a.recipe && a.recipe.user && a.recipe.pass)

// Reconcile the registry against the live vault index: mark vaultPresent, and
// heal id-matched renames of lpassItem in place. Returns { accounts, unregistered,
// changed }.
function reconcile(store, session) {
  const byId = new Map(), byName = new Map()
  for (const l of session.logins || []) {
    if (l.id) byId.set(l.id, l)
    if (l.name) byName.set(l.name, l)
  }
  let changed = false
  const accounts = Object.values(store.accounts).map((a) => {
    let vaultPresent = false
    const hit = (a.lpassId && byId.get(a.lpassId)) || byName.get(a.lpassItem) || null
    if (hit) {
      vaultPresent = true
      if (a.lpassId && hit.name && hit.name !== a.lpassItem) { a.lpassItem = hit.name; a.updatedAt = Date.now(); changed = true } // rename healed
      if (!a.lpassId && hit.id) { a.lpassId = hit.id; changed = true }
      if (hit.username && hit.username !== a.username) { a.username = hit.username }
    }
    return pubAccount(a, { vaultPresent })
  }).sort((x, y) => (x.label || x.slug).localeCompare(y.label || y.slug))

  const known = new Set()
  for (const a of Object.values(store.accounts)) { if (a.lpassId) known.add('id:' + a.lpassId); known.add('nm:' + a.lpassItem) }
  const unregistered = (session.logins || []).filter((l) => {
    const h = hostFromUrl(l.url)
    return isVaultHost(h) && !known.has('id:' + l.id) && !known.has('nm:' + l.name)
  }).map((l) => ({ id: l.id, name: l.name, username: l.username, host: hostFromUrl(l.url), url: l.url }))

  return { accounts, unregistered, changed }
}

function probeTotp(item) {
  // exit code only — stdout (a live one-time code) is discarded, never serialized.
  return run(`lpass show --otp ${JSON.stringify(item)} >/dev/null 2>&1 && echo yes`).then((r) => /yes/.test(r.out))
}

// Which vault items have a TOTP secret. Probes `lpass show --otp` for every item
// (exit code only — codes discarded), concurrency-limited. Slow-ish, so it runs
// in the background and is cached; the item NAMES it returns are non-secret.
async function scanTotp() {
  const s = await sessionStatus()
  if (!s.loggedIn) return { items: [], at: Date.now() }
  const names = [...new Set((s.logins || []).map((l) => l.name).filter(Boolean))]
  const has = []
  const CONC = 8
  for (let i = 0; i < names.length; i += CONC) {
    const batch = names.slice(i, i + CONC)
    const oks = await Promise.all(batch.map((n) => probeTotp(n)))
    batch.forEach((n, j) => { if (oks[j]) has.push(n) })
  }
  return { items: has, at: Date.now() }
}

function pushHistory(status, entry) {
  status.history = [entry, ...(status.history || [])].slice(0, 20)
}

// --- the copy-pasteable agent skill (templated with this box's URL) ----------
function renderSkill({ adminBase }) {
  return `---
name: hb-auth-login
description: Log into a website as an agent without the secret ever entering your context. The go-to is the Bitwarden broker, which TYPES the password over CDP (origin-checked and policy-gated); an older LastPass path exists too.
---

# Skill — log into a site (hb-auth)

You drive a browser over CDP (horse-browser / browser-harness). hb-auth signs a user
in without the password or 2FA code ever entering your context. The primary path is the
**Bitwarden broker**; a legacy **LastPass** path also exists. Not being logged into
LastPass does NOT block you — use the broker.

## Bitwarden broker — the go-to
A signed local daemon holds the only vault session and TYPES credentials for you over
its own CDP session; you never see the value. It works whenever the broker is connected
(independent of LastPass).

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

On any login page hb-auth prints a hint naming the exact item to use.
\`hb_get_secret("<item>")\` / \`hb_get_totp("<item>")\` return a value for non-web (CLI/env)
use — a macOS approval each time; never print it.

## LastPass — legacy, only if the operator set it up
If (and only if) the LastPass path is configured, a registered site signs in with one call:

    hb_login("github")   # slug or host — fills from LastPass, handles TOTP, reports {ok,state,detail}

Granular: \`lastpass_fill("host", "#user", "#pass", "#submit")\` + \`otp_fill("#otp", "host", "#submit")\`.
This path needs the LastPass CLI logged in — if it isn't, that affects ONLY LastPass, not
the Bitwarden broker above. Don't treat a logged-out \`lpass\` as a blocker.

## Rules
- To find accounts, call \`hb_creds()\` — that's your allow-list (the accounts you may use).
  On any login page hb-auth also prints a hint naming the exact item. Never guess item names.
- Do NOT run \`bw\` or \`lpass\` yourself, and do NOT \`lpass login\`. The broker holds the only
  Bitwarden session (a raw \`bw\` can't reach it), any CLI setup is the operator's one-time job,
  and the hb_* helpers keep the secret out of your context. Always go through the helpers.
- A logged-out LastPass CLI is NOT a reason to stop. If a credential exists, use the broker.
- Never print, echo, or paste a password or OTP code. The helpers resolve them internally.
- Live status of the tooling on this machine: \`curl -s ${adminBase}/state\`

## If a helper is missing
If \`hb_creds\` / \`hb_type_secret\` / \`hb_login\` is undefined, fetch the source:
\`curl -s ${adminBase}/state | jq -r .helper.code\` and append it to the agent_helpers.py
path that same response reports — or install it from the hb-auth Methods page.
`
}

const pubTool = (t) => ({ id: t.id, name: t.name, bin: t.bin, desc: t.desc, from: t.from, repo: t.repo, docs: t.docs, install: t.install, update: t.update })

// --- page hints (horse-browser hints.d) --------------------------------------
// horse-browser calls every executable in ~/.config/horse-browser/hints.d/ on the
// first navigation to a host; our hook curls GET /hints?url=… and prints the reply.
// Registered host → hb_login hint; vault-only host → lastpass_fill hint. The vault
// index is TTL-cached (never an lpass exec per navigation).
const HINT_REGISTERED_DEFAULT = `hb-auth knows this site (account "{slug}"): call hb_login("{slug}") — it signs you in end to end from LastPass; the secret never enters your context.`
const HINT_UNREGISTERED_DEFAULT = `LastPass has a login for this site (item "{name}"): fill it with lastpass_fill("{name}", '<user css>', '<pass css>', '<submit css>') — the password never enters your context. Register it in hb-auth to enable hb_login.`
const HINT_NOHELPER = `LastPass has a login for this site (item "{name}") — but the login helpers aren't installed; see the hb-auth module's Methods page.`

function hintsCfgPath(ctx) { return path.join(ctx.dataDir, 'hints.json') }
function hintTemplates(ctx) {
  let saved = {}
  try { saved = JSON.parse(fs.readFileSync(hintsCfgPath(ctx), 'utf8')) || {} } catch {}
  const reg = (saved.registered && String(saved.registered).trim()) ? String(saved.registered) : HINT_REGISTERED_DEFAULT
  const unreg = (saved.unregistered && String(saved.unregistered).trim()) ? String(saved.unregistered) : HINT_UNREGISTERED_DEFAULT
  return { registered: reg, unregistered: unreg }
}
const applyHint = (tpl, vars) => tpl.replace(/\{(name|host|slug)\}/g, (_, k) => vars[k] ?? '')

const HOOK_PATH = path.join(os.homedir(), '.config/horse-browser/hints.d/atelier-lastpass')
const HOOK_MARKER = 'atelier-lastpass — horse-browser hints.d hook'
function hookScript(apiBase) {
  const origin = apiBase.replace(/(^https?:\/\/[^/]+).*/, '$1')
  const apiPath = apiBase.slice(origin.length)
  return `#!/bin/sh
# ${HOOK_MARKER}. Called as: <hook> <url>.
# Asks the local atelier hb-auth module whether the operator's vault has a login
# for this URL's site and prints its one-line hint (or nothing). All LastPass
# logic lives server-side — this file is just the wire. Installed by the module;
# reinstall from its Methods page after a port or mount change.
exec curl -sf -m 2 --get --data-urlencode "url=$1" \\
  "\${ATELIER_BASE:-${origin}}${apiPath}/hints"
`
}
function hookStatus(apiBase) {
  let src = null
  try { src = fs.readFileSync(HOOK_PATH, 'utf8') } catch {}
  let exec = false
  try { exec = !!src && !!(fs.statSync(HOOK_PATH).mode & 0o111) } catch {}
  const canonical = hookScript(apiBase)
  let helpersReady = false
  try {
    const dir = helperFile() && path.dirname(helperFile())
    helpersReady = !!dir && fs.readFileSync(path.join(dir, 'horse_helpers.py'), 'utf8').includes('_hb_hints')
  } catch {}
  const state = !src ? 'missing' : !exec ? 'stale' : src === canonical ? 'ok' : src.includes(HOOK_MARKER) ? 'stale' : 'foreign'
  return { path: shortHome(HOOK_PATH), state, helpersReady }
}
function installHook(apiBase) {
  try {
    fs.mkdirSync(path.dirname(HOOK_PATH), { recursive: true })
    fs.writeFileSync(HOOK_PATH, hookScript(apiBase), { mode: 0o755 })
    fs.chmodSync(HOOK_PATH, 0o755)
    return { ok: true }
  } catch (e) { return { ok: false, error: String(e) } }
}
// Re-assert a hook WE installed once it has drifted (stale URL / lost +x). Never
// creates a missing hook (that's the Install button's job) and never overwrites a
// foreign file. This is what migrates the browser-era hook URL to /api/<ws>/hb-auth.
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

// --- SMS 2FA via SMSPool -----------------------------------------------------
// The SMSPool API key lives in the instance .env (process.env.SMSPOOL_API_KEY) —
// never in this module's data/ and never returned to a client. The rental number
// receives 2FA SMS; we poll it server-side, parse the code, and hand ONLY the code
// to the login helper / the operator's own inbox view. Same boundary as TOTP: the
// code goes SMSPool → here → helper → page, never through the model.
const SMS_BASE = 'https://api.smspool.net'
const smsKeySet = () => !!process.env.SMSPOOL_API_KEY
async function smsApi(pathname, params = {}) {
  const key = process.env.SMSPOOL_API_KEY
  if (!key) return { _noKey: true }
  const qs = new URLSearchParams({ ...params, key }).toString()
  try {
    const r = await fetch(`${SMS_BASE}/${pathname}?${qs}`)
    const txt = await r.text()
    try { return JSON.parse(txt) } catch { return { _bad: true } }
  } catch (e) { return { _err: String((e && e.message) || e) } }
}
function smsCfgPath(ctx) { return path.join(ctx.dataDir, 'sms.json') }
function loadSms(ctx) {
  let c = {}
  try { c = JSON.parse(fs.readFileSync(smsCfgPath(ctx), 'utf8')) || {} } catch {}
  return { enabled: c.enabled !== false, rentalCode: c.rentalCode || null, number: c.number || '' }
}
function saveSms(ctx, c) {
  fs.mkdirSync(ctx.dataDir, { recursive: true })
  fs.writeFileSync(smsCfgPath(ctx), JSON.stringify(c, null, 2))
}
// Resolve (and cache) the rental code from the account's rental history if unset.
async function resolveRentalCode(ctx) {
  const cfg = loadSms(ctx)
  if (cfg.rentalCode) return cfg.rentalCode
  const h = await smsApi('rental/history')
  const rows = Array.isArray(h) ? h : []
  const act = rows.filter((r) => r.action === 'activate')
  const code = ((act[act.length - 1]) || rows[rows.length - 1] || {}).rental || null
  if (code) saveSms(ctx, { ...cfg, rentalCode: code })
  return code
}
// Extract the OTP: a labeled code first, then a grouped code (632-963), then a
// 6–8 digit run, then a 4–5 digit run that isn't a year (skips "May 14, 2026").
function extractCode(text) {
  if (!text) return null
  const clean = (s) => s.replace(/\D/g, '')
  let m = text.match(/(?:code|otp|pin|passcode|verification|c[oó]digo)\b\D{0,14}(\d[\d\s-]{2,10}\d)/i)
  if (m) { const d = clean(m[1]); if (d.length >= 4 && d.length <= 8) return d }
  m = text.match(/\b\d{3}[-\s]\d{3}(?:[-\s]\d{2,3})?\b/)
  if (m) return clean(m[0])
  m = text.match(/\b\d{6,8}\b/)
  if (m) return m[0]
  m = text.match(/\b(?!(?:19|20)\d\d\b)\d{4,5}\b/)
  if (m) return m[0]
  return null
}
function parseMessages(resp) {
  const raw = resp && resp.messages ? Object.values(resp.messages) : []
  return raw.map((x) => ({ id: Number(x.ID), sender: x.sender || '', message: x.message || '', code: extractCode(x.message), at: x.timestamp || '' }))
    .filter((x) => Number.isFinite(x.id))
    .sort((a, b) => b.id - a.id)
}
// A parsed SMS as an activity/WS event.
function smsEvent(m) {
  return { id: 'sms-' + m.id, msgId: m.id, type: 'sms', source: 'SMSPool', sourceId: 'smspool', at: m.at, sender: m.sender, code: m.code, message: m.message }
}

// Broker hint for a host. The daemon resolves it against the live vault index —
// but ONLY while the vault is warm, so this never triggers a Touch ID prompt on a
// page navigation (a cold vault just returns no match).
async function brokerHintFor(ctx, host) {
  if (!brokerInstalled()) return null
  try {
    const r = await brokerCall({ op: 'hint', host }, 3000)
    const m = r?.match
    if (m && m.item) {
      return `hb-broker (enforced) can sign in here: focus the field, then hb_type_secret("${m.item}", target) — the password is typed by the broker and never printed. TOTP: hb_type_totp("${m.item}", target).`
    }
  } catch {}
  return null
}

export default {
  async mountRoutes(router, ctx) {
    // Loopback API base — the hook curls it and the python helper embeds it. Fixed
    // per process (ctx.port), so the templated HELPER_CODE stays byte-stable.
    const LOOPBACK = `http://127.0.0.1:${ctx.port}/api/${ctx.qualifiedId}`
    const HELPER_CODE = buildHelperCode(LOOPBACK)

    // Bring up the credential-broker daemon (compile-on-first-run + launchd) and
    // start streaming its audit log over the module WS. Fire-and-forget: the build
    // can take ~30s, and the Broker page polls status meanwhile.
    const brokerSlot = ctx.module(ctx.id)
    ensureDaemon(ctx, brokerSlot).catch((e) => ctx.log(`hb-auth broker: ensure failed: ${e.message}`))
    startAuditTail(ctx, brokerSlot)
    const publicBase = (req) => {
      const proto = (req.headers['x-forwarded-proto'] || 'http').toString().split(',')[0].trim()
      const host = (req.headers['x-forwarded-host'] || req.headers.host || `localhost:${ctx.port}`).toString().split(',')[0].trim()
      return `${proto}://${host}/api/${ctx.qualifiedId}`
    }
    // Cached upstream-version probe (1 h TTL) so /state stays fast.
    const getLatest = async (t) => {
      const slot = ctx.module(ctx.id)
      slot.latest ??= {}
      const c = slot.latest[t.id]
      if (c && Date.now() - c.at < 3600_000) return { out: c.out, err: c.err }
      const r = await run(t.latest)
      slot.latest[t.id] = { at: Date.now(), out: r.out || '', err: r.err || '' }
      return { out: r.out || '', err: r.err || '' }
    }
    const invalidateCaches = () => { const slot = ctx.module(ctx.id); slot.hint = null }

    // Method tri-states, given a live session + the registry.
    const methodStates = (session, accounts) => METHODS.map((m) => {
      let state = 'roadmap'
      if (m.impl) {
        if (m.id === 'lastpass') state = session.loggedIn ? 'configured' : session.installed ? 'available' : 'roadmap'
        else if (m.id === 'lastpass-otp') state = (session.loggedIn && accounts.some((a) => a.methods && a.methods.totp)) ? 'configured' : session.loggedIn ? 'available' : 'available'
        else if (m.id === 'sms-code') state = smsKeySet() ? (loadSms(ctx).enabled ? 'configured' : 'available') : 'roadmap'
      }
      return { id: m.id, kind: m.kind, name: m.name, impl: m.impl, helpers: m.helpers || [], requires: m.requires || null, desc: m.desc, state }
    })

    // TTL-cached vault host→item index for the hint hook.
    const hintIndex = async () => {
      const slot = ctx.module(ctx.id)
      if (slot.hint && Date.now() - slot.hint.at < 10 * 60 * 1000) return slot.hint.hosts
      const hosts = new Map()
      try {
        const s = await sessionStatus()
        for (const l of s.logins || []) {
          const h = hostFromUrl(l.url)
          if (isVaultHost(h) && !hosts.has(h)) hosts.set(h, l.name)
        }
      } catch {}
      slot.hint = { at: Date.now(), hosts }
      return hosts
    }

    // --- state ---------------------------------------------------------------
    router.get('/state', async (req, res) => {
      maybeSelfHeal(ctx, HELPER_CODE, LOOPBACK)
      maybeSelfHealHook(ctx, LOOPBACK)
      const slot = ctx.module(ctx.id)
      // kick off the TOTP scan once in the background; cached in the slot thereafter
      if (!slot.totp && !slot.totpScanning) { slot.totpScanning = true; scanTotp().then((r) => { slot.totp = r }).finally(() => { slot.totpScanning = false }) }
      const [tools, prereqs, session] = await Promise.all([
        Promise.all(TOOLS.map(async (t) => ({ ...pubTool(t), status: await toolStatus(t, getLatest) }))),
        Promise.all(PREREQS.map(prereqStatus)),
        sessionStatus(),
      ])
      const store = loadAccounts(ctx)
      const rec = reconcile(store, session)
      if (rec.changed) saveAccounts(ctx, store)
      res.json({
        tools, prereqs, session,
        helper: helperState(HELPER_CODE, LOOPBACK),
        methods: methodStates(session, rec.accounts),
        accounts: rec.accounts,
        unregistered: rec.unregistered,
        totpItems: (slot.totp && slot.totp.items) || [],
        totpScanning: !!slot.totpScanning && !slot.totp,
        selfHeal: selfHealEnabled(ctx),
      })
    })

    // --- accounts ------------------------------------------------------------
    router.post('/accounts', async (req, res) => {
      let body = {}
      try { body = await req.json() } catch {}
      const session = await sessionStatus()
      const logins = session.logins || []
      const hit = body.lpassId ? logins.find((l) => l.id === body.lpassId)
        : logins.find((l) => l.name === body.lpassItem)
      if (!hit && !body.lpassItem) return res.json({ ok: false, error: 'name a vault item (lpassItem or lpassId)' }, 400)
      const lpassItem = hit ? hit.name : body.lpassItem
      const host = body.host || hostFromUrl(hit && hit.url) || (/\./.test(lpassItem) ? lpassItem.replace(/^www\./, '') : '')
      const store = loadAccounts(ctx)
      if (Object.values(store.accounts).some((a) => a.lpassItem === lpassItem && (!body.lpassId || a.lpassId === body.lpassId)))
        return res.json({ ok: false, error: 'already registered' }, 409)
      const slug = (body.slug && /^[a-z0-9][a-z0-9-]*$/.test(body.slug) && !store.accounts[body.slug]) ? body.slug : deriveSlug(host || lpassItem, store.accounts)
      const now = Date.now()
      const hasTotp = await probeTotp(lpassItem)
      const acct = {
        slug, label: body.label || host || lpassItem, host,
        loginUrl: body.loginUrl || (hit && hit.url) || (host ? `https://${host}/login` : ''),
        lpassItem, lpassId: (hit && hit.id) || body.lpassId || null,
        username: (hit && hit.username) || '',
        methods: { password: { source: 'lastpass' }, ...(hasTotp ? { totp: { source: 'lastpass-otp', probedAt: now } } : {}) },
        recipe: { ...EMPTY_RECIPE },
        status: { state: 'untested', lastVerified: null, lastResult: null, history: [] },
        agentNotes: '', createdAt: now, updatedAt: now,
      }
      store.accounts[slug] = acct
      saveAccounts(ctx, store)
      invalidateCaches()
      ctx.broadcast({ type: 'accounts-changed', slug })
      res.json({ ok: true, account: pubAccount(acct, { vaultPresent: !!hit }) })
    })

    router.post('/accounts/:slug', async (req, res) => {
      const store = loadAccounts(ctx)
      const a = store.accounts[req.params.slug]
      if (!a) return res.json({ ok: false, error: 'no such account' }, 404)
      let body = {}
      try { body = await req.json() } catch {}
      for (const k of ['label', 'loginUrl', 'host', 'lpassItem', 'agentNotes']) if (k in body) a[k] = body[k]
      if (body.recipe && typeof body.recipe === 'object') a.recipe = { ...EMPTY_RECIPE, ...body.recipe }
      a.updatedAt = Date.now()
      saveAccounts(ctx, store)
      invalidateCaches()
      ctx.broadcast({ type: 'accounts-changed', slug: a.slug })
      res.json({ ok: true, account: pubAccount(a) })
    })

    router.delete('/accounts/:slug', (req, res) => {
      const store = loadAccounts(ctx)
      if (!store.accounts[req.params.slug]) return res.json({ ok: false, error: 'no such account' }, 404)
      delete store.accounts[req.params.slug]
      saveAccounts(ctx, store)
      invalidateCaches()
      ctx.broadcast({ type: 'accounts-changed', slug: req.params.slug })
      res.json({ ok: true })
    })

    router.post('/accounts/:slug/probe-totp', async (req, res) => {
      const store = loadAccounts(ctx)
      const a = store.accounts[req.params.slug]
      if (!a) return res.json({ ok: false, error: 'no such account' }, 404)
      const hasTotp = await probeTotp(a.lpassItem)
      if (hasTotp) a.methods.totp = { source: 'lastpass-otp', probedAt: Date.now() }
      else delete a.methods.totp
      a.updatedAt = Date.now()
      saveAccounts(ctx, store)
      ctx.broadcast({ type: 'accounts-changed', slug: a.slug })
      res.json({ ok: true, hasTotp, account: pubAccount(a) })
    })

    // The helper endpoint — non-secret account+recipe by schema. slug → host → parent.
    router.get('/recipe', async (req, res) => {
      const site = (new URL(req.url, 'http://x').searchParams.get('site') || '').trim()
      if (!site) return res.json({ ok: false, error: 'pass ?site=<slug|host>' }, 400)
      const store = loadAccounts(ctx)
      const all = Object.values(store.accounts)
      const host = site.replace(/^www\./, '')
      let a = store.accounts[site] || all.find((x) => x.host === host)
      if (!a) a = all.find((x) => x.host && host.endsWith('.' + x.host))
      if (!a) return res.json({ ok: false, error: `no account for "${site}"` }, 404)
      res.json({ ok: true, account: pubAccount(a) })
    })

    // The agent reports the outcome of a login attempt → the registry self-updates.
    router.post('/report', async (req, res) => {
      let body = {}
      try { body = await req.json() } catch {}
      const site = (body.site || '').trim()
      const store = loadAccounts(ctx)
      const a = store.accounts[site] || Object.values(store.accounts).find((x) => x.host === site.replace(/^www\./, ''))
      if (!a) return res.json({ ok: false, error: 'unknown site' }, 404)
      const state = ['verified', '2fa-blocked', 'broken', 'no-recipe'].includes(body.state) ? body.state : 'broken'
      const now = Date.now()
      a.status = a.status || {}
      a.status.lastResult = state
      if (state === 'verified') { a.status.state = 'verified'; a.status.lastVerified = now }
      else if (state === '2fa-blocked' || state === 'broken') a.status.state = state
      // no-recipe leaves the persisted state alone; only the history records it
      pushHistory(a.status, { at: now, state, detail: String(body.detail || '').slice(0, 300) })
      a.updatedAt = now
      saveAccounts(ctx, store)
      ctx.broadcast({ type: 'login-report', slug: a.slug, state, detail: String(body.detail || '').slice(0, 300), at: now })
      res.json({ ok: true, account: pubAccount(a) })
    })

    // --- credential hint for a URL — consumed by the hints.d hook ------------
    router.get('/hints', async (req, res) => {
      let host = ''
      try { host = (new URL(new URL(req.url, 'http://x').searchParams.get('url')).hostname || '').replace(/^www\./, '') } catch {}
      if (!host) { res.writeHead(204); return res.end() }
      // Prefer the ENFORCED broker path when a bound Bitwarden credential matches.
      const bk = await brokerHintFor(ctx, host)
      if (bk) { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end(bk) }
      const store = loadAccounts(ctx)
      const all = Object.values(store.accounts)
      let acct = all.find((a) => a.host === host) || all.find((a) => a.host && host.endsWith('.' + a.host)) || null
      const tpls = hintTemplates(ctx)
      const helperInstalled = helperState(HELPER_CODE, LOOPBACK).helpers.some((h) => h.name === 'lastpass_fill' && h.installed)
      if (acct && recipeComplete(acct)) {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
        return res.end(applyHint(tpls.registered, { slug: acct.slug, host }))
      }
      // vault-only (or registered without a recipe): fall back to lastpass_fill.
      let name = acct ? acct.lpassItem : null
      if (!name) { const hosts = await hintIndex(); name = hosts.get(host) || null; if (!name) for (const [h, n] of hosts) if (host.endsWith('.' + h)) { name = n; break } }
      if (!name) { res.writeHead(204); return res.end() }
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(applyHint(helperInstalled ? tpls.unregistered : HINT_NOHELPER, { name, host }))
    })

    router.get('/hints-config', (req, res) => {
      maybeSelfHealHook(ctx, LOOPBACK)
      const tpls = hintTemplates(ctx)
      res.json({
        registered: { template: tpls.registered, default: HINT_REGISTERED_DEFAULT, isDefault: tpls.registered === HINT_REGISTERED_DEFAULT },
        unregistered: { template: tpls.unregistered, default: HINT_UNREGISTERED_DEFAULT, isDefault: tpls.unregistered === HINT_UNREGISTERED_DEFAULT },
        placeholders: { '{name}': 'the vault item name', '{host}': "the site's host", '{slug}': 'the hb-auth account slug' },
        hook: hookStatus(LOOPBACK),
        selfHeal: selfHealEnabled(ctx),
      })
    })
    router.post('/hints-config', async (req, res) => {
      let body = {}
      try { body = await req.json() } catch {}
      const cur = (() => { try { return JSON.parse(fs.readFileSync(hintsCfgPath(ctx), 'utf8')) || {} } catch { return {} } })()
      const next = { ...cur }
      const set = (key, def) => {
        if (!(key in body)) return
        const t = String(body[key] ?? '').trim()
        if (!t || t === def) delete next[key]
        else next[key] = t
      }
      set('registered', HINT_REGISTERED_DEFAULT)
      set('unregistered', HINT_UNREGISTERED_DEFAULT)
      try {
        if (Object.keys(next).length === 0) { try { fs.unlinkSync(hintsCfgPath(ctx)) } catch {} }
        else { fs.mkdirSync(ctx.dataDir, { recursive: true }); fs.writeFileSync(hintsCfgPath(ctx), JSON.stringify(next, null, 2)) }
      } catch (e) { return res.json({ ok: false, error: String(e) }, 500) }
      const tpls = hintTemplates(ctx)
      res.json({ ok: true, registered: { template: tpls.registered, isDefault: tpls.registered === HINT_REGISTERED_DEFAULT }, unregistered: { template: tpls.unregistered, isDefault: tpls.unregistered === HINT_UNREGISTERED_DEFAULT } })
    })

    // --- helpers install / self-heal toggle / hook install -------------------
    router.post('/helpers/install', (req, res) => {
      const r = installLoginHelpers(HELPER_CODE)
      if (!r.ok) return res.json({ ok: false, error: r.error }, 500)
      res.json({ ok: true, helper: helperState(HELPER_CODE, LOOPBACK) })
    })

    router.get('/selfheal', (req, res) => res.json({ enabled: selfHealEnabled(ctx) }))
    router.post('/selfheal', async (req, res) => {
      let body = {}
      try { body = await req.json() } catch {}
      try { setSelfHeal(ctx, !!body.enabled) } catch (e) { return res.json({ ok: false, error: String(e) }, 500) }
      const repaired = selfHealEnabled(ctx) ? maybeSelfHeal(ctx, HELPER_CODE, LOOPBACK) : { enabled: false, ran: false }
      res.json({ ok: true, enabled: selfHealEnabled(ctx), repaired, helper: helperState(HELPER_CODE, LOOPBACK) })
    })

    router.post('/hints-hook/install', (req, res) => {
      const r = installHook(LOOPBACK)
      if (!r.ok) return res.json({ ok: false, error: r.error }, 500)
      res.json({ ok: true, hook: hookStatus(LOOPBACK) })
    })

    // Force `lpass sync` — the CLI's local cache doesn't pull web/app edits on its own.
    router.post('/sync', async (req, res) => {
      const r = await run('lpass sync 2>&1', 20000)
      invalidateCaches()
      ctx.module(ctx.id).totp = null                     // re-scan TOTP after a sync
      const ok = r.code === 0
      ctx.broadcast({ type: 'sync-done', ok, at: Date.now() })
      res.json({ ok, error: ok ? null : (r.out || r.err || 'lpass sync failed') })
    })

    // --- SMSPool watcher -----------------------------------------------------
    // A background poll keeps a cache warm so the UI loads instantly (no live
    // round-trip per request), and broadcasts each new SMS over the WS so the
    // activity feed + inbox update in realtime. Cache + timer live in the module
    // slot so they survive hot-reload; teardown clears the timer.
    const smsSlot = ctx.module(ctx.id)
    const pollSms = async () => {
      if (!smsKeySet()) return
      try {
        const code = await resolveRentalCode(ctx)
        if (!code) { smsSlot.smsCache = { at: Date.now(), rentalCode: null, status: null, balance: null, messages: [], maxId: 0 }; return }
        const [st, msgs, bal] = await Promise.all([
          smsApi('rental/retrieve_status', { rental_code: code }),
          smsApi('rental/retrieve_messages', { rental_code: code }),
          smsApi('request/balance'),
        ])
        const list = parseMessages(msgs)
        const firstRun = !smsSlot.smsCache
        const prevMax = firstRun ? (list[0] ? list[0].id : 0) : (smsSlot.smsCache.maxId || 0)
        smsSlot.smsCache = {
          at: Date.now(), rentalCode: code, status: (st && st.status) || null,
          balance: bal && bal.balance != null ? bal.balance : null,
          messages: list, maxId: list[0] ? list[0].id : 0,
        }
        if (!firstRun) {
          const fresh = list.filter((m) => m.id > prevMax).sort((a, b) => a.id - b.id)
          for (const m of fresh) ctx.broadcast({ type: 'sms', event: smsEvent(m) })
          if (fresh.length) ctx.broadcast({ type: 'sms-sync', latestId: smsSlot.smsCache.maxId, count: list.length })
        }
      } catch {}
    }
    const smsSnapshot = async () => {
      if (!smsSlot.smsCache) await pollSms()
      return smsSlot.smsCache || { status: null, balance: null, messages: [], maxId: 0, rentalCode: null }
    }
    if (smsSlot.smsTimer) { clearInterval(smsSlot.smsTimer); smsSlot.smsTimer = null }
    smsSlot.smsCache = undefined                         // re-warm on (re)mount
    if (smsKeySet()) { pollSms(); smsSlot.smsTimer = setInterval(pollSms, 12000) }

    // --- SMS 2FA (SMSPool) ---------------------------------------------------
    router.get('/sms/status', async (req, res) => {
      const cfg = loadSms(ctx)
      if (!smsKeySet()) return res.json({ keySet: false, enabled: cfg.enabled, number: cfg.number, ready: false })
      const c = await smsSnapshot()
      const available = c.status ? c.status.available === 1 : null
      res.json({
        keySet: true, enabled: cfg.enabled, rentalCode: c.rentalCode, number: cfg.number,
        available, expiry: c.status ? c.status.expiry : null,
        autoExtend: c.status ? c.status.auto_extend === 1 : null,
        balance: c.balance, latestId: c.maxId, msgCount: c.messages.length,
        ready: !!(c.rentalCode && available && cfg.enabled),
        error: !c.rentalCode ? 'no rental found on this SMSPool account' : null,
        watchedAt: c.at || null,
      })
    })
    router.get('/sms/inbox', async (req, res) => {
      if (!smsKeySet()) return res.json({ keySet: false, messages: [] })
      const c = await smsSnapshot()
      res.json({ keySet: true, rentalCode: c.rentalCode, messages: c.messages })
    })
    router.get('/sms/latest-id', async (req, res) => {
      if (!smsKeySet()) return res.json({ id: 0 })
      const c = await smsSnapshot()
      res.json({ id: c.maxId })
    })
    // Single check for a NEW code (id > afterId). The python helper loops this; the
    // "watch" UI polls it too. Returns the code (a live secret) only to these local callers.
    router.get('/sms-code', async (req, res) => {
      if (!smsKeySet()) return res.json({ ok: false, error: 'SMSPOOL_API_KEY not set' })
      const afterId = Number(new URL(req.url, 'http://x').searchParams.get('afterId') || 0)
      const code = await resolveRentalCode(ctx)
      const msgs = code ? await smsApi('rental/retrieve_messages', { rental_code: code }) : null
      const list = parseMessages(msgs)
      const hit = list.find((m) => m.id > afterId && m.code)
      if (!hit) return res.json({ ok: false, latestId: list.length ? list[0].id : afterId })
      res.json({ ok: true, code: hit.code, id: hit.id, sender: hit.sender, at: hit.at })
    })
    // Disconnect a source: wipe the app's state for it, then report the manual
    // external step (the app can't revoke the underlying account/session/key).
    router.post('/sources/smspool/disconnect', async (_req, res) => {
      saveSms(ctx, { enabled: false, number: '', rentalCode: null })
      ctx.broadcast({ type: 'sms-sync' })
      res.json({ ok: true, manual: 'Remove `SMSPOOL_API_KEY` from your instance’s .env file, and cancel or return the rental number on smspool.net — the app cannot do either for you.' })
    })
    router.post('/sources/lastpass/disconnect', async (_req, res) => {
      // hb-auth stores no LastPass secret, and the login helpers + hint hook are now
      // shared with the broker — so there's nothing app-side to wipe here without
      // breaking Bitwarden. Disconnecting LastPass is a manual CLI step; account
      // recipes stay (delete those per-account on the Accounts page).
      res.json({ ok: true, manual: 'Run `lpass logout` in a terminal to end the LastPass CLI session. hb-auth holds no LastPass secret; your saved account recipes are left as they are (remove them per-account on the Accounts page if you want).' })
    })

    router.get('/sms/config', (req, res) => res.json({ ...loadSms(ctx), keySet: smsKeySet() }))
    router.post('/sms/config', async (req, res) => {
      let body = {}; try { body = await req.json() } catch {}
      const next = { ...loadSms(ctx) }
      if ('enabled' in body) next.enabled = !!body.enabled
      if ('number' in body) next.number = String(body.number || '')
      if ('rentalCode' in body) next.rentalCode = String(body.rentalCode || '') || null
      saveSms(ctx, next)
      res.json({ ok: true, ...next, keySet: smsKeySet() })
    })
    // Per-account SMS 2FA toggle.
    router.post('/accounts/:slug/sms', async (req, res) => {
      const store = loadAccounts(ctx)
      const a = store.accounts[req.params.slug]
      if (!a) return res.json({ ok: false, error: 'no such account' }, 404)
      let body = {}; try { body = await req.json() } catch {}
      a.methods = a.methods || {}
      if (body.enabled) a.methods.sms = { source: 'sms-code' }
      else delete a.methods.sms
      a.updatedAt = Date.now()
      saveAccounts(ctx, store)
      ctx.broadcast({ type: 'accounts-changed', slug: a.slug })
      res.json({ ok: true, account: pubAccount(a) })
    })

    // --- activity feed (cross-source timeline) -------------------------------
    // SMS arrivals today; password-access events (logged when lastpass_fill / lp_field
    // runs) land here in the next step. Kept source-agnostic so the UI feed is generic.
    router.get('/activity', async (req, res) => {
      const events = []
      if (smsKeySet()) { const c = await smsSnapshot(); for (const m of c.messages) events.push(smsEvent(m)) }
      // TODO(next): password-access events from the login helpers.
      events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
      res.json({ events })
    })

    // Source logos (committed square PNGs under assets/, served with a long cache).
    const moduleDir = path.dirname(ctx.dataDir)
    router.get('/logo/:id', (req, res) => {
      const id = req.params.id
      if (!/^[a-z0-9-]+$/.test(id)) { res.writeHead(400); return res.end() }
      try {
        const buf = fs.readFileSync(path.join(moduleDir, 'assets', id + '.png'))
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' })
        res.end(buf)
      } catch { res.writeHead(404); res.end() }
    })

    router.get('/skill.md', (req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' })
      res.end(renderSkill({ adminBase: publicBase(req) }))
    })

    // --- broker: status / policy / audit / credentials -----------------------
    // All non-secret. Policy writes are PROPOSED to the daemon, which applies
    // downgrades freely and demands Touch ID for any upgrade — so the module (and
    // an agent editing it) cannot silently self-promote a credential.
    const brokerStatusPayload = async () => {
      const s = await brokerCall({ op: 'status', session: 'ui' })
      return { ...s, installed: brokerInstalled(), building: !!brokerSlot.brokerBuilding, setupCmd: SETUP_CMD, cli: `"${BROKER_BIN}"` }
    }
    router.get('/broker/status', async (_req, res) => {
      const s = await brokerStatusPayload()
      // a cold `bw status` can time the RPC out — serve the last real status
      // instead of the transient error, so a fresh viewer never sticks on it
      if (s.reason === 'timeout' && brokerSlot.lastStatus) return res.json(brokerSlot.lastStatus)
      res.json(s)
    })

    // status push — one watcher for every viewer (the daemon caches `bw status`
    // ~30s, so the tick is a cheap socket RPC). The daemon serializes JSON with
    // nondeterministic key order, so the diff key sorts keys. Broadcast on change
    // only; mutating broker routes force a frame so viewers converge instantly.
    const sortedKey = (v) => JSON.stringify(v, (_k, val) =>
      val && typeof val === 'object' && !Array.isArray(val)
        ? Object.keys(val).sort().reduce((o, k) => ((o[k] = val[k]), o), {})
        : val)
    const brokerStatusTick = async (force = false) => {
      // a hung RPC (up to brokerCall's 20s cap) must not swallow an action's
      // forced push — remember it and re-run once the in-flight tick settles
      if (brokerSlot.statusBusy) { if (force) brokerSlot.statusForcePending = true; return }
      brokerSlot.statusBusy = true
      try {
        const s = await brokerStatusPayload()
        // an RPC timeout is a transient, not a state — broadcasting it would
        // flap every viewer's UI; skip the frame and keep the last real status
        if (s.reason === 'timeout') return
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
    brokerSlot.statusTimer = setInterval(() => { brokerStatusTick().catch(() => {}) }, 10000)
    router.get('/broker/policy', async (_req, res) => res.json(await brokerCall({ op: 'policy_get' })))
    router.post('/broker/policy', async (req, res) => {
      let body = {}; try { body = await req.json() } catch {}
      res.json(await brokerCall({ op: 'policy_set', policy: body, session: 'ui' }, 60000))  // may Touch-ID
      brokerStatusNow()
    })
    // The collection/folder picker (unlocks the vault → Touch ID to build the index).
    router.get('/broker/groups', async (_req, res) => res.json(await brokerCall({ op: 'groups', session: 'ui' }, 60000)))
    router.post('/broker/refresh', async (_req, res) => { res.json(await brokerCall({ op: 'refresh', session: 'ui' }, 60000)); brokerStatusNow() })
    // The reachable set (what agents may use) — for display.
    router.get('/broker/reachable', async (_req, res) => res.json(await brokerCall({ op: 'list', session: 'ui' }, 60000)))
    router.get('/broker/audit', async (req, res) => {
      const n = Math.min(500, Number(new URL(req.url, 'http://x').searchParams.get('n')) || 100)
      res.json(await brokerCall({ op: 'audit_tail', n }))
    })
    router.post('/broker/lock', async (_req, res) => { res.json(await brokerCall({ op: 'lock', session: 'ui' })); brokerStatusNow() })
    router.post('/broker/rebuild', async (_req, res) => { await rebuildDaemon(ctx, brokerSlot); res.json({ ok: true, installed: brokerInstalled() }); brokerStatusNow() })

    // Disconnect Bitwarden: the daemon forgets the stored session token + access
    // rules + audit (Touch ID gated). `bw logout` is what actually revokes the token
    // server-side — the app can't do that itself, hence the manual step.
    router.post('/broker/disconnect', async (_req, res) => {
      const r = await brokerCall({ op: 'reset', session: 'ui' }, 60000)
      res.json({ ...r, manual: r.ok ? 'Run `bw logout` in a terminal to end the Bitwarden CLI session and revoke the token. hb-auth has forgotten the token and your access rules.' : null })
      brokerStatusNow()
    })

    // Stop the SMSPool watcher, broker status push + audit tail on hot-reload / shutdown.
    return () => {
      if (smsSlot.smsTimer) { clearInterval(smsSlot.smsTimer); smsSlot.smsTimer = null }
      if (brokerSlot.statusTimer) { clearInterval(brokerSlot.statusTimer); brokerSlot.statusTimer = null }
      stopAuditTail(brokerSlot)
    }
  },
}
