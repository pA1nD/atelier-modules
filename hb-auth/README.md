# HB Auth

**The credentials & login manager for coding agents — so an agent can log into a site without the password ever entering its context.**

An [Atelier](https://github.com/pA1nD/create-atelier) module. It gives agents two ways to sign in, and keeps the secret out of their reach both times:

- **Bitwarden broker (enforced).** A small signed daemon holds the *only* Bitwarden session. Agents ask it to *type* a password into a page; they never see the value. Every request is gated by three checks the agent can't skip (below).
- **LastPass convention (optional).** An older path: `lpass` runs inside the agent's own process to fill a login it has a recipe for. Best-effort, not enforced — use the broker where it matters.

> **macOS only.** The broker relies on the macOS Keychain, code-signing (cdhash), `launchd`, and LocalAuthentication. There is no Linux/Windows path.

## The broker's security model

Every path to a credential goes through the daemon, and through three gates it owns:

1. **Policy (per-collection tier).** Access is granted by **Bitwarden collection**, not per-login. A collection is `auto` (fill silently), `ask` (approve each use), or ungranted (a hard deny — items outside a granted collection aren't even enumerable). You change access by moving a password into or out of a granted collection. Policy is stored in `policy.json` with an HMAC bound to the daemon's identity — tamper with it and *all* grants fail closed.
2. **Origin check.** The daemon reads the browser tab's real URL over CDP (never trusts the caller) and refuses to type unless the host matches one of the credential's stored login URIs. Kills cross-origin phishing.
3. **Presence.** `ask`-tier fills and every policy *upgrade* require a live **macOS approval** — the system device-authentication prompt. See "The prompt is a password, not a fingerprint" below.

The session token is stored in the login **Keychain**, in an access-control list **bound to the daemon binary's code signature** — so only *that exact binary* can read it. Rebuild the daemon and macOS re-confirms once ("Always Allow"). The master password is never stored; it's used once at setup to mint a long-lived `BW_SESSION` token.

**What it deliberately does *not* guarantee:** confidentiality of a secret once it's typed into a live login field — the agent shares that tab and can read the DOM. The boundary is **authorization + scope + evidence**, not the bits. Passwords are typed by the daemon over its own CDP session so they never enter agent-authored code, and every access is logged.

**Limits (be honest with yourself before trusting it):**
- In-process isolation is not a sandbox — a module in the same Atelier runtime is trusted like a dependency.
- The origin check is host-based (equal or subdomain), not full-URL.
- The daemon is ad-hoc code-signed locally; it is not notarized or reviewed by a third party.

## The prompt is a password, not a fingerprint

The presence gate is macOS device-owner authentication. On a foreground app that's the Touch ID sheet — but the daemon runs as a **background LaunchAgent**, which macOS won't let present the biometric sheet (it returns `systemCancel`). So in practice the approval is your **login-password** dialog. It's the same OS device authentication (unfakeable by any script) — just the password form, not the fingerprint. The UI and docs say "macOS approval" for this reason.

## Setup

1. Install the deps (Atelier's `add --yes` runs these hints): `bw` (Bitwarden CLI), Xcode Command Line Tools (`xcode-select --install`, provides `swift`), and — for the optional LastPass path — `lpass`.
2. Open the module → **Bitwarden** source → run the one command it shows:
   ```
   "~/Library/Application Support/hb-broker/bin/hb-broker" setup
   ```
   It prompts for your server, email, and master password (typed hidden), logs in **inside the daemon** (nothing prints to your terminal), mints the token, and stores only the token in the Keychain.
3. Grant a collection: set it to `ask` or `auto` and Save (one macOS approval).

The daemon compiles on first run and installs to `~/Library/Application Support/hb-broker` as a per-user LaunchAgent.

## How an agent uses it

The module installs Python helpers into the browser tooling's workspace. An agent drives a Chrome over CDP, then:

```python
hb_creds()                       # non-secret list: [{item, username, hosts, tier, hasTotp}] — only granted collections
hb_type_secret("Airbnb", target) # daemon types the password into the focused field of tab `target`; returns only a char count
hb_type_totp("Airbnb", target)   # types the current TOTP (auto-advances 6-box widgets)
hb_get_totp("Airbnb")            # a TOTP value (self-expiring) for odd widgets
```

`target` is your CDP target id (the tab you drive). The secret is typed by the daemon, never returned to agent code. `hb_get_secret` can return a password value for non-web (CLI/env) use — a macOS approval every time — but avoid printing it.

## Configuration

| Env | Purpose |
|---|---|
| `SMSPOOL_API_KEY` | optional — SMS 2FA via SMSPool (for the LastPass path); set in the instance `.env` |
| `HB_CDP_PORT` | optional — the CDP port the daemon drives (default `9223`, i.e. horse-browser) |

The broker drives **any** Chrome exposing CDP on `127.0.0.1:<HB_CDP_PORT>` — [horse-browser](https://github.com/pA1nD/horse-browser) is the usual one, detected but installed separately. No secret lives in the module folder; `data/` is runtime state and never ships.

## License

MIT — see [LICENSE](./LICENSE).
