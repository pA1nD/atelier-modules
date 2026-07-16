// hb-broker — a credential broker between coding agents and the Bitwarden CLI.
//
// The security posture (see the module README): the vault is NOT ambiently
// unlocked. This daemon is the only process that holds a `bw` session, and every
// path to a credential goes through three gates it owns and an agent cannot skip:
//
//   1. policy   — per-credential tier: auto (no prompt) | ask (macOS approval per use) | never
//   2. origin   — the tab's URL is read from the browser itself (CDP
//                 Target.getTargetInfo), never trusted from the caller, and must
//                 match the credential's bound hosts. Kills cross-origin phishing.
//   3. presence — `ask` tier and every policy *upgrade* require a live macOS approval
//                 (LocalAuthentication device-owner auth — the Touch ID sheet where a
//                 process can present it, otherwise the login-password dialog; a
//                 background LaunchAgent gets the password form). Software on the same
//                 machine cannot synthesize it the way it can click an osascript dialog.
//
// What the daemon deliberately does NOT try to guarantee: confidentiality of a
// secret once it is on its own login page (the agent shares the tab and can read
// the field). We accept that; the boundary is authorization + scope + evidence,
// not the bits. Passwords are typed by THIS process over its own CDP session so
// they never enter agent-authored code; the escape-hatch value ops are tiered to
// match how durable the secret is (TOTP self-expires → cheap; password → Touch ID).
//
//   hb-broker serve        run the daemon (launchd LaunchAgent target)
//   hb-broker setup        the ONE command: prompts for server/email/master-password
//                          (hidden) + 2FA, then logs in + mints a long-lived
//                          BW_SESSION token — ALL inside this process with bw's output
//                          captured, so the token and vault contents never print to
//                          the terminal. Only the token is stored (login Keychain, bound
//                          to this binary's code signature); the master password is never
//                          saved. No bare `bw login`.
//   hb-broker status       print vault + socket status as JSON and exit
//   hb-broker doctor       print environment diagnostics

import Foundation
import Security
import LocalAuthentication
import CryptoKit
import HBBrokerCore

// ───────────────────────────── paths & constants ─────────────────────────────

let HOME = FileManager.default.homeDirectoryForCurrentUser
let APP_SUPPORT = HOME.appendingPathComponent("Library/Application Support/hb-broker", isDirectory: true)
let SOCK_PATH = APP_SUPPORT.appendingPathComponent("broker.sock").path
let POLICY_PATH = APP_SUPPORT.appendingPathComponent("policy.json")
let POLICY_SIG_PATH = APP_SUPPORT.appendingPathComponent("policy.sig")
let AUDIT_PATH = APP_SUPPORT.appendingPathComponent("audit.jsonl")
// Non-secret collection/folder metadata (names + counts, NOT items/usernames/passwords)
// cached so the picker can render WITHOUT a fresh unlock — collections don't expose accounts.
let GROUPS_CACHE_PATH = APP_SUPPORT.appendingPathComponent("groups-cache.json")
let LOG_PATH = APP_SUPPORT.appendingPathComponent("broker.log")

let KEYCHAIN_SERVICE = "de.pa1nd.hb-broker"
let KEYCHAIN_ACCOUNT = "bw-session"

let CDP_HOST = "127.0.0.1"
let CDP_PORT = ProcessInfo.processInfo.environment["HB_CDP_PORT"] ?? "9223"

func ensureAppSupport() {
  try? FileManager.default.createDirectory(at: APP_SUPPORT, withIntermediateDirectories: true)
  // Owner-only: policy.json / audit.jsonl hold no secret, but there's no reason to
  // leave the account inventory world-readable (they default to 0644).
  try? FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: APP_SUPPORT.path)
}

// ───────────────────────────────── logging ───────────────────────────────────

func log(_ msg: String) {
  let line = "[\(ISO8601DateFormatter().string(from: Date()))] \(msg)\n"
  FileHandle.standardError.write(line.data(using: .utf8)!)
  if let fh = try? FileHandle(forWritingTo: LOG_PATH) {
    fh.seekToEndOfFile(); fh.write(line.data(using: .utf8)!); try? fh.close()
  } else {
    try? line.data(using: .utf8)!.write(to: LOG_PATH)
  }
}

// ─────────────────────────── bw CLI resolution ───────────────────────────────

func resolveBw() -> String? {
  let candidates = ["/opt/homebrew/bin/bw", "/usr/local/bin/bw",
                    HOME.appendingPathComponent(".bun/bin/bw").path,
                    "/opt/homebrew/bin/rbw"]
  for c in candidates where FileManager.default.isExecutableFile(atPath: c) { return c }
  // fall back to a login shell lookup (picks up nvm / custom PATH)
  let p = Process(); p.executableURL = URL(fileURLToPath: "/bin/zsh")
  p.arguments = ["-lc", "command -v bw"]
  let pipe = Pipe(); p.standardOutput = pipe; p.standardError = FileHandle.nullDevice
  try? p.run(); p.waitUntilExit()
  let out = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?
    .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
  return out.isEmpty ? nil : out
}
// tiny helper so the candidate init above reads cleanly
extension URL { init(fileURLToPath p: String) { self.init(fileURLWithPath: p) } }

let BW = resolveBw()

// bw's data dir isn't safe for concurrent invocations (file locks), so ALL bw calls
// run one at a time on this serial queue. Request handling is otherwise concurrent —
// a slow `bw` here never blocks a cached status/groups/policy read on another thread.
let bwSerial = DispatchQueue(label: "hb-broker.bw.serial")

@discardableResult
func runBw(_ args: [String], session: String? = nil, extraEnv: [String: String] = [:]) -> (code: Int32, out: String, err: String) {
  guard let bw = BW else { return (127, "", "bitwarden cli (bw) not found on PATH") }
  return bwSerial.sync {
    let p = Process(); p.executableURL = URL(fileURLWithPath: bw); p.arguments = args
    var env = ProcessInfo.processInfo.environment
    if let s = session { env["BW_SESSION"] = s }
    for (k, v) in extraEnv { env[k] = v }
    // Isolated data dir: the broker's bw state is SEPARATE from the user's personal
    // `bw` CLI. Login happens only inside `hb-broker setup` (output captured), so the
    // user never runs a bare `bw login` that would print the session token to their
    // terminal — and a personal `bw logout` can't disturb the broker.
    env["BITWARDENCLI_APPDATA_DIR"] = APP_SUPPORT.appendingPathComponent("bw-appdata").path
    p.environment = env
    let out = Pipe(), err = Pipe(); p.standardOutput = out; p.standardError = err
    p.standardInput = FileHandle.nullDevice   // never wait on stdin (bw prompts → EOF, not hang)
    do { try p.run() } catch { return (127, "", "\(error)") }
    // Drain BOTH pipes concurrently while bw runs. Reading only after waitUntilExit()
    // deadlocks on large output: `bw list items` (a 500-item vault) overflows the 64 KB
    // pipe buffer, bw blocks on write, and it never exits → hang. Read on background
    // queues so neither pipe backs up, then join.
    let outFH = out.fileHandleForReading, errFH = err.fileHandleForReading
    var oData = Data(), eData = Data()
    let grp = DispatchGroup(), q = DispatchQueue(label: "hb-broker.bw.pipe", attributes: .concurrent)
    grp.enter(); q.async { oData = outFH.readDataToEndOfFile(); grp.leave() }
    grp.enter(); q.async { eData = errFH.readDataToEndOfFile(); grp.leave() }
    p.waitUntilExit()
    grp.wait()
    let o = String(data: oData, encoding: .utf8) ?? ""
    let e = String(data: eData, encoding: .utf8) ?? ""
    return (p.terminationStatus, o.trimmingCharacters(in: .whitespacesAndNewlines), e.trimmingCharacters(in: .whitespacesAndNewlines))
  }
}

// Like runBw, but INTERACTIVE — used only by `hb-broker setup` for a two-step login.
// bw gets the real terminal for stdin + stderr, so it can run its own 2FA flow (send an
// EMAIL code, then prompt for it) with the user live. This is what fixes email 2FA: the
// non-interactive `--method 1 --code <x>` path asks for a code before any email is sent,
// so there's nothing to enter. stdout stays CAPTURED so the session key `bw login` prints
// on success still never lands on screen. Setup runs in its own process (not the serving
// daemon), so holding bwSerial here is fine.
func runBwInteractive(_ args: [String], extraEnv: [String: String] = [:]) -> Int32 {
  guard let bw = BW else { return 127 }
  return bwSerial.sync {
    let p = Process(); p.executableURL = URL(fileURLWithPath: bw); p.arguments = args
    var env = ProcessInfo.processInfo.environment
    for (k, v) in extraEnv { env[k] = v }
    env["BITWARDENCLI_APPDATA_DIR"] = APP_SUPPORT.appendingPathComponent("bw-appdata").path
    p.environment = env
    p.standardOutput = FileHandle.nullDevice   // discard the session-key print — never on screen
    p.standardError = FileHandle.standardError  // bw's 2FA prompts stay visible
    p.standardInput = FileHandle.standardInput  // the user types the emailed / authenticator code
    do { try p.run() } catch { return 127 }
    p.waitUntilExit()
    return p.terminationStatus
  }
}

// ─────────────────────────── Keychain + presence ─────────────────────────────
// The BW_SESSION token AND a policy-integrity MAC key live in login-keychain items
// whose ACL is bound to THIS binary's code identity (cdhash) via SecAccess — so only
// hb-broker itself reads them silently; any OTHER same-user process (or a swapped /
// relocated binary, which has a different identity) is denied and hits a keychain-
// password prompt. This is macOS's strongest CERT-FREE identity gate (the Secure-
// Enclave / data-protection keychain would need an app-identifier entitlement an ad-
// hoc CLI can't carry — that's the -34018 wall). Reading the TOKEN additionally
// requires a live Touch ID (presence); the MAC key is read silently (verifying the
// config at startup shouldn't need a human). The master password is never stored;
// the token is revocable and only decrypts this vault, so its blast radius is small.

let KEYCHAIN_MAC_ACCOUNT = "policy-mac"

// A SecAccess ACL bound to THIS running binary (nil path = self). Deprecated but the
// only cert-free way to gate a keychain item by code identity. nil ⇒ caller falls back
// to a plain (identity-unbound) item so the daemon still works, with a loud log.
func selfAccess() -> SecAccess? {
  var app: SecTrustedApplication?
  guard SecTrustedApplicationCreateFromPath(nil, &app) == errSecSuccess, let a = app else {
    log("keychain: trusted-app (self) create failed"); return nil
  }
  var access: SecAccess?
  let st = SecAccessCreate("hb-broker" as CFString, [a] as CFArray, &access)
  if st != errSecSuccess { log("keychain: SecAccessCreate failed (\(st))"); return nil }
  return access
}

@discardableResult
func keychainStore(account: String, data: Data) -> Bool {
  let del: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                            kSecAttrService as String: KEYCHAIN_SERVICE, kSecAttrAccount as String: account]
  SecItemDelete(del as CFDictionary)
  var add: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                            kSecAttrService as String: KEYCHAIN_SERVICE, kSecAttrAccount as String: account,
                            kSecValueData as String: data]
  if let ac = selfAccess() { add[kSecAttrAccess as String] = ac }
  else { add[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
         log("keychain: storing '\(account)' WITHOUT code-identity ACL (fallback)") }
  let st = SecItemAdd(add as CFDictionary, nil)
  if st != errSecSuccess { log("keychain: add '\(account)' failed (\(st))") }
  return st == errSecSuccess
}

// Silent read. If the item is cdhash-bound, ONLY this exact binary succeeds here;
// a mismatched caller is denied (or prompted, which our code paths never answer).
func keychainRead(account: String) -> Data? {
  let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                          kSecAttrService as String: KEYCHAIN_SERVICE, kSecAttrAccount as String: account,
                          kSecReturnData as String: true]
  var out: CFTypeRef?
  let st = SecItemCopyMatching(q as CFDictionary, &out)
  guard st == errSecSuccess, let d = out as? Data else {
    if st != errSecItemNotFound { log("keychain: read '\(account)' failed (\(st))") }
    return nil
  }
  return d
}

func keychainStoreToken(_ token: String) -> Bool { keychainStore(account: KEYCHAIN_ACCOUNT, data: Data(token.utf8)) }

func keychainReadToken(reason: String) -> String? {
  // NO extra Touch ID here: the item's own code-identity ACL already guarantees only
  // THIS exact binary can read it — a redundant presence prompt on every unlock just
  // breaks unattended (auto-tier) flows. Presence still gates the sensitive paths:
  // `ask`-tier credential use and policy upgrades each prompt Touch ID separately.
  return keychainRead(account: KEYCHAIN_ACCOUNT).flatMap { String(data: $0, encoding: .utf8) }
}

// The policy-integrity MAC key is DERIVED from the token (HKDF) — no second keychain
// item, so there's only ONE code-identity ACL and thus ONE "Always Allow" prompt after
// a rebuild (not two). Forging a policy MAC still needs the token, which is ACL-locked.
func policyMacKey() -> SymmetricKey? {
  guard let tokenData = keychainRead(account: KEYCHAIN_ACCOUNT) else { return nil }
  return HKDF<SHA256>.deriveKey(inputKeyMaterial: SymmetricKey(data: tokenData),
                                info: Data("hb-broker/policy-mac/v1".utf8), outputByteCount: 32)
}

func hmacHex(_ data: Data, _ key: SymmetricKey) -> String {
  HMAC<SHA256>.authenticationCode(for: data, using: key).map { String(format: "%02x", $0) }.joined()
}

func keychainDeleteToken() {
  let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                          kSecAttrService as String: KEYCHAIN_SERVICE,
                          kSecAttrAccount as String: KEYCHAIN_ACCOUNT]
  SecItemDelete(q as CFDictionary)   // no auth needed to delete; errSecItemNotFound is fine
}

func keychainHasToken() -> Bool {
  let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                          kSecAttrService as String: KEYCHAIN_SERVICE,
                          kSecAttrAccount as String: KEYCHAIN_ACCOUNT,
                          kSecReturnData as String: false,
                          kSecUseAuthenticationUI as String: kSecUseAuthenticationUISkip]
  let st = SecItemCopyMatching(q as CFDictionary, nil)
  return st == errSecSuccess || st == errSecInteractionNotAllowed  // exists (may need auth to read)
}

// ─────────────────────────── explicit Touch ID ───────────────────────────────
// For `ask`-tier ops and policy upgrades on an ALREADY-warm session, where no
// Keychain read happens, we still demand presence with an explicit evaluation.

func evaluateLA(_ policy: LAPolicy, _ reason: String) -> (ok: Bool, code: LAError.Code?) {
  let ctx = LAContext()
  var pre: NSError?
  guard ctx.canEvaluatePolicy(policy, error: &pre) else {
    return (false, (pre as? LAError)?.code)
  }
  let sem = DispatchSemaphore(value: 0)
  var ok = false
  var code: LAError.Code?
  ctx.evaluatePolicy(policy, localizedReason: reason) { success, err in
    ok = success; code = (err as? LAError)?.code; sem.signal()
  }
  sem.wait()
  return (ok, code)
}

func touchID(reason: String) -> Bool {
  // Prefer the BIOMETRICS-ONLY policy so macOS presents the Touch ID sheet rather
  // than the password dialog (a background LaunchAgent gets the password fallback
  // with the combined .deviceOwnerAuthentication policy). If the user actively
  // dismisses the sheet, honor that as a denial. Only when biometrics can't be
  // presented at all here (no reader, not enrolled, locked out, can't show sheet)
  // do we fall back to device auth (password/passcode) — so approval is possible.
  let bio = evaluateLA(.deviceOwnerAuthenticationWithBiometrics, reason)
  if bio.ok { return true }
  // Only a genuine USER cancel is a denial. app/system cancel almost always means the
  // biometric sheet couldn't be presented from this background LaunchAgent (not a human
  // saying no) — fall back to device auth, the password/passcode dialog a background agent
  // CAN show, so approval still works instead of silently failing.
  if bio.code == .userCancel { log("touchID: user cancelled biometric prompt"); return false }
  log("touchID: biometric prompt not usable (code \(bio.code.map { String($0.rawValue) } ?? "nil")) → device-auth fallback")
  return evaluateLA(.deviceOwnerAuthentication, reason).ok
}

// ───────────────────────────────── vault ─────────────────────────────────────
// One Bitwarden item's non-secret metadata. Collection/folder membership is what
// the policy resolves a tier from; the URIs are what the origin check binds to.
struct BwItem {
  let id: String, name: String, username: String
  let uris: [String]           // login URLs stored on the item
  let collectionIds: [String]  // org collections (access-control groups)
  let folderId: String?        // personal-vault folder
  let hasTotp: Bool
}

// Session held in memory only, with a soft idle TTL. When cold/expired the next
// unlock reads the stored session token from the login Keychain (silent, code-signature-bound). The
// vault INDEX (item metadata + collection/folder names) is also memory-only, built
// once per unlock and dropped on lock — the operator's account inventory never
// touches disk (only the collection→tier rules in policy.json do).
final class Vault {
  private var session: String?
  private var unlockedAt: Date?
  private var index: [BwItem] = []
  private var indexAt: Date?
  private var collectionNames: [String: String] = [:]   // collectionId → name
  private var folderNames: [String: String] = [:]        // folderId → name
  private var bwStatusCache: [String: Any]? = nil        // parsed `bw status`, cached (a node spawn)
  private var bwStatusAt: Date? = nil
  private let queue = DispatchQueue(label: "hb-broker.vault")
  private let unlockQ = DispatchQueue(label: "hb-broker.vault.unlock")   // serializes cold unlocks

  func idleTTL() -> TimeInterval { TimeInterval(Policy.shared.idleUnlockSec) }

  var isWarm: Bool {
    queue.sync {
      guard let s = session, !s.isEmpty, let t = unlockedAt else { return false }
      return Date().timeIntervalSince(t) < idleTTL()
    }
  }

  func invalidateBwStatus() { queue.sync { bwStatusCache = nil; bwStatusAt = nil } }

  func status() -> [String: Any] {
    var out: [String: Any] = ["bw": BW ?? NSNull(), "hasSession": keychainHasToken(), "warm": isWarm]
    // `bw status` spawns a ~0.9s node process; the UI polls often, so cache it ~30s
    // (pre-warmed on startup). A cache miss runs bw off the caller's thread anyway.
    var j = queue.sync { (bwStatusAt.map { Date().timeIntervalSince($0) < 30 } == true) ? bwStatusCache : nil }
    if j == nil {
      let r = runBw(["status"])
      if r.code == 127 { out["bwStatus"] = "no-cli"; return out }
      j = (r.out.data(using: .utf8)).flatMap { (try? JSONSerialization.jsonObject(with: $0)) as? [String: Any] }
      queue.sync { bwStatusCache = j; bwStatusAt = Date() }
    }
    if let j = j {
      out["bwStatus"] = (j["status"] as? String) ?? "unknown"   // "unauthenticated" | "locked" | "unlocked"
      if let email = j["userEmail"] as? String, !email.isEmpty { out["email"] = email }
      let server = (j["serverUrl"] as? String) ?? ""             // "" when unset (US default)
      out["server"] = server.isEmpty ? "https://vault.bitwarden.com" : server
    } else {
      out["bwStatus"] = "unknown"
    }
    return out
  }

  var warm: Bool { isWarm }

  // Returns a usable session or nil. Reads the long-lived BW_SESSION token from the
  // login Keychain (silent, bound to this binary's code signature) — NO master password
  // is stored; it was used once at setup to mint this token. A password change or `bw logout` invalidates
  // the token, in which case the operator must reconnect.
  func ensureSession() -> String? {
    if isWarm { return queue.sync { session } }
    // Serialize the cold unlock so two concurrent requests don't BOTH prompt Touch ID;
    // the loser re-checks isWarm and reuses the session the winner just loaded.
    return unlockQ.sync {
      if isWarm { return queue.sync { session } }
      guard let token = keychainReadToken(reason: "Unlock the agent Bitwarden vault") else {
        log("vault: no stored session token / auth cancelled"); return nil
      }
      // Validate the token still decrypts the vault before trusting it.
      let chk = runBw(["status"], session: token)
      var unlocked = false
      if chk.code == 0, let d = chk.out.data(using: .utf8),
         let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
         (j["status"] as? String) == "unlocked" { unlocked = true }
      guard unlocked else { log("vault: stored session token invalid — reconnect needed"); return nil }
      queue.sync { session = token; unlockedAt = nil; index = []; indexAt = nil }
      log("vault: session token loaded (idle ttl \(Int(idleTTL()))s)")
      buildIndex(session: token)
      // Become WARM (isWarm → true) only AFTER the index is populated. Setting
      // unlockedAt before buildIndex let a concurrent list()/reachable() observe a
      // warm session with an empty index and return a spuriously-empty set (the
      // "Nothing granted yet" flash). A concurrent unlocker now blocks on unlockQ
      // until the index is real. If the index came back empty (a transient
      // `bw list items` failure), stay cold so the next call retries instead of
      // caching emptiness for the whole idle TTL.
      if (queue.sync { index.count }) > 0 { queue.sync { unlockedAt = Date() } }
      else { log("vault: index empty after unlock — staying cold to retry next call") }
      return token
    }
  }

  func lock() {
    queue.sync { session = nil; unlockedAt = nil; index = []; indexAt = nil; bwStatusCache = nil; bwStatusAt = nil }
    _ = runBw(["lock"])
  }

  private func jsonArray(_ args: [String], session s: String) -> [[String: Any]] {
    let r = runBw(args, session: s)
    guard r.code == 0, let d = r.out.data(using: .utf8),
          let arr = try? JSONSerialization.jsonObject(with: d) as? [[String: Any]] else { return [] }
    return arr
  }

  // Pull item metadata + collection/folder names into memory. Non-secret; no
  // passwords/TOTP seeds are fetched here (those come per-op via `bw get`).
  private func buildIndex(session s: String) {
    let items = jsonArray(["list", "items"], session: s).map { it -> BwItem in
      let login = it["login"] as? [String: Any]
      let uris = (login?["uris"] as? [[String: Any]])?.compactMap { $0["uri"] as? String } ?? []
      return BwItem(id: it["id"] as? String ?? "", name: it["name"] as? String ?? "",
                    username: login?["username"] as? String ?? "", uris: uris,
                    collectionIds: it["collectionIds"] as? [String] ?? [],
                    folderId: it["folderId"] as? String,
                    hasTotp: (login?["totp"] as? String).map { !$0.isEmpty } ?? false)
    }
    var cols: [String: String] = [:]
    for c in jsonArray(["list", "collections"], session: s) {
      if let id = c["id"] as? String { cols[id] = (c["name"] as? String) ?? id }
    }
    var flds: [String: String] = [:]
    for f in jsonArray(["list", "folders"], session: s) {
      if let id = f["id"] as? String, !id.isEmpty { flds[id] = (f["name"] as? String) ?? id }
    }
    queue.sync { index = items; indexAt = Date(); collectionNames = cols; folderNames = flds }
    // Persist the NON-SECRET group metadata (names + counts only) so the picker can
    // render later without unlocking. No item names, usernames, URIs, or passwords.
    let meta = groupMetadata(items: items, cols: cols, flds: flds)
    if let d = try? JSONSerialization.data(withJSONObject: meta) {
      try? d.write(to: GROUPS_CACHE_PATH)
      try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: GROUPS_CACHE_PATH.path)
    }
    log("vault: indexed \(items.count) items, \(cols.count) collections, \(flds.count) folders")
  }

  private func groupMetadata(items: [BwItem], cols: [String: String], flds: [String: String]) -> [[String: Any]] {
    var out: [[String: Any]] = []
    for (id, name) in cols {
      out.append(["key": "col:" + id, "kind": "collection", "id": id, "name": name,
                  "count": items.filter { $0.collectionIds.contains(id) }.count])
    }
    for (id, name) in flds {
      out.append(["key": "fld:" + id, "kind": "folder", "id": id, "name": name,
                  "count": items.filter { $0.folderId == id }.count])
    }
    return out
  }

  // The item metadata, ensuring a session (may unlock → Touch ID) and index.
  private func items() -> [BwItem] {
    guard ensureSession() != nil else { return [] }
    return queue.sync { index }
  }

  // Resolve a caller-supplied identifier to a single item: exact id, else a
  // UNIQUE name match. Ambiguous or missing → nil (the caller hard-denies).
  func itemInfo(_ nameOrId: String) -> BwItem? {
    let all = items()
    if let byId = all.first(where: { $0.id == nameOrId }) { return byId }
    let byName = all.filter { $0.name == nameOrId }
    return byName.count == 1 ? byName[0] : nil
  }

  // The set an agent may use: items whose collection/folder grants a tier other
  // than never. Never the full vault — items in no granted group don't appear.
  func reachableList() -> [[String: Any]] {
    items().compactMap { it -> [String: Any]? in
      guard let t = Policy.shared.tierFor(collectionIds: it.collectionIds, folderId: it.folderId), t != .never else { return nil }
      return ["item": it.name, "id": it.id, "username": it.username,
              "hosts": hostsOf(it.uris), "tier": t.rawValue, "hasTotp": it.hasTotp]
    }
  }

  // The picker WITHOUT unlocking: read the cached (non-secret) group metadata and
  // annotate each with the live policy tier (from memory). nil ⇒ never scanned yet.
  func cachedGroups() -> [[String: Any]]? {
    guard let d = try? Data(contentsOf: GROUPS_CACHE_PATH),
          let arr = try? JSONSerialization.jsonObject(with: d) as? [[String: Any]] else { return nil }
    return arr.map { var g = $0; g["tier"] = Policy.shared.tierOfGroup((g["key"] as? String) ?? "")?.rawValue ?? ""; return g }
  }

  // Rescan the live vault (unlock → Touch ID), refresh the cache, and return it.
  func rescanGroups() -> [[String: Any]] {
    if let s = ensureSession() { buildIndex(session: s) }
    return cachedGroups() ?? []
  }

  // A hint match for a host — ONLY while warm (never triggers an unlock prompt, so
  // it's safe to call on every page navigation). nil when cold or no reachable match.
  func hintFor(host: String) -> [String: Any]? {
    guard isWarm else { return nil }
    let snapshot: [BwItem] = queue.sync { index }
    for it in snapshot {
      guard let t = Policy.shared.tierFor(collectionIds: it.collectionIds, folderId: it.folderId), t != .never else { continue }
      if hostMatches(host, bound: hostsOf(it.uris)) { return ["item": it.name, "tier": t.rawValue] }
    }
    return nil
  }


  func getField(_ field: String, item: String) -> String? {
    guard let s = ensureSession() else { return nil }
    let r = runBw(["get", field, item], session: s)
    guard r.code == 0, !r.out.isEmpty else { log("vault: get \(field) failed: \(r.err)"); return nil }
    return r.out
  }
}
let vault = Vault()

// ───────────────────────────────── policy ────────────────────────────────────

enum Tier: String { case auto, ask, never
  var rank: Int { switch self { case .never: return 0; case .ask: return 1; case .auto: return 2 } }
}

// One access rule: a Bitwarden collection or folder granted to agents at a tier.
struct GroupRule { var kind: String; var name: String; var tier: Tier }

// Policy is a set of collection/folder → tier rules (schema v2). An item's tier is
// resolved from the groups it belongs to at request time — so moving a password
// into a granted collection in Bitwarden IS how you grant/adjust agent access.
final class Policy {
  static let shared = Policy()
  private let queue = DispatchQueue(label: "hb-broker.policy")
  private(set) var idleUnlockSec: Int = 3600
  private(set) var groups: [String: GroupRule] = [:]   // key "col:<id>" | "fld:<id>"
  private(set) var integrityOk = true                  // false ⇒ policy.json failed its MAC check

  init() { load() }

  private func parseGroups(_ j: [String: Any]) -> [String: GroupRule] {
    var m: [String: GroupRule] = [:]
    if let gs = j["groups"] as? [String: [String: Any]] {
      for (k, v) in gs {
        guard let tier = Tier(rawValue: (v["tier"] as? String) ?? "") else { continue }   // "" / off → not a rule
        m[k] = GroupRule(kind: (v["kind"] as? String) ?? (k.hasPrefix("fld:") ? "folder" : "collection"),
                         name: (v["name"] as? String) ?? k, tier: tier)
      }
    }
    return m
  }

  func load() {
    guard let d = try? Data(contentsOf: POLICY_PATH),
          let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any] else {
      queue.sync { integrityOk = true }   // no file → nothing to protect
      return
    }
    let idle = (j["idleUnlockSec"] as? Int) ?? 3600
    let g = parseGroups(j)
    // Empty policy grants nothing, so there's nothing to protect — accept as-is.
    if g.isEmpty { queue.sync { idleUnlockSec = idle; groups = [:]; integrityOk = true }; return }
    // Non-empty grants MUST carry a valid MAC signed by our cdhash-bound key. A tampered
    // policy.json (or a changed key/binary) fails here → fail CLOSED: grant nothing.
    let sig = (try? String(contentsOf: POLICY_SIG_PATH, encoding: .utf8))?.trimmingCharacters(in: .whitespacesAndNewlines)
    if let key = policyMacKey(), let sig = sig, sig == hmacHex(d, key) {
      queue.sync { idleUnlockSec = idle; groups = g; integrityOk = true }
    } else {
      log("policy: INTEGRITY CHECK FAILED — refusing ALL grants (policy.json tampered, or key/binary changed → reconnect)")
      queue.sync { idleUnlockSec = 3600; groups = [:]; integrityOk = false }
    }
  }

  func asJSON() -> [String: Any] {
    queue.sync {
      var gs: [String: Any] = [:]
      for (k, v) in groups { gs[k] = ["kind": v.kind, "name": v.name, "tier": v.tier.rawValue] }
      return ["version": 2, "idleUnlockSec": idleUnlockSec, "groups": gs]
    }
  }

  func tierOfGroup(_ key: String) -> Tier? { queue.sync { groups[key]?.tier } }

  // An item's effective tier = the MOST RESTRICTIVE rule among the collections/
  // folder it belongs to (never < ask < auto). nil ⇒ in no granted group ⇒
  // unreachable (a hard deny, never a prompt). This is the whole-vault safety net:
  // items you never put in a granted collection are invisible to agents.
  func tierFor(collectionIds: [String], folderId: String?) -> Tier? {
    queue.sync {
      var found: [Tier] = []
      for c in collectionIds { if let r = groups["col:" + c] { found.append(r.tier) } }
      if let f = folderId, let r = groups["fld:" + f] { found.append(r.tier) }
      return found.min(by: { $0.rank < $1.rank })
    }
  }

  // Does the proposal make any group MORE permissive (new grant, or tier raised)?
  // Those need a Touch ID; downgrades/revocations apply freely.
  func isUpgrade(_ proposed: [String: Any]) -> Bool {
    let g = parseGroups(proposed)
    return queue.sync {
      for (k, np) in g {
        guard let op = groups[k] else { if np.tier.rank > Tier.never.rank { return true } else { continue } }
        if np.tier.rank > op.tier.rank { return true }
      }
      return false
    }
  }

  // Human-readable diff of a proposal vs the current policy — which collections/folders
  // change tier (off↔ask↔auto) — for the access log. Call BEFORE apply(). "off" means
  // absent (revoked / not granted). Names come from the proposal, or the old rule for a
  // revocation.
  func changes(_ proposed: [String: Any]) -> [[String: Any]] {
    let np = parseGroups(proposed)
    return queue.sync {
      var out: [[String: Any]] = []
      for (k, r) in np {
        let from = groups[k]?.tier.rawValue ?? "off"
        if from != r.tier.rawValue { out.append(["name": r.name, "from": from, "to": r.tier.rawValue]) }
      }
      for (k, r) in groups where np[k] == nil {
        out.append(["name": r.name, "from": r.tier.rawValue, "to": "off"])
      }
      return out
    }
  }

  func apply(_ proposed: [String: Any]) {
    let idle = (proposed["idleUnlockSec"] as? Int) ?? idleUnlockSec
    let g = parseGroups(proposed)
    queue.sync { idleUnlockSec = max(60, idle); groups = g; integrityOk = true }
    save()
  }

  // Write policy.json and its MAC (keyed by our cdhash-bound key), so load() can
  // detect any out-of-band tamper. The MAC is over the exact bytes we write.
  private func save() {
    guard let data = try? JSONSerialization.data(withJSONObject: asJSON(), options: [.prettyPrinted, .sortedKeys]) else { return }
    try? data.write(to: POLICY_PATH)
    if let key = policyMacKey() { try? hmacHex(data, key).write(to: POLICY_SIG_PATH, atomically: true, encoding: .utf8) }
    else { try? FileManager.default.removeItem(at: POLICY_SIG_PATH) }   // no key ⇒ leave no stale sig
  }
}

// ─────────────────────────────── audit log ───────────────────────────────────

let auditSerial = DispatchQueue(label: "hb-broker.audit")   // concurrent handlers → serialize appends
func audit(_ event: [String: Any]) {
  var e = event
  e["ts"] = ISO8601DateFormatter().string(from: Date())
  guard let d = try? JSONSerialization.data(withJSONObject: e), var line = String(data: d, encoding: .utf8) else { return }
  line += "\n"
  auditSerial.sync {
    if let fh = try? FileHandle(forWritingTo: AUDIT_PATH) {
      fh.seekToEndOfFile(); fh.write(line.data(using: .utf8)!); try? fh.close()
    } else {
      try? line.data(using: .utf8)!.write(to: AUDIT_PATH)
    }
  }
}

func auditTail(_ n: Int) -> [[String: Any]] {
  guard let s = try? String(contentsOf: AUDIT_PATH, encoding: .utf8) else { return [] }
  let lines = s.split(separator: "\n").suffix(n)
  return lines.compactMap { l in
    (try? JSONSerialization.jsonObject(with: Data(l.utf8))) as? [String: Any]
  }
}

// ─────────────────────────────── CDP client ──────────────────────────────────
// A minimal synchronous DevTools client over the browser-level websocket, using
// flatten mode so one socket multiplexes per-target sessions. Blocking request/
// response is fine — the broker serves one human-paced request at a time.

final class CDP {
  private let task: URLSessionWebSocketTask
  private var nextId = 1

  init?() {
    guard let verURL = URL(string: "http://\(CDP_HOST):\(CDP_PORT)/json/version"),
          let data = try? Data(contentsOf: verURL),
          let j = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let wsStr = j["webSocketDebuggerUrl"] as? String,
          let wsURL = URL(string: wsStr) else {
      log("cdp: cannot reach browser on \(CDP_HOST):\(CDP_PORT)"); return nil
    }
    task = URLSession(configuration: .default).webSocketTask(with: wsURL)
    task.resume()
  }

  deinit { task.cancel(with: .goingAway, reason: nil) }

  @discardableResult
  func call(_ method: String, _ params: [String: Any] = [:], sessionId: String? = nil, timeout: TimeInterval = 8) -> [String: Any]? {
    let id = nextId; nextId += 1
    var msg: [String: Any] = ["id": id, "method": method, "params": params]
    if let s = sessionId { msg["sessionId"] = s }
    guard let d = try? JSONSerialization.data(withJSONObject: msg),
          let str = String(data: d, encoding: .utf8) else { return nil }
    let sendSem = DispatchSemaphore(value: 0)
    task.send(.string(str)) { _ in sendSem.signal() }
    _ = sendSem.wait(timeout: .now() + timeout)
    // read until we see our id (skip events and other ids)
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
      let recvSem = DispatchSemaphore(value: 0)
      var payload: String?
      task.receive { result in
        if case .success(.string(let s)) = result { payload = s }
        recvSem.signal()
      }
      if recvSem.wait(timeout: .now() + timeout) == .timedOut { break }
      guard let p = payload, let pd = p.data(using: .utf8),
            let obj = try? JSONSerialization.jsonObject(with: pd) as? [String: Any] else { continue }
      if let rid = obj["id"] as? Int, rid == id {
        if let e = obj["error"] as? [String: Any] { log("cdp: \(method) error: \(e)"); return nil }
        return (obj["result"] as? [String: Any]) ?? [:]
      }
    }
    return nil
  }

  // The tab's URL, read from the BROWSER — this is the origin-check source of truth.
  func targetURL(_ targetId: String) -> String? {
    (call("Target.getTargetInfo", ["targetId": targetId])?["targetInfo"] as? [String: Any])?["url"] as? String
  }

  func attach(_ targetId: String) -> String? {
    call("Target.attachToTarget", ["targetId": targetId, "flatten": true])?["sessionId"] as? String
  }

  func detach(_ sessionId: String) { call("Target.detachFromTarget", ["sessionId": sessionId]) }

  // Type `text` at the focused element with real per-char key events — byte-for-byte
  // the same event shape horse-browser's trusted typer produces, so site keyup/input/
  // change listeners fire, framework state updates, submit buttons enable, and 6-box
  // OTP widgets auto-advance. Human jitter between chars.
  func typeText(_ text: String, sessionId: String) {
    for ch in text {
      let (code, vk, shift) = keyInfo(ch)
      let base: [String: Any] = ["key": String(ch), "code": code,
                                 "windowsVirtualKeyCode": vk, "nativeVirtualKeyCode": vk]
      if shift {
        let sk: [String: Any] = ["key": "Shift", "code": "ShiftLeft",
                                 "windowsVirtualKeyCode": 16, "nativeVirtualKeyCode": 16]
        call("Input.dispatchKeyEvent", merge(sk, ["type": "keyDown", "modifiers": 8]), sessionId: sessionId)
        call("Input.dispatchKeyEvent", merge(base, ["type": "keyDown", "text": String(ch), "modifiers": 8]), sessionId: sessionId)
        call("Input.dispatchKeyEvent", merge(base, ["type": "keyUp", "modifiers": 8]), sessionId: sessionId)
        call("Input.dispatchKeyEvent", merge(sk, ["type": "keyUp"]), sessionId: sessionId)
      } else {
        call("Input.dispatchKeyEvent", merge(base, ["type": "keyDown", "text": String(ch)]), sessionId: sessionId)
        call("Input.dispatchKeyEvent", merge(base, ["type": "keyUp"]), sessionId: sessionId)
      }
      usleep(useconds_t(Int.random(in: 30_000...90_000)))   // 30–90ms human cadence
    }
  }
}

func merge(_ a: [String: Any], _ b: [String: Any]) -> [String: Any] { var m = a; for (k, v) in b { m[k] = v }; return m }

// Compact port of horse-browser's key mapping → (code, virtualKeyCode, needsShift).
func keyInfo(_ ch: Character) -> (String, Int, Bool) {
  if ch.isLetter, let a = ch.uppercased().unicodeScalars.first {
    return ("Key" + ch.uppercased(), Int(a.value), ch.isUppercase)
  }
  if ch.isNumber, let d = ch.unicodeScalars.first {
    return ("Digit" + String(ch), Int(d.value), false)
  }
  let sym: [Character: (String, Int, Bool)] = [
    "`": ("Backquote", 192, false), "~": ("Backquote", 192, true),
    "-": ("Minus", 189, false), "_": ("Minus", 189, true),
    "=": ("Equal", 187, false), "+": ("Equal", 187, true),
    "[": ("BracketLeft", 219, false), "{": ("BracketLeft", 219, true),
    "]": ("BracketRight", 221, false), "}": ("BracketRight", 221, true),
    "\\": ("Backslash", 220, false), "|": ("Backslash", 220, true),
    ";": ("Semicolon", 186, false), ":": ("Semicolon", 186, true),
    "'": ("Quote", 222, false), "\"": ("Quote", 222, true),
    ",": ("Comma", 188, false), "<": ("Comma", 188, true),
    ".": ("Period", 190, false), ">": ("Period", 190, true),
    "/": ("Slash", 191, false), "?": ("Slash", 191, true),
    "!": ("Digit1", 49, true), "@": ("Digit2", 50, true), "#": ("Digit3", 51, true),
    "$": ("Digit4", 52, true), "%": ("Digit5", 53, true), "^": ("Digit6", 54, true),
    "&": ("Digit7", 55, true), "*": ("Digit8", 56, true), "(": ("Digit9", 57, true),
    ")": ("Digit0", 48, true), " ": ("Space", 32, false)]
  return sym[ch] ?? ("", 0, false)
}

// The host / origin-match logic lives in the testable HBBrokerCore library
// (Sources/HBBrokerCore/Origin.swift) — hostOf / hostsOf / hostMatches.

// ──────────────────────────────── RPC core ───────────────────────────────────

func deny(_ reason: String, _ error: String) -> [String: Any] { ["ok": false, "reason": reason, "error": error] }

func handle(_ req: [String: Any]) -> [String: Any] {
  let op = (req["op"] as? String) ?? ""
  let session = (req["session"] as? String) ?? "unknown"

  switch op {

  case "status":
    return ["ok": true, "vault": vault.status(), "socket": SOCK_PATH,
            "idleUnlockSec": Policy.shared.idleUnlockSec, "policyOk": Policy.shared.integrityOk]

  case "list":
    // Agents get ONLY the reachable set — items in a granted collection/folder,
    // never the full vault. (Needs a warm/unlockable vault to resolve membership.)
    return ["ok": true, "items": vault.reachableList()]

  case "groups":
    // Serve the picker from the NON-SECRET cache — NO unlock, NO Touch ID (collection
    // names/counts don't expose accounts). needsScan ⇒ never scanned; UI offers a rescan.
    if let cached = vault.cachedGroups() { return ["ok": true, "groups": cached, "cached": true] }
    return ["ok": true, "groups": [], "needsScan": true]

  case "refresh":
    // Rescan the live vault (unlock → Touch ID) and refresh the cache.
    return ["ok": true, "groups": vault.rescanGroups()]

  case "hint":
    // Loopback hint for a host — resolves only while warm, so it never prompts on
    // navigation. Returns { match: {item, tier} } or { match: null }.
    let host = ((req["host"] as? String) ?? "").lowercased()
    return ["ok": true, "match": vault.hintFor(host: host) ?? NSNull()]

  case "policy_get":
    return ["ok": true, "policy": Policy.shared.asJSON()]

  case "policy_set":
    guard let proposed = req["policy"] as? [String: Any] else { return deny("bad-request", "missing policy") }
    if Policy.shared.isUpgrade(proposed) {
      guard touchID(reason: "Approve a more permissive hb-broker credential policy") else {
        audit(["event": "policy_set", "result": "denied", "session": session, "detail": "upgrade rejected"])
        return deny("denied", "policy upgrade requires macOS approval")
      }
    }
    let changes = Policy.shared.changes(proposed)
    Policy.shared.apply(proposed)
    var ev: [String: Any] = ["event": "policy_set", "result": "ok", "session": session]
    if !changes.isEmpty { ev["changes"] = changes }
    audit(ev)
    return ["ok": true, "policy": Policy.shared.asJSON()]

  case "audit_tail":
    return ["ok": true, "events": auditTail((req["n"] as? Int) ?? 100)]

  case "lock":
    vault.lock(); audit(["event": "lock", "session": session]); return ["ok": true]

  case "reset":
    // Disconnect Bitwarden: forget the master password (Keychain), drop the
    // session, and clear the access rules + audit. The daemon stays installed so
    // re-setup is a click. Gated by a macOS approval so a rogue caller can't wipe the setup.
    guard touchID(reason: "Disconnect Bitwarden from hb-auth — forget the master password and access rules") else {
      return deny("denied", "macOS approval declined")
    }
    keychainDeleteToken()
    SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: KEYCHAIN_SERVICE,
                   kSecAttrAccount as String: KEYCHAIN_MAC_ACCOUNT] as CFDictionary)   // wipe the policy MAC key too
    try? FileManager.default.removeItem(at: POLICY_SIG_PATH)
    try? FileManager.default.removeItem(at: GROUPS_CACHE_PATH)
    vault.lock()
    Policy.shared.apply(["version": 2, "idleUnlockSec": 3600, "groups": [:]])
    try? FileManager.default.removeItem(at: AUDIT_PATH)
    audit(["event": "reset", "session": session, "result": "ok"])
    return ["ok": true]

  case "type_secret", "type_totp", "get_totp", "get_secret":
    return handleCredOp(op, req, session: session)

  default:
    return deny("bad-request", "unknown op '\(op)'")
  }
}

func handleCredOp(_ op: String, _ req: [String: Any], session: String) -> [String: Any] {
  guard let cred = req["cred"] as? String, !cred.isEmpty else { return deny("bad-request", "missing cred") }

  // Human-readable audit context, filled in as the item + origin resolve — so every
  // ok AND deny line records WHICH account (name + username) and WHICH site, not the
  // opaque vault id the agent happened to pass.
  var audItem: String? = nil, audUser: String? = nil, audHost: String? = nil, audTotp: Bool? = nil
  func logDeny(_ reason: String, _ detail: String) -> [String: Any] {
    var ev: [String: Any] = ["event": op, "cred": cred, "result": "denied", "reason": reason, "session": session, "detail": detail]
    if let n = audItem { ev["item"] = n }
    if let u = audUser, !u.isEmpty { ev["username"] = u }
    if let h = audHost, !h.isEmpty { ev["host"] = h }
    if let t = audTotp { ev["hasTotp"] = t }
    audit(ev)
    return deny(reason, detail)
  }

  // Resolve the caller's identifier to a real vault item (may unlock → Touch ID).
  guard let item = vault.itemInfo(cred) else {
    return logDeny("no-item", "no unique Bitwarden item named '\(cred)' (unknown, ambiguous, or vault locked)")
  }
  audItem = item.name; audUser = item.username; audTotp = item.hasTotp

  // Whole-vault safety net: the item's tier comes from the collection/folder it
  // lives in. In no GRANTED group ⇒ nil ⇒ hard deny, no prompt. So moving a
  // password into a granted collection is how you grant access; everything else
  // in the personal vault stays unreachable and invisible.
  guard let tier = Policy.shared.tierFor(collectionIds: item.collectionIds, folderId: item.folderId), tier != .never else {
    return logDeny("not-in-granted-collection", "'\(item.name)' is not in a collection/folder you granted agents")
  }

  let isType = op.hasPrefix("type_")
  let field = (op == "type_totp" || op == "get_totp") ? "totp" : "password"

  // Origin binding (typing ops only). Hosts are derived from the item's own login
  // URIs; the tab URL is read from the browser itself, never trusted from the caller.
  var cdp: CDP? = nil
  var sessionId: String? = nil
  var tabHost = ""
  if isType {
    guard let target = req["target"] as? String, !target.isEmpty else { return logDeny("bad-request", "type op needs a CDP target id") }
    let hosts = hostsOf(item.uris)
    if hosts.isEmpty { return logDeny("origin-unbound", "'\(item.name)' has no login URI to bind an origin to; refusing to type") }
    guard let c = CDP() else { return logDeny("no-browser", "cannot reach the browser on \(CDP_HOST):\(CDP_PORT)") }
    cdp = c
    guard let url = c.targetURL(target), let host = hostOf(url) else { return logDeny("no-target", "target \(target) has no readable URL") }
    tabHost = host; audHost = host
    if !hostMatches(host, bound: hosts) { return logDeny("origin-mismatch", "tab host \(host) not among \(item.name)'s URIs \(hosts)") }
    guard let sid = c.attach(target) else { return logDeny("attach-failed", "could not attach to target") }
    sessionId = sid
  }

  // Presence — `ask` tier demands Touch ID every use (even on a warm session).
  if tier == .ask {
    let where_ = isType ? " on \(tabHost)" : ""
    let verb = op.replacingOccurrences(of: "_", with: " ")
    guard touchID(reason: "Agent '\(session)' requests \(verb) for '\(item.name)'\(where_)") else {
      if let s = sessionId { cdp?.detach(s) }
      return logDeny("denied", "macOS approval declined")
    }
  }

  // Fetch the secret by item id (unambiguous).
  guard let value = vault.getField(field, item: item.id) else {
    if let s = sessionId { cdp?.detach(s) }
    return logDeny("vault-error", "could not read \(field) for '\(item.name)' (missing field or no auth)")
  }

  var result: [String: Any] = ["ok": true, "cred": cred, "item": item.name, "tier": tier.rawValue]
  if isType {
    cdp!.typeText(value, sessionId: sessionId!)
    cdp!.detach(sessionId!)
    result["typed"] = value.count
    result["field"] = field
  } else {
    result["value"] = value      // get_totp / get_secret hand the value back over the socket
    result["field"] = field
  }
  var okEv: [String: Any] = ["event": op, "cred": cred, "item": item.name, "result": "ok",
                             "tier": tier.rawValue, "session": session, "field": field,
                             "returned": !isType, "hasTotp": item.hasTotp]
  if !item.username.isEmpty { okEv["username"] = item.username }
  if !tabHost.isEmpty { okEv["host"] = tabHost }
  audit(okEv)
  return result
}

// ─────────────────────────── unix socket server ──────────────────────────────

func serve() {
  ensureAppSupport()
  unlink(SOCK_PATH)
  let fd = socket(AF_UNIX, SOCK_STREAM, 0)
  guard fd >= 0 else { log("socket() failed"); exit(1) }

  var addr = sockaddr_un()
  addr.sun_family = sa_family_t(AF_UNIX)
  SOCK_PATH.withCString { p in withUnsafeMutablePointer(to: &addr.sun_path) {
    $0.withMemoryRebound(to: CChar.self, capacity: 104) { strcpy($0, p) } } }
  let len = socklen_t(MemoryLayout<sockaddr_un>.size)
  let bound = withUnsafePointer(to: &addr) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(fd, $0, len) } }
  guard bound == 0 else { log("bind() failed on \(SOCK_PATH)"); exit(1) }
  chmod(SOCK_PATH, 0o600)   // same-user only; the real gates are policy + presence
  guard listen(fd, 16) == 0 else { log("listen() failed"); exit(1) }

  log("hb-broker serving on \(SOCK_PATH)  (bw=\(BW ?? "MISSING"), cdp=\(CDP_HOST):\(CDP_PORT))")
  Policy.shared.load()
  DispatchQueue.global().async { _ = vault.status() }   // pre-warm the bw-status cache so the first UI poll is instant

  signal(SIGPIPE, SIG_IGN)

  // Handle each connection on a background thread so a slow op (a fill, a rescan,
  // a Touch ID prompt) never blocks cached status/groups/policy reads. bw access is
  // serialized in runBw; the cold unlock in ensureSession; audit + shared state have
  // their own queues — so concurrency here is safe.
  let workers = DispatchQueue(label: "hb-broker.conn", attributes: .concurrent)
  while true {
    let cfd = accept(fd, nil, nil)
    if cfd < 0 { continue }
    workers.async { handleConnection(cfd); close(cfd) }
  }
}

func handleConnection(_ cfd: Int32) {
  // read one line (the request), dispatch, write one line (the response)
  var buf = Data()
  var tmp = [UInt8](repeating: 0, count: 4096)
  readLoop: while true {
    let n = read(cfd, &tmp, tmp.count)
    if n <= 0 { break }
    buf.append(contentsOf: tmp[0..<n])
    if buf.contains(0x0a) { break readLoop }
    if buf.count > 1 << 20 { break }   // 1MB guard
  }
  guard let nl = buf.firstIndex(of: 0x0a) else { return }
  let lineData = buf.subdata(in: buf.startIndex..<nl)
  let req = (try? JSONSerialization.jsonObject(with: lineData)) as? [String: Any] ?? ["op": "?"]

  var resp: [String: Any]
  // serialize everything (one Touch ID at a time); a slow op just queues the next accept
  resp = handle(req)

  if let d = try? JSONSerialization.data(withJSONObject: resp) {
    var out = d; out.append(0x0a)
    out.withUnsafeBytes { _ = write(cfd, $0.baseAddress, out.count) }
  }
}

// ───────────────────────────────── CLI ───────────────────────────────────────

func prompt(_ msg: String) -> String {
  FileHandle.standardOutput.write(msg.data(using: .utf8)!)
  return (readLine(strippingNewline: true) ?? "").trimmingCharacters(in: .whitespaces)
}

// The ONE command. Does the whole connect INSIDE this process, in the broker's
// isolated bw data dir — bw's output (which includes the session token) is captured,
// never printed. The master password is read hidden (getpass) and never stored; only
// the resulting token goes to the login Keychain. So no `bw login` in a terminal,
// no token or vault contents ever on screen.
func cmdSetup() {
  ensureAppSupport()
  guard BW != nil else { print("bitwarden cli (bw) not found. Install it first: brew install bitwarden-cli"); exit(1) }

  print("Connect your agent Bitwarden to hb-broker.")
  print("Everything is read here and used locally — no password, token, or vault")
  print("contents is ever printed to this terminal.\n")

  let st = vault.status()["bwStatus"] as? String ?? "unknown"
  let loggedIn = (st == "locked" || st == "unlocked")

  if !loggedIn {
    let server = prompt("Server [Enter = vault.bitwarden.com · type 'eu' for EU · or a self-host URL]: ")
    let url = server.isEmpty || server == "com" ? "https://vault.bitwarden.com"
            : server == "eu" ? "https://vault.bitwarden.eu" : server
    let cfg = runBw(["config", "server", url])
    guard cfg.code == 0 else { print("Failed to set server: \(cfg.err.isEmpty ? cfg.out : cfg.err)"); exit(1) }

    let email = prompt("Bitwarden email: ")
    guard !email.isEmpty else { print("email required"); exit(1) }
    guard let pwC = getpass("Master password (hidden): ") else { exit(1) }
    let pw = String(cString: pwC)
    let method = prompt("Two-step method [Enter = none · 0 = authenticator · 1 = email · 3 = yubikey]: ")

    if method.isEmpty {
      // No two-step — non-interactive, output captured (token never printed).
      let li = runBw(["login", email, "--passwordenv", "HB_BW_PW"], extraEnv: ["HB_BW_PW": pw])
      guard li.code == 0 else { print("Login failed: \(li.err.isEmpty ? li.out : li.err)"); exit(1) }
    } else {
      // Two-step — hand bw the terminal so it runs its OWN flow: SEND the code (email) and
      // prompt for it live. Passing `--code` up front can't work for email 2FA — no code
      // exists until bw emails it, which is the bug we're fixing. stdout is discarded, so
      // the session key bw prints on success still never lands on screen.
      if method == "1" { print("\nBitwarden will email a 6-digit code to the account's address and ask for it below.") }
      else { print("\nBitwarden will ask for your two-step code below — read it from your authenticator / key.") }
      let rc = runBwInteractive(["login", email, "--method", method, "--passwordenv", "HB_BW_PW"], extraEnv: ["HB_BW_PW": pw])
      guard rc == 0 else { print("\nTwo-step login didn't complete. Re-run `hb-broker setup` to try again."); exit(1) }
    }
    let un = runBw(["unlock", "--raw", "--passwordenv", "HB_BW_PW"], extraEnv: ["HB_BW_PW": pw])
    guard un.code == 0, !un.out.isEmpty else { print("Unlock failed: \(un.err.isEmpty ? un.out : un.err)"); exit(1) }
    guard keychainStoreToken(un.out) else { print("Failed to store the token in Keychain."); exit(1) }
  } else {
    // Already logged in (re-running setup) — just re-mint the token.
    guard let pwC = getpass("Master password (hidden): ") else { exit(1) }
    let pw = String(cString: pwC)
    let un = runBw(["unlock", "--raw", "--passwordenv", "HB_BW_PW"], extraEnv: ["HB_BW_PW": pw])
    guard un.code == 0, !un.out.isEmpty else { print("Unlock failed — wrong password? \(un.err.isEmpty ? un.out : un.err)"); exit(1) }
    guard keychainStoreToken(un.out) else { print("Failed to store the token in Keychain."); exit(1) }
  }
  print("\nConnected. A session token is stored in the login Keychain, bound to this")
  print("binary's code signature; the daemon gates its use behind a macOS approval")
  print("(your login password). Your master password was NOT saved.")
}

func cmdStatus() {
  ensureAppSupport()
  let s: [String: Any] = ["vault": vault.status(), "socket": SOCK_PATH,
                          "policy": Policy.shared.asJSON(), "hasSession": keychainHasToken()]
  if let d = try? JSONSerialization.data(withJSONObject: s, options: .prettyPrinted) {
    print(String(data: d, encoding: .utf8) ?? "{}")
  }
}

func cmdDoctor() {
  print("bw:            \(BW ?? "NOT FOUND")")
  print("app support:   \(APP_SUPPORT.path)")
  print("socket:        \(SOCK_PATH)")
  print("has token:     \(keychainHasToken())")
  print("cdp:           \(CDP_HOST):\(CDP_PORT)  reachable=\(CDP() != nil)")
  print("bw status:     \(vault.status()["bwStatus"] ?? "?")")
  print("touch id:      canEvaluate=\(LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: nil))")
}

// ──────────────────────────────── entry ──────────────────────────────────────

ensureAppSupport()
let cmd = CommandLine.arguments.dropFirst().first ?? "serve"
switch cmd {
case "serve":  serve()
case "setup":  cmdSetup()
case "status": cmdStatus()
case "doctor": cmdDoctor()
default:       print("usage: hb-broker [serve|setup|status|doctor]"); exit(2)
}
