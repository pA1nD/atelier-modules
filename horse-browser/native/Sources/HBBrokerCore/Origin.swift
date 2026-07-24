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

// A tab host matches a bound host if equal or a subdomain of it (suffix on a label
// boundary). "www.github.com" matches bound "github.com"; "evilgithub.com" does not.
public func hostMatches(_ tabHost: String, bound: [String]) -> Bool {
  for b in bound {
    let bl = b.lowercased()
    if tabHost == bl || tabHost.hasSuffix("." + bl) { return true }
  }
  return false
}
