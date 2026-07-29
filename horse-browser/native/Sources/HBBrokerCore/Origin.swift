// HBBrokerCore — pure, dependency-free logic extracted from the daemon so it can be
// unit-tested. The origin match is the broker's anti-phishing boundary: the daemon
// refuses to type a credential unless the browser tab's real host matches one of the
// credential's stored login URIs. A regression here is a security hole, so it lives
// here under test rather than buried in the executable.

import Foundation

public func hostOf(_ urlStr: String) -> String? {
  URLComponents(string: urlStr)?.host?.lowercased()
}

// Hostnames from an item's stored login URIs. Bitwarden URIs may be full URLs or
// bare hosts / host+path — handle both, so the origin binding comes free from the
// URLs already in the vault (no per-item host config).
public func hostsOf(_ uris: [String]) -> [String] {
  uris.compactMap { u in
    if let h = URLComponents(string: u)?.host, !h.isEmpty { return h.lowercased() }
    let stripped = u.replacingOccurrences(of: "https://", with: "").replacingOccurrences(of: "http://", with: "")
    return stripped.split(separator: "/").first.map { String($0).lowercased() }
  }.filter { !$0.isEmpty }
}

// Multi-part TLD registries — second-level suffixes (co.uk, com.au, co.jp…) where the registrable
// NAME is the third label, so foo.co.uk and bar.co.uk are different owners and must not cross-match.
// This is the ONLY special-casing. Under a normal domain we deliberately DON'T distinguish
// subdomains: a login on one subdomain covers its siblings (the agent may open the right site on
// the wrong subdomain — a wanted convenience). Multi-tenant hosting (github.io, *.web.app,
// *.myshopify.com) is NOT listed here BY DESIGN, so its siblings match too.
//   DELIBERATE (operator ruling 2026-07-29, after a 3-reviewer flag): the match stays wide. The
//   broker never fills blindly — a password is typed only when an agent deliberately acts on a
//   task, and `ask`-tier items demand a live macOS approval every use. The convenience of not
//   fighting subdomain drift outweighs the multi-tenant edge, which the approval gate covers. If
//   that trade ever changes, swap this list for the real Public Suffix List (splits github.io
//   tenants while keeping google.com subdomains together).
// Extend ONLY with real ccTLD second-level registries (https://publicsuffix.org, ICANN section).
let MULTIPART_TLDS: Set<String> = [
  "co.uk", "org.uk", "me.uk", "ltd.uk", "plc.uk", "net.uk", "sch.uk", "ac.uk", "gov.uk",
  "com.au", "net.au", "org.au", "edu.au", "gov.au", "id.au",
  "co.jp", "ne.jp", "or.jp", "go.jp", "ac.jp", "ad.jp", "ed.jp", "gr.jp", "lg.jp",
  "co.nz", "net.nz", "org.nz", "govt.nz", "ac.nz",
  "com.br", "net.br", "org.br", "gov.br",
  "co.in", "net.in", "org.in", "gen.in", "firm.in", "ind.in",
  "com.cn", "net.cn", "org.cn", "gov.cn",
  "co.za", "org.za", "com.mx", "com.ar", "com.sg", "com.hk", "com.tw",
  "com.tr", "org.tr", "net.tr", "co.kr", "or.kr", "co.il", "co.id",
  "com.my", "com.ph", "com.vn", "com.ua", "com.pl", "com.ng",
]

// The registrable domain (eTLD+1): the site owner's boundary. mail.google.com and
// accounts.google.com both → google.com; a.foo.co.uk → foo.co.uk; a bare ccTLD suffix (co.uk) or an
// IP → nil (no owner boundary, so only exact/subdomain matching applies). A normal multi-label
// suffix (github.io) is treated as a plain domain ON PURPOSE, so its subdomains share one
// registrable domain and cross-match — only the MULTIPART_TLDS registries are split at the 3rd label.
public func registrableDomain(_ host: String) -> String? {
  let labels = host.lowercased().split(separator: ".").map(String.init)
  guard labels.count >= 2 else { return nil }
  if labels.allSatisfy({ Int($0) != nil }) { return nil }   // IPv4 → exact match only, never siblings
  let last2 = labels.suffix(2).joined(separator: ".")
  if MULTIPART_TLDS.contains(last2) {
    return labels.count >= 3 ? labels.suffix(3).joined(separator: ".") : nil
  }
  return last2
}

// A tab host matches a bound host when either:
//   (1) equal, or the tab is a subdomain of the bound host (suffix on a label boundary) — the
//       original, public-suffix-independent trust. "www.github.com" matches bound "github.com".
//   (2) both resolve to the SAME registrable domain — so a login stored on one subdomain covers
//       its siblings (accounts.google.com ↔ mail.google.com; and, by design, alice.github.io ↔
//       bob.github.io). Only multi-part ccTLD registries split owners (foo.co.uk ↮ bar.co.uk).
// "www." is apex-equivalent (a vault item stores whichever URL the login page used, so tab and
// bound can differ only by a leading www.) — normalised off BOTH sides. Look-alikes (evilgithub.com,
// github.com.evil.com) share neither a suffix boundary nor a registrable domain, so stay rejected.
public func hostMatches(_ tabHost: String, bound: [String]) -> Bool {
  func apex(_ h: String) -> String {
    let l = h.lowercased()
    return l.hasPrefix("www.") ? String(l.dropFirst(4)) : l
  }
  let t = apex(tabHost)
  let tReg = registrableDomain(t)
  for b in bound {
    let bl = apex(b)
    if t == bl || t.hasSuffix("." + bl) { return true }
    if let tReg, tReg == registrableDomain(bl) { return true }
  }
  return false
}
