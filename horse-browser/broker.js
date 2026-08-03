/* horse-browser/broker.js — the credential-broker daemon subsystem.
 *
 * This is the *enforced* half of the "secrets never enter the model's
 * context" promise. Convention-based helpers keep that promise by trust (they
 * run in the agent's own process); the broker makes it a boundary: a
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

// The module version the running daemon was built from — install.sh stamps it.
// When it differs from the shipped module version, the native code may have
// changed (e.g. a 2.2.0 upgrade over a 2.1.2 install), so we recompile.
const VERSION_STAMP = path.join(APP_SUPPORT, '.built-version')
function shippedVersion() {
  try { return JSON.parse(fs.readFileSync(path.join(HERE, 'package.json'), 'utf8')).version || '' } catch { return '' }
}
function builtVersion() {
  try { return fs.readFileSync(VERSION_STAMP, 'utf8').trim() } catch { return '' }
}

const run = (cmd, args, opts = {}) =>
  new Promise((resolve) => execFile(cmd, args, { timeout: 180000, maxBuffer: 8 << 20, ...opts },
    (err, out, errOut) => resolve({ code: err?.code ?? 0, out: String(out || ''), err: String(errOut || err?.message || '') })))

// ── unix-socket RPC: one line-JSON request → one line-JSON response ───────────
export function brokerCall(req, timeoutMs = 20000) {
  return new Promise((resolve) => {
    const sock = net.connect(SOCK)
    /* Accumulate BUFFERS and decode once, after splitting on the newline. `buf += d` stringifies
       each chunk on its own, so any multi-byte character straddling a chunk boundary became
       U+FFFD — and the result still parsed as JSON, so it was silent corruption: an item named
       "Bäcker" reached an agent as "B??cker", which the broker then rejects as unknown. The
       Python client in this same module already does it this way. */
    const chunks = []
    let len = 0
    let settled = false
    const done = (obj) => { if (settled) return; settled = true; clearTimeout(t); try { sock.destroy() } catch {} ; resolve(obj) }
    const t = setTimeout(() => done({ ok: false, error: 'broker timeout', reason: 'timeout' }), timeoutMs)
    sock.on('connect', () => sock.write(JSON.stringify(req) + '\n'))
    sock.on('data', (d) => {
      chunks.push(d); len += d.length
      const all = Buffer.concat(chunks, len)
      const nl = all.indexOf(0x0a)
      if (nl >= 0) {
        try { done(JSON.parse(all.slice(0, nl).toString('utf8'))) } catch { done({ ok: false, error: 'bad broker response' }) }
      } else if (len > (8 << 20)) {
        done({ ok: false, error: 'broker response exceeded 8 MB without a newline' })
      }
    })
    /* A daemon that dies or closes WITHOUT sending a newline used to leave this promise pending
       until the (up to 60s) timeout, holding the HTTP request open the whole time. A browser only
       gets ~6 sockets per origin and the credentials pages fire several of these at once, so a
       wedged daemon stalled page loads for every OTHER module in the instance too. Settle now. */
    const closed = () => done({ ok: false, error: 'the broker closed the connection without answering', reason: 'no-broker' })
    sock.on('end', closed)
    sock.on('close', closed)
    sock.on('error', (e) => done({ ok: false, error: `broker not reachable (${e.code})`, reason: 'no-broker' }))
  })
}

export function brokerInstalled() { return fs.existsSync(BIN) }

// ── daemon lifecycle ──────────────────────────────────────────────────────────
// The WHOLE install lives in native/install.sh — a readable script the setup
// agent (or the operator) runs deliberately; there is no install API. The
// module only HEALS an existing daemon: when the binary is already in
// ~/Library/Application Support, mount re-runs the same script (it skips the
// compile when the binary exists, refreshes the plist, re-bootstraps launchd).
export const INSTALL = path.join(HERE, 'native', 'install.sh')

export async function ensureDaemon(ctx) {
  if (!fs.existsSync(BIN)) return   // never bootstrap a first install — see native/install.sh
  /* One heal at a time, per process. This runs on every mount, and a mount happens on every hot
     reload — so while a Swift compile was in flight (up to the 180s exec cap), editing any module
     file started ANOTHER one writing the same output binary and re-bootstrapping launchd
     underneath it. The slot survives hot reload, which is exactly the span that needs covering. */
  const slot = ctx.module(ctx.id)
  if (slot.healInFlight) return
  slot.healInFlight = true
  try { await ensureDaemonInner(ctx) } finally { slot.healInFlight = false }
}

async function ensureDaemonInner(ctx) {
  // A healthy daemon of the CURRENT version is left alone — re-running install.sh
  // bounces the daemon (drops vault warmth, re-prompts Keychain), so we only do it
  // when it's actually needed: the daemon isn't answering, OR the shipped module
  // version moved past what the binary was built from (a module update carrying new
  // native code — without this, an upgraded install keeps running the OLD daemon).
  const stale = builtVersion() !== shippedVersion()
  if (!stale) {
    const alive = await brokerCall({ op: 'status', session: 'heal' }, 1500)
    if (alive?.reason !== 'no-broker' && alive?.reason !== 'timeout') return
    ctx.log('hb-broker: daemon not answering — re-bootstrapping via install.sh')
  } else {
    ctx.log(`hb-broker: rebuilding — binary built from ${builtVersion() || '(unstamped)'}, module is ${shippedVersion()}`)
  }
  const r = await run('/bin/sh', [INSTALL])
  if (r.code !== 0) ctx.log(`hb-broker: heal failed: ${(r.err || '').slice(0, 160)}`)
}

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
  } catch (e) { ctx.log(`hb-broker: audit watch failed: ${e.message}`) }
}

export function stopAuditTail(slot) {
  if (slot.brokerAuditWatcher) { try { slot.brokerAuditWatcher.close() } catch {} ; slot.brokerAuditWatcher = null }
}
