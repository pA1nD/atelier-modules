// origin-check — a plain-Swift test runner (no XCTest, so it runs with only the Xcode
// Command Line Tools, which is all the module declares). Exercises HBBrokerCore's
// origin match — the broker's anti-phishing gate. `npm test` runs this; non-zero exit
// on any failure fails the shipmate health pipeline.

import Foundation
import HBBrokerCore

var failures = 0
func check(_ cond: Bool, _ name: String) {
  if cond { print("  ok  \(name)") } else { print("  FAIL  \(name)"); failures += 1 }
}

print("origin / anti-phishing match:")
check(hostMatches("github.com", bound: ["github.com"]), "exact host matches")
check(hostMatches("www.github.com", bound: ["github.com"]), "subdomain matches")
check(hostMatches("login.corp.github.com", bound: ["github.com"]), "deep subdomain matches")
check(!hostMatches("evilgithub.com", bound: ["github.com"]), "lookalike suffix rejected")
check(!hostMatches("github.com.evil.com", bound: ["github.com"]), "bound-as-subdomain-of-attacker rejected")
check(!hostMatches("github.co", bound: ["github.com"]), "truncation rejected")
check(!hostMatches("notgithub.com", bound: ["github.com"]), "prefix lookalike rejected")
check(!hostMatches("github.com", bound: []), "empty bound never matches")
check(hostMatches("id.airfranceklm.com", bound: ["aa.com", "airfranceklm.com"]), "matches any of several bound")
check(!hostMatches("aa.com.evil.com", bound: ["aa.com", "airfranceklm.com"]), "phish against multi-bound rejected")

print("url / host parsing:")
check(hostOf("https://www.awardfares.com/login") == "www.awardfares.com", "hostOf parses url")
check(hostOf("HTTPS://Awardfares.COM/x") == "awardfares.com", "hostOf lowercases")
check(hostOf("not a url") == nil, "hostOf nil on junk")
check(hostsOf(["https://awardfares.com/login"]) == ["awardfares.com"], "hostsOf full url")
check(hostsOf(["awardfares.com"]) == ["awardfares.com"], "hostsOf bare host")
check(hostsOf(["fly.airmate.aero/path"]) == ["fly.airmate.aero"], "hostsOf host+path, no scheme")
check(hostsOf([""]) == [], "hostsOf drops junk")

print("gate end-to-end (derive bound hosts from URIs, then match a tab):")
let bound = hostsOf(["https://awardfares.com/login", "awardfares.com"])
check(hostMatches(hostOf("https://awardfares.com/account")!, bound: bound), "allows the real tab")
check(!hostMatches(hostOf("https://awardfares.com.phish.io/")!, bound: bound), "rejects the phish tab")

print("keychain blob (one item carries {token, macKey}):")
let mk = Data(repeating: 0xAB, count: MAC_KEY_BYTES)
let enc = encodeKeychainBlob(token: "sess-tok-123", macKey: mk)
check(enc != nil, "encodes a v2 blob")
let rt = enc.flatMap { decodeKeychainBlob($0) }
check(rt?.token == "sess-tok-123", "round-trips the token")
check(rt?.macKey == mk, "round-trips the macKey")
check(encodeKeychainBlob(token: "t", macKey: Data(repeating: 1, count: 31)) == nil, "refuses a short macKey")

// v1 items hold the bare token; they MUST keep working (fall back to the derived key)
// or an un-migrated install loses its vault on upgrade.
let v1 = decodeKeychainBlob(Data("raw-session-token".utf8))
check(v1?.token == "raw-session-token", "v1 bare token still decodes")
check(v1?.macKey == nil, "v1 reports no macKey → caller uses the derived key")

// A corrupt macKey must degrade to v1, never sign with a wrong-length key.
let badMac = try! JSONSerialization.data(withJSONObject: ["v": 2, "token": "t", "macKey": "AAAA"])
check(decodeKeychainBlob(badMac)?.token == "t", "corrupt macKey keeps the token")
check(decodeKeychainBlob(badMac)?.macKey == nil, "corrupt macKey is dropped, not trusted")
check(decodeKeychainBlob(Data()) == nil, "empty item decodes to nil")

// A token that happens to look like JSON must not be mistaken for a blob.
let jsonish = decodeKeychainBlob(Data("{\"foo\":1}".utf8))
check(jsonish?.token == "{\"foo\":1}", "JSON without a token field is treated as a bare token")

if failures > 0 { print("\n\(failures) check(s) FAILED"); exit(1) }
print("\nall checks passed")
