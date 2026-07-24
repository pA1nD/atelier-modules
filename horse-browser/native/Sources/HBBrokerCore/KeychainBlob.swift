// The payload of the broker's ONE Keychain item. Two secrets share one item because
// each item carries its own code-identity ACL, and a second ACL means a second
// "Always Allow" approval — which the daemon (a background LaunchAgent) cannot
// present, so it would block forever on the write.
//
//   token  — the BW_SESSION. Replaced on every `hb-broker setup`.
//   macKey — the policy-integrity HMAC key. Random and INDEPENDENT of the token, so
//            reconnecting the vault does not invalidate the operator's grants.
//
// v1 stored the bare token string and derived macKey from it (HKDF); that made every
// reconnect mint a new key, fail the policy signature, and silently refuse every
// grant. Decoding therefore has to accept both shapes — hence this file, and hence
// it lives here under test: a parsing slip here bricks access to the vault.

import Foundation

public struct KeychainBlob: Equatable {
  public var token: String
  public var macKey: Data?          // nil ⇒ v1 item, caller falls back to the derived key
  public init(token: String, macKey: Data?) { self.token = token; self.macKey = macKey }
}

public let MAC_KEY_BYTES = 32

// v2 → {token, macKey}; anything else is treated as a v1 bare token. A macKey of the
// wrong length is dropped rather than trusted, so a corrupt item degrades to v1
// behaviour instead of signing with a bad key.
public func decodeKeychainBlob(_ d: Data) -> KeychainBlob? {
  if let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
     let t = j["token"] as? String, !t.isEmpty {
    let mk = (j["macKey"] as? String).flatMap { Data(base64Encoded: $0) }
    return KeychainBlob(token: t, macKey: mk?.count == MAC_KEY_BYTES ? mk : nil)
  }
  guard let s = String(data: d, encoding: .utf8), !s.isEmpty else { return nil }
  return KeychainBlob(token: s, macKey: nil)
}

public func encodeKeychainBlob(token: String, macKey: Data) -> Data? {
  guard macKey.count == MAC_KEY_BYTES else { return nil }
  return try? JSONSerialization.data(
    withJSONObject: ["v": 2, "token": token, "macKey": macKey.base64EncodedString()])
}
