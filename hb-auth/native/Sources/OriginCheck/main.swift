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

if failures > 0 { print("\n\(failures) check(s) FAILED"); exit(1) }
print("\nall checks passed")
