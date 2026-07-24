// swift-tools-version:5.9
import PackageDescription

// hb-broker — the credential broker daemon. A single self-contained executable,
// no external SwiftPM dependencies: LocalAuthentication (Touch ID), Security
// (Keychain), Foundation (unix socket, CDP websocket, Process→bw) are all system
// frameworks. Built by build.sh into ~/Library/Application Support/hb-broker/bin.
let package = Package(
  name: "hb-broker",
  platforms: [.macOS(.v13)],
  targets: [
    // Pure, testable logic (the origin/anti-phishing match). No system-framework deps.
    .target(name: "HBBrokerCore", path: "Sources/HBBrokerCore"),
    .executableTarget(name: "hb-broker", dependencies: ["HBBrokerCore"], path: "Sources/hb-broker"),
    // Plain-Swift test runner (no XCTest → runs with only the Command Line Tools). `npm test`.
    .executableTarget(name: "OriginCheck", dependencies: ["HBBrokerCore"], path: "Sources/OriginCheck"),
  ]
)
