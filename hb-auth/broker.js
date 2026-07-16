/* hb-auth/broker.js — the credential-broker daemon subsystem.
 *
 * This is the *enforced* half of hb-auth's "secrets never enter the model's
 * context" promise. The LastPass helpers keep that promise by convention (they
 * run lpass inside the agent's own process); the broker makes it a boundary: a
 * signed local daemon (native/) is the only holder of the Bitwarden session, and
 * every path to a credential goes through per-credential policy, an origin check
 * read from the browser, and a native macOS approval prompt — none of which agent code
 * can skip. See native/Sources/hb-broker/main.swift for the daemon itself.
 *
 * A separate first-party file (not inlined into backend.js) because it is a
 * cohesive, self-contained subsystem: daemon build + launchd supervision + the
 * unix-socket client + the live audit tail. First-party relative imports bundle
 * into the backend, so `import { … } from './broker.js'` needs no createRequire.
 */

import net from 'node:net'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const HOME = os.homedir()

export const APP_SUPPORT = path.join(HOME, 'Library', 'Application Support', 'hb-broker')
export const BIN = path.join(APP_SUPPORT, 'bin', 'hb-broker')
export const SOCK = path.join(APP_SUPPORT, 'broker.sock')
export const AUDIT = path.join(APP_SUPPORT, 'audit.jsonl')
export const SETUP_CMD = `"${BIN}" setup`

const BUILD = path.join(HERE, 'native', 'build.sh')
const PLIST_LABEL = 'de.pa1nd.hb-broker'
const PLIST_PATH = path.join(HOME, 'Library', 'LaunchAgents', `${PLIST_LABEL}.plist`)

const run = (cmd, args, opts = {}) =>
  new Promise((resolve) => execFile(cmd, args, { timeout: 180000, maxBuffer: 8 << 20, ...opts },
    (err, out, errOut) => resolve({ code: err?.code ?? 0, out: String(out || ''), err: String(errOut || err?.message || '') })))

// ── unix-socket RPC: one line-JSON request → one line-JSON response ───────────
export function brokerCall(req, timeoutMs = 20000) {
  return new Promise((resolve) => {
    const sock = net.connect(SOCK)
    let buf = ''
    let settled = false
    const done = (obj) => { if (settled) return; settled = true; try { sock.destroy() } catch {} ; resolve(obj) }
    const t = setTimeout(() => done({ ok: false, error: 'broker timeout', reason: 'timeout' }), timeoutMs)
    sock.on('connect', () => sock.write(JSON.stringify(req) + '\n'))
    sock.on('data', (d) => {
      buf += d
      const nl = buf.indexOf('\n')
      if (nl >= 0) { clearTimeout(t); try { done(JSON.parse(buf.slice(0, nl))) } catch { done({ ok: false, error: 'bad broker response' }) } }
    })
    sock.on('error', (e) => { clearTimeout(t); done({ ok: false, error: `broker not reachable (${e.code})`, reason: 'no-broker' }) })
  })
}

export function brokerInstalled() { return fs.existsSync(BIN) }

// ── daemon lifecycle: compile once, install a LaunchAgent, bootstrap it ───────
// The daemon lives in ~/Library/Application Support — OUTSIDE the module tree —
// so agent edits and the hot-reload watcher can never touch the running boundary.
// It runs as a per-user LaunchAgent (GUI session) because the macOS approval prompt needs one.
function plistXml() {
  const log = path.join(APP_SUPPORT, 'broker.log')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${PLIST_LABEL}</string>
  <key>ProgramArguments</key><array><string>${BIN}</string><string>serve</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Interactive</string>
  <key>StandardOutPath</key><string>${log}</string>
  <key>StandardErrorPath</key><string>${log}</string>
</dict></plist>
`
}

export async function ensureDaemon(ctx, slot, { rebuild = false } = {}) {
  fs.mkdirSync(path.join(APP_SUPPORT, 'bin'), { recursive: true })
  fs.mkdirSync(path.dirname(PLIST_PATH), { recursive: true })

  if (rebuild || !fs.existsSync(BIN)) {
    if (slot.brokerBuilding) return
    slot.brokerBuilding = true
    ctx.log('hb-auth broker: compiling daemon (first run / rebuild)…')
    const r = await run('/bin/sh', [BUILD])
    slot.brokerBuilding = false
    if (r.code !== 0 || !fs.existsSync(BIN)) { ctx.log(`hb-auth broker: build failed: ${r.err.slice(0, 200)}`); return }
    ctx.log('hb-auth broker: daemon built')
  }

  try { fs.writeFileSync(PLIST_PATH, plistXml()) } catch (e) { ctx.log(`hb-auth broker: plist write failed: ${e.message}`) }
  const uid = process.getuid()
  await run('/bin/launchctl', ['bootout', `gui/${uid}/${PLIST_LABEL}`]).catch(() => {})
  const b = await run('/bin/launchctl', ['bootstrap', `gui/${uid}`, PLIST_PATH])
  await run('/bin/launchctl', ['enable', `gui/${uid}/${PLIST_LABEL}`]).catch(() => {})
  if (b.code !== 0 && !/already|service already loaded/i.test(b.err)) ctx.log(`hb-auth broker: bootstrap: ${b.err.slice(0, 160)}`)
}

export async function rebuildDaemon(ctx, slot) { return ensureDaemon(ctx, slot, { rebuild: true }) }

// ── live audit feed: stream new audit.jsonl lines over the module WS ──────────
export function startAuditTail(ctx, slot) {
  const emitFrom = () => {
    try {
      const size = fs.existsSync(AUDIT) ? fs.statSync(AUDIT).size : 0
      if (size < slot.brokerAuditPos) slot.brokerAuditPos = 0        // truncated / rotated
      if (size === slot.brokerAuditPos) return
      const fd = fs.openSync(AUDIT, 'r')
      const buf = Buffer.alloc(size - slot.brokerAuditPos)
      fs.readSync(fd, buf, 0, buf.length, slot.brokerAuditPos)
      fs.closeSync(fd)
      slot.brokerAuditPos = size
      for (const line of buf.toString('utf8').split('\n')) {
        const s = line.trim(); if (!s) continue
        try { ctx.broadcast({ type: 'broker-audit', event: JSON.parse(s) }) } catch {}
      }
    } catch {}
  }
  slot.brokerAuditPos = fs.existsSync(AUDIT) ? fs.statSync(AUDIT).size : 0   // start at EOF: only new events
  try {
    if (slot.brokerAuditWatcher) { try { slot.brokerAuditWatcher.close() } catch {} }
    slot.brokerAuditWatcher = fs.watch(APP_SUPPORT, (_evt, name) => { if (name === 'audit.jsonl') emitFrom() })
  } catch (e) { ctx.log(`hb-auth broker: audit watch failed: ${e.message}`) }
}

export function stopAuditTail(slot) {
  if (slot.brokerAuditWatcher) { try { slot.brokerAuditWatcher.close() } catch {} ; slot.brokerAuditWatcher = null }
}
